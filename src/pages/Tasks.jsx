import { useState, useEffect } from 'react'
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from 'date-fns'
import { Plus, Check, Circle, Trash2, Calendar, ChevronLeft, ChevronRight, Play, Pause, Clock, GripVertical, X, Edit2, Info } from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import useStore from '../store'
import { getTasksByDate, getTaskTotalTime } from '../utils/calculations'

export default function Tasks() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskGoal, setNewTaskGoal] = useState('')
  const [newTaskMins, setNewTaskMins] = useState('')
  const [manualTimeTaskId, setManualTimeTaskId] = useState(null)
  const [manualMins, setManualMins] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editedDesc, setEditedDesc] = useState('')
  const [editingTitleId, setEditingTitleId] = useState(null)
  const [editedTitle, setEditedTitle] = useState('')
  
  // Custom fast force timer just to update UI without global state churn for now
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const tasks = useStore((s) => s.tasks)
  const goals = useStore((s) => s.goals)
  const addTask = useStore((s) => s.addTask)
  const toggleTask = useStore((s) => s.toggleTask)
  const startTask = useStore((s) => s.startTask)
  const pauseTask = useStore((s) => s.pauseTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const reorderTasks = useStore((s) => s.reorderTasks)
  const addManualTime = useStore((s) => s.addManualTime)
  const updateTask = useStore((s) => s.updateTask)
  
  const activeGoals = goals.filter((g) => g.status === 'active')

  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dailyTasks = getTasksByDate(tasks, dateStr)
  
  const handlePrevDay = () => setCurrentDate((d) => subDays(d, 1))
  const handleNextDay = () => setCurrentDate((d) => addDays(d, 1))
  const handleToday = () => setCurrentDate(new Date())

  const handleAddTask = (e) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    
    const taskId = crypto.randomUUID()
    const mins = parseInt(newTaskMins) || 0
    
    addTask({
      id: taskId,
      title: newTaskTitle.trim(),
      date: dateStr,
      goalId: newTaskGoal || null,
      status: mins > 0 ? 'completed' : 'pending',
      createdAt: new Date().toISOString()
    })

    if (mins > 0) {
      addManualTime(taskId, mins, dateStr)
    }

    setNewTaskTitle('')
    setNewTaskMins('')
  }

  const getDateLabel = () => {
    if (isToday(currentDate)) return 'Today'
    if (isYesterday(currentDate)) return 'Yesterday'
    if (isTomorrow(currentDate)) return 'Tomorrow'
    return format(currentDate, 'EEEE')
  }

  const handleDragEnd = (result) => {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return
    reorderTasks(result.draggableId, dailyTasks[result.destination.index].id)
  }

  const handleAddManualTime = (taskId) => {
    const mins = parseInt(manualMins)
    if (isNaN(mins) || mins <= 0) return
    addManualTime(taskId, mins, dateStr)
    setManualTimeTaskId(null)
    setManualMins('')
  }

  const handleSaveDescription = () => {
    if (!selectedTask) return
    updateTask(selectedTask.id, { description: editedDesc })
    setIsEditingDesc(false)
    // Update the local selected task object to reflect the change
    setSelectedTask(prev => ({ ...prev, description: editedDesc }))
  }

  const completedCount = dailyTasks.filter(t => t.status === 'completed').length
  const progressPct = dailyTasks.length === 0 ? 0 : Math.round((completedCount / dailyTasks.length) * 100)

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24">
      {/* Header & Date Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Daily Tasks</h1>
          <p className="text-[#555] mt-1 text-sm font-medium flex items-center gap-2">
            <Calendar size={14} className="text-[#F0C040]" />
            {format(currentDate, 'MMMM d, yyyy')}
          </p>
        </div>
        
        <div className="flex bg-[#141414] border border-[#1E1E1E] rounded-xl p-1 w-fit">
          <button onClick={handlePrevDay} className="p-2 text-[#666] hover:text-white rounded-lg hover:bg-[#1C1C1C] transition-colors"><ChevronLeft size={18} /></button>
          <button onClick={handleToday} className="px-4 py-2 text-sm font-bold text-white hover:bg-[#1C1C1C] rounded-lg transition-colors">
            {getDateLabel()}
          </button>
          <button onClick={handleNextDay} className="p-2 text-[#666] hover:text-white rounded-lg hover:bg-[#1C1C1C] transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Progress */}
      {dailyTasks.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[#555] font-bold uppercase tracking-wide mb-2">
            <span>{completedCount} of {dailyTasks.length} completed</span>
            <span className="text-[#F0C040]">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, backgroundColor: '#F0C040' }} />
          </div>
        </div>
      )}

      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-2 mb-6 flex flex-col sm:flex-row focus-within:border-[#F0C040]/50 transition-colors">
        <div className="flex-1 flex items-center px-4 py-2">
          <Plus size={18} className="text-[#555] mr-3" />
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-[#444]"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 sm:px-0 pb-2 sm:pb-0 sm:pr-2 border-t sm:border-t-0 sm:border-l border-[#1E1E1E] sm:pl-3 pt-2 sm:pt-0">
          <div className="flex items-center gap-2 bg-[#1C1C1C] px-3 py-1.5 rounded-xl border border-[#1E1E1E] transition-all focus-within:border-[#F0C040]/30">
            <Clock size={14} className="text-[#F0C040]" />
            <input
              type="number"
              value={newTaskMins}
              onChange={(e) => setNewTaskMins(e.target.value)}
              placeholder="0 mins"
              className="w-14 bg-transparent text-white text-xs font-bold focus:outline-none placeholder-[#333]"
            />
          </div>
          <select
            value={newTaskGoal}
            onChange={(e) => setNewTaskGoal(e.target.value)}
            className="bg-transparent text-[#aaa] text-[11px] font-bold focus:outline-none max-w-[120px] truncate px-2"
          >
            <option value="">No Goal</option>
            {activeGoals.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button 
            type="submit" 
            disabled={!newTaskTitle.trim()}
            className="bg-[#F0C040] text-black w-full sm:w-10 h-10 sm:h-8 rounded-xl flex items-center justify-center font-bold disabled:opacity-30 transition-all text-sm sm:text-base mt-2 sm:mt-0 shadow-lg shadow-[#F0C040]/10"
          >
            <Plus size={18} />
          </button>
        </div>
      </form>

      {/* Task List */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="daily-tasks">
          {(provided) => (
            <div 
              {...provided.droppableProps} 
              ref={provided.innerRef}
              className="space-y-2"
            >
              {dailyTasks.length === 0 ? (
                <div className="text-center py-16 bg-[#141414] border border-[#1E1E1E] border-dashed rounded-2xl">
                  <div className="text-[#444] text-sm font-medium">No tasks for this date</div>
                  <p className="text-[#333] text-xs mt-1">Enjoy your free time or add a new task above.</p>
                </div>
              ) : (
                dailyTasks.map((task, index) => {
                  const goal = goals.find(g => g.id === task.goalId)
                  const isDone = task.status === 'completed'
                  const isRunning = task.isRunning
                  
                  // Calculate live display mins without mutating state on every second
                  let displayMins = getTaskTotalTime(task)
                  if (isRunning && task.startTime) {
                    displayMins += Math.floor((Date.now() - task.startTime) / 60000)
                  }
                  
                  return (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          onClick={() => {
                            setSelectedTask(task)
                            setEditedDesc(task.description || '')
                            setIsEditingDesc(false)
                          }}
                          className={`group flex items-center gap-3 sm:gap-4 bg-[#141414] border rounded-2xl p-3 sm:p-4 transition-all cursor-pointer
                            ${isDone ? 'opacity-60 border-[#1E1E1E]' : isRunning ? 'border-[#10b981]/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-[#1E1E1E] hover:border-[#2a2a2a]'}
                            ${snapshot.isDragging ? 'shadow-2xl border-[#F0C040] scale-[1.02] z-50' : ''}`}
                          style={{
                            ...provided.draggableProps.style,
                            borderLeft: goal && !isDone && !isRunning && !snapshot.isDragging ? `3px solid ${goal.color}` : undefined
                          }}
                        >
                          <div 
                            {...provided.dragHandleProps} 
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#333] hover:text-[#555] transition-colors cursor-grab active:cursor-grabbing p-1 -ml-2 sm:-ml-1"
                          >
                            <GripVertical size={16} />
                          </div>

                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTask(task.id)
                            }}
                            className="flex-shrink-0 text-[#555] hover:text-[#F0C040] transition-colors focus:outline-none"
                          >
                            {isDone ? (
                              <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center">
                                <Check size={14} className="text-black" />
                              </div>
                            ) : (
                              <Circle size={24} strokeWidth={1.5} />
                            )}
                          </button>
                          
                          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            {editingTitleId === task.id ? (
                              <input
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => {
                                  if (editedTitle.trim() && editedTitle !== task.title) {
                                    updateTask(task.id, { title: editedTitle.trim() })
                                  }
                                  setEditingTitleId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editedTitle.trim() && editedTitle !== task.title) {
                                      updateTask(task.id, { title: editedTitle.trim() })
                                    }
                                    setEditingTitleId(null)
                                  } else if (e.key === 'Escape') {
                                    setEditingTitleId(null)
                                  }
                                }}
                                className="bg-[#1C1C1C] text-white text-sm px-2 py-1 rounded w-full max-w-[200px] border border-[#F0C040]/50 focus:outline-none"
                              />
                            ) : (
                              <span className={`text-sm font-medium transition-all break-words ${isDone ? 'text-[#666] line-through' : 'text-white'}`}>
                                {task.title}
                              </span>
                            )}
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Goal Tag */}
                              {goal && (
                                <span 
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold w-fit sm:w-auto truncate max-w-full"
                                  style={{ backgroundColor: `${goal.color}15`, color: isDone ? '#666' : goal.color }}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isDone ? '#444' : goal.color }} />
                                  <span className="truncate">{goal.name}</span>
                                </span>
                              )}

                              {/* Time Tracking Indicator */}
                              {(displayMins > 0 || isRunning || task.timeSpent > 0) && (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md 
                                  ${isRunning ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#252525] text-[#888]'}`}>
                                  <Clock size={10} />
                                  {displayMins}m
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {manualTimeTaskId === task.id ? (
                              <div className="flex items-center gap-1 bg-[#1C1C1C] rounded-2xl p-1 border border-[#F0C040]/50 shadow-[0_0_20px_rgba(240,192,64,0.1)] animate-in fade-in zoom-in duration-300">
                                <input
                                  type="number"
                                  value={manualMins}
                                  onChange={(e) => setManualMins(e.target.value)}
                                  placeholder="0"
                                  autoFocus
                                  className="w-10 bg-transparent text-white text-xs font-black px-2 focus:outline-none text-center"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddManualTime(task.id)
                                    if (e.key === 'Escape') setManualTimeTaskId(null)
                                  }}
                                />
                                <button 
                                  onClick={() => handleAddManualTime(task.id)}
                                  className="bg-[#F0C040] text-black rounded-xl h-8 px-3 text-[10px] font-black hover:scale-105 transition-transform"
                                >
                                  SAVE
                                </button>
                                <button 
                                  onClick={() => setManualTimeTaskId(null)}
                                  className="p-2 text-[#555] hover:text-white transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingTitleId(task.id)
                                    setEditedTitle(task.title)
                                  }}
                                  className="p-2 text-[#555] hover:text-[#F0C040] transition-all sm:opacity-0 group-hover:opacity-100 hover:bg-[#252525] rounded-xl focus:outline-none focus:opacity-100"
                                  title="Edit Task Name"
                                >
                                  <Edit2 size={14} />
                                </button>
                                {!isDone && (
                                  <div className="flex items-center gap-1.5">
                                    <button 
                                      onClick={() => {
                                        setManualTimeTaskId(task.id)
                                        setManualMins('')
                                      }}
                                      className="p-2 bg-[#1C1C1C] text-[#555] hover:text-[#F0C040] rounded-xl transition-all sm:opacity-0 group-hover:opacity-100 hover:bg-[#252525] border border-transparent hover:border-[#F0C040]/20"
                                      title="Log extra minutes"
                                    >
                                      <Plus size={14} />
                                    </button>
                                    <button 
                                      onClick={() => isRunning ? pauseTask(task.id) : startTask(task.id)}
                                      className={`p-2 rounded-xl transition-all focus:outline-none flex items-center gap-1.5 
                                        ${isRunning 
                                          ? 'bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/30 opacity-100 border border-[#10b981]/30' 
                                          : 'bg-[#1C1C1C] text-[#666] hover:text-white sm:opacity-0 group-hover:opacity-100 hover:bg-[#252525] border border-transparent'}`}
                                      aria-label={isRunning ? "Pause Task" : "Start Task"}
                                    >
                                      {isRunning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                                      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">
                                        {isRunning ? 'Pause' : 'Start'}
                                      </span>
                                    </button>
                                  </div>
                                )}

                                <button 
                                  onClick={() => deleteTask(task.id)}
                                  className="sm:opacity-0 group-hover:opacity-100 p-2 text-[#333] hover:text-red-500 transition-all rounded-xl focus:outline-none focus:opacity-100"
                                  aria-label="Delete Task"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  )
                })
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Task Details Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedTask(null)}
          />
          <div className="relative w-full max-w-lg bg-[#0C0C0C] border border-[#1E1E1E] rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 pb-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {goals.find(g => g.id === selectedTask.goalId) && (
                    <span 
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ 
                        backgroundColor: `${goals.find(g => g.id === selectedTask.goalId).color}15`, 
                        color: goals.find(g => g.id === selectedTask.goalId).color 
                      }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: goals.find(g => g.id === selectedTask.goalId).color }} />
                      {goals.find(g => g.id === selectedTask.goalId).name}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${selectedTask.status === 'completed' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#F0C040]/20 text-[#F0C040]'}`}>
                    {selectedTask.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS'}
                  </span>
                </div>
                {editingTitleId === selectedTask.id ? (
                  <input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    autoFocus
                    onBlur={() => {
                      if (editedTitle.trim() && editedTitle !== selectedTask.title) {
                        updateTask(selectedTask.id, { title: editedTitle.trim() })
                        setSelectedTask(prev => ({ ...prev, title: editedTitle.trim() }))
                      }
                      setEditingTitleId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editedTitle.trim() && editedTitle !== selectedTask.title) {
                          updateTask(selectedTask.id, { title: editedTitle.trim() })
                          setSelectedTask(prev => ({ ...prev, title: editedTitle.trim() }))
                        }
                        setEditingTitleId(null)
                      } else if (e.key === 'Escape') {
                        setEditingTitleId(null)
                      }
                    }}
                    className="text-xl font-black bg-[#1C1C1C] text-white px-2 py-1 rounded w-full border border-[#F0C040]/50 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h2 className="text-xl font-black text-white leading-tight break-words">
                      {selectedTask.title}
                    </h2>
                    <button 
                      onClick={() => {
                        setEditingTitleId(selectedTask.id)
                        setEditedTitle(selectedTask.title)
                      }}
                      className="p-1 text-[#555] hover:text-[#F0C040] transition-colors sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Edit Task Title"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setSelectedTask(null)}
                className="p-2 text-[#444] hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Description Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-[#555] uppercase tracking-widest">Description</h3>
                  {!isEditingDesc && (
                    <button 
                      onClick={() => setIsEditingDesc(true)}
                      className="text-[#F0C040] flex items-center gap-1 text-[10px] font-bold hover:underline"
                    >
                      <Edit2 size={10} />
                      EDIT
                    </button>
                  )}
                </div>
                
                {isEditingDesc ? (
                  <div className="space-y-3">
                    <textarea
                      value={editedDesc}
                      onChange={(e) => setEditedDesc(e.target.value)}
                      placeholder="Add some details about this task..."
                      className="w-full bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-[#F0C040]/30 min-h-[120px] resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={handleSaveDescription}
                        className="bg-[#F0C040] text-black px-4 py-2 rounded-xl text-xs font-black hover:scale-105 transition-transform"
                      >
                        SAVE DETAILS
                      </button>
                      <button 
                        onClick={() => {
                          setIsEditingDesc(false)
                          setEditedDesc(selectedTask.description || '')
                        }}
                        className="text-[#555] px-4 py-2 text-xs font-bold hover:text-white transition-colors"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 min-h-[80px]">
                    {selectedTask.description ? (
                      <p className="text-[#888] text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedTask.description}
                      </p>
                    ) : (
                      <p className="text-[#333] text-sm italic">No description added yet.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Time Log Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-[#555] uppercase tracking-widest">Time Logs</h3>
                <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl divide-y divide-[#1E1E1E]">
                  <div className="p-4 flex justify-between items-center">
                    <span className="text-sm text-[#888] font-medium">Total Time Spent</span>
                    <span className="text-sm text-[#F0C040] font-black">{getTaskTotalTime(selectedTask)}m</span>
                  </div>
                  {Object.entries(selectedTask.timeLog || {}).length > 0 && (
                    <div className="p-4 space-y-3">
                      {Object.entries(selectedTask.timeLog)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([date, mins]) => (
                          <div key={date} className="flex justify-between items-center text-[11px]">
                            <span className="text-[#555] font-bold">{format(new Date(date), 'MMM d, yyyy')}</span>
                            <span className="text-[#888] font-bold">{mins} mins</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 pt-0 flex justify-between items-center bg-gradient-to-t from-[#000]/20 to-transparent">
              <div className="text-[10px] text-[#333] font-bold uppercase tracking-wider">
                Created {format(new Date(selectedTask.createdAt), 'MMM d, h:mm a')}
              </div>
              <button 
                onClick={() => {
                  deleteTask(selectedTask.id)
                  setSelectedTask(null)
                }}
                className="flex items-center gap-1.5 text-red-500/50 hover:text-red-500 text-[10px] font-bold transition-colors"
              >
                <Trash2 size={12} />
                DELETE TASK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

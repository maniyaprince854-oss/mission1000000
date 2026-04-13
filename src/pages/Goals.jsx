import { useState } from 'react'
import { Pencil, Trash2, X, Calendar as CalIcon, AlertOctagon, Play, Pause } from 'lucide-react'
import { format } from 'date-fns'
import useStore from '../store'
import { getGoalProgress, getDaysUntil, getTaskTotalTime } from '../utils/calculations'

const COLORS = ['#6366f1','#F0C040','#10b981','#ef4444','#06b6d4','#8b5cf6','#f97316','#ec4899','#84cc16']
const EMPTY = { 
  name: '', 
  description: '', 
  startDate: new Date().toISOString().split('T')[0], 
  targetDate: '', 
  status: 'active',
  section: 'ideas',
  color: COLORS[0]
}

function GoalCard({ goal, tasks, onEdit, onDelete, onStartTask, onPauseTask, onTaskClick }) {
  const [expanded, setExpanded] = useState(false)
  const { total, completed, percentage, totalTimeSpent } = getGoalProgress(goal.id, tasks)
  const goalTasks = tasks.filter(t => t.goalId === goal.id)
  const daysUntil = getDaysUntil(goal.targetDate)
  
  let urgencyClass = "text-[#666]"
  let urgencyBg = ""
  let UrgencyIcon = CalIcon
  
  if (daysUntil !== null && goal.status !== 'completed') {
    if (daysUntil < 0) {
      urgencyClass = "text-red-400 font-bold"
      urgencyBg = "bg-red-400/10 px-2 py-0.5 rounded-md border border-red-400/20"
      UrgencyIcon = AlertOctagon
    } else if (daysUntil <= 3) {
      urgencyClass = "text-orange-400 font-bold"
      urgencyBg = "bg-orange-400/10 px-2 py-0.5 rounded-md"
    }
  }

  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl overflow-hidden group hover:border-[#2a2a2a] transition-colors" style={{ borderLeft: `3px solid ${goal.color}` }}>
      {/* Card top accent */}
      <div className="px-5 pt-5 pb-4" style={{ background: `linear-gradient(135deg, ${goal.color}0d 0%, transparent 60%)` }}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm leading-tight">{goal.name}</h3>
            {goal.targetDate && (
              <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium w-fit ${urgencyClass} ${urgencyBg}`}>
                <UrgencyIcon size={12} />
                <span>
                  {daysUntil < 0 ? `Overdue by ${Math.abs(daysUntil)} days` : 
                   daysUntil === 0 ? 'Due Today' : 
                   daysUntil === 1 ? 'Due Tomorrow' : 
                   `Due: ${format(new Date(goal.targetDate), 'MMM d')}`}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(goal)} className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors"><Pencil size={12} /></button>
            <button onClick={() => onDelete(goal.id)} className="p-1.5 text-[#555] hover:text-red-400 rounded-lg transition-colors"><Trash2 size={12} /></button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 pb-5">
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-2xl font-black tabular-nums leading-none" style={{ color: goal.color }}>{completed}</div>
            <div className="text-[9px] text-[#555] mt-1 uppercase tracking-wide font-bold">Tasks Done</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-whitetabular-nums">{percentage}%</div>
            <div className="text-[9px] text-[#555] mt-0.5 uppercase tracking-wide">Progress</div>
          </div>
        </div>

        <div className="h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: goal.color }} />
        </div>

        <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#1a1a1a]">
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${goal.status === 'active' ? 'bg-[#10b981]/10 text-[#10b981]' : goal.status === 'paused' ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'bg-[#444]/20 text-[#666]'}`}>
            {goal.status}
          </span>
          <span className="text-[10px] uppercase font-bold text-[#444] tracking-wider">
            {goal.section.replace('_', ' ')}
          </span>
        </div>
      </div>
      
      {/* Expandable Task List */}
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[800px] border-t border-[#1a1a1a]' : 'max-h-0'}`}>
        <div className="bg-[#0e0e0e] p-4 text-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#252525]">
            <span className="text-[#888] font-bold text-[10px] uppercase tracking-wider">Associated Tasks</span>
            <span className="text-[#F0C040] font-bold text-xs">{totalTimeSpent}m total</span>
          </div>
          
          {goalTasks.length === 0 ? (
            <div className="text-center text-[#555] text-xs py-2 italic font-medium">No tasks linked yet.</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
              {goalTasks.map((t) => {
                let liveTime = getTaskTotalTime(t)
                if (t.isRunning && t.startTime) liveTime += Math.floor((Date.now() - t.startTime) / 60000)
                
                return (
                  <div key={t.id} onClick={() => onTaskClick(t)} className="flex justify-between items-start gap-3 p-2 rounded-xl bg-[#141414] border border-[#252525] cursor-pointer hover:border-[#333] hover:bg-[#1a1a1a] transition-all">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className={`text-xs font-semibold leading-relaxed line-clamp-2 ${t.status === 'completed' ? 'text-[#555] line-through' : 'text-white'}`}>
                        {t.title}
                      </div>
                      <div className="text-[9px] text-[#666] font-medium mt-1 uppercase tracking-wider">{format(new Date(t.date), 'MMM d, yyyy')}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {t.status !== 'completed' && (
                          <button
                            title={t.isRunning ? "Pause Task" : "Start Task"}
                            onClick={(e) => { e.stopPropagation(); t.isRunning ? onPauseTask(t.id) : onStartTask(t.id) }}
                            className={`p-1 rounded-full border transition-colors ${
                              t.isRunning 
                                ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 hover:bg-[#f59e0b]/20' 
                                : 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 hover:bg-[#10b981]/20'
                            }`}
                          >
                            {t.isRunning ? <Pause size={10} className="fill-current" /> : <Play size={10} className="fill-current translate-x-[1px]" />}
                          </button>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${t.status === 'completed' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#252525] text-[#888]'}`}>
                          {t.status === 'completed' ? 'Done' : 'Pending'}
                        </span>
                      </div>
                      {liveTime > 0 && (
                        <span className={`text-[9px] font-bold ${t.isRunning ? 'text-[#10b981]' : 'text-[#888]'}`}>
                          {liveTime}m
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Toggle Button */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2 bg-[#141414] hover:bg-[#1a1a1a] text-[#555] hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest border-t border-[#1a1a1a]"
      >
        {expanded ? 'Hide Tasks ▲' : 'Show Tasks ▼'}
      </button>
    </div>
  )
}

function TaskHistoryModal({ task, onClose, onTaskUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task ? task.title : '');

  if (!task) return null;

  const handleSaveTitle = () => {
    if (draftTitle.trim() && draftTitle.trim() !== task.title) {
      onTaskUpdate(task.id, { title: draftTitle.trim() });
    }
    setIsEditing(false);
  }

  const totalTime = getTaskTotalTime(task);
  let timeLogList = [];
  if (task.timeLog) {
    timeLogList = Object.entries(task.timeLog)
      .sort((a, b) => new Date(b[0]) - new Date(a[0])) // Descending sorting by date
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#141414] border border-[#252525] rounded-2xl p-6 w-full max-w-md" style={{ borderTop: '2px solid #F0C040' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1 min-w-0 pr-4">
            {isEditing ? (
              <input 
                autoFocus
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                className="w-full text-lg font-black text-white bg-[#1C1C1C] border border-[#F0C040] rounded-xl px-3 py-1 focus:outline-none"
              />
            ) : (
              <div className="flex items-start gap-2 group">
                <h2 className="text-lg font-black text-white leading-tight">{task.title}</h2>
                <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-[#555] hover:text-[#F0C040] mt-0.5" title="Edit Task Name">
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <div className="text-xs text-[#666] font-bold uppercase tracking-wider mt-2">Task History & Details</div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#555] hover:text-white transition-colors bg-[#1E1E1E] rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="mb-6 bg-[#0e0e0e] border border-[#1E1E1E] rounded-xl p-4 flex justify-between items-center">
          <span className="text-xs text-[#888] font-bold uppercase tracking-wider">Total Time Logged</span>
          <span className="text-2xl font-black tabular-nums text-[#F0C040]">{totalTime}m</span>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
          {timeLogList.length === 0 ? (
            <div className="text-center bg-[#0e0e0e] border border-dashed border-[#252525] rounded-xl text-[#555] text-xs py-8 font-medium">No time logged yet.</div>
          ) : (
            timeLogList.map(([date, mins]) => (
              <div key={date} className="flex justify-between items-center p-3.5 rounded-xl bg-[#1C1C1C] border border-[#252525]">
                <div className="flex items-center gap-3">
                  <div className="bg-[#252525] p-2 rounded-lg text-[#F0C040]">
                    <CalIcon size={14} />
                  </div>
                  <span className="text-sm font-semibold text-white">{format(new Date(date), 'MMMM d, yyyy')}</span>
                </div>
                <span className="text-sm font-bold text-[#10b981] bg-[#10b981]/10 px-2.5 py-1 rounded-md tabular-nums">+{mins}m</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function GoalModal({ form, setForm, editing, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#141414] border border-[#252525] rounded-2xl p-6 w-full max-w-md my-8" style={{ borderTop: '2px solid #F0C040' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-white">{editing ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Goal Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Launch SaaS Product"
              className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] placeholder-[#444]" />
          </div>
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Description <span className="text-[#444] normal-case tracking-normal">(Optional)</span></label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief details..."
              className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] placeholder-[#444] resize-none h-20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] color-scheme-dark" />
            </div>
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Target Date</label>
              <input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] color-scheme-dark" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-[#141414]' : ''}`}
                  style={{ backgroundColor: c, ringColor: c }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040]">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Board Section</label>
              <select value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040]">
                <option value="ideas">Ideas</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onSave} disabled={!form.name.trim() || !form.startDate}
            className="flex-1 py-3 font-black rounded-xl text-sm disabled:opacity-30 transition-all"
            style={{ backgroundColor: '#F0C040', color: '#000' }}>
            {editing ? 'Update Goal' : 'Create Goal'}
          </button>
          <button onClick={onClose} className="flex-1 py-3 bg-[#1C1C1C] text-[#666] rounded-xl font-bold text-sm hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Goals() {
  const goals = useStore((s) => s.goals)
  const tasks = useStore((s) => s.tasks)
  const addGoal = useStore((s) => s.addGoal)
  const updateGoal = useStore((s) => s.updateGoal)
  const deleteGoal = useStore((s) => s.deleteGoal)
  const startTask = useStore((s) => s.startTask)
  const pauseTask = useStore((s) => s.pauseTask)
  const updateTask = useStore((s) => s.updateTask)
  
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [filter, setFilter] = useState('all')
  const [selectedTaskHistory, setSelectedTaskHistory] = useState(null)

  const handleEdit = (goal) => { 
    setEditingGoal(goal)
    setForm({ 
      name: goal.name, 
      description: goal.description || '', 
      startDate: goal.startDate || new Date().toISOString().split('T')[0],
      targetDate: goal.targetDate || '',
      status: goal.status || 'active', 
      section: goal.section || 'ideas',
      color: goal.color || COLORS[0]
    })
    setShowModal(true) 
  }

  const handleDelete = (id) => { 
    if (window.confirm('Delete this goal? Any connected tasks will be unlinked.')) {
      deleteGoal(id) 
    }
  }

  const handleSave = () => {
    if (!form.name.trim()) return
    if (editingGoal) {
      updateGoal(editingGoal.id, form)
    } else {
      addGoal({ id: crypto.randomUUID(), ...form })
    }
    closeModal()
  }

  const closeModal = () => { 
    setShowModal(false)
    setTimeout(() => {
      setEditingGoal(null)
      setForm(EMPTY)
    }, 200) // slight delay to prevent flicker during modal close animation
  }
  
  const filtered = filter === 'all' ? goals : goals.filter((g) => g.status === filter)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Goals</h1>
          <p className="text-[#555] mt-1 text-sm font-medium">Create and track your main objectives</p>
        </div>
        <button onClick={() => setShowModal(true)} className="w-full sm:w-auto px-5 py-2.5 font-black rounded-xl text-sm" style={{ backgroundColor: '#F0C040', color: '#000' }}>
          + New Goal
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {['all','active','paused','completed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-4 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap"
            style={{ 
              backgroundColor: filter === s ? '#F0C040' : '#141414', 
              color: filter === s ? '#000' : '#555', 
              border: `1px solid ${filter === s ? '#F0C040' : '#1E1E1E'}` 
            }}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-24 bg-[#141414] border border-[#1E1E1E] border-dashed rounded-2xl">
          <p className="text-lg font-bold text-white">No goals found.</p>
          <button onClick={() => setShowModal(true)} className="mt-3 text-[#F0C040] text-sm font-semibold hover:underline">
            Create your first goal →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((goal) => (
            <GoalCard 
              key={goal.id} 
              goal={goal} 
              tasks={tasks} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
              onStartTask={startTask}
              onPauseTask={pauseTask}
              onTaskClick={setSelectedTaskHistory}
            />
          ))}
        </div>
      )}
      {showModal && <GoalModal form={form} setForm={setForm} editing={editingGoal} onSave={handleSave} onClose={closeModal} />}
      {selectedTaskHistory && (
        <TaskHistoryModal 
          task={selectedTaskHistory} 
          onClose={() => setSelectedTaskHistory(null)} 
          onTaskUpdate={(id, updates) => {
            updateTask(id, updates);
            setSelectedTaskHistory((prev) => ({...prev, ...updates}));
          }}
        />
      )}
    </div>
  )
}

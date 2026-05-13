import { useState } from 'react'
import { Pencil, Trash2, X, Calendar as CalIcon, Play, Pause, GripVertical, Check, ChevronDown, ChevronUp, Flag, Clock, Target, TrendingUp, BarChart3, Zap } from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
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
  color: COLORS[0],
  priority: 'medium',
}

const PRIORITY_STYLES = {
  high:   { label: 'HIGH',   bg: 'bg-red-500/15',        text: 'text-red-400',      border: 'border-red-500/30'      },
  medium: { label: 'MED',    bg: 'bg-[#F0C040]/15',      text: 'text-[#F0C040]',    border: 'border-[#F0C040]/30'    },
  low:    { label: 'LOW',    bg: 'bg-[#10b981]/15',      text: 'text-[#10b981]',    border: 'border-[#10b981]/30'    },
}

const SORT_OPTIONS = [
  { value: 'manual',   label: 'Manual Order' },
  { value: 'priority', label: 'Priority' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'progress', label: 'Progress' },
  { value: 'time',     label: 'Time Spent' },
]

function fmtTime(mins) {
  if (!mins || mins <= 0) return '0m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function GoalCard({ goal, tasks, onEdit, onDelete, onStartTask, onPauseTask, onTaskClick, onAddTask, onAddMilestone, onToggleMilestone, onDeleteMilestone, dragHandleProps }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('tasks')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newMilestone, setNewMilestone] = useState('')

  const { total, completed, percentage, totalTimeSpent } = getGoalProgress(goal.id, tasks)
  const goalTasks = tasks.filter(t => t.goalId === goal.id)
  const daysUntil = getDaysUntil(goal.targetDate)
  const milestones = goal.milestones || []
  const doneMilestones = milestones.filter(m => m.done).length
  const pStyle = PRIORITY_STYLES[goal.priority || 'medium']

  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (percentage / 100) * circumference

  let urgencyText = ''
  let urgencyClass = 'text-[#555]'
  if (daysUntil !== null && goal.status !== 'completed') {
    if (daysUntil < 0) {
      urgencyText = `${Math.abs(daysUntil)}d overdue`
      urgencyClass = 'text-red-400'
    } else if (daysUntil === 0) {
      urgencyText = 'Due today'
      urgencyClass = 'text-orange-400'
    } else if (daysUntil === 1) {
      urgencyText = 'Due tomorrow'
      urgencyClass = 'text-orange-400'
    } else if (daysUntil <= 7) {
      urgencyText = `${daysUntil}d left`
      urgencyClass = 'text-[#F0C040]'
    } else {
      urgencyText = format(new Date(goal.targetDate + 'T12:00:00'), 'MMM d, yyyy')
      urgencyClass = 'text-[#555]'
    }
  }

  return (
    <div
      className="bg-[#141414] border border-[#1E1E1E] rounded-2xl overflow-hidden group hover:border-[#2a2a2a] transition-all duration-300 hover:shadow-xl hover:shadow-black/40"
      style={{ borderLeft: `3px solid ${goal.color}` }}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3" style={{ background: `linear-gradient(135deg, ${goal.color}10 0%, transparent 55%)` }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-[#444] hover:text-white mt-1 flex-shrink-0 transition-colors">
              <GripVertical size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                  {pStyle.label}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide
                  ${goal.status === 'active' ? 'bg-[#10b981]/10 text-[#10b981]'
                  : goal.status === 'paused' ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                  : 'bg-[#444]/20 text-[#666]'}`}
                >
                  {goal.status}
                </span>
                <span className="text-[9px] text-[#444] uppercase tracking-wider font-bold">
                  {goal.section.replace('_', ' ')}
                </span>
              </div>
              <h3 className="font-bold text-white text-sm leading-tight break-words">{goal.name}</h3>
              {goal.description && (
                <p className="text-[#555] text-[10px] mt-1 leading-relaxed line-clamp-2">{goal.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
            <button onClick={() => onEdit(goal)} className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors"><Pencil size={12} /></button>
            <button onClick={() => onDelete(goal.id)} className="p-1.5 text-[#555] hover:text-red-400 rounded-lg transition-colors"><Trash2 size={12} /></button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          {/* Circular progress ring */}
          <div className="relative flex-shrink-0">
            <svg width="70" height="70" viewBox="0 0 70 70">
              <circle cx="35" cy="35" r={radius} fill="none" stroke="#1a1a1a" strokeWidth="5.5" />
              <circle
                cx="35" cy="35" r={radius}
                fill="none"
                stroke={goal.color}
                strokeWidth="5.5"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 35 35)"
                style={{ transition: 'stroke-dashoffset 0.6s ease', filter: `drop-shadow(0 0 5px ${goal.color}90)` }}
              />
              <text x="35" y="32" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="system-ui,sans-serif">
                {percentage}%
              </text>
              <text x="35" y="43" textAnchor="middle" fill="#555" fontSize="7.5" fontFamily="system-ui,sans-serif">
                done
              </text>
            </svg>
          </div>

          {/* Metrics */}
          <div className="flex-1 space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[9px] text-[#555] uppercase tracking-wide font-bold mb-0.5">Tasks</div>
                <div className="text-white font-black text-lg leading-none tabular-nums">
                  {completed}<span className="text-[#444] text-sm font-bold">/{total}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-[#555] uppercase tracking-wide font-bold mb-0.5">Time</div>
                <div className="font-black text-base leading-none tabular-nums" style={{ color: goal.color }}>
                  {fmtTime(totalTimeSpent)}
                </div>
              </div>
            </div>

            {goal.targetDate && (
              <div className={`flex items-center gap-1.5 text-[10px] font-bold ${urgencyClass}`}>
                <CalIcon size={10} />
                <span>{urgencyText}</span>
              </div>
            )}

            {milestones.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${milestones.length > 0 ? (doneMilestones / milestones.length) * 100 : 0}%`, backgroundColor: goal.color }}
                  />
                </div>
                <span className={`text-[9px] font-bold flex-shrink-0 ${doneMilestones === milestones.length && milestones.length > 0 ? 'text-[#10b981]' : 'text-[#555]'}`}>
                  <Flag size={9} className="inline mr-0.5" />
                  {doneMilestones}/{milestones.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded section */}
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'border-t border-[#1a1a1a]' : 'max-h-0'}`}>
        {/* Tabs */}
        <div className="flex bg-[#0a0a0a] border-b border-[#1a1a1a]">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'tasks' ? 'text-[#F0C040] border-[#F0C040]' : 'text-[#444] border-transparent hover:text-[#888]'}`}
          >
            Tasks ({goalTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('milestones')}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'milestones' ? 'text-[#F0C040] border-[#F0C040]' : 'text-[#444] border-transparent hover:text-[#888]'}`}
          >
            Milestones ({milestones.length})
          </button>
        </div>

        <div className="bg-[#0e0e0e] p-4">
          {activeTab === 'tasks' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#666] font-bold text-[10px] uppercase tracking-wider">All Linked Tasks</span>
                <span className="text-[#F0C040] font-bold text-xs">{fmtTime(totalTimeSpent)} total</span>
              </div>

              {goalTasks.length === 0 ? (
                <div className="text-center text-[#444] text-xs py-4 italic">No tasks linked yet.</div>
              ) : (
                <Droppable droppableId={goal.id} direction="vertical">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 mb-3">
                      {goalTasks.map((t, index) => {
                        let liveTime = getTaskTotalTime(t)
                        if (t.isRunning && t.startTime) liveTime += Math.floor((Date.now() - t.startTime) / 60000)
                        return (
                          <Draggable key={t.id} draggableId={t.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => onTaskClick(t)}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all
                                  ${t.isRunning ? 'bg-[#10b981]/5 border-[#10b981]/20' : 'bg-[#141414] border-[#252525] hover:border-[#333]'}`}
                              >
                                <div {...provided.dragHandleProps} onClick={e => e.stopPropagation()} className="text-[#333] hover:text-[#666] cursor-grab flex-shrink-0">
                                  <GripVertical size={11} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs font-medium line-clamp-1 ${t.status === 'completed' ? 'text-[#555] line-through' : 'text-white'}`}>
                                    {t.title}
                                  </div>
                                  <div className="text-[9px] text-[#555] mt-0.5">{format(new Date(t.date), 'MMM d')}</div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {t.status !== 'completed' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); t.isRunning ? onPauseTask(t.id) : onStartTask(t.id) }}
                                      className={`p-1 rounded-full border transition-colors ${t.isRunning ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30' : 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'}`}
                                    >
                                      {t.isRunning ? <Pause size={9} className="fill-current" /> : <Play size={9} className="fill-current translate-x-px" />}
                                    </button>
                                  )}
                                  {liveTime > 0 && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.isRunning ? 'text-[#10b981] bg-[#10b981]/10' : 'text-[#666] bg-[#1C1C1C]'}`}>
                                      {liveTime}m
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-bold w-4 text-center ${t.status === 'completed' ? 'text-[#10b981]' : 'text-[#444]'}`}>
                                    {t.status === 'completed' ? '✓' : '○'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}

              <input
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) {
                    onAddTask({ id: crypto.randomUUID(), title: newTaskTitle.trim(), date: new Date().toISOString().split('T')[0], goalId: goal.id, status: 'pending', createdAt: new Date().toISOString() })
                    setNewTaskTitle('')
                  }
                }}
                placeholder="Add task · press Enter"
                className="w-full bg-[#141414] border border-[#252525] text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F0C040]/40 placeholder-[#444] transition-colors"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#666] font-bold text-[10px] uppercase tracking-wider">Milestones</span>
                {milestones.length > 0 && (
                  <span className={`text-[10px] font-bold ${doneMilestones === milestones.length ? 'text-[#10b981]' : 'text-[#555]'}`}>
                    {doneMilestones}/{milestones.length} complete
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-3">
                {milestones.length === 0 ? (
                  <div className="text-center text-[#444] text-xs py-4 italic">No milestones yet. Add one below.</div>
                ) : milestones.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#141414] border border-[#252525] group/m hover:border-[#2a2a2a] transition-colors">
                    <button
                      onClick={() => onToggleMilestone(goal.id, m.id)}
                      className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110
                        ${m.done ? 'border-[#10b981]' : 'border-[#333] hover:border-[#F0C040]'}`}
                      style={{ backgroundColor: m.done ? goal.color : 'transparent', borderColor: m.done ? goal.color : undefined }}
                    >
                      {m.done && <Check size={9} strokeWidth={3} className="text-black" />}
                    </button>
                    <span className={`flex-1 text-xs leading-relaxed ${m.done ? 'text-[#444] line-through' : 'text-white'}`}>
                      {m.text}
                    </span>
                    <button
                      onClick={() => onDeleteMilestone(goal.id, m.id)}
                      className="opacity-0 group-hover/m:opacity-100 p-1 text-[#333] hover:text-red-400 transition-all"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

              <input
                value={newMilestone}
                onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newMilestone.trim()) {
                    onAddMilestone(goal.id, newMilestone.trim())
                    setNewMilestone('')
                  }
                }}
                placeholder="Add milestone · press Enter"
                className="w-full bg-[#141414] border border-[#252525] text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F0C040]/40 placeholder-[#444] transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2.5 bg-[#0a0a0a] hover:bg-[#141414] text-[#444] hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border-t border-[#1a1a1a] flex items-center justify-center gap-1.5"
      >
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {expanded ? 'Collapse' : `Expand · ${goalTasks.length} tasks · ${milestones.length} milestones`}
      </button>
    </div>
  )
}

function TaskHistoryModal({ task, onClose, onTaskUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(task ? task.title : '')

  if (!task) return null

  const handleSaveTitle = () => {
    if (draftTitle.trim() && draftTitle.trim() !== task.title) {
      onTaskUpdate(task.id, { title: draftTitle.trim() })
    }
    setIsEditing(false)
  }

  const totalTime = getTaskTotalTime(task)
  const timeLogList = task.timeLog ? Object.entries(task.timeLog).sort((a, b) => new Date(b[0]) - new Date(a[0])) : []

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#141414] border border-[#252525] rounded-2xl p-6 w-full max-w-md" style={{ borderTop: '2px solid #F0C040' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1 min-w-0 pr-4">
            {isEditing ? (
              <input autoFocus value={draftTitle} onChange={e => setDraftTitle(e.target.value)} onBlur={handleSaveTitle} onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                className="w-full text-lg font-black text-white bg-[#1C1C1C] border border-[#F0C040] rounded-xl px-3 py-1 focus:outline-none" />
            ) : (
              <div className="flex items-start gap-2 group">
                <h2 className="text-lg font-black text-white leading-tight">{task.title}</h2>
                <button onClick={() => setIsEditing(true)} className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-[#555] hover:text-[#F0C040] mt-0.5">
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <div className="text-xs text-[#666] font-bold uppercase tracking-wider mt-2">Task History</div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#555] hover:text-white bg-[#1E1E1E] rounded-lg"><X size={16} /></button>
        </div>

        <div className="mb-6 bg-[#0e0e0e] border border-[#1E1E1E] rounded-xl p-4 flex justify-between items-center">
          <span className="text-xs text-[#888] font-bold uppercase tracking-wider">Total Time Logged</span>
          <span className="text-2xl font-black tabular-nums text-[#F0C040]">{fmtTime(totalTime)}</span>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {timeLogList.length === 0 ? (
            <div className="text-center bg-[#0e0e0e] border border-dashed border-[#252525] rounded-xl text-[#555] text-xs py-8">No time logged yet.</div>
          ) : timeLogList.map(([date, mins]) => (
            <div key={date} className="flex justify-between items-center p-3.5 rounded-xl bg-[#1C1C1C] border border-[#252525]">
              <div className="flex items-center gap-3">
                <div className="bg-[#252525] p-2 rounded-lg text-[#F0C040]"><CalIcon size={14} /></div>
                <span className="text-sm font-semibold text-white">{format(new Date(date), 'MMMM d, yyyy')}</span>
              </div>
              <span className="text-sm font-bold text-[#10b981] bg-[#10b981]/10 px-2.5 py-1 rounded-md tabular-nums">+{mins}m</span>
            </div>
          ))}
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
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Launch SaaS Product"
              className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] placeholder-[#444]" />
          </div>
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Description <span className="text-[#444] normal-case">(optional)</span></label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does success look like?"
              className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040] placeholder-[#444] resize-none h-20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040]" />
            </div>
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Target Date</label>
              <input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040]" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {['high', 'medium', 'low'].map(p => {
                const s = PRIORITY_STYLES[p]
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all
                      ${form.priority === p ? `${s.bg} ${s.text} ${s.border} scale-[1.02] shadow-lg` : 'bg-[#1C1C1C] text-[#444] border-[#252525] hover:border-[#333]'}`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-[#141414] scale-110' : ''}`}
                  style={{ backgroundColor: c, ringColor: c }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F0C040]">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[#555] uppercase tracking-wider font-medium block mb-2">Board Section</label>
              <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
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
            className="flex-1 py-3 font-black rounded-xl text-sm disabled:opacity-30 transition-all hover:scale-[1.02]"
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
  const goals = useStore(s => s.goals)
  const tasks = useStore(s => s.tasks)
  const addGoal = useStore(s => s.addGoal)
  const updateGoal = useStore(s => s.updateGoal)
  const deleteGoal = useStore(s => s.deleteGoal)
  const startTask = useStore(s => s.startTask)
  const pauseTask = useStore(s => s.pauseTask)
  const updateTask = useStore(s => s.updateTask)
  const reorderTasks = useStore(s => s.reorderTasks)
  const addTask = useStore(s => s.addTask)
  const reorderGoals = useStore(s => s.reorderGoals)
  const addMilestone = useStore(s => s.addMilestone)
  const toggleMilestone = useStore(s => s.toggleMilestone)
  const deleteMilestone = useStore(s => s.deleteMilestone)

  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('manual')
  const [selectedTaskHistory, setSelectedTaskHistory] = useState(null)

  // Aggregate stats
  const totalTime = tasks.reduce((sum, t) => sum + getTaskTotalTime(t), 0)
  const activeGoals = goals.filter(g => g.status === 'active')
  const totalCompleted = tasks.filter(t => t.status === 'completed').length
  const totalTasks = tasks.length
  const overallPct = totalTasks === 0 ? 0 : Math.round((totalCompleted / totalTasks) * 100)

  const handleEdit = (goal) => {
    setEditingGoal(goal)
    setForm({
      name: goal.name,
      description: goal.description || '',
      startDate: goal.startDate || new Date().toISOString().split('T')[0],
      targetDate: goal.targetDate || '',
      status: goal.status || 'active',
      section: goal.section || 'ideas',
      color: goal.color || COLORS[0],
      priority: goal.priority || 'medium',
    })
    setShowModal(true)
  }

  const handleDelete = (id) => {
    if (window.confirm('Delete this goal? Any connected tasks will be unlinked.')) deleteGoal(id)
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
    setTimeout(() => { setEditingGoal(null); setForm(EMPTY) }, 200)
  }

  const handleDragEnd = (result) => {
    if (!result.destination) return
    const { source, destination, draggableId, type } = result

    if (type === 'goal') {
      if (source.index !== destination.index) {
        reorderGoals(draggableId, sorted[destination.index].id)
      }
      return
    }

    if (source.droppableId === destination.droppableId && source.index !== destination.index) {
      const goalTasks = tasks.filter(t => t.goalId === source.droppableId)
      reorderTasks(draggableId, goalTasks[destination.index].id)
    } else if (source.droppableId !== destination.droppableId) {
      updateTask(draggableId, { goalId: destination.droppableId })
    }
  }

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

  let filtered = filter === 'all' ? goals : goals.filter(g => g.status === filter)

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'manual') return 0
    if (sortBy === 'priority') {
      return (PRIORITY_ORDER[a.priority || 'medium'] ?? 1) - (PRIORITY_ORDER[b.priority || 'medium'] ?? 1)
    }
    if (sortBy === 'deadline') {
      const da = getDaysUntil(a.targetDate) ?? 99999
      const db = getDaysUntil(b.targetDate) ?? 99999
      return da - db
    }
    if (sortBy === 'progress') {
      const pa = getGoalProgress(a.id, tasks).percentage
      const pb = getGoalProgress(b.id, tasks).percentage
      return pb - pa
    }
    if (sortBy === 'time') {
      const ta = getGoalProgress(a.id, tasks).totalTimeSpent
      const tb = getGoalProgress(b.id, tasks).totalTimeSpent
      return tb - ta
    }
    return 0
  })

  const statCards = [
    { icon: Target,    label: 'Total Goals',     value: goals.length,           color: '#6366f1' },
    { icon: Zap,       label: 'Active',           value: activeGoals.length,     color: '#10b981' },
    { icon: Clock,     label: 'Time Tracked',     value: fmtTime(totalTime),     color: '#F0C040' },
    { icon: TrendingUp, label: 'Tasks Done',      value: `${totalCompleted}/${totalTasks}`, color: '#06b6d4' },
    { icon: BarChart3, label: 'Completion',       value: `${overallPct}%`,       color: '#8b5cf6' },
  ]

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent tracking-tight">Goals</h1>
            <p className="text-[#555] mt-1 text-sm font-medium">Mission control for your objectives</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="w-full sm:w-auto px-5 py-2.5 font-black rounded-xl text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#F0C040]/10"
            style={{ backgroundColor: '#F0C040', color: '#000' }}>
            + New Goal
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {statCards.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 flex items-center gap-3 hover:border-[#2a2a2a] transition-colors">
              <div className="p-2 rounded-xl flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
                <Icon size={15} style={{ color }} />
              </div>
              <div className="min-w-0">
                <div className="text-white font-black text-base leading-none tabular-nums">{value}</div>
                <div className="text-[#555] text-[10px] uppercase tracking-wide font-bold mt-1">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {['all', 'active', 'paused', 'completed'].map(s => (
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

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[#444] font-bold uppercase tracking-wider hidden sm:block">Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-[#141414] border border-[#1E1E1E] text-[#888] text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#F0C040] hover:border-[#2a2a2a] transition-colors"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Goals grid */}
        {sorted.length === 0 ? (
          <div className="text-center py-24 bg-[#141414] border border-[#1E1E1E] border-dashed rounded-2xl">
            <p className="text-lg font-bold text-white">No goals found.</p>
            <button onClick={() => setShowModal(true)} className="mt-3 text-[#F0C040] text-sm font-semibold hover:underline">
              Create your first goal →
            </button>
          </div>
        ) : (
          <Droppable droppableId="goals-list" type="goal" direction="horizontal">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sorted.map((goal, index) => (
                  <Draggable key={goal.id} draggableId={goal.id} index={index}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.draggableProps}>
                        <GoalCard
                          goal={goal}
                          tasks={tasks}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onStartTask={startTask}
                          onPauseTask={pauseTask}
                          onTaskClick={setSelectedTaskHistory}
                          onAddTask={addTask}
                          onAddMilestone={addMilestone}
                          onToggleMilestone={toggleMilestone}
                          onDeleteMilestone={deleteMilestone}
                          dragHandleProps={provided.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        )}

        {showModal && <GoalModal form={form} setForm={setForm} editing={editingGoal} onSave={handleSave} onClose={closeModal} />}

        {selectedTaskHistory && (
          <TaskHistoryModal
            task={selectedTaskHistory}
            onClose={() => setSelectedTaskHistory(null)}
            onTaskUpdate={(id, updates) => {
              updateTask(id, updates)
              setSelectedTaskHistory(prev => ({ ...prev, ...updates }))
            }}
          />
        )}
      </div>
    </DragDropContext>
  )
}

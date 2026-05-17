import { useState, useRef, useEffect } from 'react'
import { X, CheckCircle2, Circle, ArrowRightLeft } from 'lucide-react'
import { format } from 'date-fns'
import useStore from '../store'
import { getGoalProgress, getTaskTotalTime } from '../utils/calculations'

const GOAL_ORBIT = 230
const TASK_ORBIT = 115
const TASK_SPREAD = 1.15

function fmtMins(m) {
  if (!m) return '0m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function curvePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const nx = -dy * 0.12
  const ny = dx * 0.12
  return `M ${x1} ${y1} Q ${mx + nx} ${my + ny} ${x2} ${y2}`
}

export default function Analyse() {
  const tasks = useStore(s => s.tasks)
  const goals = useStore(s => s.goals)
  const updateTask = useStore(s => s.updateTask)

  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 700, h: 600 })
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [drag, setDrag] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cx = size.w / 2
  const cy = size.h / 2

  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const goalNodes = goals.map((goal, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, goals.length) - Math.PI / 2
    return { ...goal, x: cx + GOAL_ORBIT * Math.cos(angle), y: cy + GOAL_ORBIT * Math.sin(angle), angle }
  })

  const taskNodes = goalNodes.flatMap(gn => {
    const gt = filteredTasks.filter(t => t.goalId === gn.id)
    return gt.map((task, j) => {
      const span = gt.length > 1 ? TASK_SPREAD : 0
      const tAngle = gn.angle + (span * (j - (gt.length - 1) / 2)) / Math.max(1, gt.length - 1)
      return {
        ...task,
        x: gn.x + TASK_ORBIT * Math.cos(tAngle),
        y: gn.y + TASK_ORBIT * Math.sin(tAngle),
        goalColor: gn.color,
      }
    })
  })

  const unassigned = filteredTasks.filter(t => !goalNodes.some(gn => gn.id === t.goalId))

  const getSVGPos = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onTaskMouseDown = (e, taskId, goalId) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = getSVGPos(e)
    setDrag({ taskId, goalId, x: pos.x, y: pos.y })
    setDropTarget(null)
  }

  const onSVGMouseMove = (e) => {
    if (!drag) return
    const pos = getSVGPos(e)
    setDrag(d => ({ ...d, x: pos.x, y: pos.y }))
    const hovered = goalNodes.find(gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < 36)
    setDropTarget(hovered?.id || null)
  }

  const onSVGMouseUp = () => {
    if (drag && dropTarget && dropTarget !== drag.goalId) {
      updateTask(drag.taskId, { goalId: dropTarget })
      setSelected({ type: 'task', id: drag.taskId })
    }
    setDrag(null)
    setDropTarget(null)
  }

  const selGoal = selected?.type === 'goal' ? goals.find(g => g.id === selected.id) : null
  const selTask = selected?.type === 'task' ? tasks.find(t => t.id === selected.id) : null

  const totalTime = tasks.reduce((s, t) => s + getTaskTotalTime(t), 0)
  const doneCount = tasks.filter(t => t.status === 'completed').length
  const totalTasks = tasks.length

  return (
    <div className="flex h-full bg-[#0C0C0C] overflow-hidden">
      {/* SVG Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* Filter bar */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
          <div className="flex bg-[#141414] border border-[#1E1E1E] rounded-xl p-1 gap-0.5">
            {['all', 'pending', 'completed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  filter === f ? 'bg-[#F0C040] text-black' : 'text-[#555] hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-[#2a2a2a] text-xs font-bold">
            {taskNodes.length + unassigned.length} tasks · {goals.length} goals
          </span>
        </div>

        {/* Drag hint */}
        <div className="absolute bottom-4 left-4 z-10 text-[#2a2a2a] text-[10px] font-bold uppercase tracking-widest">
          Drag tasks between goals to reassign
        </div>

        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          onMouseMove={onSVGMouseMove}
          onMouseUp={onSVGMouseUp}
          onMouseLeave={onSVGMouseUp}
          onClick={() => { if (!drag) setSelected(null) }}
          className="select-none"
        >
          <defs>
            <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="softglow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#181818" />
            </pattern>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F0C040" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#F0C040" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background */}
          <rect width={size.w} height={size.h} fill="url(#dots)" />
          <circle cx={cx} cy={cy} r={220} fill="url(#centerGlow)" />

          {/* Orbit ring */}
          <circle cx={cx} cy={cy} r={GOAL_ORBIT} fill="none" stroke="#1a1a1a" strokeWidth={1} strokeDasharray="4 6" />

          {/* Lines: center → goals */}
          {goalNodes.map(gn => (
            <path
              key={`cl-${gn.id}`}
              d={curvePath(cx, cy, gn.x, gn.y)}
              stroke={gn.color}
              strokeWidth={1.5}
              strokeOpacity={0.12}
              fill="none"
            />
          ))}

          {/* Lines: goals → tasks */}
          {taskNodes.map(tn => {
            if (drag?.taskId === tn.id) return null
            const gn = goalNodes.find(g => g.id === tn.goalId)
            if (!gn) return null
            return (
              <path
                key={`tl-${tn.id}`}
                d={curvePath(gn.x, gn.y, tn.x, tn.y)}
                stroke={tn.goalColor}
                strokeWidth={1}
                strokeOpacity={0.15}
                fill="none"
              />
            )
          })}

          {/* Drag ghost line */}
          {drag && (() => {
            const sg = goalNodes.find(g => g.id === drag.goalId)
            if (!sg) return null
            return (
              <line
                x1={sg.x} y1={sg.y} x2={drag.x} y2={drag.y}
                stroke="#F0C040"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeOpacity={0.5}
              />
            )
          })()}

          {/* Task nodes */}
          {taskNodes.map(tn => {
            const isDragging = drag?.taskId === tn.id
            const isSelected = selected?.type === 'task' && selected?.id === tn.id
            const isDone = tn.status === 'completed'
            const mins = getTaskTotalTime(tn)
            const tx = isDragging ? drag.x : tn.x
            const ty = isDragging ? drag.y : tn.y

            return (
              <g
                key={tn.id}
                transform={`translate(${tx},${ty})`}
                onMouseDown={(e) => onTaskMouseDown(e, tn.id, tn.goalId)}
                onClick={(e) => { e.stopPropagation(); if (!drag) setSelected({ type: 'task', id: tn.id }) }}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              >
                {isSelected && (
                  <circle r={22} fill="none" stroke={tn.goalColor} strokeWidth={1.5} strokeOpacity={0.35} />
                )}
                <circle
                  r={15}
                  fill={isDone ? '#111' : `${tn.goalColor}18`}
                  stroke={tn.goalColor}
                  strokeWidth={isDragging ? 2.5 : isSelected ? 2 : 1.2}
                  strokeOpacity={isDone ? 0.2 : isDragging ? 1 : 0.6}
                  filter={isDragging ? 'url(#softglow)' : undefined}
                />
                {isDone
                  ? <circle r={4.5} fill="#10b981" />
                  : mins > 0
                    ? <text x={0} y={4} textAnchor="middle" fontSize={7.5} fill={tn.goalColor} fontWeight="bold" fontFamily="monospace">{mins}m</text>
                    : <circle r={3} fill={tn.goalColor} fillOpacity={0.45} />
                }
                <title>{tn.title}{mins > 0 ? ` · ${fmtMins(mins)}` : ''}</title>
              </g>
            )
          })}

          {/* Goal nodes */}
          {goalNodes.map(gn => {
            const progress = getGoalProgress(gn.id, tasks)
            const isSelected = selected?.type === 'goal' && selected?.id === gn.id
            const isDropTarget = dropTarget === gn.id
            const R = 33
            const circ = 2 * Math.PI * (R - 6)
            const dashOff = circ * (1 - progress.percentage / 100)

            return (
              <g
                key={gn.id}
                transform={`translate(${gn.x},${gn.y})`}
                onClick={(e) => { e.stopPropagation(); setSelected({ type: 'goal', id: gn.id }) }}
                style={{ cursor: 'pointer' }}
              >
                {isDropTarget && (
                  <circle r={44} fill={`${gn.color}10`} stroke={gn.color} strokeWidth={2} strokeOpacity={0.6} filter="url(#glow)" />
                )}
                {isSelected && (
                  <circle r={40} fill="none" stroke={gn.color} strokeWidth={1.5} strokeOpacity={0.25} strokeDasharray="4 4" />
                )}
                <circle
                  r={R}
                  fill="#111"
                  stroke={gn.color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeOpacity={isSelected ? 0.9 : 0.5}
                />
                <circle
                  r={R - 6}
                  fill="none"
                  stroke={gn.color}
                  strokeWidth={3.5}
                  strokeDasharray={circ}
                  strokeDashoffset={dashOff}
                  strokeLinecap="round"
                  strokeOpacity={0.65}
                  transform="rotate(-90)"
                />
                <text x={0} y={-5} textAnchor="middle" fontSize={11} fill={gn.color} fontWeight="900" fontFamily="monospace">
                  {progress.percentage}%
                </text>
                <text x={0} y={8} textAnchor="middle" fontSize={7} fill="#555" fontFamily="monospace">
                  {progress.completed}/{progress.total}
                </text>
                <text x={0} y={R + 15} textAnchor="middle" fontSize={9} fill="#777" fontWeight="bold">
                  {gn.name.length > 18 ? gn.name.slice(0, 17) + '…' : gn.name}
                </text>
              </g>
            )
          })}

          {/* Center node */}
          <g
            transform={`translate(${cx},${cy})`}
            onClick={(e) => { e.stopPropagation(); setSelected(null) }}
            style={{ cursor: 'pointer' }}
          >
            <circle r={48} fill="#0d0d00" stroke="#F0C040" strokeWidth={2} strokeOpacity={0.7} />
            <circle r={44} fill="none" stroke="#F0C040" strokeWidth={0.5} strokeOpacity={0.18} strokeDasharray="3 5" />
            <text x={0} y={-7} textAnchor="middle" fontSize={11} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}>
              MISSION
            </text>
            <text x={0} y={9} textAnchor="middle" fontSize={11} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}>
              10000
            </text>
          </g>

          {/* Unassigned tasks cluster */}
          {unassigned.length > 0 && (
            <>
              <text x={30} y={size.h - 80} fontSize={8} fill="#333" fontWeight="bold" letterSpacing={1}>
                UNASSIGNED ({unassigned.length})
              </text>
              {unassigned.map((t, i) => {
                const ux = 30 + (i % 6) * 34
                const uy = size.h - 58 + Math.floor(i / 6) * 34
                const isSelected = selected?.type === 'task' && selected?.id === t.id
                return (
                  <g
                    key={t.id}
                    transform={`translate(${ux},${uy})`}
                    onClick={(e) => { e.stopPropagation(); setSelected({ type: 'task', id: t.id }) }}
                    style={{ cursor: 'pointer' }}
                  >
                    {isSelected && <circle r={20} fill="none" stroke="#444" strokeWidth={1.5} />}
                    <circle r={13} fill="#111" stroke="#2a2a2a" strokeWidth={1.2} />
                    {t.status === 'completed'
                      ? <circle r={4} fill="#10b981" />
                      : <circle r={3} fill="#2a2a2a" />
                    }
                    <title>{t.title}</title>
                  </g>
                )
              })}
            </>
          )}
        </svg>
      </div>

      {/* Right Detail Panel */}
      <div className="w-72 xl:w-80 border-l border-[#1E1E1E] bg-[#080808] flex flex-col overflow-hidden flex-shrink-0">
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-[#1E1E1E] flex items-center justify-between flex-shrink-0">
          <h2 className="text-[11px] font-black text-[#555] uppercase tracking-widest">
            {selGoal ? 'Goal Details' : selTask ? 'Task Details' : 'Overview'}
          </h2>
          {selected && (
            <button onClick={() => setSelected(null)} className="p-1 text-[#333] hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Overview */}
          {!selected && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Goals', value: goals.length, color: '#F0C040' },
                  { label: 'Total Tasks', value: totalTasks, color: '#6366f1' },
                  { label: 'Completed', value: doneCount, color: '#10b981' },
                  { label: 'Time Logged', value: fmtMins(totalTime), color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                    <div className="text-[9px] text-[#333] font-black uppercase tracking-widest mb-1">{label}</div>
                    <div className="text-lg font-black" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Goals</div>
                {goalNodes.map(gn => {
                  const p = getGoalProgress(gn.id, tasks)
                  return (
                    <div
                      key={gn.id}
                      className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3 cursor-pointer hover:border-[#222] transition-colors"
                      onClick={() => setSelected({ type: 'goal', id: gn.id })}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: gn.color }} />
                          <span className="text-xs font-bold text-[#aaa] truncate">{gn.name}</span>
                        </div>
                        <span className="text-xs font-black ml-2 flex-shrink-0" style={{ color: gn.color }}>{p.percentage}%</span>
                      </div>
                      <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${p.percentage}%`, backgroundColor: gn.color }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[9px] text-[#333] font-bold">
                        <span>{p.completed}/{p.total} tasks</span>
                        <span>{fmtMins(p.totalTimeSpent)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Goal details */}
          {selGoal && (() => {
            const p = getGoalProgress(selGoal.id, tasks)
            const goalTasks = tasks.filter(t => t.goalId === selGoal.id)
            return (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selGoal.color }} />
                  <span className="text-sm font-black text-white leading-snug">{selGoal.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Tasks', value: p.total },
                    { label: 'Done', value: p.completed },
                    { label: 'Time', value: fmtMins(p.totalTimeSpent) },
                    { label: 'Progress', value: `${p.percentage}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                      <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">{label}</div>
                      <div className="text-base font-black text-white mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p.percentage}%`, backgroundColor: selGoal.color }} />
                </div>

                <div className="space-y-1.5">
                  <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">
                    Tasks ({goalTasks.length})
                  </div>
                  {goalTasks.length === 0 && (
                    <div className="text-center py-6 text-[#2a2a2a] text-xs">No tasks assigned</div>
                  )}
                  {goalTasks.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setSelected({ type: 'task', id: t.id })}
                      className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-xl border border-[#1a1a1a] cursor-pointer hover:border-[#222] transition-colors"
                    >
                      {t.status === 'completed'
                        ? <CheckCircle2 size={13} className="text-[#10b981] flex-shrink-0" />
                        : <Circle size={13} className="text-[#2a2a2a] flex-shrink-0" />
                      }
                      <span className="text-xs text-[#666] flex-1 truncate">{t.title}</span>
                      {getTaskTotalTime(t) > 0 && (
                        <span className="text-[9px] text-[#333] font-bold flex-shrink-0">{getTaskTotalTime(t)}m</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )
          })()}

          {/* Task details */}
          {selTask && (() => {
            const taskGoal = goals.find(g => g.id === selTask.goalId)
            const mins = getTaskTotalTime(selTask)
            const timeLogs = Object.entries(selTask.timeLog || {}).sort((a, b) => b[0].localeCompare(a[0]))
            return (
              <>
                <div>
                  {taskGoal && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskGoal.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: taskGoal.color }}>{taskGoal.name}</span>
                    </div>
                  )}
                  {!taskGoal && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#333]" />
                      <span className="text-[10px] font-bold text-[#444] uppercase tracking-wide">Unassigned</span>
                    </div>
                  )}
                  <div className="text-sm font-black text-white leading-snug">{selTask.title}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                    <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">Status</div>
                    <div className={`text-sm font-black mt-0.5 ${selTask.status === 'completed' ? 'text-[#10b981]' : 'text-[#F0C040]'}`}>
                      {selTask.status === 'completed' ? 'Done' : 'Active'}
                    </div>
                  </div>
                  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                    <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">Time</div>
                    <div className="text-sm font-black text-white mt-0.5">{fmtMins(mins)}</div>
                  </div>
                </div>

                {/* Transfer to Goal */}
                <div>
                  <div className="text-[9px] font-black text-[#333] uppercase tracking-widest mb-2">Transfer to Goal</div>
                  <div className="space-y-1.5">
                    {goals.filter(g => g.id !== selTask.goalId).map(g => (
                      <button
                        key={g.id}
                        onClick={() => { updateTask(selTask.id, { goalId: g.id }); setSelected({ type: 'task', id: selTask.id }) }}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs text-[#555] hover:text-white hover:border-[#222] transition-all text-left group"
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="truncate flex-1">{g.name}</span>
                        <ArrowRightLeft size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                    {selTask.goalId && (
                      <button
                        onClick={() => { updateTask(selTask.id, { goalId: null }); setSelected({ type: 'task', id: selTask.id }) }}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs text-[#333] hover:text-white hover:border-[#222] transition-all text-left group"
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-[#2a2a2a]" />
                        <span className="flex-1">Unassign from goal</span>
                        <X size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Time log */}
                {timeLogs.length > 0 && (
                  <div>
                    <div className="text-[9px] font-black text-[#333] uppercase tracking-widest mb-2">
                      Time Log
                    </div>
                    <div className="space-y-1">
                      {timeLogs.map(([date, m]) => (
                        <div key={date} className="flex justify-between items-center px-3 py-1.5 bg-[#111] rounded-lg border border-[#1a1a1a]">
                          <span className="text-[10px] text-[#444]">{format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                          <span className="text-[10px] text-[#666] font-bold">{m}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

        </div>
      </div>
    </div>
  )
}

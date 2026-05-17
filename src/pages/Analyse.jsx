import { useState, useRef, useEffect } from 'react'
import { X, CheckCircle2, Circle, ArrowRightLeft, ChevronDown, Plus, Minus, Maximize2 } from 'lucide-react'
import { format } from 'date-fns'
import useStore from '../store'
import { getGoalProgress, getTaskTotalTime } from '../utils/calculations'

const TASK_SPREAD = 1.2
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4.0

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
  return `M ${x1} ${y1} Q ${mx - dy * 0.12} ${my + dx * 0.12} ${x2} ${y2}`
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

export default function Analyse() {
  const tasks = useStore(s => s.tasks)
  const goals = useStore(s => s.goals)
  const updateTask = useStore(s => s.updateTask)

  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 300, h: 400 })
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [drag, setDrag] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Stable refs so event listeners don't go stale
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const bgPanRef = useRef(null) // { startCX, startCY, startPX, startPY, moved }
  const pinchRef = useRef(null) // { dist, zoom, panX, panY, midX, midY }
  const goalNodesRef = useRef([])

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { dragRef.current = drag }, [drag])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Responsive sizes based on available canvas
  const minDim = Math.min(size.w, size.h)
  const goalOrbit = Math.max(80, minDim * 0.35)
  const taskOrbit = Math.max(44, minDim * 0.175)
  const centerR   = Math.max(28, minDim * 0.065)
  const goalR     = Math.max(22, minDim * 0.05)
  const taskR     = Math.max(11, minDim * 0.025)

  const cx = size.w / 2
  const cy = size.h / 2

  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const goalNodes = goals.map((goal, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, goals.length) - Math.PI / 2
    return { ...goal, x: cx + goalOrbit * Math.cos(angle), y: cy + goalOrbit * Math.sin(angle), angle }
  })
  goalNodesRef.current = goalNodes

  const taskNodes = goalNodes.flatMap(gn => {
    const gt = filteredTasks.filter(t => t.goalId === gn.id)
    return gt.map((task, j) => {
      const span = gt.length > 1 ? TASK_SPREAD : 0
      const tAngle = gn.angle + (span * (j - (gt.length - 1) / 2)) / Math.max(1, gt.length - 1)
      return {
        ...task,
        x: gn.x + taskOrbit * Math.cos(tAngle),
        y: gn.y + taskOrbit * Math.sin(tAngle),
        goalColor: gn.color,
      }
    })
  })

  const unassigned = filteredTasks.filter(t => !goalNodes.some(gn => gn.id === t.goalId))

  // Screen coords → world coords
  const screenToWorld = (sx, sy) => ({
    x: (sx - panRef.current.x) / zoomRef.current,
    y: (sy - panRef.current.y) / zoomRef.current,
  })

  const getEventPos = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const src = e.touches?.[0] ?? e
    return screenToWorld(src.clientX - rect.left, src.clientY - rect.top)
  }

  // Zoom centered on a canvas point (screen coords)
  const applyZoom = (newZ, originX, originY) => {
    newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZ))
    const cur = zoomRef.current
    const p = panRef.current
    const nx = originX - (originX - p.x) * (newZ / cur)
    const ny = originY - (originY - p.y) * (newZ / cur)
    setZoom(newZ)
    setPan({ x: nx, y: ny })
  }

  const zoomIn  = () => applyZoom(zoomRef.current * 1.3, size.w / 2, size.h / 2)
  const zoomOut = () => applyZoom(zoomRef.current * 0.77, size.w / 2, size.h / 2)
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Wheel zoom (needs passive:false — attach via useEffect)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const ox = e.clientX - rect.left
      const oy = e.clientY - rect.top
      applyZoom(zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1), ox, oy)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, []) // stable — uses refs

  // ── Mouse events ──────────────────────────────────────────────────────────

  const onTaskMouseDown = (e, taskId, goalId) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = getEventPos(e)
    setDrag({ taskId, goalId, x: pos.x, y: pos.y })
    setDropTarget(null)
  }

  const onBgMouseDown = (e) => {
    if (dragRef.current) return
    bgPanRef.current = {
      startCX: e.clientX, startCY: e.clientY,
      startPX: panRef.current.x, startPY: panRef.current.y,
      moved: false,
    }
  }

  const onMouseMove = (e) => {
    if (dragRef.current) {
      const pos = getEventPos(e)
      setDrag(d => ({ ...d, x: pos.x, y: pos.y }))
      const hovered = goalNodesRef.current.find(
        gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 10
      )
      setDropTarget(hovered?.id || null)
      return
    }
    if (bgPanRef.current) {
      const dx = e.clientX - bgPanRef.current.startCX
      const dy = e.clientY - bgPanRef.current.startCY
      if (Math.hypot(dx, dy) > 4) bgPanRef.current.moved = true
      if (bgPanRef.current.moved) {
        setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
      }
    }
  }

  const onMouseUp = () => {
    const wasPanning = bgPanRef.current?.moved
    bgPanRef.current = null
    if (drag && dropTarget && dropTarget !== drag.goalId) {
      updateTask(drag.taskId, { goalId: dropTarget })
      setSelected({ type: 'task', id: drag.taskId })
    }
    setDrag(null)
    setDropTarget(null)
    return wasPanning
  }

  // ── Touch events ──────────────────────────────────────────────────────────

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const rect = svgRef.current?.getBoundingClientRect()
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (rect?.left || 0)
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (rect?.top || 0)
      pinchRef.current = { dist, zoom: zoomRef.current, panX: panRef.current.x, panY: panRef.current.y, midX, midY }
    } else if (e.touches.length === 1 && !dragRef.current) {
      bgPanRef.current = {
        startCX: e.touches[0].clientX, startCY: e.touches[0].clientY,
        startPX: panRef.current.x, startPY: panRef.current.y,
        moved: false,
      }
    }
  }

  const onTouchMove = (e) => {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.zoom * (dist / pinchRef.current.dist)))
      const ratio = newZ / pinchRef.current.zoom
      setZoom(newZ)
      setPan({
        x: pinchRef.current.midX - (pinchRef.current.midX - pinchRef.current.panX) * ratio,
        y: pinchRef.current.midY - (pinchRef.current.midY - pinchRef.current.panY) * ratio,
      })
    } else if (e.touches.length === 1) {
      if (dragRef.current) {
        const pos = getEventPos(e)
        setDrag(d => ({ ...d, x: pos.x, y: pos.y }))
        const hovered = goalNodesRef.current.find(
          gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 10
        )
        setDropTarget(hovered?.id || null)
      } else if (bgPanRef.current) {
        const dx = e.touches[0].clientX - bgPanRef.current.startCX
        const dy = e.touches[0].clientY - bgPanRef.current.startCY
        if (Math.hypot(dx, dy) > 4) bgPanRef.current.moved = true
        if (bgPanRef.current.moved) {
          setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
        }
      }
    }
  }

  const onTouchEnd = () => {
    pinchRef.current = null
    onMouseUp()
  }

  const selGoal = selected?.type === 'goal' ? goals.find(g => g.id === selected.id) : null
  const selTask = selected?.type === 'task' ? tasks.find(t => t.id === selected.id) : null
  const totalTime = tasks.reduce((s, t) => s + getTaskTotalTime(t), 0)
  const doneCount = tasks.filter(t => t.status === 'completed').length

  // ── Shared panel content ──────────────────────────────────────────────────

  const PanelContent = () => (
    <div className="space-y-4">
      {!selected && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Goals', value: goals.length, color: '#F0C040' },
              { label: 'Tasks', value: tasks.length, color: '#6366f1' },
              { label: 'Done', value: doneCount, color: '#10b981' },
              { label: 'Time', value: fmtMins(totalTime), color: '#f59e0b' },
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
                <div key={gn.id}
                  className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3 cursor-pointer hover:border-[#252525] transition-colors"
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
                    <div className="h-full rounded-full" style={{ width: `${p.percentage}%`, backgroundColor: gn.color }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[9px] text-[#2a2a2a] font-bold">
                    <span>{p.completed}/{p.total} tasks</span>
                    <span>{fmtMins(p.totalTimeSpent)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

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
              <div className="h-full rounded-full" style={{ width: `${p.percentage}%`, backgroundColor: selGoal.color }} />
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Tasks ({goalTasks.length})</div>
              {goalTasks.length === 0 && <div className="text-center py-4 text-[#222] text-xs">No tasks assigned</div>}
              {goalTasks.map(t => (
                <div key={t.id} onClick={() => setSelected({ type: 'task', id: t.id })}
                  className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-xl border border-[#1a1a1a] cursor-pointer hover:border-[#252525] transition-colors"
                >
                  {t.status === 'completed'
                    ? <CheckCircle2 size={13} className="text-[#10b981] flex-shrink-0" />
                    : <Circle size={13} className="text-[#2a2a2a] flex-shrink-0" />
                  }
                  <span className="text-xs text-[#666] flex-1 truncate">{t.title}</span>
                  {getTaskTotalTime(t) > 0 && <span className="text-[9px] text-[#333] font-bold">{getTaskTotalTime(t)}m</span>}
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {selTask && (() => {
        const taskGoal = goals.find(g => g.id === selTask.goalId)
        const mins = getTaskTotalTime(selTask)
        const timeLogs = Object.entries(selTask.timeLog || {}).sort((a, b) => b[0].localeCompare(a[0]))
        return (
          <>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                {taskGoal
                  ? <><div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskGoal.color }} /><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: taskGoal.color }}>{taskGoal.name}</span></>
                  : <><div className="w-2 h-2 rounded-full bg-[#333]" /><span className="text-[10px] font-bold text-[#444] uppercase tracking-wide">Unassigned</span></>
                }
              </div>
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
            <div>
              <div className="text-[9px] font-black text-[#333] uppercase tracking-widest mb-2">Transfer to Goal</div>
              <div className="space-y-1.5">
                {goals.filter(g => g.id !== selTask.goalId).map(g => (
                  <button key={g.id}
                    onClick={() => { updateTask(selTask.id, { goalId: g.id }); setSelected({ type: 'task', id: selTask.id }) }}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs text-[#555] hover:text-white hover:border-[#252525] transition-all text-left group"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="truncate flex-1">{g.name}</span>
                    <ArrowRightLeft size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
                {selTask.goalId && (
                  <button onClick={() => { updateTask(selTask.id, { goalId: null }); setSelected({ type: 'task', id: selTask.id }) }}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs text-[#333] hover:text-white hover:border-[#252525] transition-all text-left group"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-[#2a2a2a]" />
                    <span className="flex-1">Unassign from goal</span>
                    <X size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>
            {timeLogs.length > 0 && (
              <div>
                <div className="text-[9px] font-black text-[#333] uppercase tracking-widest mb-2">Time Log</div>
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
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const labelFontSize = Math.max(7, taskR * 0.75)
  const goalLabelFontSize = Math.max(8, goalR * 0.38)

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#0C0C0C] overflow-hidden relative">

      {/* ── SVG Canvas ─────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden min-h-0">

        {/* Filter bar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
          <div className="flex bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl p-1 gap-0.5">
            {['all', 'pending', 'completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all ${
                  filter === f ? 'bg-[#F0C040] text-black' : 'text-[#555] hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="hidden sm:block text-[#252525] text-xs font-bold">
            {taskNodes.length + unassigned.length} tasks · {goals.length} goals
          </span>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
          <button onClick={zoomIn}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"
          ><Plus size={15} /></button>
          <button onClick={zoomOut}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"
          ><Minus size={15} /></button>
          <button onClick={resetView}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"
            title="Reset view"
          ><Maximize2 size={13} /></button>
          {/* Zoom % badge */}
          <div className="text-center text-[9px] font-black text-[#333] tabular-nums">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Drag hint — desktop only */}
        <div className="hidden md:block absolute bottom-4 left-4 z-10 text-[#1e1e1e] text-[10px] font-bold uppercase tracking-widest">
          Scroll to zoom · drag background to pan · drag tasks to reassign
        </div>

        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          onMouseDown={onBgMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => { if (!bgPanRef.current?.moved && !drag) setSelected(null) }}
          className="select-none touch-none"
          style={{ cursor: bgPanRef.current?.moved ? 'grabbing' : 'default' }}
        >
          <defs>
            <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="softglow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#181818" />
            </pattern>
            <radialGradient id="cGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F0C040" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#F0C040" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Static background — not affected by zoom/pan */}
          <rect width={size.w} height={size.h} fill="url(#dots)" />

          {/* Everything below is zoomed + panned */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Center glow */}
            <circle cx={cx} cy={cy} r={goalOrbit * 0.9} fill="url(#cGlow)" />
            {/* Orbit ring */}
            <circle cx={cx} cy={cy} r={goalOrbit} fill="none" stroke="#1a1a1a" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${6 / zoom}`} />

            {/* center → goals */}
            {goalNodes.map(gn => (
              <path key={`cl-${gn.id}`} d={curvePath(cx, cy, gn.x, gn.y)}
                stroke={gn.color} strokeWidth={1.5 / zoom} strokeOpacity={0.12} fill="none" />
            ))}

            {/* goals → tasks */}
            {taskNodes.map(tn => {
              if (drag?.taskId === tn.id) return null
              const gn = goalNodes.find(g => g.id === tn.goalId)
              if (!gn) return null
              return (
                <path key={`tl-${tn.id}`} d={curvePath(gn.x, gn.y, tn.x, tn.y)}
                  stroke={tn.goalColor} strokeWidth={1 / zoom} strokeOpacity={0.15} fill="none" />
              )
            })}

            {/* Drag ghost line */}
            {drag && (() => {
              const sg = goalNodes.find(g => g.id === drag.goalId)
              if (!sg) return null
              return <line x1={sg.x} y1={sg.y} x2={drag.x} y2={drag.y}
                stroke="#F0C040" strokeWidth={1.5 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} strokeOpacity={0.6} />
            })()}

            {/* Task nodes */}
            {taskNodes.map(tn => {
              const isDragging = drag?.taskId === tn.id
              const isSelected = selected?.type === 'task' && selected?.id === tn.id
              const isDone = tn.status === 'completed'
              const mins = getTaskTotalTime(tn)
              const tx = isDragging ? drag.x : tn.x
              const ty = isDragging ? drag.y : tn.y
              const r = taskR

              return (
                <g key={tn.id} transform={`translate(${tx},${ty})`}
                  onMouseDown={(e) => { e.stopPropagation(); onTaskMouseDown(e, tn.id, tn.goalId) }}
                  onTouchStart={(e) => { e.stopPropagation(); onTaskMouseDown(e, tn.id, tn.goalId) }}
                  onClick={(e) => { e.stopPropagation(); if (!drag) setSelected({ type: 'task', id: tn.id }) }}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  {isSelected && (
                    <circle r={r + 7} fill="none" stroke={tn.goalColor} strokeWidth={1.5 / zoom} strokeOpacity={0.4} />
                  )}
                  <circle r={r}
                    fill={isDone ? '#111' : `${tn.goalColor}1a`}
                    stroke={tn.goalColor}
                    strokeWidth={(isDragging ? 2.5 : isSelected ? 2 : 1.5) / zoom}
                    strokeOpacity={isDone ? 0.25 : isDragging ? 1 : 0.7}
                    filter={isDragging ? 'url(#softglow)' : undefined}
                  />
                  {/* Status indicator */}
                  {isDone
                    ? <circle r={r * 0.36} fill="#10b981" />
                    : mins > 0
                      ? <text x={0} y={r * 0.3} textAnchor="middle" fontSize={r * 0.58} fill={tn.goalColor} fontWeight="bold" fontFamily="monospace">{mins}m</text>
                      : <circle r={r * 0.28} fill={tn.goalColor} fillOpacity={0.5} />
                  }
                  {/* Task name label */}
                  <text
                    x={0} y={r + labelFontSize + 3}
                    textAnchor="middle"
                    fontSize={labelFontSize}
                    fill={isSelected ? tn.goalColor : isDone ? '#444' : '#666'}
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(tn.title, 14)}
                  </text>
                </g>
              )
            })}

            {/* Goal nodes */}
            {goalNodes.map(gn => {
              const progress = getGoalProgress(gn.id, tasks)
              const isSelected = selected?.type === 'goal' && selected?.id === gn.id
              const isDropTarget = dropTarget === gn.id
              const R = goalR
              const innerR = R - R * 0.2
              const circ = 2 * Math.PI * innerR
              const dashOff = circ * (1 - progress.percentage / 100)
              const sw = Math.max(2, R * 0.13)

              return (
                <g key={gn.id} transform={`translate(${gn.x},${gn.y})`}
                  onClick={(e) => { e.stopPropagation(); setSelected({ type: 'goal', id: gn.id }) }}
                  style={{ cursor: 'pointer' }}
                >
                  {isDropTarget && (
                    <circle r={R + 14} fill={`${gn.color}12`} stroke={gn.color} strokeWidth={2 / zoom} strokeOpacity={0.7} filter="url(#glow)" />
                  )}
                  {isSelected && (
                    <circle r={R + 9} fill="none" stroke={gn.color} strokeWidth={1.5 / zoom} strokeOpacity={0.3} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
                  )}
                  <circle r={R} fill="#111" stroke={gn.color}
                    strokeWidth={(isSelected ? 2.5 : 1.5) / zoom}
                    strokeOpacity={isSelected ? 0.9 : 0.55}
                  />
                  {/* Progress arc */}
                  <circle r={innerR} fill="none" stroke={gn.color} strokeWidth={sw / zoom}
                    strokeDasharray={circ} strokeDashoffset={dashOff}
                    strokeLinecap="round" strokeOpacity={0.7} transform="rotate(-90)"
                  />
                  {/* % label */}
                  <text x={0} y={-R * 0.15} textAnchor="middle"
                    fontSize={Math.max(9, R * 0.44)} fill={gn.color} fontWeight="900" fontFamily="monospace"
                  >
                    {progress.percentage}%
                  </text>
                  {/* done/total */}
                  <text x={0} y={R * 0.35} textAnchor="middle"
                    fontSize={Math.max(6, R * 0.27)} fill="#555" fontFamily="monospace"
                  >
                    {progress.completed}/{progress.total}
                  </text>
                  {/* Goal name — always visible */}
                  <text x={0} y={R + goalLabelFontSize + 5} textAnchor="middle"
                    fontSize={goalLabelFontSize} fill={isSelected ? gn.color : '#888'} fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(gn.name, 18)}
                  </text>
                </g>
              )
            })}

            {/* Center node */}
            <g transform={`translate(${cx},${cy})`}
              onClick={(e) => { e.stopPropagation(); setSelected(null) }}
              style={{ cursor: 'pointer' }}
            >
              <circle r={centerR} fill="#0d0d00" stroke="#F0C040" strokeWidth={2 / zoom} strokeOpacity={0.75} />
              <circle r={centerR - 4} fill="none" stroke="#F0C040" strokeWidth={0.5 / zoom} strokeOpacity={0.15} strokeDasharray={`${3 / zoom} ${5 / zoom}`} />
              <text x={0} y={-centerR * 0.1} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.34)} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >MISSION</text>
              <text x={0} y={centerR * 0.3} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.34)} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >10000</text>
            </g>

            {/* Unassigned cluster */}
            {unassigned.length > 0 && (
              <>
                <text x={12} y={size.h - 68} fontSize={7} fill="#252525" fontWeight="bold" letterSpacing={1}>
                  UNASSIGNED ({unassigned.length})
                </text>
                {unassigned.map((t, i) => {
                  const ux = 20 + (i % 5) * (taskR * 2.2 + 8)
                  const uy = size.h - 48 + Math.floor(i / 5) * (taskR * 2.2 + 8)
                  const isSel = selected?.type === 'task' && selected?.id === t.id
                  return (
                    <g key={t.id} transform={`translate(${ux},${uy})`}
                      onClick={(e) => { e.stopPropagation(); setSelected({ type: 'task', id: t.id }) }}
                      style={{ cursor: 'pointer' }}
                    >
                      {isSel && <circle r={taskR + 6} fill="none" stroke="#444" strokeWidth={1.5 / zoom} />}
                      <circle r={taskR} fill="#111" stroke="#2a2a2a" strokeWidth={1.2 / zoom} />
                      {t.status === 'completed' ? <circle r={taskR * 0.34} fill="#10b981" /> : <circle r={taskR * 0.28} fill="#252525" />}
                      <text x={0} y={taskR + labelFontSize + 2} textAnchor="middle" fontSize={labelFontSize} fill="#333" style={{ pointerEvents: 'none' }}>
                        {truncate(t.title, 10)}
                      </text>
                      <title>{t.title}</title>
                    </g>
                  )
                })}
              </>
            )}

          </g>{/* end zoom group */}
        </svg>
      </div>

      {/* ── Desktop side panel ─────────────────────────────────────────────── */}
      <div className="hidden md:flex w-72 xl:w-80 border-l border-[#1E1E1E] bg-[#080808] flex-col overflow-hidden flex-shrink-0">
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
        <div className="flex-1 overflow-y-auto p-4">
          <PanelContent />
        </div>
      </div>

      {/* ── Mobile bottom sheet ────────────────────────────────────────────── */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setSelected(null)} />
          <div className="relative bg-[#0a0a0a] border-t border-[#1E1E1E] rounded-t-2xl max-h-[65vh] flex flex-col pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] flex-shrink-0">
              <div className="w-8 h-1 bg-[#2a2a2a] rounded-full absolute left-1/2 -translate-x-1/2 top-2" />
              <h2 className="text-[11px] font-black text-[#555] uppercase tracking-widest">
                {selGoal ? 'Goal Details' : 'Task Details'}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 text-[#333] hover:text-white ml-auto">
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <PanelContent />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

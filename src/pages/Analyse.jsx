import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, CheckCircle2, Circle, ArrowRightLeft, ChevronDown,
  Plus, Minus, Maximize2, Search, Activity, Clock, Zap,
} from 'lucide-react'
import { format } from 'date-fns'
import useStore from '../store'
import { getGoalProgress, getTaskTotalTime } from '../utils/calculations'

const TASK_SPREAD = 1.3
const MIN_ZOOM = 0.12
const MAX_ZOOM = 5.0

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function fmtMins(m) {
  if (!m) return '0m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function curvePath(x1, y1, x2, y2, bend = 0.13) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * bend} ${my + dx * bend} ${x2} ${y2}`
}

function trunc(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str }

/* ── Donut ring (used in side panel) ─────────────────────────────────────── */
function DonutRing({ pct, color, size = 56, sw = 5 }) {
  const r = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const off = circ * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1c1c1c" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle"
        fontSize={11} fill={color} fontWeight="900" fontFamily="monospace"
      >{pct}%</text>
    </svg>
  )
}

/* ── 7-day sparkline ──────────────────────────────────────────────────────── */
function Spark({ data, color }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const W = 80, H = 22, pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = H - pad - (v / max) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => v > 0 && (
        <circle key={i}
          cx={pad + (i / (data.length - 1)) * (W - pad * 2)}
          cy={H - pad - (v / max) * (H - pad * 2)}
          r={2} fill={color}
        />
      ))}
    </svg>
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function Analyse() {
  const tasks  = useStore(s => s.tasks)
  const goals  = useStore(s => s.goals)
  const updateTask = useStore(s => s.updateTask)

  const containerRef = useRef(null)
  const svgRef       = useRef(null)
  const [size, setSize] = useState({ w: 300, h: 400 })
  const [selected,   setSelected]   = useState(null)
  const [filter,     setFilter]     = useState('all')
  const [search,     setSearch]     = useState('')
  const [collapsed,  setCollapsed]  = useState(new Set())
  const [drag,       setDrag]       = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: 0, y: 0 })

  // Stable refs — event handlers must read these instead of state
  const zoomRef      = useRef(1)
  const panRef       = useRef({ x: 0, y: 0 })
  const dragRef      = useRef(null)
  const bgPanRef     = useRef(null)
  const pinchRef     = useRef(null)
  const goalNodesRef = useRef([])
  const wasMoving    = useRef(false)

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current  = pan  }, [pan])
  useEffect(() => { dragRef.current = drag }, [drag])

  /* ResizeObserver */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const go = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    go()
    const ro = new ResizeObserver(go)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Keyboard shortcuts */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setSelected(null)
      if ((e.key === '0' && (e.ctrlKey || e.metaKey)) || e.key === 'r') {
        setZoom(1); setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ── Responsive sizing ────────────────────────────────────────────────── */
  const minDim   = Math.min(size.w, size.h)
  const goalOrbit = Math.max(85,  minDim * 0.36)
  const taskOrbit = Math.max(46,  minDim * 0.18)
  const centerR   = Math.max(30,  minDim * 0.068)
  const goalR     = Math.max(23,  minDim * 0.052)
  const taskR     = Math.max(12,  minDim * 0.026)
  const cx = size.w / 2
  const cy = size.h / 2

  /* ── Data ────────────────────────────────────────────────────────────── */
  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending')   return t.status === 'pending'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const goalNodes = goals.map((goal, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, goals.length) - Math.PI / 2
    return { ...goal, x: cx + goalOrbit * Math.cos(angle), y: cy + goalOrbit * Math.sin(angle), angle }
  })
  goalNodesRef.current = goalNodes

  const taskNodes = goalNodes.flatMap(gn => {
    if (collapsed.has(gn.id)) return []
    const gt = filteredTasks.filter(t => t.goalId === gn.id)
    const count = gt.length
    return gt.map((task, j) => {
      // Fan tasks wider when there are many
      const spread = count === 1 ? 0 : Math.min(TASK_SPREAD, (count - 1) * 0.38)
      const tAngle = gn.angle + (spread * (j - (count - 1) / 2)) / Math.max(1, count - 1)
      // Extra orbit ring if many tasks
      const ring = Math.floor(j / 10)
      const orbit = taskOrbit + ring * (taskOrbit * 0.7)
      return {
        ...task,
        x: gn.x + orbit * Math.cos(tAngle),
        y: gn.y + orbit * Math.sin(tAngle),
        goalColor: gn.color,
      }
    })
  })

  const unassigned = filteredTasks.filter(t => !goalNodes.some(gn => gn.id === t.goalId))

  const searchLower = search.toLowerCase()
  const hasSearch   = search.length > 0
  const matchTask   = (t) => !hasSearch || t.title.toLowerCase().includes(searchLower)
  const matchGoal   = (g) => !hasSearch || g.name.toLowerCase().includes(searchLower) ||
    tasks.filter(t => t.goalId === g.id).some(t => t.title.toLowerCase().includes(searchLower))

  const runningTask = tasks.find(t => t.isRunning)

  /* ── Zoom helpers ────────────────────────────────────────────────────── */
  const applyZoom = useCallback((newZ, ox, oy) => {
    newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZ))
    const cur = zoomRef.current
    const p   = panRef.current
    setZoom(newZ)
    setPan({ x: ox - (ox - p.x) * (newZ / cur), y: oy - (oy - p.y) * (newZ / cur) })
  }, [])

  const zoomIn    = () => applyZoom(zoomRef.current * 1.3,  size.w / 2, size.h / 2)
  const zoomOut   = () => applyZoom(zoomRef.current * 0.77, size.w / 2, size.h / 2)
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const fitToScreen = () => {
    const all = [...taskNodes, ...goalNodes, { x: cx, y: cy }]
    if (!all.length) return
    const xs = all.map(n => n.x), ys = all.map(n => n.y)
    const pad = 80
    const bx = Math.min(...xs) - pad, bX = Math.max(...xs) + pad
    const by = Math.min(...ys) - pad, bY = Math.max(...ys) + pad
    const gw = bX - bx, gh = bY - by
    const fz = Math.min(size.w / gw, size.h / gh, MAX_ZOOM) * 0.9
    setZoom(fz)
    setPan({ x: size.w / 2 - (bx + gw / 2) * fz, y: size.h / 2 - (by + gh / 2) * fz })
  }

  /* Wheel zoom */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const h = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      applyZoom(zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [applyZoom])

  /* Screen → world */
  const s2w = (sx, sy) => ({
    x: (sx - panRef.current.x) / zoomRef.current,
    y: (sy - panRef.current.y) / zoomRef.current,
  })
  const evPos = (e) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const src = e.touches?.[0] ?? e
    return s2w(src.clientX - r.left, src.clientY - r.top)
  }

  /* ── Mouse events ────────────────────────────────────────────────────── */
  const onTaskMouseDown = (e, taskId, goalId) => {
    e.preventDefault(); e.stopPropagation()
    const pos = evPos(e)
    setDrag({ taskId, goalId, x: pos.x, y: pos.y })
    setDropTarget(null)
  }

  const onBgMouseDown = (e) => {
    if (dragRef.current) return
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    wasMoving.current = false
    bgPanRef.current = { startCX: e.clientX, startCY: e.clientY, startPX: panRef.current.x, startPY: panRef.current.y }
  }

  const onMouseMove = (e) => {
    if (dragRef.current) {
      const pos = evPos(e)
      setDrag(d => ({ ...d, x: pos.x, y: pos.y }))
      const hov = goalNodesRef.current.find(gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 12)
      setDropTarget(hov?.id || null)
      return
    }
    if (bgPanRef.current) {
      const dx = e.clientX - bgPanRef.current.startCX
      const dy = e.clientY - bgPanRef.current.startCY
      if (Math.hypot(dx, dy) > 5) wasMoving.current = true
      if (wasMoving.current)
        setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
    }
  }

  const onMouseUp = () => {
    bgPanRef.current = null
    if (drag && dropTarget && dropTarget !== drag.goalId) {
      updateTask(drag.taskId, { goalId: dropTarget })
      setSelected({ type: 'task', id: drag.taskId })
    }
    setDrag(null); setDropTarget(null)
  }

  const onBgClick = () => { if (!wasMoving.current) setSelected(null) }

  /* ── Touch events ────────────────────────────────────────────────────── */
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const r = svgRef.current?.getBoundingClientRect()
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY)
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (r?.left || 0)
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (r?.top  || 0)
      pinchRef.current = { dist, zoom: zoomRef.current, panX: panRef.current.x, panY: panRef.current.y, midX, midY }
    } else if (e.touches.length === 1 && !dragRef.current) {
      wasMoving.current = false
      bgPanRef.current = { startCX: e.touches[0].clientX, startCY: e.touches[0].clientY, startPX: panRef.current.x, startPY: panRef.current.y }
    }
  }
  const onTouchMove = (e) => {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY)
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.zoom * (dist / pinchRef.current.dist)))
      const ratio = newZ / pinchRef.current.zoom
      setZoom(newZ)
      setPan({ x: pinchRef.current.midX - (pinchRef.current.midX - pinchRef.current.panX) * ratio, y: pinchRef.current.midY - (pinchRef.current.midY - pinchRef.current.panY) * ratio })
    } else if (e.touches.length === 1) {
      if (dragRef.current) {
        const pos = evPos(e)
        setDrag(d => ({ ...d, x: pos.x, y: pos.y }))
        const hov = goalNodesRef.current.find(gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 12)
        setDropTarget(hov?.id || null)
      } else if (bgPanRef.current) {
        const dx = e.touches[0].clientX - bgPanRef.current.startCX
        const dy = e.touches[0].clientY - bgPanRef.current.startCY
        if (Math.hypot(dx, dy) > 5) wasMoving.current = true
        if (wasMoving.current) setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
      }
    }
  }
  const onTouchEnd = () => { pinchRef.current = null; onMouseUp() }

  /* ── Derived stats ───────────────────────────────────────────────────── */
  const selGoal = selected?.type === 'goal' ? goals.find(g => g.id === selected.id) : null
  const selTask = selected?.type === 'task' ? tasks.find(t => t.id === selected.id) : null
  const totalTime = tasks.reduce((s, t) => s + getTaskTotalTime(t), 0)
  const doneCount = tasks.filter(t => t.status === 'completed').length
  const overallPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  // 7-day activity per goal
  const spark7 = (goalId) => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    return tasks.filter(t => t.goalId === goalId).reduce((s, t) => s + ((t.timeLog?.[key]) || 0), 0)
  })

  /* ── SVG rendering helpers ───────────────────────────────────────────── */
  const labelSz  = Math.max(7,  taskR * 0.72)
  const gLabelSz = Math.max(8,  goalR * 0.38)
  const invZ = 1 / zoom // keep strokes visually consistent at any zoom

  /* ── Panel content (inlined JSX) ─────────────────────────────────────── */
  const renderPanel = () => (
    <div className="space-y-5">

      {/* ── Overview ── */}
      {!selected && (
        <>
          {/* Overall completion donut + headline */}
          <div className="flex items-center gap-4 p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
            <DonutRing pct={overallPct} color="#F0C040" size={56} sw={5} />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-[#333] font-black uppercase tracking-widest mb-1">Overall</div>
              <div className="text-white font-black text-sm">{doneCount}/{tasks.length} tasks done</div>
              <div className="text-[#444] text-[10px] font-bold mt-0.5">{fmtMins(totalTime)} logged</div>
            </div>
          </div>

          {/* Running task badge */}
          {runningTask && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0d1f17] border border-[#10b981]/30 rounded-xl">
              <span className="relative flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-[#10b981] font-black uppercase tracking-widest">Running now</div>
                <div className="text-xs text-white font-bold truncate">{runningTask.title}</div>
              </div>
              <Zap size={12} className="text-[#10b981] flex-shrink-0" />
            </div>
          )}

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Goals',     value: goals.length,       color: '#F0C040' },
              { label: 'Tasks',     value: tasks.length,        color: '#6366f1' },
              { label: 'Done',      value: doneCount,           color: '#10b981' },
              { label: 'Time',      value: fmtMins(totalTime),  color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                <div className="text-[9px] text-[#333] font-black uppercase tracking-widest mb-1">{label}</div>
                <div className="text-lg font-black" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Goal cards */}
          <div className="space-y-2">
            <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Goals</div>
            {goalNodes.map(gn => {
              const p = getGoalProgress(gn.id, tasks)
              const s7 = spark7(gn.id)
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
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <Spark data={s7} color={gn.color} />
                      <span className="text-xs font-black" style={{ color: gn.color }}>{p.percentage}%</span>
                    </div>
                  </div>
                  <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.percentage}%`, backgroundColor: gn.color }} />
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

      {/* ── Goal detail ── */}
      {selGoal && (() => {
        const p   = getGoalProgress(selGoal.id, tasks)
        const gts = tasks.filter(t => t.goalId === selGoal.id)
        const s7  = spark7(selGoal.id)
        return (
          <>
            <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
              <DonutRing pct={p.percentage} color={selGoal.color} size={56} sw={5} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selGoal.color }} />
                  <span className="text-xs font-black text-white truncate">{selGoal.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Spark data={s7} color={selGoal.color} />
                </div>
                <div className="text-[9px] text-[#444] font-bold mt-1">7-day activity</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Tasks',    value: p.total },
                { label: 'Done',     value: p.completed },
                { label: 'Time',     value: fmtMins(p.totalTimeSpent) },
                { label: 'Progress', value: `${p.percentage}%` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                  <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">{label}</div>
                  <div className="text-base font-black text-white mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Tasks ({gts.length})</div>
              {gts.length === 0 && <div className="text-center py-4 text-[#222] text-xs">No tasks assigned</div>}
              {gts.map(t => (
                <div key={t.id} onClick={() => setSelected({ type: 'task', id: t.id })}
                  className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-xl border border-[#1a1a1a] cursor-pointer hover:border-[#252525] transition-colors"
                >
                  {t.isRunning
                    ? <span className="relative flex-shrink-0"><span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] opacity-60" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]" /></span>
                    : t.status === 'completed'
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

      {/* ── Task detail ── */}
      {selTask && (() => {
        const taskGoal = goals.find(g => g.id === selTask.goalId)
        const mins     = getTaskTotalTime(selTask)
        const timeLogs = Object.entries(selTask.timeLog || {}).sort((a, b) => b[0].localeCompare(a[0]))
        return (
          <>
            <div className="p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
              <div className="flex items-center gap-1.5 mb-2">
                {taskGoal
                  ? <><div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskGoal.color }} /><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: taskGoal.color }}>{taskGoal.name}</span></>
                  : <><div className="w-2 h-2 rounded-full bg-[#333]" /><span className="text-[10px] font-bold text-[#444] uppercase tracking-wide">Unassigned</span></>
                }
              </div>
              <div className="text-sm font-black text-white leading-snug">{selTask.title}</div>
              {selTask.isRunning && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="relative flex-shrink-0"><span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#10b981] opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]" /></span>
                  <span className="text-[10px] text-[#10b981] font-bold">Running now</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
                <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">Status</div>
                <div className={`text-sm font-black mt-0.5 ${selTask.status === 'completed' ? 'text-[#10b981]' : selTask.isRunning ? 'text-[#10b981]' : 'text-[#F0C040]'}`}>
                  {selTask.isRunning ? 'Running' : selTask.status === 'completed' ? 'Done' : 'Active'}
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

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col md:flex-row h-full bg-[#0C0C0C] overflow-hidden relative">

      {/* ═══════════════════════ SVG CANVAS ═══════════════════════ */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden min-h-0">

        {/* ── Top controls ─────────────────────────────────────────── */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 flex-wrap">
          {/* Filter pills */}
          <div className="flex bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl p-1 gap-0.5">
            {['all', 'pending', 'completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all ${filter === f ? 'bg-[#F0C040] text-black' : 'text-[#555] hover:text-white'}`}
              >{f}</button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl px-2.5 py-1.5 flex-1 sm:flex-none sm:w-40">
            <Search size={11} className="text-[#444] flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search nodes…"
              className="bg-transparent text-white text-[11px] focus:outline-none placeholder-[#333] w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-[#444] hover:text-white flex-shrink-0"><X size={10} /></button>
            )}
          </div>

          {/* Count badge */}
          <span className="hidden sm:flex items-center gap-1 text-[#252525] text-[10px] font-bold bg-[#141414]/80 px-2 py-1 rounded-lg border border-[#1a1a1a]">
            <Activity size={10} />
            {taskNodes.length + unassigned.length}t · {goals.length}g
          </span>
        </div>

        {/* ── Zoom controls (bottom-right) ──────────────────────────── */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 items-center">
          <button onClick={zoomIn}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"
          ><Plus size={15} /></button>
          <button onClick={zoomOut}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"
          ><Minus size={15} /></button>
          <button onClick={fitToScreen}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-[#F0C040] hover:border-[#F0C040]/30 transition-all active:scale-95"
            title="Fit all nodes to screen"
          ><Maximize2 size={13} /></button>
          <button onClick={resetView}
            className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[10px] font-black text-[#333] hover:text-white transition-all active:scale-95"
            title="Reset view (R)"
          >1:1</button>
          <div className="text-[9px] font-black text-[#2a2a2a] tabular-nums">{Math.round(zoom * 100)}%</div>
        </div>

        {/* ── Desktop hint ─────────────────────────────────────────── */}
        <div className="hidden md:block absolute bottom-4 left-4 z-10 text-[#1c1c1c] text-[9px] font-bold uppercase tracking-widest leading-relaxed">
          Scroll: zoom · Drag bg: pan · Drag node: reassign<br />Double-click goal: collapse · Esc: deselect
        </div>

        {/* ════════════════════════ SVG ════════════════════════ */}
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
          onClick={onBgClick}
          className="select-none touch-none"
        >
          {/* ── Static defs ── */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="sglow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="4" result="blur" />
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

          {/* Static background */}
          <rect width={size.w} height={size.h} fill="url(#dots)" />

          {/* ── Zoom/pan group (everything below transforms) ── */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Per-goal gradient defs (inside transform so coords match) */}
            <defs>
              {goalNodes.map(gn => (
                <linearGradient key={`lg-${gn.id}`} id={`lg-${gn.id}`}
                  gradientUnits="userSpaceOnUse" x1={cx} y1={cy} x2={gn.x} y2={gn.y}
                >
                  <stop offset="0%"   stopColor="#F0C040" stopOpacity="0.25" />
                  <stop offset="100%" stopColor={gn.color} stopOpacity="0.25" />
                </linearGradient>
              ))}
            </defs>

            {/* Center ambient glow */}
            <circle cx={cx} cy={cy} r={goalOrbit * 0.88} fill="url(#cGlow)" />

            {/* Orbit guide ring */}
            <circle cx={cx} cy={cy} r={goalOrbit}
              fill="none" stroke="#1c1c1c" strokeWidth={invZ}
              strokeDasharray={`${3 * invZ} ${7 * invZ}`}
            />

            {/* ── center → goal connections (gradient) ── */}
            {goalNodes.map(gn => {
              const dimmed = hasSearch && !matchGoal(gn)
              return (
                <path key={`cl-${gn.id}`}
                  d={curvePath(cx, cy, gn.x, gn.y)}
                  stroke={`url(#lg-${gn.id})`}
                  strokeWidth={2 * invZ}
                  opacity={dimmed ? 0.04 : 1}
                  fill="none"
                />
              )
            })}

            {/* ── goal → task connections ── */}
            {taskNodes.map(tn => {
              if (drag?.taskId === tn.id) return null
              const gn = goalNodes.find(g => g.id === tn.goalId)
              if (!gn) return null
              const dimmed = hasSearch && !matchTask(tn)
              return (
                <path key={`tl-${tn.id}`}
                  d={curvePath(gn.x, gn.y, tn.x, tn.y, 0.1)}
                  stroke={tn.goalColor}
                  strokeWidth={invZ}
                  strokeOpacity={dimmed ? 0.02 : 0.18}
                  fill="none"
                />
              )
            })}

            {/* ── Drag ghost line ── */}
            {drag && (() => {
              const sg = goalNodes.find(g => g.id === drag.goalId)
              if (!sg) return null
              return <line x1={sg.x} y1={sg.y} x2={drag.x} y2={drag.y}
                stroke="#F0C040" strokeWidth={1.5 * invZ}
                strokeDasharray={`${5 * invZ} ${3 * invZ}`} strokeOpacity={0.7}
              />
            })()}

            {/* ── Task nodes ── */}
            {taskNodes.map(tn => {
              const isDragging = drag?.taskId === tn.id
              const isSelected = selected?.type === 'task' && selected?.id === tn.id
              const isDone     = tn.status === 'completed'
              const isRunning  = tn.isRunning
              const dimmed     = hasSearch && !matchTask(tn)
              const mins       = getTaskTotalTime(tn)
              const tx = isDragging ? drag.x : tn.x
              const ty = isDragging ? drag.y : tn.y
              const r  = taskR

              return (
                <g key={tn.id} transform={`translate(${tx},${ty})`}
                  onMouseDown={(e) => { e.stopPropagation(); onTaskMouseDown(e, tn.id, tn.goalId) }}
                  onTouchStart={(e) => { e.stopPropagation(); onTaskMouseDown(e, tn.id, tn.goalId) }}
                  onClick={(e) => { e.stopPropagation(); if (!drag) setSelected({ type: 'task', id: tn.id }) }}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab', opacity: dimmed ? 0.15 : 1 }}
                >
                  {/* Running pulse animation */}
                  {isRunning && (
                    <>
                      <circle r={r + 5} fill="none" stroke="#10b981" strokeWidth={1.5 * invZ}>
                        <animate attributeName="r" values={`${r + 3};${r + 13};${r + 3}`} dur="2s" repeatCount="indefinite" calcMode="ease" />
                        <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" calcMode="ease" />
                      </circle>
                      <circle r={r + 2} fill="none" stroke="#10b981" strokeWidth={invZ}>
                        <animate attributeName="r" values={`${r + 1};${r + 8};${r + 1}`} dur="2s" begin="0.6s" repeatCount="indefinite" calcMode="ease" />
                        <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2s" begin="0.6s" repeatCount="indefinite" calcMode="ease" />
                      </circle>
                    </>
                  )}

                  {/* Selection ring */}
                  {isSelected && <circle r={r + 8} fill="none" stroke={tn.goalColor} strokeWidth={1.5 * invZ} strokeOpacity={0.4} />}

                  {/* Main circle */}
                  <circle r={r}
                    fill={isDone ? '#0d0d0d' : isRunning ? `${tn.goalColor}22` : `${tn.goalColor}18`}
                    stroke={isRunning ? '#10b981' : tn.goalColor}
                    strokeWidth={(isDragging ? 2.5 : isSelected ? 2 : 1.5) * invZ}
                    strokeOpacity={isDone ? 0.2 : isDragging ? 1 : isRunning ? 0.9 : 0.65}
                    filter={isDragging ? 'url(#sglow)' : undefined}
                  />

                  {/* Inner content */}
                  {isDone
                    ? <circle r={r * 0.35} fill="#10b981" />
                    : isRunning
                      ? <circle r={r * 0.32} fill="#10b981" fillOpacity={0.8} />
                      : mins > 0
                        ? <text x={0} y={r * 0.3} textAnchor="middle" fontSize={r * 0.58} fill={tn.goalColor} fontWeight="bold" fontFamily="monospace">{mins}m</text>
                        : <circle r={r * 0.28} fill={tn.goalColor} fillOpacity={0.45} />
                  }

                  {/* Task name label */}
                  <text x={0} y={r + labelSz + 4} textAnchor="middle" fontSize={labelSz}
                    fill={isSelected ? tn.goalColor : isDone ? '#3a3a3a' : '#666'}
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    style={{ pointerEvents: 'none' }}
                  >{trunc(tn.title, 15)}</text>
                </g>
              )
            })}

            {/* ── Goal nodes ── */}
            {goalNodes.map(gn => {
              const progress    = getGoalProgress(gn.id, tasks)
              const isSelected  = selected?.type === 'goal' && selected?.id === gn.id
              const isDropTarget = dropTarget === gn.id
              const isCollapsed = collapsed.has(gn.id)
              const dimmed      = hasSearch && !matchGoal(gn)
              const collCount   = filteredTasks.filter(t => t.goalId === gn.id).length
              const R     = goalR
              const inner = R - R * 0.2
              const circ  = 2 * Math.PI * inner
              const off   = circ * (1 - progress.percentage / 100)
              const sw    = Math.max(2, R * 0.13)

              return (
                <g key={gn.id} transform={`translate(${gn.x},${gn.y})`}
                  onClick={(e) => { e.stopPropagation(); setSelected({ type: 'goal', id: gn.id }) }}
                  onDoubleClick={(e) => { e.stopPropagation(); setCollapsed(s => { const n = new Set(s); n.has(gn.id) ? n.delete(gn.id) : n.add(gn.id); return n }) }}
                  style={{ cursor: 'pointer', opacity: dimmed ? 0.15 : 1 }}
                >
                  {/* Drop target glow */}
                  {isDropTarget && <circle r={R + 16} fill={`${gn.color}0e`} stroke={gn.color} strokeWidth={2 * invZ} strokeOpacity={0.8} filter="url(#glow)" />}
                  {/* Selection dashed ring */}
                  {isSelected && <circle r={R + 10} fill="none" stroke={gn.color} strokeWidth={1.5 * invZ} strokeOpacity={0.3} strokeDasharray={`${4 * invZ} ${4 * invZ}`} />}

                  {/* Body */}
                  <circle r={R} fill="#111" stroke={gn.color}
                    strokeWidth={(isSelected ? 2.5 : 1.5) * invZ}
                    strokeOpacity={isSelected ? 0.9 : 0.55}
                  />

                  {/* Progress arc */}
                  <circle r={inner} fill="none" stroke={gn.color}
                    strokeWidth={sw * invZ} strokeDasharray={circ} strokeDashoffset={off}
                    strokeLinecap="round" strokeOpacity={0.7} transform="rotate(-90)"
                  />

                  {/* % text */}
                  <text x={0} y={-R * 0.14} textAnchor="middle"
                    fontSize={Math.max(9, R * 0.44)} fill={gn.color} fontWeight="900" fontFamily="monospace"
                  >{progress.percentage}%</text>

                  {/* done/total */}
                  <text x={0} y={R * 0.33} textAnchor="middle"
                    fontSize={Math.max(6, R * 0.27)} fill="#555" fontFamily="monospace"
                  >{progress.completed}/{progress.total}</text>

                  {/* Collapsed badge */}
                  {isCollapsed && collCount > 0 && (
                    <g transform={`translate(${R * 0.7},${-R * 0.7})`}>
                      <circle r={Math.max(7, R * 0.28)} fill={gn.color} />
                      <text x={0} y={Math.max(7, R * 0.28) * 0.38} textAnchor="middle"
                        fontSize={Math.max(6, R * 0.24)} fill="#000" fontWeight="900"
                      >{collCount}</text>
                    </g>
                  )}

                  {/* Goal name */}
                  <text x={0} y={R + gLabelSz + 6} textAnchor="middle"
                    fontSize={gLabelSz} fill={isSelected ? gn.color : '#888'} fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >{trunc(gn.name, 18)}</text>

                  {/* Collapse indicator */}
                  {isCollapsed && (
                    <text x={0} y={R + gLabelSz * 2 + 8} textAnchor="middle"
                      fontSize={Math.max(5, gLabelSz * 0.8)} fill={gn.color} fontWeight="bold" fillOpacity={0.6}
                    >▲ collapsed</text>
                  )}
                </g>
              )
            })}

            {/* ── Center node ── */}
            <g transform={`translate(${cx},${cy})`}
              onClick={(e) => { e.stopPropagation(); setSelected(null) }}
              style={{ cursor: 'pointer' }}
            >
              <circle r={centerR} fill="#0d0d00" stroke="#F0C040" strokeWidth={2 * invZ} strokeOpacity={0.8} />
              <circle r={centerR - 4} fill="none" stroke="#F0C040" strokeWidth={0.5 * invZ} strokeOpacity={0.15}
                strokeDasharray={`${3 * invZ} ${5 * invZ}`}
              />
              <text x={0} y={-centerR * 0.1} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.33)} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >MISSION</text>
              <text x={0} y={centerR * 0.3} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.33)} fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >10000</text>
            </g>

            {/* ── Unassigned cluster ── */}
            {unassigned.length > 0 && (
              <>
                <text x={14} y={size.h - 72} fontSize={7} fill="#252525" fontWeight="bold" letterSpacing={1}>
                  UNASSIGNED ({unassigned.length})
                </text>
                {unassigned.map((t, i) => {
                  const ux  = 20 + (i % 5) * (taskR * 2.4 + 8)
                  const uy  = size.h - 52 + Math.floor(i / 5) * (taskR * 2.4 + labelSz + 10)
                  const sel = selected?.type === 'task' && selected?.id === t.id
                  const dim = hasSearch && !matchTask(t)
                  return (
                    <g key={t.id} transform={`translate(${ux},${uy})`}
                      onClick={(e) => { e.stopPropagation(); setSelected({ type: 'task', id: t.id }) }}
                      style={{ cursor: 'pointer', opacity: dim ? 0.12 : 1 }}
                    >
                      {sel && <circle r={taskR + 6} fill="none" stroke="#444" strokeWidth={1.5 * invZ} />}
                      <circle r={taskR} fill="#111" stroke="#2a2a2a" strokeWidth={1.2 * invZ} />
                      {t.status === 'completed'
                        ? <circle r={taskR * 0.34} fill="#10b981" />
                        : <circle r={taskR * 0.26} fill="#252525" />
                      }
                      <text x={0} y={taskR + labelSz + 3} textAnchor="middle" fontSize={labelSz} fill="#333" style={{ pointerEvents: 'none' }}>
                        {trunc(t.title, 10)}
                      </text>
                    </g>
                  )
                })}
              </>
            )}

          </g>{/* end transform group */}
        </svg>
      </div>

      {/* ═══════════════════════ DESKTOP PANEL ═══════════════════════ */}
      <div className="hidden md:flex w-72 xl:w-80 border-l border-[#1E1E1E] bg-[#080808] flex-col overflow-hidden flex-shrink-0">
        <div className="px-5 py-4 border-b border-[#1E1E1E] flex items-center justify-between flex-shrink-0">
          <h2 className="text-[11px] font-black text-[#444] uppercase tracking-widest">
            {selGoal ? 'Goal Details' : selTask ? 'Task Details' : 'Overview'}
          </h2>
          {selected && (
            <button onClick={() => setSelected(null)} className="p-1 text-[#333] hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">{renderPanel()}</div>
      </div>

      {/* ═══════════════════════ MOBILE BOTTOM SHEET ═══════════════════════ */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setSelected(null)} />
          <div className="relative bg-[#0a0a0a] border-t border-[#1E1E1E] rounded-t-2xl max-h-[68vh] flex flex-col pointer-events-auto shadow-2xl">
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] flex-shrink-0">
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-8 h-1 bg-[#2a2a2a] rounded-full" />
              <h2 className="text-[11px] font-black text-[#444] uppercase tracking-widest mt-2">
                {selGoal ? 'Goal Details' : 'Task Details'}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 text-[#333] hover:text-white mt-2">
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-4">{renderPanel()}</div>
          </div>
        </div>
      )}

    </div>
  )
}

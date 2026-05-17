import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, CheckCircle2, Circle, ArrowRightLeft, ChevronDown,
  Plus, Minus, Maximize2, Search, Map, Zap,
} from 'lucide-react'
import { format } from 'date-fns'
import useStore from '../store'
import { getGoalProgress, getTaskTotalTime } from '../utils/calculations'

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const MIN_ZOOM      = 0.1
const MAX_ZOOM      = 5.0
const SECTOR_PAD    = 0.80   // fraction of each sector used (vs edge gaps)
const MAX_RING_TASKS = 7     // tasks per ring before wrapping to outer ring

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const fmtMins = (m) => !m ? '0m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
const trunc   = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s

function curvePath(x1, y1, x2, y2, bend = 0.08) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * bend} ${my + dx * bend} ${x2} ${y2}`
}

// Radial text-anchor based on cosine of angle
const radialAnchor = (cos) =>
  Math.abs(cos) < 0.28 ? 'middle' : cos > 0 ? 'start' : 'end'

/* ─── DonutRing ──────────────────────────────────────────────────────────────── */
function DonutRing({ pct, color, size = 56, sw = 5 }) {
  const r = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const off  = circ * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1c1c1c" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2+4} textAnchor="middle"
        fontSize={11} fill={color} fontWeight="900" fontFamily="monospace"
      >{pct}%</text>
    </svg>
  )
}

/* ─── Sparkline ──────────────────────────────────────────────────────────────── */
function Spark({ data, color, w = 72, h = 20 }) {
  if (!data || !data.some(v => v > 0))
    return <div style={{ width: w, height: h }} className="opacity-20 bg-[#111] rounded" />
  const max = Math.max(...data, 1), pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - (v / max) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const apts = [
    ...pts.split(' '),
    `${(w - pad).toFixed(1)},${(h - pad).toFixed(1)}`,
    `${pad},${(h - pad).toFixed(1)}`,
  ].join(' ')
  return (
    <svg width={w} height={h} className="opacity-80">
      <polygon points={apts} fill={color} fillOpacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => v > 0
        ? <circle key={i}
            cx={pad + (i / (data.length - 1)) * (w - pad * 2)}
            cy={h - pad - (v / max) * (h - pad * 2)}
            r="2" fill={color} />
        : null
      )}
    </svg>
  )
}

/* ═══════════════════════════════ MAIN COMPONENT ═══════════════════════════════ */
export default function Analyse() {
  const tasks      = useStore(s => s.tasks)
  const goals      = useStore(s => s.goals)
  const updateTask = useStore(s => s.updateTask)

  /* ── State ── */
  const containerRef  = useRef(null)
  const svgRef        = useRef(null)
  const [size,        setSize]        = useState({ w: 300, h: 400 })
  const [selected,    setSelected]    = useState(null)
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [collapsed,   setCollapsed]   = useState(new Set())
  const [drag,        setDrag]        = useState(null)
  const [dropTarget,  setDropTarget]  = useState(null)
  const [zoom,        setZoom]        = useState(1)
  const [pan,         setPan]         = useState({ x: 0, y: 0 })
  const [showMinimap, setShowMinimap] = useState(false)

  /* ── Stable refs ── */
  const zoomRef      = useRef(1)
  const panRef       = useRef({ x: 0, y: 0 })
  const dragRef      = useRef(null)
  const bgPanRef     = useRef(null)
  const pinchRef     = useRef(null)
  const goalNodesRef = useRef([])
  const taskNodesRef = useRef([])
  const sizeRef      = useRef({ w: 300, h: 400 })
  const wasMoved     = useRef(false)
  const autoFitDone  = useRef(false)

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current  = pan  }, [pan])
  useEffect(() => { dragRef.current = drag }, [drag])
  useEffect(() => { sizeRef.current = size }, [size])

  /* ── ResizeObserver ── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const go = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    go()
    const ro = new ResizeObserver(go)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'r' || e.key === 'R') { setZoom(1); setPan({ x: 0, y: 0 }) }
      if (e.key === 'f' || e.key === 'F') fitToScreen()
      if (e.key === 'm' || e.key === 'M') setShowMinimap(v => !v)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* ── Sizing ── */
  const minDim    = Math.min(size.w, size.h)
  const goalOrbit = Math.max(100, minDim * 0.30)
  const centerR   = Math.max(30,  minDim * 0.065)
  const goalR     = Math.max(26,  minDim * 0.054)
  const taskR     = Math.max(13,  minDim * 0.027)
  const cx        = size.w / 2
  const cy        = size.h / 2
  const invZ      = 1 / zoom

  // Font sizes derived from node sizes
  const GOAL_FS   = Math.max(9,  goalR * 0.33)
  const TASK_FS   = Math.max(8,  taskR * 0.68)

  // Task orbit: starts beyond goal label extent so labels never overlap nodes
  const GOAL_LABEL_EXTENT = goalR + GOAL_FS + 14
  const TASK_ORBIT = Math.max(GOAL_LABEL_EXTENT + taskR + 18, Math.max(60, minDim * 0.135))

  /* ── Data ── */
  const todayStr = new Date().toISOString().split('T')[0]

  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending')   return t.status === 'pending'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  /* ── Sector-based goal layout ──────────────────────────────────────────────
     Each goal gets an angular slice proportional to its task count.
     Goals with more tasks get more angular space → tasks don't crowd neighbors.
  ── */
  const goalTaskCounts = goals.map(g =>
    filteredTasks.filter(t => t.goalId === g.id).length
  )
  const totalSectorWeight = goalTaskCounts.reduce((s, n) => s + Math.max(1.5, n), 0) || 1

  let curAngle = -Math.PI / 2  // start from 12 o'clock
  const goalNodes = goals.map((goal, i) => {
    const weight     = Math.max(1.5, goalTaskCounts[i])
    const sectorSpan = (weight / totalSectorWeight) * 2 * Math.PI
    const angle      = curAngle + sectorSpan / 2
    curAngle        += sectorSpan
    return {
      ...goal,
      x: cx + goalOrbit * Math.cos(angle),
      y: cy + goalOrbit * Math.sin(angle),
      angle,
      sectorSpan,
    }
  })

  /* ── Fan-within-sector task layout ─────────────────────────────────────────
     Tasks fan out within their goal's sector.
     Multiple rings used when tasks exceed MAX_RING_TASKS.
     Ring spacing accounts for task node size + label height.
  ── */
  const taskNodes = goalNodes.flatMap(gn => {
    if (collapsed.has(gn.id)) return []
    const gt = filteredTasks.filter(t => t.goalId === gn.id)
    if (!gt.length) return []

    return gt.map((task, j) => {
      const ring        = Math.floor(j / MAX_RING_TASKS)
      const idxInRing   = j % MAX_RING_TASKS
      const countInRing = Math.min(MAX_RING_TASKS, gt.length - ring * MAX_RING_TASKS)
      const ringOrbit   = TASK_ORBIT + ring * (taskR * 2.6 + TASK_FS + 14)

      // Scale sector usage down for small rings (last partial ring uses proportionally less)
      const ringFill  = countInRing / MAX_RING_TASKS
      const usable    = gn.sectorSpan * SECTOR_PAD * Math.min(1, ringFill + 0.2)

      let angle
      if (countInRing === 1) {
        angle = gn.angle
      } else {
        angle = gn.angle - usable / 2 + (idxInRing / (countInRing - 1)) * usable
      }

      return {
        ...task,
        x:         gn.x + ringOrbit * Math.cos(angle),
        y:         gn.y + ringOrbit * Math.sin(angle),
        angle,
        goalColor: gn.color,
      }
    })
  })

  goalNodesRef.current = goalNodes
  taskNodesRef.current = taskNodes

  const unassigned = filteredTasks.filter(t => !goalNodes.some(gn => gn.id === t.goalId))
  const hasSearch  = search.length > 0
  const searchLow  = search.toLowerCase()
  const matchTask  = t => !hasSearch || t.title.toLowerCase().includes(searchLow)
  const matchGoal  = g => !hasSearch || g.name.toLowerCase().includes(searchLow) ||
    tasks.filter(t => t.goalId === g.id).some(t => t.title.toLowerCase().includes(searchLow))
  const runningTask = tasks.find(t => t.isRunning)

  /* ── Activity helpers ── */
  const spark7 = useCallback((goalId) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      const key = d.toISOString().split('T')[0]
      return tasks.filter(t => t.goalId === goalId).reduce((s, t) => s + ((t.timeLog?.[key]) || 0), 0)
    }), [tasks])

  const heatVal = useCallback((goalId) => {
    const total = spark7(goalId).reduce((a, b) => a + b, 0)
    return Math.min(1, total / 100)
  }, [spark7])

  /* ── Stats ── */
  const totalTime  = tasks.reduce((s, t) => s + getTaskTotalTime(t), 0)
  const doneCount  = tasks.filter(t => t.status === 'completed').length
  const overallPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  /* ── Zoom helpers ── */
  const applyZoom = useCallback((newZ, ox, oy) => {
    newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZ))
    const cur = zoomRef.current, p = panRef.current
    setZoom(newZ)
    setPan({ x: ox - (ox - p.x) * (newZ / cur), y: oy - (oy - p.y) * (newZ / cur) })
  }, [])

  const fitToScreen = useCallback(() => {
    const s   = sizeRef.current
    const all = [...taskNodesRef.current, ...goalNodesRef.current]
    if (!all.length) return
    const xs  = all.map(n => n.x), ys = all.map(n => n.y)
    // Generous padding to include radial labels which extend beyond node center
    const pad = 90
    const bx = Math.min(...xs) - pad, bX = Math.max(...xs) + pad
    const by = Math.min(...ys) - pad, bY = Math.max(...ys) + pad
    const gw = bX - bx, gh = bY - by
    const fz = Math.min((s.w * 0.92) / gw, (s.h * 0.88) / gh, MAX_ZOOM)
    setZoom(Math.max(MIN_ZOOM, fz))
    setPan({ x: s.w / 2 - (bx + gw / 2) * fz, y: s.h / 2 - (by + gh / 2) * fz })
  }, [])

  /* Auto-fit once after first meaningful size */
  useEffect(() => {
    if (size.w > 100 && size.h > 100 && !autoFitDone.current) {
      autoFitDone.current = true
      const t = setTimeout(fitToScreen, 80)
      return () => clearTimeout(t)
    }
  }, [size.w, size.h, fitToScreen])

  const zoomIn    = () => applyZoom(zoomRef.current * 1.3,  size.w / 2, size.h / 2)
  const zoomOut   = () => applyZoom(zoomRef.current * 0.77, size.w / 2, size.h / 2)
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

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

  /* ── Coordinate conversion ── */
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

  /* ── Mouse events ── */
  const onTaskDown = (e, taskId, goalId) => {
    e.preventDefault(); e.stopPropagation()
    setDrag({ taskId, goalId, ...evPos(e) })
    setDropTarget(null)
  }

  const onBgDown = (e) => {
    if (dragRef.current) return
    wasMoved.current = false
    bgPanRef.current = {
      startCX: e.clientX, startCY: e.clientY,
      startPX: panRef.current.x, startPY: panRef.current.y,
    }
  }

  const onMove = (e) => {
    if (dragRef.current) {
      const pos = evPos(e)
      setDrag(d => ({ ...d, ...pos }))
      setDropTarget(
        goalNodesRef.current.find(gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 12)?.id || null
      )
      return
    }
    if (bgPanRef.current) {
      const dx = e.clientX - bgPanRef.current.startCX
      const dy = e.clientY - bgPanRef.current.startCY
      if (Math.hypot(dx, dy) > 4) wasMoved.current = true
      if (wasMoved.current) setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
    }
  }

  const onUp = () => {
    bgPanRef.current = null
    if (drag && dropTarget && dropTarget !== drag.goalId) {
      updateTask(drag.taskId, { goalId: dropTarget })
      setSelected({ type: 'task', id: drag.taskId })
    }
    setDrag(null); setDropTarget(null)
  }

  /* ── Touch events ── */
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const r    = svgRef.current?.getBoundingClientRect()
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      )
      pinchRef.current = {
        dist, zoom: zoomRef.current,
        panX: panRef.current.x, panY: panRef.current.y,
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2 - (r?.left || 0),
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2 - (r?.top  || 0),
      }
    } else if (e.touches.length === 1 && !dragRef.current) {
      wasMoved.current = false
      bgPanRef.current = {
        startCX: e.touches[0].clientX, startCY: e.touches[0].clientY,
        startPX: panRef.current.x, startPY: panRef.current.y,
      }
    }
  }

  const onTouchMove = (e) => {
    e.preventDefault()
    if (e.touches.length === 2 && pinchRef.current) {
      const dist  = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY)
      const newZ  = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.zoom * (dist / pinchRef.current.dist)))
      const ratio = newZ / pinchRef.current.zoom
      setZoom(newZ)
      setPan({
        x: pinchRef.current.midX - (pinchRef.current.midX - pinchRef.current.panX) * ratio,
        y: pinchRef.current.midY - (pinchRef.current.midY - pinchRef.current.panY) * ratio,
      })
    } else if (e.touches.length === 1) {
      if (dragRef.current) {
        const pos = evPos(e)
        setDrag(d => ({ ...d, ...pos }))
        setDropTarget(
          goalNodesRef.current.find(gn => Math.hypot(gn.x - pos.x, gn.y - pos.y) < goalR + 12)?.id || null
        )
      } else if (bgPanRef.current) {
        const dx = e.touches[0].clientX - bgPanRef.current.startCX
        const dy = e.touches[0].clientY - bgPanRef.current.startCY
        if (Math.hypot(dx, dy) > 4) wasMoved.current = true
        if (wasMoved.current) setPan({ x: bgPanRef.current.startPX + dx, y: bgPanRef.current.startPY + dy })
      }
    }
  }

  /* ── Minimap ── */
  const MM_W = 160, MM_H = 110
  const mmNodes = [...goalNodes, ...taskNodes, { x: cx, y: cy }]
  const mmXs = mmNodes.map(n => n.x), mmYs = mmNodes.map(n => n.y)
  const mmMinX = Math.min(...mmXs, cx - goalOrbit) - 40
  const mmMaxX = Math.max(...mmXs, cx + goalOrbit) + 40
  const mmMinY = Math.min(...mmYs, cy - goalOrbit) - 40
  const mmMaxY = Math.max(...mmYs, cy + goalOrbit) + 40
  const mmSc   = Math.min(MM_W / (mmMaxX - mmMinX), MM_H / (mmMaxY - mmMinY)) * 0.9
  const mmOX   = MM_W / 2 - ((mmMinX + mmMaxX) / 2) * mmSc
  const mmOY   = MM_H / 2 - ((mmMinY + mmMaxY) / 2) * mmSc
  const toMM   = (x, y) => ({ x: x * mmSc + mmOX, y: y * mmSc + mmOY })

  const vpWorld = { x: -pan.x / zoom, y: -pan.y / zoom, w: size.w / zoom, h: size.h / zoom }
  const vpMM    = {
    x: vpWorld.x * mmSc + mmOX, y: vpWorld.y * mmSc + mmOY,
    w: vpWorld.w * mmSc,        h: vpWorld.h * mmSc,
  }

  const onMinimapClick = (e) => {
    const r  = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const wx = (mx - mmOX) / mmSc, wy = (my - mmOY) / mmSc
    setPan({ x: size.w / 2 - wx * zoom, y: size.h / 2 - wy * zoom })
  }

  /* ── Selection helpers ── */
  const selGoal = selected?.type === 'goal' ? goals.find(g => g.id === selected.id) : null
  const selTask = selected?.type === 'task' ? tasks.find(t => t.id === selected.id) : null

  /* ── Panel content ── */
  const renderPanel = () => (
    <div className="space-y-4">
      {!selected && (<>
        <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
          <DonutRing pct={overallPct} color="#F0C040" size={54} sw={5} />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-[#333] font-black uppercase tracking-widest mb-1">Overall Progress</div>
            <div className="text-white font-black text-sm">{doneCount}/{tasks.length} tasks</div>
            <div className="text-[#444] text-[10px] font-bold">{fmtMins(totalTime)} total</div>
          </div>
        </div>

        {runningTask && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#0d1f17] border border-[#10b981]/30 rounded-xl">
            <span className="relative flex-shrink-0 w-2.5 h-2.5">
              <span className="animate-ping absolute inset-0 rounded-full bg-[#10b981] opacity-60" />
              <span className="absolute inset-0 rounded-full bg-[#10b981]" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-[#10b981] font-black uppercase tracking-widest">Running now</div>
              <div className="text-xs text-white font-bold truncate">{runningTask.title}</div>
            </div>
            <Zap size={12} className="text-[#10b981] flex-shrink-0" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Goals', value: goals.length,       color: '#F0C040' },
            { label: 'Tasks', value: tasks.length,       color: '#6366f1' },
            { label: 'Done',  value: doneCount,          color: '#10b981' },
            { label: 'Time',  value: fmtMins(totalTime), color: '#f59e0b' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
              <div className="text-[9px] text-[#333] font-black uppercase tracking-widest mb-0.5">{label}</div>
              <div className="text-lg font-black" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Goals</div>
          {goalNodes.map(gn => {
            const p  = getGoalProgress(gn.id, tasks)
            const s7 = spark7(gn.id)
            return (
              <div key={gn.id} onClick={() => setSelected({ type: 'goal', id: gn.id })}
                className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3 cursor-pointer hover:border-[#252525] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: gn.color }} />
                    <span className="text-xs font-bold text-[#aaa] truncate">{gn.name}</span>
                    {p.percentage === 100 && <span className="text-[10px] ml-1">🏆</span>}
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <Spark data={s7} color={gn.color} w={56} h={18} />
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

        <div className="hidden md:block bg-[#0d0d0d] border border-[#151515] rounded-xl p-3">
          <div className="text-[9px] font-black text-[#2a2a2a] uppercase tracking-widest mb-2">Shortcuts</div>
          {[['F','Fit to screen'],['R','Reset view'],['M','Toggle minimap'],['Esc','Deselect']].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-0.5">
              <span className="text-[9px] text-[#333]">{v}</span>
              <kbd className="text-[9px] font-black text-[#444] bg-[#141414] px-1.5 py-0.5 rounded">{k}</kbd>
            </div>
          ))}
        </div>
      </>)}

      {selGoal && (() => {
        const p   = getGoalProgress(selGoal.id, tasks)
        const gts = tasks.filter(t => t.goalId === selGoal.id)
        const s7  = spark7(selGoal.id)
        return (<>
          <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
            <DonutRing pct={p.percentage} color={selGoal.color} size={54} sw={5} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selGoal.color }} />
                <span className="text-xs font-black text-white truncate">{selGoal.name}</span>
                {p.percentage === 100 && <span>🏆</span>}
              </div>
              <Spark data={s7} color={selGoal.color} w={80} h={22} />
              <div className="text-[9px] text-[#333] font-bold mt-1">7-day activity</div>
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
          <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${p.percentage}%`, backgroundColor: selGoal.color }} />
          </div>
          <div className="space-y-1.5">
            <div className="text-[9px] font-black text-[#333] uppercase tracking-widest">Tasks ({gts.length})</div>
            {gts.length === 0 && <div className="text-center py-4 text-[#222] text-xs">No tasks</div>}
            {gts.map(t => (
              <div key={t.id} onClick={() => setSelected({ type: 'task', id: t.id })}
                className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-xl border border-[#1a1a1a] cursor-pointer hover:border-[#252525] transition-colors"
              >
                {t.isRunning
                  ? <span className="relative w-2.5 h-2.5 flex-shrink-0">
                      <span className="animate-ping absolute inset-0 rounded-full bg-[#10b981] opacity-60"/>
                      <span className="absolute inset-0 rounded-full bg-[#10b981]"/>
                    </span>
                  : t.status === 'completed'
                    ? <CheckCircle2 size={13} className="text-[#10b981] flex-shrink-0" />
                    : <Circle size={13} className="text-[#2a2a2a] flex-shrink-0" />
                }
                <span className="text-xs text-[#666] flex-1 truncate">{t.title}</span>
                {(t.timeLog?.[todayStr] || 0) > 0 && <span className="text-[9px] text-[#10b981] font-bold">today</span>}
                {getTaskTotalTime(t) > 0 && <span className="text-[9px] text-[#333] font-bold">{getTaskTotalTime(t)}m</span>}
              </div>
            ))}
          </div>
        </>)
      })()}

      {selTask && (() => {
        const tg   = goals.find(g => g.id === selTask.goalId)
        const mins = getTaskTotalTime(selTask)
        const logs = Object.entries(selTask.timeLog || {}).sort((a, b) => b[0].localeCompare(a[0]))
        return (<>
          <div className="p-3 bg-[#111] border border-[#1a1a1a] rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              {tg
                ? <><div className="w-2 h-2 rounded-full" style={{ backgroundColor: tg.color }} /><span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tg.color }}>{tg.name}</span></>
                : <><div className="w-2 h-2 rounded-full bg-[#333]" /><span className="text-[10px] font-bold text-[#444] uppercase">Unassigned</span></>}
            </div>
            <div className="text-sm font-black text-white leading-snug">{selTask.title}</div>
            {selTask.isRunning && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="relative w-2 h-2">
                  <span className="animate-ping absolute inset-0 rounded-full bg-[#10b981] opacity-60"/>
                  <span className="absolute inset-0 rounded-full bg-[#10b981]"/>
                </span>
                <span className="text-[10px] text-[#10b981] font-bold">Running now</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
              <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">Status</div>
              <div className={`text-sm font-black mt-0.5 ${selTask.isRunning || selTask.status === 'completed' ? 'text-[#10b981]' : 'text-[#F0C040]'}`}>
                {selTask.isRunning ? 'Running' : selTask.status === 'completed' ? 'Done' : 'Active'}
              </div>
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3">
              <div className="text-[9px] text-[#333] font-black uppercase tracking-widest">Total Time</div>
              <div className="text-sm font-black text-white mt-0.5">{fmtMins(mins)}</div>
            </div>
            {(selTask.timeLog?.[todayStr] || 0) > 0 && (
              <div className="col-span-2 bg-[#0d1f17] border border-[#10b981]/20 rounded-xl p-3">
                <div className="text-[9px] text-[#10b981] font-black uppercase tracking-widest">Today</div>
                <div className="text-sm font-black text-[#10b981] mt-0.5">{fmtMins(selTask.timeLog[todayStr])}</div>
              </div>
            )}
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
                <button
                  onClick={() => { updateTask(selTask.id, { goalId: null }); setSelected({ type: 'task', id: selTask.id }) }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs text-[#333] hover:text-white hover:border-[#252525] transition-all text-left group"
                >
                  <div className="w-2 h-2 rounded-full bg-[#2a2a2a] flex-shrink-0" />
                  <span className="flex-1">Unassign from goal</span>
                  <X size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>
          {logs.length > 0 && (
            <div>
              <div className="text-[9px] font-black text-[#333] uppercase tracking-widest mb-2">Time Log</div>
              <div className="space-y-1">
                {logs.map(([date, m]) => (
                  <div key={date} className="flex justify-between items-center px-3 py-1.5 bg-[#111] rounded-lg border border-[#1a1a1a]">
                    <span className="text-[10px] text-[#444]">{format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                    <span className="text-[10px] text-[#666] font-bold">{m}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)
      })()}
    </div>
  )

  /* ═══════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <div className="flex flex-col md:flex-row h-full bg-[#0C0C0C] overflow-hidden">

      {/* ════════════════════ SVG CANVAS ════════════════════ */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden min-h-0">

        {/* ── Mobile stats strip ── */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-10 bg-[#0C0C0C] flex items-center gap-2 px-3 py-2">
          {[
            { v: goals.length, c: '#F0C040', l: 'Goals' },
            { v: tasks.length, c: '#6366f1', l: 'Tasks'  },
            { v: doneCount,    c: '#10b981', l: 'Done'   },
          ].map(({ v, c, l }) => (
            <div key={l} className="flex-1 bg-[#111] border border-[#1a1a1a] rounded-lg px-2 py-1 text-center">
              <div className="text-xs font-black" style={{ color: c }}>{v}</div>
              <div className="text-[7px] text-[#333] font-bold uppercase tracking-wide">{l}</div>
            </div>
          ))}
          <div className="flex-1 bg-[#111] border border-[#1a1a1a] rounded-lg px-2 py-1 text-center">
            <div className="text-xs font-black text-[#f59e0b]">{overallPct}%</div>
            <div className="text-[7px] text-[#333] font-bold uppercase tracking-wide">Done</div>
          </div>
        </div>

        {/* ── Top toolbar ── */}
        <div className="absolute top-[54px] left-3 right-3 z-10 flex items-center gap-2 flex-wrap md:top-3">
          <div className="flex bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl p-1 gap-0.5">
            {['all', 'pending', 'completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wide transition-all ${
                  filter === f ? 'bg-[#F0C040] text-black' : 'text-[#555] hover:text-white'
                }`}
              >{f}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl px-2.5 py-1.5 flex-1 sm:flex-none sm:w-44 min-w-0">
            <Search size={10} className="text-[#444] flex-shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="bg-transparent text-white text-[11px] focus:outline-none placeholder-[#2a2a2a] w-full min-w-0"
            />
            {search && <button onClick={() => setSearch('')} className="text-[#444] hover:text-white flex-shrink-0"><X size={10} /></button>}
          </div>
        </div>

        {/* ── Zoom controls ── */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 items-center">
          <button onClick={zoomIn} className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"><Plus size={15} /></button>
          <button onClick={zoomOut} className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-white hover:border-[#2a2a2a] transition-all active:scale-95"><Minus size={15} /></button>
          <button onClick={fitToScreen} className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[#555] hover:text-[#F0C040] hover:border-[#F0C040]/30 transition-all active:scale-95" title="Fit (F)"><Maximize2 size={13} /></button>
          <button onClick={() => setShowMinimap(v => !v)} className={`w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border rounded-xl flex items-center justify-center transition-all active:scale-95 ${showMinimap ? 'border-[#F0C040]/40 text-[#F0C040]' : 'border-[#1E1E1E] text-[#555] hover:text-white'}`} title="Minimap (M)"><Map size={13} /></button>
          <button onClick={resetView} className="w-9 h-9 bg-[#141414]/90 backdrop-blur-sm border border-[#1E1E1E] rounded-xl flex items-center justify-center text-[10px] font-black text-[#333] hover:text-white transition-all active:scale-95" title="Reset (R)">1:1</button>
          <div className="text-[9px] font-black text-[#222] tabular-nums mt-0.5">{Math.round(zoom * 100)}%</div>
        </div>

        {/* ── Minimap overlay ── */}
        {showMinimap && (
          <div className="absolute top-14 right-4 z-20 bg-[#0a0a0a]/95 border border-[#1E1E1E] rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm" style={{ width: MM_W, height: MM_H }}>
            <svg width={MM_W} height={MM_H} onClick={onMinimapClick} style={{ cursor: 'crosshair' }}>
              {goalNodes.map(gn => {
                const mc = toMM(cx, cy), mg = toMM(gn.x, gn.y)
                return <line key={`ml-${gn.id}`} x1={mc.x} y1={mc.y} x2={mg.x} y2={mg.y} stroke={gn.color} strokeWidth={0.5} strokeOpacity={0.2} />
              })}
              {taskNodes.map(tn => { const m = toMM(tn.x, tn.y); return <circle key={`mt-${tn.id}`} cx={m.x} cy={m.y} r={1.5} fill={tn.goalColor} fillOpacity={0.5} /> })}
              {goalNodes.map(gn => { const m = toMM(gn.x, gn.y); return <circle key={`mg-${gn.id}`} cx={m.x} cy={m.y} r={4} fill={gn.color} fillOpacity={0.8} /> })}
              {(() => { const m = toMM(cx, cy); return <circle cx={m.x} cy={m.y} r={5} fill="#F0C040" fillOpacity={0.9} /> })()}
              <rect x={vpMM.x} y={vpMM.y} width={vpMM.w} height={vpMM.h}
                fill="none" stroke="white" strokeWidth={1} strokeOpacity={0.25} rx={1} />
            </svg>
          </div>
        )}

        {/* ════════════ SVG ════════════ */}
        <svg ref={svgRef} width={size.w} height={size.h}
          onMouseDown={onBgDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { pinchRef.current = null; onUp() }}
          onClick={() => { if (!wasMoved.current) setSelected(null) }}
          className="select-none touch-none absolute inset-0"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="sglow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="#181818" />
            </pattern>
            <radialGradient id="cGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F0C040" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#F0C040" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width={size.w} height={size.h} fill="url(#dots)" />

          {/* Zoom/pan group */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Per-goal gradient defs (inside transform so userSpaceOnUse coords work) */}
            <defs>
              {goalNodes.map(gn => (
                <linearGradient key={`lg-${gn.id}`} id={`lg-${gn.id}`}
                  gradientUnits="userSpaceOnUse" x1={cx} y1={cy} x2={gn.x} y2={gn.y}
                >
                  <stop offset="0%"   stopColor="#F0C040" stopOpacity="0.15" />
                  <stop offset="100%" stopColor={gn.color} stopOpacity="0.30" />
                </linearGradient>
              ))}
            </defs>

            {/* Ambient glow behind center */}
            <circle cx={cx} cy={cy} r={goalOrbit * 0.8} fill="url(#cGlow)" />

            {/* Sector guide arcs — subtle slice dividers */}
            {goalNodes.map(gn => {
              const halfSector = gn.sectorSpan / 2
              const a1 = gn.angle - halfSector, a2 = gn.angle + halfSector
              const r0 = centerR + 6, r1 = goalOrbit - goalR - 10
              if (r1 <= r0) return null
              const x1 = cx + r1 * Math.cos(a1), y1 = cy + r1 * Math.sin(a1)
              const x2 = cx + r0 * Math.cos(a1), y2 = cy + r0 * Math.sin(a1)
              const x3 = cx + r0 * Math.cos(a2), y3 = cy + r0 * Math.sin(a2)
              const x4 = cx + r1 * Math.cos(a2), y4 = cy + r1 * Math.sin(a2)
              const large = halfSector * 2 > Math.PI ? 1 : 0
              return (
                <path key={`sec-${gn.id}`}
                  d={`M ${x1} ${y1} A ${r1} ${r1} 0 ${large} 0 ${x4} ${y4} L ${x3} ${y3} A ${r0} ${r0} 0 ${large} 1 ${x2} ${y2} Z`}
                  fill={gn.color} fillOpacity="0.03"
                  stroke={gn.color} strokeOpacity="0.06" strokeWidth={invZ}
                />
              )
            })}

            {/* center → goal branches */}
            {goalNodes.map(gn => (
              <path key={`cl-${gn.id}`}
                d={curvePath(cx, cy, gn.x, gn.y, 0.06)}
                stroke={`url(#lg-${gn.id})`} strokeWidth={2 * invZ}
                opacity={hasSearch && !matchGoal(gn) ? 0.04 : 1} fill="none"
              />
            ))}

            {/* goal → task branches */}
            {taskNodes.map(tn => {
              if (drag?.taskId === tn.id) return null
              const gn = goalNodes.find(g => g.id === tn.goalId)
              if (!gn) return null
              return (
                <path key={`tl-${tn.id}`}
                  d={curvePath(gn.x, gn.y, tn.x, tn.y, 0.07)}
                  stroke={tn.goalColor} strokeWidth={invZ}
                  strokeOpacity={hasSearch && !matchTask(tn) ? 0.02 : 0.20}
                  fill="none"
                />
              )
            })}

            {/* Drag ghost line */}
            {drag && (() => {
              const sg = goalNodes.find(g => g.id === drag.goalId)
              if (!sg) return null
              return (
                <line x1={sg.x} y1={sg.y} x2={drag.x} y2={drag.y}
                  stroke="#F0C040" strokeWidth={1.5 * invZ}
                  strokeDasharray={`${5*invZ} ${3*invZ}`} strokeOpacity={0.7}
                />
              )
            })()}

            {/* ── Task nodes ── */}
            {taskNodes.map(tn => {
              const isDragging  = drag?.taskId === tn.id
              const isSel       = selected?.type === 'task' && selected?.id === tn.id
              const isDone      = tn.status === 'completed'
              const isRunning   = tn.isRunning
              const workedToday = (tn.timeLog?.[todayStr] || 0) > 0
              const dimmed      = hasSearch && !matchTask(tn)
              const mins        = getTaskTotalTime(tn)
              const tx = isDragging ? drag.x : tn.x
              const ty = isDragging ? drag.y : tn.y
              const r  = taskR

              // Radial label direction: away from parent goal
              const lcos   = Math.cos(tn.angle)
              const lsin   = Math.sin(tn.angle)
              const lx     = (r + 5) * lcos
              const ly     = (r + 5) * lsin
              const anchor = radialAnchor(lcos)

              return (
                <g key={tn.id} transform={`translate(${tx},${ty})`}
                  onMouseDown={(e) => { e.stopPropagation(); onTaskDown(e, tn.id, tn.goalId) }}
                  onTouchStart={(e) => { e.stopPropagation(); onTaskDown(e, tn.id, tn.goalId) }}
                  onClick={(e) => { e.stopPropagation(); if (!drag) setSelected({ type: 'task', id: tn.id }) }}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab', opacity: dimmed ? 0.08 : 1 }}
                >
                  {/* Running: double pulse rings */}
                  {isRunning && (<>
                    <circle r={r + 4} fill="none" stroke="#10b981" strokeWidth={1.5 * invZ}>
                      <animate attributeName="r" values={`${r+3};${r+13};${r+3}`} dur="2s" repeatCount="indefinite" calcMode="ease" />
                      <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" calcMode="ease" />
                    </circle>
                    <circle r={r + 2} fill="none" stroke="#10b981" strokeWidth={invZ}>
                      <animate attributeName="r" values={`${r+1};${r+8};${r+1}`} dur="2s" begin="0.55s" repeatCount="indefinite" calcMode="ease" />
                      <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2s" begin="0.55s" repeatCount="indefinite" calcMode="ease" />
                    </circle>
                  </>)}

                  {/* Worked today: steady green halo */}
                  {workedToday && !isRunning && (
                    <circle r={r + 5} fill="none" stroke="#10b981" strokeWidth={invZ} strokeOpacity={0.22} />
                  )}

                  {/* Selection ring */}
                  {isSel && <circle r={r + 8} fill="none" stroke={tn.goalColor} strokeWidth={1.5 * invZ} strokeOpacity={0.5} />}

                  {/* Body */}
                  <circle r={r}
                    fill={isDone ? '#0d0d0d' : `${tn.goalColor}18`}
                    stroke={isRunning ? '#10b981' : tn.goalColor}
                    strokeWidth={(isDragging ? 2.5 : isSel ? 2 : 1.5) * invZ}
                    strokeOpacity={isDone ? 0.2 : 0.75}
                    filter={isDragging ? 'url(#sglow)' : undefined}
                  />

                  {/* Inner indicator */}
                  {isDone
                    ? <circle r={r * 0.35} fill="#10b981" />
                    : isRunning
                      ? <circle r={r * 0.32} fill="#10b981" fillOpacity={0.9} />
                      : mins > 0
                        ? <text x={0} y={r * 0.32} textAnchor="middle" fontSize={r * 0.52}
                            fill={tn.goalColor} fontWeight="bold" fontFamily="monospace"
                          >{mins}m</text>
                        : <circle r={r * 0.27} fill={tn.goalColor} fillOpacity={0.4} />
                  }

                  {/* Radial label — points away from parent goal */}
                  <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
                    fontSize={TASK_FS}
                    fill={isSel ? tn.goalColor : isDone ? '#3a3a3a' : '#575757'}
                    fontWeight={isSel ? 'bold' : 'normal'}
                    style={{ pointerEvents: 'none' }}
                  >{trunc(tn.title, 22)}</text>
                </g>
              )
            })}

            {/* ── Goal nodes ── */}
            {goalNodes.map(gn => {
              const progress    = getGoalProgress(gn.id, tasks)
              const isSel       = selected?.type === 'goal' && selected?.id === gn.id
              const isDropTgt   = dropTarget === gn.id
              const isCollapsed = collapsed.has(gn.id)
              const isDone      = progress.percentage === 100
              const dimmed      = hasSearch && !matchGoal(gn)
              const heat        = heatVal(gn.id)
              const collCount   = filteredTasks.filter(t => t.goalId === gn.id).length
              const R     = goalR
              const inner = R - R * 0.2
              const circ  = 2 * Math.PI * inner
              const off   = circ * (1 - progress.percentage / 100)
              const sw    = Math.max(2, R * 0.13)

              // Radial label direction: away from center
              const lcos   = Math.cos(gn.angle)
              const lsin   = Math.sin(gn.angle)
              const lDist  = R + GOAL_FS + 9
              const glx    = lDist * lcos
              const gly    = lDist * lsin
              const anchor = radialAnchor(lcos)

              return (
                <g key={gn.id} transform={`translate(${gn.x},${gn.y})`}
                  onClick={(e) => { e.stopPropagation(); setSelected({ type: 'goal', id: gn.id }) }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setCollapsed(s => {
                      const n = new Set(s)
                      n.has(gn.id) ? n.delete(gn.id) : n.add(gn.id)
                      return n
                    })
                  }}
                  style={{ cursor: 'pointer', opacity: dimmed ? 0.08 : 1 }}
                >
                  {/* Activity heat ring */}
                  {heat > 0.05 && (
                    <circle r={R + 8} fill="none" stroke={gn.color}
                      strokeWidth={Math.max(1, heat * 4) * invZ}
                      strokeOpacity={heat * 0.35}
                      filter={heat > 0.6 ? 'url(#sglow)' : undefined}
                    />
                  )}

                  {/* 100% completion pulse */}
                  {isDone && (
                    <circle r={R + 5} fill="none" stroke="#F0C040" strokeWidth={2 * invZ}>
                      <animate attributeName="stroke-opacity" values="0.55;0.12;0.55" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Drop target glow */}
                  {isDropTgt && (
                    <circle r={R + 16} fill={`${gn.color}0d`} stroke={gn.color}
                      strokeWidth={2 * invZ} strokeOpacity={0.8} filter="url(#glow)" />
                  )}

                  {/* Selection ring */}
                  {isSel && (
                    <circle r={R + 10} fill="none" stroke={gn.color}
                      strokeWidth={1.5 * invZ} strokeOpacity={0.3}
                      strokeDasharray={`${4*invZ} ${4*invZ}`} />
                  )}

                  {/* Body */}
                  <circle r={R} fill="#111"
                    stroke={gn.color}
                    strokeWidth={(isSel ? 2.5 : 1.5) * invZ}
                    strokeOpacity={isSel ? 0.9 : 0.55}
                  />

                  {/* Progress arc */}
                  <circle r={inner} fill="none" stroke={gn.color}
                    strokeWidth={sw * invZ}
                    strokeDasharray={circ} strokeDashoffset={off}
                    strokeLinecap="round" strokeOpacity={0.7}
                    transform="rotate(-90)"
                  />

                  {/* % text */}
                  <text x={0} y={-R * 0.12} textAnchor="middle"
                    fontSize={Math.max(9, R * 0.44)}
                    fill={isDone ? '#F0C040' : gn.color}
                    fontWeight="900" fontFamily="monospace"
                  >{progress.percentage}%</text>

                  <text x={0} y={R * 0.34} textAnchor="middle"
                    fontSize={Math.max(6, R * 0.27)} fill="#555" fontFamily="monospace"
                  >{progress.completed}/{progress.total}</text>

                  {/* 100% trophy badge */}
                  {isDone && (
                    <text x={R * 0.72} y={-R * 0.72} textAnchor="middle"
                      fontSize={Math.max(8, R * 0.38)}>🏆</text>
                  )}

                  {/* Collapsed badge */}
                  {isCollapsed && collCount > 0 && (
                    <g transform={`translate(${R * 0.72},${-R * 0.72})`}>
                      <circle r={Math.max(7, R * 0.3)} fill={gn.color} />
                      <text x={0} y={Math.max(7, R * 0.3) * 0.38} textAnchor="middle"
                        fontSize={Math.max(6, R * 0.24)} fill="#000" fontWeight="900"
                      >{collCount}</text>
                    </g>
                  )}

                  {/* Radial label — points away from center */}
                  <text x={glx} y={gly} textAnchor={anchor} dominantBaseline="middle"
                    fontSize={GOAL_FS}
                    fill={isSel ? gn.color : '#909090'}
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >{trunc(gn.name, 20)}</text>

                  {isCollapsed && (
                    <text x={glx} y={gly + GOAL_FS + 3} textAnchor={anchor}
                      fontSize={Math.max(5, GOAL_FS * 0.75)}
                      fill={gn.color} fillOpacity={0.5}
                      style={{ pointerEvents: 'none' }}
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
              <circle r={centerR} fill="#0d0d00" stroke="#F0C040"
                strokeWidth={2 * invZ} strokeOpacity={0.85} />
              <circle r={centerR - 5} fill="none" stroke="#F0C040"
                strokeWidth={0.5 * invZ} strokeOpacity={0.12}
                strokeDasharray={`${3*invZ} ${6*invZ}`} />
              <text x={0} y={-centerR * 0.12} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.33)}
                fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >MISSION</text>
              <text x={0} y={centerR * 0.32} textAnchor="middle"
                fontSize={Math.max(8, centerR * 0.33)}
                fill="#F0C040" fontWeight="900" fontFamily="monospace" letterSpacing={1}
              >10000</text>
            </g>

            {/* ── Unassigned cluster (bottom-left corner) ── */}
            {unassigned.length > 0 && (() => {
              const clusterX = 24, clusterY = size.h - 60
              return (
                <>
                  <text x={clusterX} y={clusterY - taskR - 10}
                    fontSize={7} fill="#252525" fontWeight="bold" letterSpacing={1}
                  >UNASSIGNED ({unassigned.length})</text>
                  {unassigned.map((t, i) => {
                    const ux  = clusterX + (i % 6) * (taskR * 2.6 + 8)
                    const uy  = clusterY + Math.floor(i / 6) * (taskR * 2.6 + TASK_FS + 10)
                    const sel = selected?.type === 'task' && selected?.id === t.id
                    const dim = hasSearch && !matchTask(t)
                    return (
                      <g key={t.id} transform={`translate(${ux},${uy})`}
                        onClick={(e) => { e.stopPropagation(); setSelected({ type: 'task', id: t.id }) }}
                        style={{ cursor: 'pointer', opacity: dim ? 0.08 : 1 }}
                      >
                        {sel && <circle r={taskR + 6} fill="none" stroke="#444" strokeWidth={1.5 * invZ} />}
                        <circle r={taskR} fill="#111" stroke="#252525" strokeWidth={1.2 * invZ} />
                        {t.status === 'completed'
                          ? <circle r={taskR * 0.34} fill="#10b981" />
                          : <circle r={taskR * 0.25} fill="#222" />
                        }
                        <text x={0} y={taskR + TASK_FS + 3} textAnchor="middle"
                          fontSize={TASK_FS} fill="#333"
                          style={{ pointerEvents: 'none' }}
                        >{trunc(t.title, 14)}</text>
                      </g>
                    )
                  })}
                </>
              )
            })()}

          </g>
        </svg>
      </div>

      {/* ════════════════════ DESKTOP PANEL ════════════════════ */}
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

      {/* ════════════════════ MOBILE BOTTOM SHEET ════════════════════ */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setSelected(null)} />
          <div className="relative bg-[#0a0a0a] border-t border-[#1E1E1E] rounded-t-2xl max-h-[70vh] flex flex-col pointer-events-auto shadow-2xl">
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] flex-shrink-0">
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-8 h-1 bg-[#252525] rounded-full" />
              <h2 className="text-[11px] font-black text-[#444] uppercase tracking-widest mt-1.5">
                {selGoal ? 'Goal Details' : 'Task Details'}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 text-[#333] hover:text-white mt-1.5">
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

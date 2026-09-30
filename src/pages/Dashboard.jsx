import { useMemo } from 'react'
import { format } from 'date-fns'
import { Target, CheckSquare, ListTodo, TrendingUp, Clock } from 'lucide-react'
import useStore from '../store'
import { getDashboardStats } from '../utils/calculations'
import TimeBudget from '../components/TimeBudget'

function ProgressRing({ percentage, size = 220, stroke = 16 }) {
  const r = (size - stroke * 2) / 2
  const circ = r * 2 * Math.PI
  const offset = circ - (Math.min(percentage, 100) / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#1E1E1E" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke="#F0C040" strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
      </svg>
      <div className="absolute text-center pointer-events-none">
        <div className="text-5xl font-black text-white tabular-nums leading-none">{percentage}<span className="text-2xl text-[#F0C040]">%</span></div>
        <div className="text-[10px] text-[#555] mt-2 uppercase tracking-[0.15em] font-medium">Life Progress</div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-5" style={{ borderTop: `2px solid ${color}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#555] uppercase tracking-wider font-medium">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <Icon size={13} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-black text-white tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[#555] mt-1.5">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const tasks = useStore((s) => s.tasks)
  const goals = useStore((s) => s.goals)
  const settings = useStore((s) => s.settings)

  const stats = useMemo(() => getDashboardStats(goals, tasks), [goals, tasks])

  const statCards = [
    { icon: Clock, label: 'Time Tracked', value: `${stats.totalTimeSpent}m`, sub: `Out of ${stats.LIFETIME_GOAL.toLocaleString()}m goal`, color: '#F0C040' },
    { icon: CheckSquare, label: 'Tasks Done Today', value: stats.completedToday, sub: `${stats.pendingToday} remaining today`, color: '#10b981' },
    { icon: Target, label: 'Active Goals', value: stats.activeGoals, sub: `Out of ${stats.totalGoals} total`, color: '#6366f1' },
    { icon: ListTodo, label: 'All Tasks', value: stats.totalTasks, sub: `${stats.totalCompleted} completed overall`, color: '#ec4899' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Welcome back, {settings.userName} 👋</h1>
          <p className="text-[#555] mt-1 text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Hero: Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Progress ring card */}
        <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-6 flex flex-col items-center justify-center" style={{ borderTop: '2px solid #F0C040' }}>
          <ProgressRing percentage={stats.overallProgress} />
          <div className="grid grid-cols-2 gap-4 w-full mt-5">
            <div className="text-center">
              <div className="text-lg font-black text-[#F0C040] tabular-nums">{stats.totalTimeSpent.toLocaleString()}</div>
              <div className="text-[10px] text-[#555] mt-0.5 uppercase tracking-wide">Mins Logged</div>
            </div>
            <div className="text-center border-l border-[#1E1E1E]">
              <div className="text-lg font-black text-white tabular-nums">{Math.max(0, stats.LIFETIME_GOAL - stats.totalTimeSpent).toLocaleString()}</div>
              <div className="text-[10px] text-[#555] mt-0.5 uppercase tracking-wide">Pending Mins</div>
            </div>
          </div>
        </div>

        {/* Stats 2x2 */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {statCards.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
          
          {/* Daily Units Chart */}
          <div className="sm:col-span-2 bg-[#141414] border border-[#1E1E1E] rounded-2xl p-5 border-t-[2px] border-[#F0C040]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-[#555] uppercase tracking-wider font-medium">Daily Units (1 Unit = 50m)</span>
            </div>
            
            <div className="flex items-end gap-2 h-32 mt-2">
              {stats.dailyUnits.map((day, i) => {
                const maxUnit = Math.max(1, ...stats.dailyUnits.map(d => d.units))
                const heightPct = Math.max(5, (day.units / maxUnit) * 100)
                const isToday = i === stats.dailyUnits.length - 1
                
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full gap-2 group">
                    <div className="w-full relative flex items-end justify-center h-full">
                      <div 
                        className={`w-full max-w-[40px] rounded-t-lg transition-all duration-500 ease-out group-hover:opacity-80
                          ${isToday ? 'bg-[#F0C040]' : 'bg-[#1E1E1E]'}`}
                        style={{ height: `${heightPct}%` }}
                      >
                         <span className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity
                           ${isToday ? 'text-[#F0C040]' : 'text-white'}`}>
                           {day.units}
                         </span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold ${isToday ? 'text-white' : 'text-[#555]'}`}>
                      {day.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <TimeBudget tasks={tasks} />

      {/* Goal Ticker */}
      <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl mb-8 overflow-hidden">
        <div className="flex overflow-hidden">
          <div className="ticker-track flex gap-0 whitespace-nowrap py-3">
            {[...goals, ...goals].map((g, i) => {
              const gTasks = tasks.filter(t => t.goalId === g.id)
              const gDone = gTasks.filter(t => t.status === 'completed').length
              return (
                <div key={i} className="flex items-center gap-3 px-6 border-r border-[#1E1E1E]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="text-xs text-[#888] font-medium">{g.name}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: g.color }}>
                    {gDone}/{gTasks.length} tasks
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}


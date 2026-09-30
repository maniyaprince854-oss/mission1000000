import { useState, useEffect, useMemo } from 'react'
import {
  format, addDays, subDays, startOfDay, startOfWeek, startOfMonth, addWeeks, subWeeks,
  addMonths, subMonths, eachDayOfInterval, differenceInCalendarDays, getDaysInMonth,
} from 'date-fns'
import { Hourglass, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getMinutesOnDate } from '../utils/calculations'

const TABS = [
  { key: 'day', label: 'Today', prevLabel: 'Yesterday' },
  { key: 'week', label: 'This Week', prevLabel: 'Last week' },
  { key: 'month', label: 'This Month', prevLabel: 'Last month' },
]

function fmt(mins) {
  mins = Math.max(0, Math.round(mins))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function sumMinutes(tasks, from, to) {
  // Inclusive range of calendar days
  if (to < from) return 0
  return eachDayOfInterval({ start: from, end: to })
    .reduce((sum, d) => sum + getMinutesOnDate(tasks, format(d, 'yyyy-MM-dd')), 0)
}

function getPeriod(key, now) {
  if (key === 'day') {
    const start = startOfDay(now)
    return { start, end: addDays(start, 1), prevStart: subDays(start, 1) }
  }
  if (key === 'week') {
    const start = startOfWeek(now, { weekStartsOn: 1 })
    return { start, end: addWeeks(start, 1), prevStart: subWeeks(start, 1) }
  }
  const start = startOfMonth(now)
  return { start, end: addMonths(start, 1), prevStart: subMonths(start, 1) }
}

function Delta({ current, previous }) {
  if (previous === 0 && current === 0) {
    return <span className="text-[#555] text-xs font-bold flex items-center gap-1"><Minus size={12} /> no change</span>
  }
  const diff = current - previous
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100)
  const up = diff >= 0
  const Icon = diff === 0 ? Minus : up ? TrendingUp : TrendingDown
  const color = diff === 0 ? '#555' : up ? '#10b981' : '#ef4444'
  return (
    <span className="text-xs font-bold flex items-center gap-1" style={{ color }}>
      <Icon size={12} />
      {up ? '+' : '-'}{fmt(Math.abs(diff))}{pct !== null && ` (${up ? '+' : ''}${pct}%)`}
    </span>
  )
}

export default function TimeBudget({ tasks }) {
  const [tab, setTab] = useState('day')
  const [now, setNow] = useState(() => new Date())

  // Refresh every minute so remaining time and running timers stay live
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const data = useMemo(() => {
    const today = startOfDay(now)
    const { start, end, prevStart } = getPeriod(tab, now)

    const totalMins = (end - start) / 60000
    const elapsedMins = Math.min(totalMins, (now - start) / 60000)
    const remainingMins = totalMins - elapsedMins

    const worked = sumMinutes(tasks, start, today)
    const prevTotal = sumMinutes(tasks, prevStart, subDays(start, 1))

    // Same point in the previous period (day-by-day), for a fair comparison
    const dayIndex = differenceInCalendarDays(today, start)
    let prevSoFar = null
    if (tab !== 'day') {
      const lastPrevDay = subDays(start, 1)
      let cutoff = addDays(prevStart, dayIndex)
      if (cutoff > lastPrevDay) cutoff = lastPrevDay
      prevSoFar = sumMinutes(tasks, prevStart, cutoff)
    }

    // Per-day breakdown for week/month charts
    let days = []
    if (tab !== 'day') {
      days = eachDayOfInterval({ start, end: subDays(end, 1) }).map((d, i) => {
        const prevDay = addDays(prevStart, i)
        const prevInRange = prevDay < start
        return {
          key: format(d, 'yyyy-MM-dd'),
          label: tab === 'week' ? format(d, 'EEE') : format(d, 'd'),
          mins: d <= today ? getMinutesOnDate(tasks, format(d, 'yyyy-MM-dd')) : 0,
          prevMins: prevInRange ? getMinutesOnDate(tasks, format(prevDay, 'yyyy-MM-dd')) : 0,
          isToday: d.getTime() === today.getTime(),
          isFuture: d > today,
        }
      })
    }

    // Daily average across elapsed days (week/month)
    const daysElapsed = dayIndex + 1
    const avgPerDay = worked / daysElapsed
    const prevDays = tab === 'month' ? getDaysInMonth(prevStart) : tab === 'week' ? 7 : 1
    const prevAvgPerDay = prevTotal / prevDays

    return {
      totalMins, elapsedMins, remainingMins, worked, prevTotal, prevSoFar,
      days, avgPerDay, prevAvgPerDay, daysElapsed,
    }
  }, [tasks, tab, now])

  const tabInfo = TABS.find((t) => t.key === tab)
  const { totalMins, elapsedMins, remainingMins, worked } = data
  const workedPct = Math.min(100, (worked / totalMins) * 100)
  const idlePct = Math.max(0, (elapsedMins / totalMins) * 100 - workedPct)
  const remainingPct = Math.max(0, 100 - workedPct - idlePct)
  const focusPct = elapsedMins > 0 ? Math.round((worked / elapsedMins) * 100) : 0
  const maxBar = Math.max(1, ...data.days.map((d) => Math.max(d.mins, d.prevMins)))

  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-5 md:p-6 mb-5" style={{ borderTop: '2px solid #6366f1' }}>
      {/* Header + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Hourglass size={14} className="text-[#6366f1]" />
          <span className="text-[11px] text-[#555] uppercase tracking-wider font-medium">Time Budget</span>
        </div>
        <div className="flex bg-[#1C1C1C] rounded-xl p-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === t.key ? 'bg-[#6366f1] text-white' : 'text-[#666] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#1C1C1C] rounded-xl p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wide font-medium">Time Remaining</div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">{fmt(remainingMins)}</div>
          <div className="text-[10px] text-[#555] mt-1">of {fmt(totalMins)} in {tab === 'day' ? 'the day' : tab === 'week' ? 'the week' : 'the month'}</div>
        </div>
        <div className="bg-[#1C1C1C] rounded-xl p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wide font-medium">Work Done</div>
          <div className="text-2xl font-black text-[#F0C040] tabular-nums mt-1">{fmt(worked)}</div>
          <div className="text-[10px] text-[#555] mt-1">{focusPct}% of elapsed time</div>
        </div>
        <div className="bg-[#1C1C1C] rounded-xl p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wide font-medium">{tabInfo.prevLabel}</div>
          <div className="text-2xl font-black text-white tabular-nums mt-1">{fmt(data.prevTotal)}</div>
          <div className="mt-1"><Delta current={worked} previous={data.prevTotal} /></div>
        </div>
        <div className="bg-[#1C1C1C] rounded-xl p-4">
          {tab === 'day' ? (
            <>
              <div className="text-[10px] text-[#555] uppercase tracking-wide font-medium">Time Passed</div>
              <div className="text-2xl font-black text-white tabular-nums mt-1">{fmt(elapsedMins)}</div>
              <div className="text-[10px] text-[#555] mt-1">{fmt(elapsedMins - worked)} not tracked</div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-[#555] uppercase tracking-wide font-medium">{tabInfo.prevLabel} same point</div>
              <div className="text-2xl font-black text-white tabular-nums mt-1">{fmt(data.prevSoFar)}</div>
              <div className="mt-1"><Delta current={worked} previous={data.prevSoFar} /></div>
            </>
          )}
        </div>
      </div>

      {/* Budget bar: worked | passed without work | remaining */}
      <div className="mb-2 flex h-4 w-full rounded-full overflow-hidden bg-[#1C1C1C]">
        <div className="h-full bg-[#F0C040] transition-all duration-700" style={{ width: `${workedPct}%` }} title={`Worked: ${fmt(worked)}`} />
        <div className="h-full bg-[#3a3a3a] transition-all duration-700" style={{ width: `${idlePct}%` }} title={`Passed, not tracked: ${fmt(elapsedMins - worked)}`} />
        <div className="h-full transition-all duration-700" style={{ width: `${remainingPct}%` }} title={`Remaining: ${fmt(remainingMins)}`} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#666] font-medium">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F0C040]" />Worked {fmt(worked)}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3a3a3a]" />Passed, not tracked {fmt(elapsedMins - worked)}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-[#3a3a3a]" />Remaining {fmt(remainingMins)}</span>
      </div>

      {/* Per-day comparison chart for week / month */}
      {tab !== 'day' && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-[10px] text-[#555] uppercase tracking-wide font-medium">
              Daily avg {fmt(data.avgPerDay)} · {tabInfo.prevLabel.toLowerCase()} {fmt(data.prevAvgPerDay)}
            </span>
            <div className="flex gap-3 text-[10px] text-[#666] font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#6366f1]" />{tabInfo.label}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#2e2e2e]" />{tabInfo.prevLabel}</span>
            </div>
          </div>
          <div className={`flex items-end h-32 ${tab === 'week' ? 'gap-2' : 'gap-[2px] sm:gap-1'}`}>
            {data.days.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group min-w-0">
                <div className="relative w-full flex items-end justify-center h-full gap-[2px]">
                  <div
                    className="flex-1 max-w-[18px] rounded-t bg-[#2e2e2e] transition-all duration-500"
                    style={{ height: `${(d.prevMins / maxBar) * 100}%` }}
                  />
                  <div
                    className={`flex-1 max-w-[18px] rounded-t transition-all duration-500 ${d.isToday ? 'bg-[#F0C040]' : 'bg-[#6366f1]'} ${d.isFuture ? 'opacity-0' : ''}`}
                    style={{ height: `${(d.mins / maxBar) * 100}%` }}
                  />
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-white bg-[#252525] px-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                    {d.isFuture ? '—' : fmt(d.mins)} / {fmt(d.prevMins)}
                  </span>
                </div>
                <span className={`text-[9px] sm:text-[10px] font-bold ${d.isToday ? 'text-white' : 'text-[#555]'}`}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

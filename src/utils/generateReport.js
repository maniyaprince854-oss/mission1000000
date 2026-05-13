import { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import { getGoalProgress } from './calculations'

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [100, 100, 100]
}

function fmtTime(mins) {
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function drawRoundedRect(doc, x, y, w, h, r, fillColor, strokeColor) {
  if (fillColor) doc.setFillColor(...fillColor)
  if (strokeColor) doc.setDrawColor(...strokeColor)
  doc.roundedRect(x, y, w, h, r, r, fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'D')
}

export function generateDailyReport(tasks, goals, settings, dateStr) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W = 210
  const H = 297
  const margin = 18
  const contentW = W - margin * 2
  const GOLD = [240, 192, 64]
  const DARK = [10, 10, 10]
  const WHITE = [255, 255, 255]
  const GRAY = [120, 120, 120]
  const LIGHT_BG = [250, 250, 250]
  const ALT_ROW = [244, 244, 244]
  const GREEN = [16, 185, 129]

  // Helper: time logged on dateStr only (not all-time total)
  const todayMins = (task) => (task.timeLog && task.timeLog[dateStr]) || 0

  // Only tasks actually worked on that day (have time logged on dateStr)
  const dailyTasks = tasks.filter(t => todayMins(t) > 0)
  const completedTasks = dailyTasks.filter(t => t.status === 'completed')
  const totalTime = dailyTasks.reduce((sum, t) => sum + todayMins(t), 0)
  const units = Math.round((totalTime / 50) * 10) / 10
  const activeGoals = goals.filter(g => g.status === 'active')

  // ─── HEADER ─────────────────────────────────────────────────────
  doc.setFillColor(...DARK)
  doc.rect(0, 0, W, 48, 'F')

  // Gold top stripe
  doc.setFillColor(...GOLD)
  doc.rect(0, 0, W, 2.5, 'F')

  // Left vertical gold bar
  doc.rect(margin, 10, 1.5, 28, 'F')

  // App name
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('MISSION  10000', margin + 5, 18)

  // Report title
  doc.setTextColor(...WHITE)
  doc.setFontSize(22)
  doc.text('Daily Performance Report', margin + 5, 30)

  // Date subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 180, 180)
  const dateLabel = format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMMM d, yyyy')
  doc.text(dateLabel, margin + 5, 40)

  // User name top-right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GOLD)
  const userName = settings?.userName || 'Prince'
  doc.text(userName, W - margin, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(140, 140, 140)
  doc.text('Generated ' + format(new Date(), 'MMM d · h:mm a'), W - margin, 30, { align: 'right' })

  // Gold bottom border of header
  doc.setFillColor(...GOLD)
  doc.rect(0, 48, W, 1.5, 'F')

  let y = 60

  // ─── SUMMARY STATS ───────────────────────────────────────────────
  const stats = [
    { label: 'TASKS TODAY', value: String(dailyTasks.length), color: WHITE },
    { label: 'COMPLETED', value: String(completedTasks.length), color: GREEN },
    { label: 'PENDING', value: String(dailyTasks.length - completedTasks.length), color: GOLD },
    { label: 'TIME TRACKED', value: fmtTime(totalTime), color: WHITE },
    { label: 'UNITS EARNED', value: String(units), color: GOLD },
  ]

  const statCellW = contentW / stats.length

  // Stats box background
  drawRoundedRect(doc, margin, y, contentW, 26, 3, [15, 15, 15], [30, 30, 30])

  stats.forEach((stat, i) => {
    const cx = margin + i * statCellW + statCellW / 2

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...stat.color)
    doc.text(stat.value, cx, y + 11, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY)
    doc.text(stat.label, cx, y + 19, { align: 'center' })

    if (i < stats.length - 1) {
      doc.setDrawColor(35, 35, 35)
      doc.line(margin + (i + 1) * statCellW, y + 5, margin + (i + 1) * statCellW, y + 21)
    }
  })

  y += 34

  // ─── TASKS TABLE ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text('TASKS', margin, y)
  doc.setFillColor(...GOLD)
  doc.rect(margin, y + 1.5, 16, 1, 'F')

  y += 8

  // Table header
  doc.setFillColor(...DARK)
  doc.rect(margin, y, contentW, 8, 'F')

  const tCols = [
    { label: 'TASK NAME', x: margin + 3 },
    { label: 'GOAL', x: margin + 90 },
    { label: 'STATUS', x: margin + 135 },
    { label: 'TIME', x: margin + 163 },
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...WHITE)
  tCols.forEach(c => doc.text(c.label, c.x, y + 5.2))
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  if (dailyTasks.length === 0) {
    drawRoundedRect(doc, margin, y, contentW, 14, 2, LIGHT_BG, null)
    doc.setTextColor(...GRAY)
    doc.setFontSize(9)
    doc.text('No tasks recorded for this day.', margin + contentW / 2, y + 9, { align: 'center' })
    y += 20
  } else {
    dailyTasks.forEach((task, i) => {
      if (y > H - 55) {
        doc.addPage()
        y = margin
      }

      const isDone = task.status === 'completed'
      const goal = goals.find(g => g.id === task.goalId)
      const time = todayMins(task)
      const rowBg = i % 2 === 0 ? LIGHT_BG : ALT_ROW

      doc.setFillColor(...rowBg)
      doc.rect(margin, y, contentW, 7, 'F')

      // Status color left edge
      const edgeColor = isDone ? GREEN : GOLD
      doc.setFillColor(...edgeColor)
      doc.rect(margin, y, 2, 7, 'F')

      // Task name
      doc.setTextColor(isDone ? 140 : 20, isDone ? 140 : 20, isDone ? 140 : 20)
      doc.setFont('helvetica', isDone ? 'normal' : 'normal')
      const title = task.title.length > 50 ? task.title.slice(0, 48) + '…' : task.title
      doc.text(title, tCols[0].x, y + 4.8)

      // Goal name
      doc.setTextColor(...GRAY)
      const gName = goal ? (goal.name.length > 24 ? goal.name.slice(0, 22) + '…' : goal.name) : '—'
      doc.text(gName, tCols[1].x, y + 4.8)

      // Status badge
      if (isDone) {
        doc.setTextColor(...GREEN)
        doc.setFont('helvetica', 'bold')
        doc.text('✓ Done', tCols[2].x, y + 4.8)
      } else {
        doc.setTextColor(...GOLD)
        doc.setFont('helvetica', 'bold')
        doc.text('• Pending', tCols[2].x, y + 4.8)
      }

      // Time
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY)
      doc.text(fmtTime(time), tCols[3].x, y + 4.8)

      y += 7
    })
  }

  y += 10

  // ─── GOAL PROGRESS ───────────────────────────────────────────────
  if (y > H - 80) {
    doc.addPage()
    y = margin
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text('GOAL PROGRESS', margin, y)
  doc.setFillColor(...GOLD)
  doc.rect(margin, y + 1.5, 32, 1, 'F')

  y += 8

  if (activeGoals.length === 0) {
    drawRoundedRect(doc, margin, y, contentW, 14, 2, LIGHT_BG, null)
    doc.setTextColor(...GRAY)
    doc.setFontSize(9)
    doc.text('No active goals.', margin + contentW / 2, y + 9, { align: 'center' })
    y += 20
  } else {
    // Goal table header
    doc.setFillColor(...DARK)
    doc.rect(margin, y, contentW, 8, 'F')

    const gCols = [
      { label: 'GOAL', x: margin + 6 },
      { label: 'TASKS', x: margin + 100 },
      { label: 'PROGRESS', x: margin + 122 },
      { label: 'TODAY TIME', x: margin + 158 },
    ]

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...WHITE)
    gCols.forEach(c => doc.text(c.label, c.x, y + 5.2))
    y += 8

    activeGoals.forEach((goal, i) => {
      if (y > H - 30) {
        doc.addPage()
        y = margin
      }

      const { total, completed, percentage } = getGoalProgress(goal.id, tasks)
      // Time shown is today's contribution only
      const totalTimeSpent = tasks
        .filter(t => t.goalId === goal.id)
        .reduce((sum, t) => sum + todayMins(t), 0)
      const [r, g, b] = hexToRgb(goal.color)
      const rowBg = i % 2 === 0 ? LIGHT_BG : ALT_ROW

      doc.setFillColor(...rowBg)
      doc.rect(margin, y, contentW, 9, 'F')

      // Colored dot
      doc.setFillColor(r, g, b)
      doc.circle(margin + 3, y + 4.5, 2, 'F')

      // Goal name
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(20, 20, 20)
      const gName = goal.name.length > 50 ? goal.name.slice(0, 48) + '…' : goal.name
      doc.text(gName, gCols[0].x, y + 5.5)

      // Tasks fraction
      doc.setTextColor(...GRAY)
      doc.text(`${completed} / ${total}`, gCols[1].x, y + 5.5)

      // Progress bar
      const barX = gCols[2].x
      const barW = 28
      const barH = 3.5
      const barY = y + 3

      doc.setFillColor(220, 220, 220)
      doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F')

      if (percentage > 0) {
        doc.setFillColor(r, g, b)
        doc.roundedRect(barX, barY, Math.max((percentage / 100) * barW, 1.5), barH, 1, 1, 'F')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(60, 60, 60)
      doc.text(`${percentage}%`, barX + barW + 2, y + 5.5)

      // Time
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY)
      doc.text(fmtTime(totalTimeSpent), gCols[3].x, y + 5.5)

      y += 9
    })
  }

  // ─── TIME BREAKDOWN ──────────────────────────────────────────────
  const tasksWithTime = dailyTasks.filter(t => todayMins(t) > 0).sort((a, b) => todayMins(b) - todayMins(a))
  if (tasksWithTime.length > 0 && y < H - 60) {
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text("TODAY'S TIME BREAKDOWN", margin, y)
    doc.setFillColor(...GOLD)
    doc.rect(margin, y + 1.5, 50, 1, 'F')

    y += 10

    const maxTime = Math.max(...tasksWithTime.map(t => todayMins(t)))
    const barAreaW = contentW - 80

    tasksWithTime.slice(0, 10).forEach((task) => {
      if (y > H - 30) return
      const time = todayMins(task)
      const goal = goals.find(g => g.id === task.goalId)
      const barColor = goal ? hexToRgb(goal.color) : GOLD
      const barW = Math.max((time / maxTime) * barAreaW, 2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(40, 40, 40)
      const label = task.title.length > 34 ? task.title.slice(0, 32) + '…' : task.title
      doc.text(label, margin, y + 4)

      doc.setFillColor(230, 230, 230)
      doc.roundedRect(margin + 72, y, barAreaW, 6, 1, 1, 'F')

      doc.setFillColor(...barColor)
      doc.roundedRect(margin + 72, y, barW, 6, 1, 1, 'F')

      doc.setTextColor(...GRAY)
      doc.setFontSize(7)
      doc.text(fmtTime(time), margin + 72 + barAreaW + 2, y + 4.5)

      y += 10
    })
  }

  // ─── FOOTER ──────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFillColor(...DARK)
    doc.rect(0, H - 12, W, 12, 'F')
    doc.setFillColor(...GOLD)
    doc.rect(0, H - 12, W, 0.8, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(100, 100, 100)
    doc.text('Mission 10000 · Daily Performance Report · Confidential', margin, H - 5)

    doc.setTextColor(...GOLD)
    doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 5, { align: 'right' })
  }

  doc.save(`mission10000-report-${dateStr}.pdf`)
}

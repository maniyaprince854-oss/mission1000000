import { useState } from 'react'
import { Check, X, Pencil, ChevronUp, ChevronDown, ListChecks, Plus } from 'lucide-react'
import useStore from '../store'

// Small "2/5" badge for task rows
export function ChecklistBadge({ task, className = '' }) {
  const list = task.checklist || []
  if (list.length === 0) return null
  const done = list.filter((i) => i.done).length
  const complete = done === list.length
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${complete ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#252525] text-[#888]'} ${className}`}
      title={`${done} of ${list.length} to-dos done`}
    >
      <ListChecks size={10} />
      {done}/{list.length}
    </span>
  )
}

function ChecklistRow({ item, taskId, accent, compact, canUp, canDown }) {
  const toggle = useStore((s) => s.toggleChecklistItem)
  const update = useStore((s) => s.updateChecklistItem)
  const remove = useStore((s) => s.deleteChecklistItem)
  const move = useStore((s) => s.moveChecklistItem)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)

  const save = () => {
    const text = draft.trim()
    if (text && text !== item.text) update(taskId, item.id, text)
    else setDraft(item.text)
    setEditing(false)
  }

  const size = compact ? 'text-[11px]' : 'text-sm'
  const box = compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'

  return (
    <div className={`group/ci flex items-center gap-2.5 rounded-lg px-2 ${compact ? 'py-1.5' : 'py-2'} hover:bg-[#1C1C1C] transition-colors`}>
      <button
        onClick={() => toggle(taskId, item.id)}
        className={`${box} flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all hover:scale-110 active:scale-95`}
        style={{ backgroundColor: item.done ? accent : 'transparent', borderColor: item.done ? accent : '#3a3a3a' }}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
      >
        {item.done && <Check size={compact ? 10 : 12} strokeWidth={3.5} className="text-black" />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setDraft(item.text); setEditing(false) }
          }}
          className={`flex-1 min-w-0 bg-[#141414] border border-[#F0C040]/40 text-white rounded-md px-2 py-0.5 ${size} focus:outline-none`}
        />
      ) : (
        <span
          onDoubleClick={() => { setDraft(item.text); setEditing(true) }}
          className={`flex-1 min-w-0 break-words leading-snug ${size} ${item.done ? 'text-[#555] line-through' : 'text-[#ddd]'}`}
        >
          {item.text}
        </span>
      )}

      {!editing && (
        <div className="flex items-center flex-shrink-0 sm:opacity-0 group-hover/ci:opacity-100 transition-opacity">
          {!item.done && (
            <>
              <button disabled={!canUp} onClick={() => move(taskId, item.id, -1)} className="p-1 text-[#444] hover:text-white disabled:opacity-20 disabled:hover:text-[#444]" title="Move up">
                <ChevronUp size={12} />
              </button>
              <button disabled={!canDown} onClick={() => move(taskId, item.id, 1)} className="p-1 text-[#444] hover:text-white disabled:opacity-20 disabled:hover:text-[#444]" title="Move down">
                <ChevronDown size={12} />
              </button>
            </>
          )}
          <button onClick={() => { setDraft(item.text); setEditing(true) }} className="p-1 text-[#444] hover:text-[#F0C040]" title="Edit">
            <Pencil size={11} />
          </button>
          <button onClick={() => remove(taskId, item.id)} className="p-1 text-[#444] hover:text-red-400" title="Delete">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * To-do checklist for a single task. Reads the task live from the store,
 * so it stays in sync wherever it's rendered (goal cards, modals).
 */
export default function Checklist({ taskId, accent = '#10b981', compact = false }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId))
  const addItem = useStore((s) => s.addChecklistItem)
  const clearCompleted = useStore((s) => s.clearCompletedChecklist)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(true)

  if (!task) return null
  const list = task.checklist || []
  const pending = list.filter((i) => !i.done)
  const done = list.filter((i) => i.done)
  const pct = list.length === 0 ? 0 : Math.round((done.length / list.length) * 100)

  // One to-do per line; strips leading bullets / "[ ]" markers from pasted lists
  const addLines = (raw) => {
    raw.split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, '').trim())
      .filter(Boolean)
      .forEach((l) => addItem(taskId, l))
  }

  const add = () => {
    addLines(text)
    setText('')
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Header + progress */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5">
          <ListChecks size={compact ? 11 : 13} style={{ color: accent }} />
          <span className={`font-black uppercase tracking-widest text-[#555] ${compact ? 'text-[9px]' : 'text-xs'}`}>To-dos</span>
        </div>
        {list.length > 0 && (
          <span className={`font-bold tabular-nums ${compact ? 'text-[9px]' : 'text-[11px]'} ${pct === 100 ? 'text-[#10b981]' : 'text-[#666]'}`}>
            {pct === 100 ? 'All done ✓' : `${done.length}/${list.length} · ${pct}%`}
          </span>
        )}
      </div>
      {list.length > 0 && (
        <div className="h-1 bg-[#1C1C1C] rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : accent }} />
        </div>
      )}

      {/* Pending */}
      <div className="-mx-2">
        {pending.map((item, i) => (
          <ChecklistRow key={item.id} item={item} taskId={taskId} accent={accent} compact={compact} canUp={i > 0} canDown={i < pending.length - 1} />
        ))}
      </div>

      {list.length > 0 && pending.length === 0 && (
        <div className={`text-center text-[#10b981]/70 italic py-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>Everything ticked off 🎉</div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowDone((v) => !v)}
              className={`flex items-center gap-1 font-bold text-[#555] hover:text-white transition-colors ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider`}
            >
              {showDone ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              Completed ({done.length})
            </button>
            <button
              onClick={() => clearCompleted(taskId)}
              className={`font-bold text-[#444] hover:text-red-400 transition-colors ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider`}
            >
              Clear
            </button>
          </div>
          {showDone && (
            <div className="-mx-2 mt-1">
              {done.map((item) => (
                <ChecklistRow key={item.id} item={item} taskId={taskId} accent={accent} compact={compact} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add */}
      <div className="flex items-center gap-2 mt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            // Pasting a multi-line list adds every line as its own to-do
            if (pasted.includes('\n')) {
              e.preventDefault()
              addLines(pasted)
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) add() }}
          placeholder={list.length === 0 ? 'Add a to-do · press Enter' : 'Add another to-do…'}
          className={`flex-1 min-w-0 bg-[#141414] border border-[#252525] text-white rounded-lg px-3 ${compact ? 'py-1.5 text-[11px]' : 'py-2 text-sm'} focus:outline-none focus:border-[#F0C040]/40 placeholder-[#444] transition-colors`}
        />
        <button
          onClick={add}
          disabled={!text.trim()}
          className={`flex-shrink-0 rounded-lg bg-[#1C1C1C] border border-[#252525] text-[#888] hover:text-[#F0C040] hover:border-[#F0C040]/30 disabled:opacity-30 transition-colors ${compact ? 'p-1.5' : 'p-2'}`}
          aria-label="Add to-do"
        >
          <Plus size={compact ? 12 : 14} />
        </button>
      </div>
    </div>
  )
}

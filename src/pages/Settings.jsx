import { useState, useRef } from 'react'
import { Save, Trash2, RotateCcw, AlertTriangle, Download, Upload } from 'lucide-react'
import useStore from '../store'
import { format } from 'date-fns'

function Section({ title, children }) {
  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-6 mb-5">
      <div className="text-[11px] text-[#555] uppercase tracking-wider font-bold mb-5">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, sub, children }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-[#1E1E1E] last:border-0">
      <div className="flex-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        {sub && <div className="text-xs text-[#555] mt-0.5">{sub}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const tasks = useStore((s) => s.tasks)
  const goals = useStore((s) => s.goals)
  const goalOrder = useStore((s) => s.goalOrder)
  const updateSettings = useStore((s) => s.updateSettings)
  const deleteTask = useStore((s) => s.deleteTask)
  const toggleTask = useStore((s) => s.toggleTask)
  const clearAllData = useStore((s) => s.clearAllData)

  const [form, setForm] = useState({ ...settings })
  const [saved, setSaved] = useState(false)
  const [showDanger, setShowDanger] = useState(false)
  const fileInputRef = useRef(null)

  const handleSave = () => {
    updateSettings({ ...form })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearTasks = () => {
    if (window.confirm(`Delete ALL ${tasks.length} tasks? This cannot be undone.`)) {
      const ids = tasks.map((t) => t.id)
      ids.forEach((id) => deleteTask(id))
    }
  }

  const handleClearAll = () => {
    const input = window.prompt(
      `This permanently deletes ALL ${tasks.length} tasks and ${goals.length} goals. Export a backup first if you might need it.\n\nType DELETE to confirm.`
    )
    if (input === 'DELETE') clearAllData()
  }

  const exportData = () => {
    const data = { tasks, goals, goalOrder, settings }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `m10k_backup_${format(new Date(), 'yyyy-MM-dd')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const importData = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        if (parsed.tasks && parsed.goals && parsed.settings) {
          // Instead of mutating state directly, standard store restoration
          useStore.setState({
            tasks: parsed.tasks,
            goals: parsed.goals,
            settings: parsed.settings,
            goalOrder: parsed.goalOrder || { ideas: [], planned: [], in_progress: [], completed: [] }
          })
          alert('Backup restored successfully! Please refresh the page if everything doesn\'t update immediately.')
        } else {
          alert('Invalid backup file format.')
        }
      } catch (err) {
        alert('Failed to parse backup file.')
      }
    }
    reader.readAsText(file)
  }

  const goal = (id) => goals.find((g) => g.id === id)

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Settings</h1>
        <p className="text-[#555] mt-1 text-sm font-medium">Configure your Workspace tracker</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-6">
          {/* Identity */}
          <Section title="Identity">
            <Field label="Your Name" sub="Used in greetings and reports">
              <input
                value={form.userName}
                onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))}
                className="w-full sm:w-44 bg-[#1C1C1C] border border-[#252525] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#F0C040] sm:text-right"
              />
            </Field>
          </Section>

          {/* Settings Save */}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm transition-all w-full sm:w-auto mt-4"
            style={{ backgroundColor: saved ? '#10b981' : '#F0C040', color: '#000' }}
          >
            <Save size={15} />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>

          {/* Action History */}
          <Section title={`Task Ledger (${tasks.length})`}>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-[#444] text-sm font-medium">No tasks logged yet</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 scrollbar-hide">
                {[...tasks].reverse().map((task) => {
                  const g = goal(task.goalId)
                  return (
                    <div key={task.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-[#1C1C1C] rounded-xl group hover:border-[#F0C040]/30 border border-transparent transition-colors">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 hidden sm:block" style={{ backgroundColor: g?.color || '#555' }} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 sm:hidden`} style={{ backgroundColor: g?.color || '#555' }} />
                          <div className="text-xs font-semibold text-white truncate">{task.title}</div>
                        </div>
                        <div className="text-[10px] text-[#555] font-medium flex items-center gap-1.5 mt-0.5">
                          <span>{format(new Date(task.date), 'MMM d, yyyy')}</span>
                          {g && (
                            <>
                              <span className="text-[#333]">&bull;</span>
                              <span className="truncate" style={{ color: g.color }}>{g.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-[#2a2a2a] sm:border-0 w-full sm:w-auto">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#444]/20 text-[#666]'}`}>
                          {task.status}
                        </span>
                        
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => toggleTask(task.id)} className="p-1.5 text-[#555] hover:text-[#10b981] transition-colors rounded-lg bg-[#252525] sm:bg-transparent">
                            <RotateCcw size={12} />
                          </button>
                          <button onClick={() => deleteTask(task.id)} className="p-1.5 text-[#555] hover:text-red-400 transition-colors rounded-lg bg-[#252525] sm:bg-transparent">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Data Management */}
          <Section title="Data Management">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={exportData}
                  className="flex-1 flex justify-center items-center gap-2 px-4 py-2.5 bg-[#1C1C1C] hover:bg-[#252525] border border-[#2A2A2A] rounded-xl text-sm font-bold text-white transition-colors"
                >
                  <Download size={15} className="text-[#F0C040]" />
                  Export Backup (JSON)
                </button>
                
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={importData}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex justify-center items-center gap-2 px-4 py-2.5 bg-[#1C1C1C] hover:bg-[#252525] border border-[#2A2A2A] rounded-xl text-sm font-bold text-white transition-colors"
                >
                  <Upload size={15} className="text-[#10b981]" />
                  Restore Backup
                </button>
              </div>
              <p className="text-[10px] text-[#555] font-medium text-center">
                Export your tasks and goals to securely backup your data. Restoring replacing your current state.
              </p>
            </div>
          </Section>

          {/* Danger Zone */}
          <div className="bg-[#141414] border border-[#2a1010] rounded-2xl p-6" style={{ borderLeft: '3px solid #ef4444' }}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-red-400" />
              <span className="text-sm font-black text-red-400">Danger Zone</span>
            </div>
            {!showDanger ? (
              <button
                onClick={() => setShowDanger(true)}
                className="text-xs text-[#555] hover:text-red-400 transition-colors font-semibold py-1 focus:outline-none"
              >
                Show destructive actions...
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleClearTasks}
                  className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-colors w-full sm:w-auto"
                >
                  <RotateCcw size={12} />
                  Delete All Tasks ({tasks.length})
                </button>
                <p className="text-[10px] text-[#444] font-medium">This permanently deletes all task history. Goals and settings are not affected.</p>

                <div className="pt-3 border-t border-[#2a1010]">
                  <button
                    onClick={handleClearAll}
                    className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors w-full sm:w-auto"
                  >
                    <Trash2 size={12} />
                    Clear All Data
                  </button>
                  <p className="text-[10px] text-[#444] font-medium mt-3">Permanently deletes all tasks, goals and board layout. Your name and settings are kept.</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Sidebar */}
        <div className="space-y-6">
          <Section title="Database Stats">
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              {[
                { label: 'Total Tasks', value: tasks.length.toLocaleString(), color: '#F0C040' },
                { label: 'Tasks Done', value: tasks.filter(t => t.status === 'completed').length.toLocaleString(), color: '#10b981' },
                { label: 'Total Goals', value: goals.length, color: '#6366f1' },
                { label: 'Active Goals', value: goals.filter((g) => g.status === 'active').length, color: '#f59e0b' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[#1C1C1C] rounded-xl p-4 flex flex-col items-center justify-center">
                  <div className="text-3xl font-black tabular-nums leading-none" style={{ color }}>{value}</div>
                  <div className="text-[10px] text-[#555] mt-2 font-medium uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

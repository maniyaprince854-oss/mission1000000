import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, Target, Kanban, Settings, Activity, GitBranch } from 'lucide-react'
import useStore from '../store'

const navItems = [
  { to: '/tasks', icon: CheckSquare, label: 'Daily Tasks' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { to: '/goals', icon: Target, label: 'Goals' },
  { to: '/planning', icon: Kanban, label: 'Planning' },
  { to: '/units', icon: Activity, label: 'Units' },
  { to: '/analyse', icon: GitBranch, label: 'Analyse' },
]

const bottomItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const tasks = useStore((s) => s.tasks)
  const settings = useStore((s) => s.settings)
  const completed = tasks.filter(t => t.status === 'completed').length
  const progress = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100)

  return (
    <div className="flex h-screen bg-[#0C0C0C] text-white overflow-hidden">
      <aside className="w-56 flex-shrink-0 border-r border-[#1E1E1E] flex flex-col bg-[#0C0C0C] hidden md:flex">
        {/* Brand */}
        <div className="px-5 py-6 border-b border-[#1E1E1E]">
          <div className="font-black text-2xl text-[#F0C040] font-mono tracking-tight">M10K</div>
          <div className="text-[11px] text-[#555] mt-0.5 font-medium tracking-wide uppercase">Goal Progress</div>
          {/* Progress */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-[#555]">{completed} completed</span>
              <span className="text-[11px] text-[#F0C040] font-semibold">{progress}%</span>
            </div>
            <div className="h-1 bg-[#1E1E1E] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, backgroundColor: '#F0C040' }}
              />
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all font-medium ${
                  isActive
                    ? 'bg-[#1C1C1C] text-[#F0C040] border-l-2 border-[#F0C040] pl-[10px]'
                    : 'text-[#666] hover:text-white hover:bg-[#141414]'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom nav */}
        <nav className="px-3 pb-2">
          {bottomItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all font-medium ${
                  isActive
                    ? 'bg-[#1C1C1C] text-[#F0C040] border-l-2 border-[#F0C040] pl-[10px]'
                    : 'text-[#666] hover:text-white hover:bg-[#141414]'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1E1E1E]">
          <div className="text-[11px] text-white font-bold mb-0.5">{settings.userName}</div>
          <div className="text-[10px] text-[#444] leading-relaxed">
            {tasks.length} total tasks
          </div>
        </div>
      </aside>

      {/* Mobile Nav Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#0C0C0C] border-b border-[#1E1E1E] flex items-center px-4 justify-between z-50">
        <div className="font-black text-xl text-[#F0C040] font-mono tracking-tight">M10K</div>
        <div className="flex items-center gap-1">
          {navItems.map(({ to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `p-2.5 rounded-lg transition-colors ${isActive ? 'text-[#F0C040] bg-[#1C1C1C]' : 'text-[#666]'}`
              }
            >
              <Icon size={18} />
            </NavLink>
          ))}
          <NavLink to="/settings" className={({isActive}) => `p-2.5 rounded-lg ml-2 ${isActive ? 'text-[#F0C040] bg-[#1C1C1C]' : 'text-[#666]'}`}>
            <Settings size={18} />
          </NavLink>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-[#0C0C0C] pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Goals from './pages/Goals'
import Planning from './pages/Planning'
import Settings from './pages/Settings'
import Units from './pages/Units'
import useStore from './store'
import useLockScreenControls from './hooks/useLockScreenControls'

export default function App() {
  const rolloverTasks = useStore((s) => s.rolloverTasks)
  useLockScreenControls()

  useEffect(() => {
    console.log('App mounted, running initial task rollover...')
    rolloverTasks()

    // Check every minute if we've crossed into a new day
    const interval = setInterval(() => {
      console.log('Checking for task rollover...')
      rolloverTasks()
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="goals" element={<Goals />} />
          <Route path="planning" element={<Planning />} />
          <Route path="units" element={<Units />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

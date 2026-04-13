import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

const DEFAULT_GOALS = [
  {
    id: 'g1',
    name: 'AI Automation Business',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '',
    status: 'active',
    section: 'ideas',
    color: '#6366f1',
  },
  {
    id: 'g2',
    name: 'Laser Cutting Business',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '',
    status: 'active',
    section: 'planned',
    color: '#f59e0b',
  },
  {
    id: 'g3',
    name: 'Learning / Skill Building',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '',
    status: 'active',
    section: 'in_progress',
    color: '#10b981',
  },
]

const useStore = create(
  persist(
    immer((set, get) => ({
      tasks: [],
      goals: DEFAULT_GOALS,
      settings: {
        userName: 'Prince',
      },
      goalOrder: {
        ideas: ['g1'],
        planned: ['g2'],
        in_progress: ['g3'],
        completed: [],
      },

      // Goal actions
      addGoal: (goal) =>
        set((state) => {
          state.goals.push(goal)
          const sec = goal.section || 'ideas'
          if (!state.goalOrder[sec]) state.goalOrder[sec] = []
          state.goalOrder[sec].unshift(goal.id)
        }),
      updateGoal: (id, updates) =>
        set((state) => {
          const goal = state.goals.find((g) => g.id === id)
          if (goal) {
            // Check if section is changing
            if (updates.section && updates.section !== goal.section) {
              const oldSec = goal.section
              const newSec = updates.section
              if (state.goalOrder[oldSec]) {
                state.goalOrder[oldSec] = state.goalOrder[oldSec].filter((gId) => gId !== id)
              }
              if (!state.goalOrder[newSec]) state.goalOrder[newSec] = []
              state.goalOrder[newSec].push(id)
            }
            Object.assign(goal, updates)
          }
        }),
      deleteGoal: (id) =>
        set((state) => {
          state.goals = state.goals.filter((g) => g.id !== id)
          Object.keys(state.goalOrder).forEach((sec) => {
            state.goalOrder[sec] = state.goalOrder[sec].filter((gId) => gId !== id)
          })
          // Keep tasks, but remove the goalId reference
          state.tasks.forEach((t) => {
            if (t.goalId === id) t.goalId = null
          })
        }),
      reorderGoals: (activeId, overId) =>
        set((state) => {
          const activeIndex = state.goals.findIndex(g => g.id === activeId)
          const overIndex = state.goals.findIndex(g => g.id === overId)
          if (activeIndex !== -1 && overIndex !== -1) {
            const [removed] = state.goals.splice(activeIndex, 1)
            state.goals.splice(overIndex, 0, removed)
          }
        }),

      // Task actions
      addTask: (task) =>
        set((state) => {
          state.tasks.push({
            ...task,
            description: task.description || '',
            timeSpent: 0,
            timeLog: {}, // NEW: Store minutes by date (e.g. { '2023-10-01': 45 })
            startTime: null,
            isRunning: false
          })
        }),
      updateTask: (id, updates) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id)
          if (task) Object.assign(task, updates)
        }),
      deleteTask: (id) =>
        set((state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id)
        }),
      startTask: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id)
          if (task && !task.isRunning && task.status !== 'completed') {
            task.isRunning = true
            task.startTime = Date.now()
          }
        }),
      pauseTask: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id)
          if (task && task.isRunning) {
            const mins = Math.floor((Date.now() - task.startTime) / 60000)
            const today = new Date().toISOString().split('T')[0]
            if (!task.timeLog) task.timeLog = {}
            task.timeLog[today] = (task.timeLog[today] || 0) + mins
            
            task.isRunning = false
            task.startTime = null
          }
        }),
      toggleTask: (id) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id)
          if (task) {
            if (task.status === 'pending') {
              // Pause if running before completing
              if (task.isRunning) {
                const mins = Math.floor((Date.now() - task.startTime) / 60000)
                const today = new Date().toISOString().split('T')[0]
                if (!task.timeLog) task.timeLog = {}
                task.timeLog[today] = (task.timeLog[today] || 0) + mins
                
                task.isRunning = false
                task.startTime = null
              }
              task.status = 'completed'
            } else {
              task.status = 'pending'
            }
          }
        }),
      rolloverTasks: () => {
        const today = new Date().toISOString().split('T')[0]
        const now = Date.now()
        const currentTasks = get().tasks

        const updatedTasks = currentTasks.map((t) => {
          if (t.status === 'completed') return t

          const taskDate = t.date || ''

          if (taskDate && taskDate < today) {
            const updates = { ...t, date: today }

            // Handle tasks that were left running overnight
            if (t.isRunning && t.startTime) {
              const mins = Math.floor((now - t.startTime) / 60000)
              updates.timeLog = { ...(t.timeLog || {}), [taskDate]: ((t.timeLog || {})[taskDate] || 0) + mins }
              updates.startTime = now
            }

            return updates
          }

          if (!taskDate) {
            return { ...t, date: today }
          }

          return t
        })

        set({ tasks: updatedTasks })
      },
      reorderTasks: (activeId, overId) =>
        set((state) => {
          const activeIndex = state.tasks.findIndex(t => t.id === activeId)
          const overIndex = state.tasks.findIndex(t => t.id === overId)
          if (activeIndex !== -1 && overIndex !== -1) {
            const [removed] = state.tasks.splice(activeIndex, 1)
            state.tasks.splice(overIndex, 0, removed)
          }
        }),
      addManualTime: (id, mins, dateStr) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === id)
          if (task) {
            if (!task.timeLog) task.timeLog = {}
            const date = dateStr || new Date().toISOString().split('T')[0]
            task.timeLog[date] = (task.timeLog[date] || 0) + mins
          }
        }),

      // Settings
      updateSettings: (updates) =>
        set((state) => {
          Object.assign(state.settings, updates)
        }),

      // Board
      // Board dragging
      moveGoalItem: (goalId, fromSection, toSection, toIndex) =>
        set((state) => {
          if (!state.goalOrder[fromSection]) state.goalOrder[fromSection] = []
          if (!state.goalOrder[toSection]) state.goalOrder[toSection] = []

          state.goalOrder[fromSection] = state.goalOrder[fromSection].filter((id) => id !== goalId)
          if (toIndex === undefined) {
            state.goalOrder[toSection].push(goalId)
          } else {
            state.goalOrder[toSection].splice(toIndex, 0, goalId)
          }
          
          // Also update the goal's actual section property
          const goal = state.goals.find((g) => g.id === goalId)
          if (goal) goal.section = toSection
        }),
      reorderGoalSection: (section, startIndex, endIndex) =>
        set((state) => {
          if (!state.goalOrder[section]) return
          const items = [...state.goalOrder[section]]
          const [removed] = items.splice(startIndex, 1)
          items.splice(endIndex, 0, removed)
          state.goalOrder[section] = items
        }),
    })),
    {
      name: 'mission10000-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        goals: state.goals,
        settings: state.settings,
        goalOrder: state.goalOrder,
      }),
    }
  )
)

export default useStore

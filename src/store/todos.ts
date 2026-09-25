import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { DateKey, Id, Todo } from '@/types/models'

export type TodoDraft = Omit<Todo, 'id' | 'createdAt' | 'done' | 'completedAt'>

interface TodoState {
  todos: Todo[]
  /** 指定日期的待办，未完成的排在前面，再按创建时间排 */
  listByDate: (date: DateKey) => Todo[]
  add: (draft: TodoDraft) => Id
  addMany: (drafts: TodoDraft[]) => void
  toggle: (id: Id) => void
  update: (id: Id, patch: Partial<TodoDraft>) => void
  remove: (id: Id) => void
  removeByCourse: (courseId: Id) => void
  /** 按 planItemId 查找，用于「完成待办 → 回流更新掌握状态」 */
  findByPlanItem: (planItemId: Id) => Todo | undefined
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],

      listByDate: (date) =>
        get()
          .todos.filter((t) => t.date === date)
          .sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1
            return a.createdAt.localeCompare(b.createdAt)
          }),

      add: (draft) => {
        const todo: Todo = {
          ...draft,
          id: newId(),
          done: false,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ todos: [...state.todos, todo] }))
        return todo.id
      },

      addMany: (drafts) => {
        const now = new Date().toISOString()
        const created: Todo[] = drafts.map((draft) => ({
          ...draft,
          id: newId(),
          done: false,
          createdAt: now,
        }))
        set((state) => ({ todos: [...state.todos, ...created] }))
      },

      toggle: (id) =>
        set((state) => ({
          todos: state.todos.map((t) =>
            t.id === id
              ? {
                  ...t,
                  done: !t.done,
                  completedAt: !t.done ? new Date().toISOString() : undefined,
                }
              : t,
          ),
        })),

      update: (id, patch) =>
        set((state) => ({
          todos: state.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      remove: (id) => set((state) => ({ todos: state.todos.filter((t) => t.id !== id) })),

      removeByCourse: (courseId) =>
        set((state) => ({ todos: state.todos.filter((t) => t.courseId !== courseId) })),

      findByPlanItem: (planItemId) => get().todos.find((t) => t.planItemId === planItemId),
    }),
    {
      name: `${STORAGE_PREFIX}.todos`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ todos: state.todos }),
    },
  ),
)

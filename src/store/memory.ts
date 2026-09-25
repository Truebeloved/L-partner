import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { Id, MemoryEntry, MemoryLayer } from '@/types/models'

/** 新建记忆时由调用方提供；confidence / useCount 由 store 初始化 */
export type MemoryDraft = Omit<MemoryEntry, 'id' | 'createdAt' | 'useCount'>

export interface MemoryFilter {
  layer?: MemoryLayer
  courseId?: Id
  includeArchived?: boolean
}

interface MemoryState {
  entries: MemoryEntry[]
  list: (filter?: MemoryFilter) => MemoryEntry[]
  add: (draft: MemoryDraft) => Id
  addMany: (drafts: MemoryDraft[]) => void
  update: (id: Id, patch: Partial<MemoryDraft>) => void
  remove: (id: Id) => void
  setArchived: (id: Id, archived: boolean) => void
  /**
   * 标记记忆被检索使用过。
   * 这是「记忆演化」的数据基础：常用记忆权重上升，长期不用的会被降权或遗忘。
   */
  touch: (ids: Id[]) => void
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      list: (filter = {}) => {
        const { layer, courseId, includeArchived = false } = filter
        return get()
          .entries.filter((entry) => {
            if (!includeArchived && entry.archived) return false
            if (layer && entry.layer !== layer) return false
            if (courseId && entry.courseId !== courseId) return false
            return true
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },

      add: (draft) => {
        const entry: MemoryEntry = {
          ...draft,
          id: newId(),
          createdAt: new Date().toISOString(),
          useCount: 0,
        }
        set((state) => ({ entries: [entry, ...state.entries] }))
        return entry.id
      },

      addMany: (drafts) => {
        const now = new Date().toISOString()
        const created: MemoryEntry[] = drafts.map((draft) => ({
          ...draft,
          id: newId(),
          createdAt: now,
          useCount: 0,
        }))
        set((state) => ({ entries: [...created, ...state.entries] }))
      },

      update: (id, patch) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      setArchived: (id, archived) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, archived } : e)),
        })),

      touch: (ids) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        const now = new Date().toISOString()
        set((state) => ({
          entries: state.entries.map((e) =>
            idSet.has(e.id) ? { ...e, lastUsedAt: now, useCount: e.useCount + 1 } : e,
          ),
        }))
      },
    }),
    {
      name: `${STORAGE_PREFIX}.memory`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
)

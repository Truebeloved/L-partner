import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { Id, Persona } from '@/types/models'

/** 角色卡的可编辑部分（id / builtin / createdAt 由系统管理） */
export type PersonaDraft = Omit<Persona, 'id' | 'builtin' | 'createdAt'>

interface PersonaState {
  personas: Persona[]
  getById: (id: Id) => Persona | undefined
  /** 新建自定义角色，返回新 id */
  add: (draft: PersonaDraft) => Id
  /** 复制一个角色（内置角色不可直接改，只能复制后改） */
  duplicate: (id: Id) => Id | undefined
  update: (id: Id, patch: Partial<PersonaDraft>) => void
  /** 内置角色受保护，不可删除 */
  remove: (id: Id) => void
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      personas: BUILTIN_PERSONAS,

      getById: (id) => get().personas.find((p) => p.id === id),

      add: (draft) => {
        const persona: Persona = {
          ...draft,
          id: newId(),
          builtin: false,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ personas: [...state.personas, persona] }))
        return persona.id
      },

      duplicate: (id) => {
        const source = get().personas.find((p) => p.id === id)
        if (!source) return undefined
        const copy: Persona = {
          ...source,
          id: newId(),
          name: `${source.name} 副本`,
          builtin: false,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ personas: [...state.personas, copy] }))
        return copy.id
      },

      update: (id, patch) =>
        set((state) => ({
          personas: state.personas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      remove: (id) => {
        const target = get().personas.find((p) => p.id === id)
        if (!target || target.builtin) return
        set((state) => ({ personas: state.personas.filter((p) => p.id !== id) }))
      },
    }),
    {
      name: `${STORAGE_PREFIX}.personas`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ personas: state.personas }),
    },
  ),
)

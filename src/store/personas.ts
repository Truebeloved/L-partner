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

/**
 * 把持久化的角色列表与当前的内置模板合并。
 *
 * 内置角色**永远以 seed 为准**：它受保护、用户改不了（想改只能复制一份再改），
 * 所以本地那份没有任何用户数据，却会挡住 seed 的更新 ——
 * 之前改过一版内置角色的说话风格，老用户那边一个字都没变，正是因为读的是本地旧副本。
 * 自定义角色（含内置角色的副本）原样保留，顺序仍按「内置在前、自定义在后」。
 *
 * 抽成纯函数是为了能被直接测：这段逻辑的价值全在"老数据 + 新 seed"这一种输入上。
 */
export function mergePersonas(stored: Persona[] | undefined): Persona[] {
  const customs = (stored ?? []).filter((persona) => !persona.builtin)
  return [...BUILTIN_PERSONAS, ...customs]
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
      version: 2,
      partialize: (state) => ({ personas: state.personas }),
      // 版本号变了必须给 migrate，否则 zustand 会直接放弃这份数据
      migrate: (persisted) => persisted as { personas: Persona[] },
      merge: (persisted, current) => ({
        ...current,
        personas: mergePersonas((persisted as { personas?: Persona[] } | undefined)?.personas),
      }),
    },
  ),
)

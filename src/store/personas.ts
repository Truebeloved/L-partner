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
 * 规则只有一条，看**用户有没有亲手改过这个人**：
 *
 * - **改过**（`edited: true`）→ 以**本地**为准。那是他正在用的那个人设，
 *   不能被一次版本更新悄悄改回去。用户明确要求过"内置角色可以直接改"，
 *   而在他改完之后又被代码覆盖，比一开始就不让他改更糟。
 * - **没改过** → 以 **seed** 为准。这样应用侧对角色卡的改进（比如把林知夏从
 *   "可爱的学姐"重写成有距离感的那个人）能落到所有老用户身上 ——
 *   这是本地那份唯一会挡住 seed 的地方，而它本来就没有任何用户数据。
 *
 * 自定义角色（含内置角色的副本）原样保留，顺序仍按「内置在前、自定义在后」。
 *
 * 抽成纯函数是为了能被直接测：这段逻辑的价值全在"老数据 + 新 seed"这一种输入上。
 */
export function mergePersonas(stored: Persona[] | undefined): Persona[] {
  const local = new Map((stored ?? []).map((persona) => [persona.id, persona]))

  const builtins = BUILTIN_PERSONAS.map((seed) => {
    const mine = local.get(seed.id)
    if (!mine?.edited) return seed
    // 以本地为准，但补上 seed 里后来新增的字段（旧数据不会有）
    return { ...seed, ...mine, builtin: true }
  })

  const customs = (stored ?? []).filter((persona) => !persona.builtin)
  return [...builtins, ...customs]
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

      /**
       * 改角色。改**内置角色**时顺手打上 `edited` 标记 ——
       * 有了它，启动时那场合并才知道这一份是用户亲手改的（见 mergePersonas），
       * 不会再被代码里的模板覆盖掉。
       */
      update: (id, patch) =>
        set((state) => ({
          personas: state.personas.map((p) =>
            p.id === id ? { ...p, ...patch, ...(p.builtin ? { edited: true } : {}) } : p,
          ),
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

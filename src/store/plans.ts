import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { Id, Plan, PlanItemStatus } from '@/types/models'

interface PlanState {
  /** 以 courseId 为键：一门课程对应一份当前生效的计划 */
  plans: Record<Id, Plan>
  getByCourse: (courseId: Id) => Plan | undefined
  /** 保存（覆盖）某门课程的计划 —— 重新排期就是再调一次 save */
  save: (plan: Plan) => void
  updateItemStatus: (courseId: Id, itemId: Id, status: PlanItemStatus) => void
  removeByCourse: (courseId: Id) => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plans: {},

      getByCourse: (courseId) => get().plans[courseId],

      save: (plan) => set((state) => ({ plans: { ...state.plans, [plan.courseId]: plan } })),

      updateItemStatus: (courseId, itemId, status) =>
        set((state) => {
          const plan = state.plans[courseId]
          if (!plan) return state
          const updated: Plan = {
            ...plan,
            items: plan.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    status,
                    completedAt: status === 'done' ? new Date().toISOString() : undefined,
                  }
                : item,
            ),
          }
          return { plans: { ...state.plans, [courseId]: updated } }
        }),

      removeByCourse: (courseId) =>
        set((state) => {
          const next = { ...state.plans }
          delete next[courseId]
          return { plans: next }
        }),
    }),
    {
      name: `${STORAGE_PREFIX}.plans`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ plans: state.plans }),
    },
  ),
)

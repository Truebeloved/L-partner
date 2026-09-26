import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { Course, Id } from '@/types/models'

/** 新建课程时由调用方提供的字段（id 与时间戳由 store 补齐） */
export type CourseDraft = Omit<Course, 'id' | 'createdAt' | 'updatedAt'>

interface CourseState {
  courses: Course[]
  /**
   * 随应用交付的示例课程是否已经摆上书架。
   *
   * 为什么需要一个**落盘的标记**，而不是"书架为空就自动载入"：
   * 后者在用户主动删光所有课程之后会把示例课程又塞回去 —— 他想清空，应用却认为他"还没开始"。
   * 标记只写一次，之后书架是空是满都由用户自己决定（想恢复可以去设置里手动载入）。
   */
  seededAt: string | null
  /** 标记示例课程已载入（由 seedInstall 调用，界面不要直接用） */
  markSeeded: () => void
  getById: (id: Id) => Course | undefined
  add: (draft: CourseDraft) => Id
  update: (id: Id, patch: Partial<CourseDraft>) => void
  /**
   * 写入某个单元的教学正文。
   *
   * 单独一个 action 而不是让调用方拼 stages 数组：单元藏在 阶段 → 单元 两层里，
   * 手写这层不可变更新很容易把别的阶段弄丢（改一门课却把另一阶段清空了）。
   */
  setUnitContent: (courseId: Id, unitId: Id, content: string) => void
  remove: (id: Id) => void
}

export const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => ({
      courses: [],
      seededAt: null,

      markSeeded: () => set({ seededAt: new Date().toISOString() }),

      getById: (id) => get().courses.find((c) => c.id === id),

      add: (draft) => {
        const now = new Date().toISOString()
        const course: Course = { ...draft, id: newId(), createdAt: now, updatedAt: now }
        set((state) => ({ courses: [course, ...state.courses] }))
        return course.id
      },

      update: (id, patch) =>
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
          ),
        })),

      setUnitContent: (courseId, unitId, content) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === courseId
              ? {
                  ...course,
                  updatedAt: new Date().toISOString(),
                  stages: course.stages.map((stage) => ({
                    ...stage,
                    units: stage.units.map((unit) =>
                      unit.id === unitId
                        ? { ...unit, content, contentGeneratedAt: new Date().toISOString() }
                        : unit,
                    ),
                  })),
                }
              : course,
          ),
        })),

      remove: (id) => set((state) => ({ courses: state.courses.filter((c) => c.id !== id) })),
    }),
    {
      name: `${STORAGE_PREFIX}.courses`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ courses: state.courses, seededAt: state.seededAt }),
    },
  ),
)

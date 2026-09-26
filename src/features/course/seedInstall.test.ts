import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 与 courseActions.test.ts 同一套处理：jsdom 没有 IndexedDB，
 * 真实的 idb 存储会让 persist 的写入变成未处理的 promise rejection。
 */
vi.mock('@/lib/storage/idbStorage', () => {
  const store = new Map<string, string>()
  return {
    STORAGE_PREFIX: 'lpartner-test',
    createIdbJSONStorage: () => ({
      getItem: async (name: string) => {
        const raw = store.get(name)
        return raw === undefined ? null : JSON.parse(raw)
      },
      setItem: async (name: string, value: unknown) => {
        store.set(name, JSON.stringify(value))
      },
      removeItem: async (name: string) => {
        store.delete(name)
      },
    }),
  }
})

import { installSeedCourses } from '@/features/course/seedInstall'
import { SEED_COURSES } from '@/lib/seed/courses'
import { useCourseStore } from '@/store/courses'

/**
 * 示例课程必须**初始就在书架上**。
 *
 * 上一版它们只存在于「新建课程」弹出的选择框里，于是全新安装打开应用看到的是空书架 ——
 * 而"零配置也能立刻看到这个应用在干什么"正是这几门课存在的全部理由。
 *
 * 这一组同时守住另一头：自动上架**只能发生一次**。用户在书架上删掉一门课，
 * 下次启动不该被他没要求的东西填回去。
 */
beforeEach(() => {
  useCourseStore.setState({ courses: [], seededAt: null })
})

describe('installSeedCourses', () => {
  it('首次打开把示例课程全部摆上书架，并落下"已载入"标记', () => {
    expect(installSeedCourses()).toBe(SEED_COURSES.length)

    const state = useCourseStore.getState()
    expect(state.courses).toHaveLength(SEED_COURSES.length)
    // 比对的是**落库后的标题**（即 build() 产出的那份），不是 SEED_COURSES 里的展示名 ——
    // 去重也是按前者做的，两者必须一致
    expect(state.courses.map((course) => course.title)).toEqual(
      expect.arrayContaining(SEED_COURSES.map((seed) => seed.build().title)),
    )
    expect(state.seededAt).not.toBeNull()
  })

  it('落库的是真内容，不是空壳 —— 阶段与单元都要在', () => {
    installSeedCourses()
    for (const course of useCourseStore.getState().courses) {
      expect(course.stages.length).toBeGreaterThan(0)
      expect(course.stages.flatMap((stage) => stage.units).length).toBeGreaterThan(0)
    }
  })

  it('第二次调用不再重复上架，用户删掉的那门也不会自己回来', () => {
    installSeedCourses()
    const first = useCourseStore.getState().courses[0]
    if (!first) throw new Error('应当已经载入示例课程')
    useCourseStore.getState().remove(first.id)

    expect(installSeedCourses()).toBe(0)
    expect(useCourseStore.getState().courses).toHaveLength(SEED_COURSES.length - 1)
  })

  it('force 只补缺的那几门，已有的不会摆成两本', () => {
    installSeedCourses()
    const dropped = useCourseStore.getState().courses[0]
    if (!dropped) throw new Error('应当已经载入示例课程')
    useCourseStore.getState().remove(dropped.id)

    expect(installSeedCourses({ force: true })).toBe(1)

    const titles = useCourseStore.getState().courses.map((course) => course.title)
    expect(titles).toHaveLength(SEED_COURSES.length)
    expect(new Set(titles).size).toBe(SEED_COURSES.length)
  })
})

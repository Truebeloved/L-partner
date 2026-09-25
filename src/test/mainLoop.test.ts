import { beforeEach, describe, expect, it } from 'vitest'

import {
  createCourse,
  deleteCourseCompletely,
  generatePlanForCourse,
  materializeTodos,
  rescheduleCourse,
} from '@/features/course/courseActions'
import { syncMasteryFromPlan } from '@/features/memory/mastery'
import { buildDemoCourseDraft } from '@/lib/seed/demoCourse'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'

/**
 * 主循环集成测试：课程 → 计划 → 待办 → 掌握状态。
 *
 * 这是整个项目的骨架链路，也是**没有 API Key 时用户唯一能体验的路径**，
 * 所以它必须被测试钉住。这里刻意不渲染任何 UI：
 * 链路上真正的风险在于 store 之间的协作（谁创建了待办、重排会不会留孤儿、
 * 完成情况有没有回流成掌握状态），这些用 store 层测试能更精确地定位。
 */

function resetStores() {
  useCourseStore.setState({ courses: [] })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
  useMemoryStore.setState({ entries: [] })
}

beforeEach(resetStores)

describe('主循环：课程 → 计划 → 待办', () => {
  it('载入示例课程后能一路生成计划和待办', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })

    const result = generatePlanForCourse(courseId)
    expect(result).not.toBeNull()
    expect(result?.plan.items.length).toBeGreaterThan(0)

    const created = materializeTodos(courseId)
    expect(created).toBeGreaterThan(0)

    const todos = useTodoStore.getState().todos
    expect(todos).toHaveLength(created)
    // 每一个派生的待办都必须挂在上某个真实存在的排期项上，
    // 否则「完成待办 → 回流掌握状态」这条链路会断在这里
    const planItemIds = new Set(
      usePlanStore
        .getState()
        .getByCourse(courseId)
        ?.items.map((item) => item.id),
    )
    for (const todo of todos) {
      expect(todo.planItemId).toBeDefined()
      expect(planItemIds.has(todo.planItemId as string)).toBe(true)
    }
  })

  it('重复物化不会让待办翻倍（幂等）', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    generatePlanForCourse(courseId)

    const first = materializeTodos(courseId)
    const second = materializeTodos(courseId)

    expect(second).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(first)
  })

  it('完成待办后能推导出知识点掌握状态', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    generatePlanForCourse(courseId)
    materializeTodos(courseId)

    // 把某一天的任务全部勾完，模拟真实使用
    const todos = useTodoStore.getState().todos
    const firstDate = todos[0]?.date as string
    const sameDay = todos.filter((todo) => todo.date === firstDate)
    for (const todo of sameDay) {
      useTodoStore.getState().toggle(todo.id)
    }

    const course = useCourseStore.getState().getById(courseId)
    const plan = usePlanStore.getState().getByCourse(courseId)
    expect(course).toBeDefined()
    expect(plan).toBeDefined()

    const changed = syncMasteryFromPlan(course!, plan!)
    expect(changed).toBeGreaterThan(0)

    const mastery = useMemoryStore.getState().entries.filter((entry) => entry.layer === 'mastery')
    expect(mastery.length).toBeGreaterThan(0)
    // 规则推导的边界：只能到「学习中」，不能自称「已掌握」
    expect(mastery.every((entry) => entry.level === 'learning')).toBe(true)
  })

  it('重新排期后不会留下指向已消失排期项的孤儿待办', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    generatePlanForCourse(courseId)
    materializeTodos(courseId)

    rescheduleCourse(courseId)

    const plan = usePlanStore.getState().getByCourse(courseId)
    const planItemIds = new Set(plan?.items.map((item) => item.id))
    const orphans = useTodoStore
      .getState()
      .todos.filter((todo) => todo.planItemId && !planItemIds.has(todo.planItemId))

    expect(orphans).toEqual([])
  })

  it('重新排期会保留已完成的历史，不会把学习记录抹掉', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    generatePlanForCourse(courseId)
    materializeTodos(courseId)

    const firstTodo = useTodoStore.getState().todos[0]
    expect(firstTodo).toBeDefined()
    useTodoStore.getState().toggle(firstTodo!.id)
    usePlanStore.getState().updateItemStatus(courseId, firstTodo!.planItemId as string, 'done')

    rescheduleCourse(courseId)

    const plan = usePlanStore.getState().getByCourse(courseId)
    const doneItems = plan?.items.filter((item) => item.status === 'done') ?? []
    expect(doneItems.length).toBeGreaterThan(0)
  })

  it('删除课程会连带清掉它的计划、待办与课程内记忆，但不碰全局记忆', () => {
    const courseId = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    generatePlanForCourse(courseId)
    materializeTodos(courseId)

    useMemoryStore.getState().add({
      layer: 'fact',
      courseId,
      content: '这门课他想重点练手写代码',
      confidence: 0.9,
      source: 'user',
    })
    useMemoryStore.getState().add({
      layer: 'fact',
      content: '他是计算机专业大三学生',
      confidence: 0.9,
      source: 'user',
    })

    deleteCourseCompletely(courseId)

    expect(useCourseStore.getState().courses).toHaveLength(0)
    expect(usePlanStore.getState().getByCourse(courseId)).toBeUndefined()
    expect(useTodoStore.getState().todos).toHaveLength(0)

    const memories = useMemoryStore.getState().entries
    expect(memories).toHaveLength(1)
    // 全局记忆是关于用户本人的，不该被删一门课牵连
    expect(memories[0]?.content).toContain('计算机专业')
  })

  it('示例课程的 deadline 在未来，评审任何一天打开都不会看到「已过期」', () => {
    const draft = buildDemoCourseDraft()
    expect(draft.deadline).toBeDefined()
    expect(new Date(draft.deadline as string).getTime()).toBeGreaterThan(Date.now())
  })
})

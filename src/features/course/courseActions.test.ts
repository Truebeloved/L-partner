import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * jsdom 没有 IndexedDB。真实的 idb 存储会让 persist 的写入变成未处理的 promise rejection，
 * 直接把整个测试文件判失败。这里用内存实现替掉存储层 ——
 * 被测的仍然是 store 与 courseActions 的逻辑本身，只是换了块写不坏的硬盘。
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

import {
  createCourse,
  deleteCourseCompletely,
  deletePlanForCourse,
  generatePlanForCourse,
  materializeTodos,
  planItemState,
  rescheduleCourse,
  summarizePlan,
} from '@/features/course/courseActions'
import {
  buildStages,
  courseTotals,
  estimateUnitMinutes,
  flattenUnits,
} from '@/features/course/drafts'
import type { CoursePlanDraft } from '@/features/course/drafts'
import { dayjs } from '@/lib/date'
import { buildDemoCourseDraft } from '@/lib/seed/demoCourse'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, DateKey, Id, Plan } from '@/types/models'

/** 2026-09-25 是周五；用例里的日期推算都以它为基准，保证结果不随运行时间漂移 */
const START: DateKey = '2026-09-25'

function draft(overrides: Partial<CoursePlanDraft> = {}): CoursePlanDraft {
  return {
    title: '两个月上手 React',
    goal: '能独立做出一个前端小应用',
    deadline: '2026-11-24',
    weeklyMinutes: 600,
    stages: [
      {
        title: '起步',
        objective: '把开发环境跑起来',
        units: [
          {
            title: '环境与第一个组件',
            knowledgePoints: ['脚手架', '热更新'],
            estimatedMinutes: 60,
          },
          { title: 'JSX 基础', knowledgePoints: ['JSX 语法', 'props'], estimatedMinutes: 90 },
        ],
      },
      {
        title: '核心',
        units: [
          { title: '状态与事件', knowledgePoints: ['useState'], estimatedMinutes: 90 },
          { title: '数据获取', knowledgePoints: ['useEffect'], estimatedMinutes: 60 },
        ],
      },
    ],
    ...overrides,
  }
}

function requireCourse(id: Id): Course {
  const course = useCourseStore.getState().getById(id)
  if (!course) throw new Error(`课程 ${id} 不存在`)
  return course
}

function requirePlan(id: Id): Plan {
  const plan = usePlanStore.getState().getByCourse(id)
  if (!plan) throw new Error(`课程 ${id} 还没有计划`)
  return plan
}

function unitsOf(course: Course) {
  return course.stages.flatMap((stage) => stage.units)
}

beforeEach(() => {
  useCourseStore.setState({ courses: [] })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
  useMemoryStore.setState({ entries: [] })
})

describe('estimateUnitMinutes', () => {
  it('按知识点数量估算，每个约 20 分钟', () => {
    expect(estimateUnitMinutes({ knowledgePoints: ['a', 'b'] })).toBe(40)
  })

  it('知识点很少时兜到 30 分钟下限', () => {
    expect(estimateUnitMinutes({ knowledgePoints: [] })).toBe(30)
    expect(estimateUnitMinutes({ knowledgePoints: ['a'] })).toBe(30)
  })

  it('用户填了时长就以用户为准，0 视为没填', () => {
    expect(estimateUnitMinutes({ knowledgePoints: ['a'], estimatedMinutes: 45 })).toBe(45)
    expect(estimateUnitMinutes({ knowledgePoints: ['a'], estimatedMinutes: 0 })).toBe(30)
  })
})

describe('buildStages', () => {
  it('补 id 与 order，并去掉重复知识点', () => {
    const stages = buildStages([
      { title: ' 起步 ', units: [{ title: ' JSX ', knowledgePoints: ['a', 'a', 'b'] }] },
      { title: '核心', units: [] },
    ])

    expect(stages.map((stage) => stage.order)).toEqual([0, 1])
    expect(stages.map((stage) => stage.title)).toEqual(['起步', '核心'])
    expect(stages[0]?.objective).toBeUndefined()

    const unit = stages[0]?.units[0]
    expect(unit?.id).toBeTruthy()
    expect(unit?.order).toBe(0)
    expect(unit?.title).toBe('JSX')
    expect(unit?.knowledgePoints).toEqual(['a', 'b'])
    expect(unit?.estimatedMinutes).toBe(40)

    // 每个阶段的单元 id 不能撞车：掌握状态是挂在 unit id 上的
    const ids = stages.flatMap((stage) => stage.units.map((item) => item.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('flattenUnits', () => {
  it('按 order 展平，而不是按数组下标（顺序决定先学后练）', () => {
    const course: Course = {
      id: 'c1',
      title: '乱序课程',
      source: 'manual',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      stages: [
        {
          id: 's2',
          title: '第二阶段',
          order: 1,
          units: [
            { id: 'u3', title: '第三步', knowledgePoints: [], estimatedMinutes: 30, order: 0 },
          ],
        },
        {
          id: 's1',
          title: '第一阶段',
          order: 0,
          units: [
            { id: 'u2', title: '第二步', knowledgePoints: [], estimatedMinutes: 40, order: 1 },
            { id: 'u1', title: '第一步', knowledgePoints: [], estimatedMinutes: 50, order: 0 },
          ],
        },
      ],
    }

    expect(flattenUnits(course).map((unit) => unit.unitId)).toEqual(['u1', 'u2', 'u3'])
    expect(flattenUnits(course).map((unit) => unit.estimatedMinutes)).toEqual([50, 40, 30])
  })
})

describe('createCourse', () => {
  it('落库时补齐 id / 时间戳，来源默认手动创建', () => {
    const id = createCourse(draft())

    const course = requireCourse(id)
    expect(course.title).toBe('两个月上手 React')
    expect(course.source).toBe('manual')
    expect(course.stages.map((stage) => stage.order)).toEqual([0, 1])
    expect(course.weeklyMinutes).toBe(600)
    expect(course.createdAt).toBeTruthy()
  })

  it('AI 与文件导入两条路径只改来源标记，数据结构完全一致', () => {
    expect(requireCourse(createCourse({ ...draft(), source: 'prompt' })).source).toBe('prompt')
    expect(requireCourse(createCourse({ ...draft(), source: 'file' })).source).toBe('file')
  })

  it('只有空白的可选字段不会存成空字符串', () => {
    const course = requireCourse(createCourse(draft({ description: '   ', goal: '  ' })))
    expect(course.description).toBeUndefined()
    expect(course.goal).toBeUndefined()
  })
})

describe('generatePlanForCourse', () => {
  it('课程不存在时返回 null，不留下半份计划', () => {
    expect(generatePlanForCourse('not-exist')).toBeNull()
  })

  it('把课程展平后交给排期算法，排期项只指向真实存在的单元', () => {
    const id = createCourse(draft())
    const result = generatePlanForCourse(id, { startDate: START })
    const course = requireCourse(id)
    const unitIds = new Set(flattenUnits(course).map((unit) => unit.unitId))

    expect(result?.plan.items.length).toBeGreaterThan(0)
    for (const item of result?.plan.items ?? []) {
      expect(unitIds.has(item.unitId)).toBe(true)
      expect(item.status).toBe('todo')
    }

    // 落库：计划是按 courseId 存的一份
    expect(requirePlan(id).items).toHaveLength(result?.plan.items.length ?? -1)
    expect(usePlanStore.getState().getByCourse(id)?.generatedBy).toBe('rule')
  })

  it('排期总时长与课程总时长一致，不会凭空多出或漏掉内容', () => {
    const id = createCourse(draft())
    const result = generatePlanForCourse(id, { startDate: START })
    const scheduled = (result?.plan.items ?? []).reduce((sum, item) => sum + item.minutes, 0)

    expect(scheduled).toBe(courseTotals(requireCourse(id)).totalMinutes)
  })

  it('已完成的单元不会被再排一遍（重新生成计划不该让人原地打转）', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })

    const doneItem = requirePlan(id).items[0]
    if (!doneItem) throw new Error('计划应当是空的')
    usePlanStore.getState().updateItemStatus(id, doneItem.id, 'done')

    const again = generatePlanForCourse(id, { startDate: START })
    const after = requirePlan(id)

    // 已完成的那条排期项原样保留，id 不变（待办的回流链路靠它）
    expect(after.items.find((item) => item.id === doneItem.id)?.status).toBe('done')

    const unit = unitsOf(requireCourse(id)).find((item) => item.id === doneItem.unitId)
    const unitMinutes = after.items
      .filter((item) => item.unitId === doneItem.unitId)
      .reduce((sum, item) => sum + item.minutes, 0)
    expect(unitMinutes).toBe(unit?.estimatedMinutes)

    // 新排出来的部分里不再出现这个已完成的单元
    expect(again?.schedule.items.some((item) => item.unitId === doneItem.unitId)).toBe(false)
  })

  it('把 deadline 排不下的事实如实传出来，而不是硬塞进单日上限', () => {
    const id = createCourse(draft({ deadline: '2026-09-26' }))
    const result = generatePlanForCourse(id, { startDate: START })

    expect(result?.schedule.exceedsDeadline).toBe(true)
    expect(result?.summary.exceedsDeadline).toBe(true)
    expect(result?.summary.finishDate).toBe('2026-09-28')
    for (const item of result?.plan.items ?? []) {
      expect(item.minutes).toBeLessThanOrEqual(90)
    }
  })
})

describe('materializeTodos', () => {
  it('每个排期项对应一条待办，planItemId 与日期都对得上', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    const plan = requirePlan(id)

    expect(materializeTodos(id)).toBe(plan.items.length)

    const todos = useTodoStore.getState().todos.filter((todo) => todo.courseId === id)
    expect(todos).toHaveLength(plan.items.length)

    for (const todo of todos) {
      const item = plan.items.find((candidate) => candidate.id === todo.planItemId)
      expect(item).toBeDefined()
      expect(todo.date).toBe(item?.date)
      expect(todo.minutes).toBe(item?.minutes)
      expect(todo.done).toBe(false)
      // 标题用单元标题，今日列表里才看得懂要做什么
      const unit = unitsOf(requireCourse(id)).find((candidate) => candidate.id === item?.unitId)
      expect(todo.title).toBe(unit?.title)
    }
  })

  it('同一个 planItemId 不会重复创建待办', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })

    const first = materializeTodos(id)
    expect(first).toBeGreaterThan(0)

    // 再点一次「生成学习计划」：待办数量必须纹丝不动
    expect(materializeTodos(id)).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(first)
  })

  it('已完成与已跳过的排期项不再生成待办', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    const items = requirePlan(id).items
    const doneItem = items[0]
    const skippedItem = items[1]
    if (!doneItem || !skippedItem) throw new Error('计划项不足')

    usePlanStore.getState().updateItemStatus(id, doneItem.id, 'done')
    usePlanStore.getState().updateItemStatus(id, skippedItem.id, 'skipped')

    expect(materializeTodos(id)).toBe(items.length - 2)
  })

  it('待办先打勾也算完成，重新物化时不会把它当成新任务', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    materializeTodos(id)

    const todo = useTodoStore.getState().todos[0]
    if (!todo) throw new Error('应当已经生成待办')
    useTodoStore.getState().toggle(todo.id)

    // 排期项状态还没被回流逻辑写回，但完成待办本身已经是事实
    expect(materializeTodos(id)).toBe(0)
  })
})

describe('rescheduleCourse', () => {
  it('保留已完成的历史，只重排剩下的内容，且不留孤儿待办', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    materializeTodos(id)

    const doneItem = requirePlan(id).items[0]
    if (!doneItem) throw new Error('计划应当是空的')
    usePlanStore.getState().updateItemStatus(id, doneItem.id, 'done')
    const doneTodo = useTodoStore.getState().findByPlanItem(doneItem.id)
    if (doneTodo) useTodoStore.getState().toggle(doneTodo.id)

    const result = rescheduleCourse(id, { startDate: '2026-10-01' })
    const after = requirePlan(id)

    // 历史不动：排期项与待办都还在，连日期都没被改
    const keptItem = after.items.find((item) => item.id === doneItem.id)
    expect(keptItem?.status).toBe('done')
    expect(keptItem?.date).toBe(doneItem.date)
    expect(useTodoStore.getState().findByPlanItem(doneItem.id)?.done).toBe(true)

    // 没有孤儿待办：每条派生待办都必须指向当前计划里还存在的排期项
    const itemIds = new Set(after.items.map((item) => item.id))
    for (const todo of useTodoStore.getState().todos) {
      if (todo.planItemId) expect(itemIds.has(todo.planItemId)).toBe(true)
    }

    // 重排的是「课程总量 − 已完成」，不是全部内容
    const openMinutes = after.items
      .filter((item) => item.status === 'todo')
      .reduce((sum, item) => sum + item.minutes, 0)
    expect(openMinutes).toBe(courseTotals(requireCourse(id)).totalMinutes - doneItem.minutes)
    expect(result?.schedule.items.length).toBeGreaterThan(0)
    expect(courseTotals(requireCourse(id)).totalMinutes).toBeGreaterThan(0)
  })

  it('全部完成时没有可重排的内容，也不会把历史清掉', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    for (const item of requirePlan(id).items) {
      usePlanStore.getState().updateItemStatus(id, item.id, 'done')
    }

    const result = rescheduleCourse(id, { startDate: START })

    expect(result?.schedule.empty).toBe(true)
    expect(result?.summary.remainingMinutes).toBe(0)
    expect(requirePlan(id).items.every((item) => item.status === 'done')).toBe(true)
  })
})

describe('deletePlanForCourse', () => {
  /** 造一个"有计划的课程 + 一条手动待办"的现场 */
  function setup() {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    materializeTodos(id)
    const manualId = useTodoStore
      .getState()
      .add({ title: '取快递', date: START, source: 'manual' })
    return { id, manualId }
  }

  it('删计划会连它派生的待办一起删掉，手动待办与课程内容一概不动', () => {
    const { id, manualId } = setup()
    const itemCount = requirePlan(id).items.length
    expect(itemCount).toBeGreaterThan(0)

    const derivedCount = useTodoStore.getState().todos.filter((todo) => todo.planItemId).length
    expect(derivedCount).toBeGreaterThan(0)

    expect(deletePlanForCourse(id)).toBe(derivedCount)

    expect(usePlanStore.getState().getByCourse(id)).toBeUndefined()
    // 手动添加的待办不是计划的产物，必须留下来
    expect(useTodoStore.getState().todos.map((todo) => todo.id)).toEqual([manualId])
    // 课程本体（教材）与删计划无关
    expect(requireCourse(id).stages.length).toBeGreaterThan(0)
  })

  it('已完成的派生待办也一起删 —— 留着会永远指向已不存在的排期项', () => {
    const { id } = setup()
    const todos = useTodoStore.getState().todos.filter((todo) => todo.planItemId)
    const first = todos[0]
    if (!first) throw new Error('应当已经生成派生待办')
    useTodoStore.getState().toggle(first.id)

    deletePlanForCourse(id)

    // 一条都不剩：不留"来自学习计划"却点不进去的幽灵任务
    expect(useTodoStore.getState().todos.filter((todo) => todo.planItemId)).toHaveLength(0)
  })

  it('掌握记录不动：删的是「打算怎么学」，不是「学会了什么」', () => {
    const { id } = setup()
    useMemoryStore.getState().add({
      layer: 'mastery',
      courseId: id,
      knowledgePoint: 'useState',
      content: '已经会用',
      level: 'mastered',
      confidence: 0.8,
      source: 'rule',
    })

    deletePlanForCourse(id)

    expect(useMemoryStore.getState().entries).toHaveLength(1)
  })

  it('删完可以立刻重新生成一份计划', () => {
    const { id } = setup()
    deletePlanForCourse(id)

    const result = generatePlanForCourse(id, { startDate: START })

    expect(result).not.toBeNull()
    expect(requirePlan(id).items.length).toBeGreaterThan(0)
  })

  it('没有计划时是空操作', () => {
    const id = createCourse(draft())
    expect(deletePlanForCourse(id)).toBe(0)
  })
})

describe('deleteCourseCompletely', () => {
  it('连带清掉计划、待办与该课程的记忆，不碰其他课程和全局记忆', () => {
    const keepId = createCourse(draft({ title: '保留的课程' }))
    const dropId = createCourse(draft({ title: '要删的课程' }))

    for (const id of [keepId, dropId]) {
      generatePlanForCourse(id, { startDate: START })
      materializeTodos(id)
      useMemoryStore.getState().add({
        layer: 'mastery',
        courseId: id,
        knowledgePoint: 'useState',
        content: 'useState 会用但还不熟',
        level: 'learning',
        confidence: 0.8,
        source: 'rule',
      })
    }
    // 全局记忆（courseId 为空）是关于用户本人的，不该被删课牵连
    const globalMemoryId = useMemoryStore.getState().add({
      layer: 'fact',
      content: '我是计算机专业大三',
      confidence: 0.9,
      source: 'user',
    })

    deleteCourseCompletely(dropId)

    expect(useCourseStore.getState().getById(dropId)).toBeUndefined()
    expect(usePlanStore.getState().getByCourse(dropId)).toBeUndefined()
    expect(useTodoStore.getState().todos.some((todo) => todo.courseId === dropId)).toBe(false)
    expect(useMemoryStore.getState().entries.some((entry) => entry.courseId === dropId)).toBe(false)

    expect(useCourseStore.getState().getById(keepId)).toBeDefined()
    expect(requirePlan(keepId).items.length).toBeGreaterThan(0)
    expect(useTodoStore.getState().todos.some((todo) => todo.courseId === keepId)).toBe(true)
    expect(useMemoryStore.getState().entries.some((entry) => entry.courseId === keepId)).toBe(true)
    expect(useMemoryStore.getState().entries.some((entry) => entry.id === globalMemoryId)).toBe(
      true,
    )
  })

  it('只删课程不删数据是不允许的：删完不该剩下孤儿待办', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    materializeTodos(id)

    deleteCourseCompletely(id)

    expect(useTodoStore.getState().todos).toHaveLength(0)
    expect(usePlanStore.getState().plans[id]).toBeUndefined()
  })
})

describe('planItemState', () => {
  it('待办打了勾就算完成，回流逻辑没写回状态时统计与日历也不会各说各话', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })
    materializeTodos(id)

    const plan = requirePlan(id)
    const item = plan.items[0]
    const todo = item ? useTodoStore.getState().findByPlanItem(item.id) : undefined
    if (!item || !todo) throw new Error('应当已经生成待办')

    expect(planItemState(item, [])).toBe('open')

    useTodoStore.getState().toggle(todo.id)
    const todos = useTodoStore.getState().todos
    expect(planItemState(item, todos)).toBe('done')

    // 概览走的是同一个判定：勾一条待办，剩余时长立刻少掉这一条
    const summary = summarizePlan(requireCourse(id), plan, todos)
    expect(summary.doneMinutes).toBe(item.minutes)
    expect(summary.remainingMinutes).toBe(summary.totalMinutes - item.minutes)
  })
})

describe('summarizePlan', () => {
  it('没排期时是一份空概览，不谎报完成度', () => {
    const id = createCourse(draft())
    const summary = summarizePlan(requireCourse(id), undefined)

    expect(summary).toEqual({
      totalMinutes: 0,
      doneMinutes: 0,
      remainingMinutes: 0,
      dailyMinutes: 0,
      studyDays: 0,
      finishDate: null,
      exceedsDeadline: false,
    })
  })

  it('排得下时 exceedsDeadline 为 false，剩余时长等于总时长', () => {
    const id = createCourse(draft())
    generatePlanForCourse(id, { startDate: START })

    const summary = summarizePlan(requireCourse(id), requirePlan(id))
    expect(summary.exceedsDeadline).toBe(false)
    expect(summary.doneMinutes).toBe(0)
    expect(summary.remainingMinutes).toBe(summary.totalMinutes)
    expect(summary.dailyMinutes).toBeGreaterThan(0)
    expect(summary.studyDays).toBeGreaterThan(1)
  })
})

describe('示例课程', () => {
  it('结构可排期：3 个阶段、8~12 个单元，知识点与时长都填得实', () => {
    const demo = buildDemoCourseDraft()
    expect(demo.stages).toHaveLength(3)

    const units = demo.stages.flatMap((stage) => stage.units)
    expect(units.length).toBeGreaterThanOrEqual(8)
    expect(units.length).toBeLessThanOrEqual(12)

    for (const unit of units) {
      expect(unit.title.trim()).not.toBe('')
      expect(unit.knowledgePoints.length).toBeGreaterThan(0)
      expect(unit.estimatedMinutes).toBeGreaterThanOrEqual(30)
    }

    // deadline 必须在今天之后，否则评审载入后只会看到一片「排不完」的警告
    expect(demo.deadline).toBeDefined()
    expect(dayjs(demo.deadline).isAfter(dayjs(), 'day')).toBe(true)
  })

  it('每次载入拿到的是独立对象，改一份不会污染下一次', () => {
    const first = buildDemoCourseDraft()
    first.stages[0]?.units.push({ title: '临时单元', knowledgePoints: [] })

    expect(buildDemoCourseDraft().stages[0]?.units).toHaveLength(3)
  })

  it('载入示例课程后能直接跑通「课程 → 计划 → 待办」（无 API Key 的主路径）', () => {
    const id = createCourse(buildDemoCourseDraft())
    const result = generatePlanForCourse(id)

    expect(result?.schedule.empty).toBe(false)
    expect(result?.summary.exceedsDeadline).toBe(false)

    const created = materializeTodos(id)
    expect(created).toBe(result?.plan.items.length)
    expect(useTodoStore.getState().todos.every((todo) => Boolean(todo.planItemId))).toBe(true)
  })
})

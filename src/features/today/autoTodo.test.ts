import { beforeEach, describe, expect, it } from 'vitest'

import {
  doneUnitIds,
  isWeeklyTodo,
  matchTodoToCourse,
  normalizeForMatch,
  parseOrdinal,
  repairStageLinks,
  resolveWhen,
  stageIdOfUnit,
  weekStartOf,
} from '@/features/today/autoTodo'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, Plan, Todo } from '@/types/models'

/** 2026-09-23 是周三 —— 固定住"今天"，周几的解析才有确定的答案 */
const NOW = new Date('2026-09-23T10:00:00')

const course: Course = {
  id: 'c1',
  title: '两个月上手 React',
  source: 'manual',
  goal: '',
  weeklyMinutes: 600,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  stages: [
    {
      id: 's1',
      title: '起步',
      objective: '',
      order: 0,
      units: [
        {
          id: 'u1',
          title: '环境与第一个组件',
          knowledgePoints: ['Vite 项目脚手架', 'useState 的更新批处理'],
          estimatedMinutes: 60,
          order: 0,
        },
        {
          id: 'u2',
          title: '状态与事件',
          knowledgePoints: [],
          estimatedMinutes: 90,
          order: 1,
        },
      ],
    },
  ],
}

const plan: Plan = {
  id: 'p1',
  courseId: 'c1',
  generatedBy: 'rule',
  createdAt: '2026-09-01T00:00:00.000Z',
  items: [
    { id: 'i1', courseId: 'c1', unitId: 'u1', date: '2026-09-23', minutes: 60, status: 'todo' },
  ],
}

function todo(patch: Partial<Todo>): Todo {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'x',
    date: '2026-09-23',
    done: false,
    createdAt: '2026-09-23T00:00:00.000Z',
    ...patch,
  }
}

describe('resolveWhen', () => {
  it('今天/明天/后天', () => {
    expect(resolveWhen('今天', NOW)).toEqual({ kind: 'day', date: '2026-09-23' })
    expect(resolveWhen('明天', NOW)).toEqual({ kind: 'day', date: '2026-09-24' })
    expect(resolveWhen('后天', NOW)).toEqual({ kind: 'day', date: '2026-09-25' })
  })

  it('周几：本周内往后找，过了就顺延到下周', () => {
    // 今天周三
    expect(resolveWhen('周五', NOW)).toEqual({ kind: 'day', date: '2026-09-25' })
    // 周一已经过了 → 下周一，而不是回到过去
    expect(resolveWhen('周一', NOW)).toEqual({ kind: 'day', date: '2026-09-28' })
    // 今天本身
    expect(resolveWhen('周三', NOW)).toEqual({ kind: 'day', date: '2026-09-23' })
  })

  it('下周三 / 星期三 / 礼拜天 都能认', () => {
    expect(resolveWhen('下周三', NOW)).toEqual({ kind: 'day', date: '2026-09-30' })
    expect(resolveWhen('星期五', NOW)).toEqual({ kind: 'day', date: '2026-09-25' })
    expect(resolveWhen('礼拜天', NOW)).toEqual({ kind: 'day', date: '2026-09-27' })
  })

  it('「这周」是周颗粒度，落在本周一', () => {
    expect(resolveWhen('这周', NOW)).toEqual({ kind: 'week', weekStart: '2026-09-21' })
    expect(resolveWhen('本周内', NOW)).toEqual({ kind: 'week', weekStart: '2026-09-21' })
    expect(resolveWhen('下周', NOW)).toEqual({ kind: 'week', weekStart: '2026-09-28' })
  })

  it('具体月日：已经过了就顺延到下一年', () => {
    expect(resolveWhen('10月1日', NOW)).toEqual({ kind: 'day', date: '2026-10-01' })
    expect(resolveWhen('3月5号', NOW)).toEqual({ kind: 'day', date: '2027-03-05' })
  })

  it('标准日期与「N 天后」', () => {
    expect(resolveWhen('2026-12-01', NOW)).toEqual({ kind: 'day', date: '2026-12-01' })
    expect(resolveWhen('3天后', NOW)).toEqual({ kind: 'day', date: '2026-09-26' })
  })

  it('认不出来就是 unknown —— 不硬猜', () => {
    for (const text of ['', '  ', '有空的时候', '某天']) {
      expect(resolveWhen(text, NOW)).toEqual({ kind: 'unknown' })
    }
  })
})

describe('weekStartOf / isWeeklyTodo', () => {
  it('周一就是它自己，周日归到同一周', () => {
    expect(weekStartOf('2026-09-21')).toBe('2026-09-21')
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21')
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28')
  })

  it('只有"本周"的周目标才算数，上周的自己就下线了', () => {
    expect(isWeeklyTodo(todo({ weekStart: '2026-09-21' }), '2026-09-23')).toBe(true)
    expect(isWeeklyTodo(todo({ weekStart: '2026-09-14' }), '2026-09-23')).toBe(false)
    expect(isWeeklyTodo(todo({}), '2026-09-23')).toBe(false)
  })
})

describe('matchTodoToCourse', () => {
  const plans = { c1: plan }

  it('整段包含单元标题就能匹配上', () => {
    const link = matchTodoToCourse('今天把「环境与第一个组件」看完', [course], plans)
    expect(link).toMatchObject({ courseId: 'c1', unitId: 'u1', planItemId: 'i1' })
  })

  it('知识点也能作为匹配依据', () => {
    const link = matchTodoToCourse('复习 useState 的更新批处理', [course], plans)
    expect(link).toMatchObject({ courseId: 'c1', unitId: 'u1' })
  })

  it('短标题被单元标题包含时同样算命中', () => {
    const link = matchTodoToCourse('状态与事件', [course], plans)
    expect(link).toMatchObject({ unitId: 'u2' })
  })

  it('匹配不上就返回 null，不硬塞一个课程', () => {
    expect(matchTodoToCourse('去拿快递', [course], plans)).toBeNull()
    // 单字不算命中，否则"学"会匹配到一切
    expect(matchTodoToCourse('学', [course], plans)).toBeNull()
  })

  it('没有计划项时仍然能建立关联（只是没有 planItemId）', () => {
    const link = matchTodoToCourse('环境与第一个组件', [course], {})
    expect(link).toMatchObject({ unitId: 'u1' })
    expect(link?.planItemId).toBeUndefined()
  })
})

describe('normalizeForMatch', () => {
  it('去掉空白与标点，方便中文直接比对', () => {
    expect(normalizeForMatch('「 useState 的更新批处理 」')).toBe('usestate的更新批处理')
  })
})

describe('doneUnitIds', () => {
  it('计划项完成时该单元算完成', () => {
    const done = doneUnitIds(course, plan, [todo({ planItemId: 'i1', unitId: 'u1', done: true })])
    expect(done.has('u1')).toBe(true)
    expect(done.has('u2')).toBe(false)
  })

  it('直接关联的待办全部勾掉也算完成（手输的待办没有计划项）', () => {
    const done = doneUnitIds(course, undefined, [todo({ unitId: 'u1', done: true })])
    expect(done.has('u1')).toBe(true)
  })

  it('关联的待办只要还有一件没完成，就不划掉', () => {
    const done = doneUnitIds(course, undefined, [
      todo({ unitId: 'u1', done: true }),
      todo({ unitId: 'u1', done: false }),
    ])
    expect(done.has('u1')).toBe(false)
  })

  it('周目标不参与：它的颗粒度不对，不该把某个单元划掉', () => {
    const done = doneUnitIds(course, undefined, [
      todo({ unitId: 'u1', done: true, weekStart: '2026-09-21' }),
    ])
    expect(done.has('u1')).toBe(false)
  })
})

describe('序号解析', () => {
  it('中文与阿拉伯数字都认，且是**从 1 开始**的序号', () => {
    expect(parseOrdinal('一')).toBe(1)
    expect(parseOrdinal('二')).toBe(2)
    expect(parseOrdinal('十')).toBe(10)
    expect(parseOrdinal('十一')).toBe(11)
    expect(parseOrdinal('二十一')).toBe(21)
    expect(parseOrdinal('3')).toBe(3)
  })
})

/** 一门三段、共六节的课：用来验证"说阶段一就动阶段一" */
function makeCourse(): Course {
  return {
    id: 'c1',
    title: 'C语言程序设计',
    source: 'manual',
    stages: [
      {
        id: 's1',
        title: '第 1 章',
        order: 0,
        units: [
          {
            id: 's1u1',
            title: '1.1 什么是程序',
            knowledgePoints: [],
            estimatedMinutes: 60,
            order: 0,
          },
          {
            id: 's1u2',
            title: '1.2 变量与类型',
            knowledgePoints: [],
            estimatedMinutes: 60,
            order: 1,
          },
          {
            id: 's1u3',
            title: '1.3 第一个程序',
            knowledgePoints: [],
            estimatedMinutes: 60,
            order: 2,
          },
        ],
      },
      {
        id: 's2',
        title: '第 2 章',
        order: 1,
        units: [
          { id: 's2u1', title: '2.1 分支', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
          { id: 's2u2', title: '2.2 循环', knowledgePoints: [], estimatedMinutes: 60, order: 1 },
        ],
      },
      {
        id: 's3',
        title: '第 3 章',
        order: 2,
        units: [
          { id: 's3u1', title: '3.1 数组', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
        ],
      },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

const NO_PLANS: Record<string, Plan> = {}

describe('待办 → 课程：说"阶段一"就该落到第一阶段', () => {
  it('「学完阶段一」命中第一阶段（不是第二个）', () => {
    const link = matchTodoToCourse('我要学完C语言程序设计阶段一', [makeCourse()], NO_PLANS)
    expect(link?.courseId).toBe('c1')
    expect(link?.stageId).toBe('s1')
    expect(link?.unitId).toBeUndefined()
  })

  it('同义说法一个都不能漏：阶段一 = 阶段1 = 第一阶段 = 第 1 章 = 第一章', () => {
    const course = makeCourse()
    for (const phrase of [
      '学完阶段一',
      '学完阶段1',
      '学完第一阶段',
      '学完第 1 阶段',
      '学完第1章',
      '学完第一章',
      '学完第 1 章',
      '学完第一部分',
    ]) {
      const link = matchTodoToCourse(phrase, [course], NO_PLANS)
      expect(link?.stageId, phrase).toBe('s1')
      expect(link?.unitId, phrase).toBeUndefined()
    }
  })

  it('「第二章」命中第二阶段', () => {
    const link = matchTodoToCourse('把第二章过一遍', [makeCourse()], NO_PLANS)
    expect(link?.stageId).toBe('s2')
  })

  it('课程名决定归属：两门课都有第一阶段时，看用户说了哪门课', () => {
    const other: Course = {
      ...makeCourse(),
      id: 'c2',
      title: '文言文阅读',
      stages: [
        {
          id: 'w1',
          title: '先把字词句读通',
          order: 0,
          units: [
            { id: 'w1u1', title: '一词多义', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
          ],
        },
        {
          id: 'w2',
          title: '篇目精读',
          order: 1,
          units: [
            { id: 'w2u1', title: '劝学', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
          ],
        },
      ],
    }

    const courses = [other, makeCourse()]
    expect(matchTodoToCourse('学完 C语言程序设计 阶段一', courses, NO_PLANS)?.stageId).toBe('s1')
    expect(matchTodoToCourse('学完文言文阅读 阶段一', courses, NO_PLANS)?.stageId).toBe('w1')
  })

  it('课程名只提一半也算（「C语言」指的是《C语言基础入门》）', () => {
    const c: Course = { ...makeCourse(), id: 'c-c', title: 'C语言基础入门' }
    const other: Course = {
      ...makeCourse(),
      id: 'c-w',
      title: '文言文阅读 · 中高考贯通',
    }
    // 文言文排在前面：不认部分提及的话，第一条会按数组顺序落到它身上
    const courses = [other, c]
    expect(matchTodoToCourse('学完C语言阶段一', courses, NO_PLANS)?.courseId).toBe('c-c')
    expect(matchTodoToCourse('学完C语言阶段一', courses, NO_PLANS)?.stageId).toBe('s1')
  })

  it('序号超出范围时不硬套：说"第九章"而只有三章 → 不匹配', () => {
    expect(matchTodoToCourse('学完第九章', [makeCourse()], NO_PLANS)).toBeNull()
  })

  it('直接写阶段名（足够长）也能命中', () => {
    const course = makeCourse()
    course.stages[1]!.title = '分支与循环'
    const link = matchTodoToCourse('把分支与循环看完', [course], NO_PLANS)
    expect(link?.stageId).toBe('s2')
  })

  it('点名了阶段里的**某一节**时，以那一节为准', () => {
    const link = matchTodoToCourse('学完第 1 章的 1.2 变量与类型', [makeCourse()], NO_PLANS)
    expect(link?.stageId).toBeUndefined()
    expect(link?.unitId).toBe('s1u2')
  })

  it('「第 3 讲」按序号落到第三节；网课用户就是这么说的', () => {
    expect(matchTodoToCourse('看完第 3 讲', [makeCourse()], NO_PLANS)?.unitId).toBe('s1u3')
    expect(matchTodoToCourse('看完第三讲', [makeCourse()], NO_PLANS)?.unitId).toBe('s1u3')
  })

  it('「第 2 章第 1 讲」里的序号是**段内**序号，不是全课程序号', () => {
    // 全课程第 1 节是 s1u1；段内第 1 节应该是 s2u1
    expect(matchTodoToCourse('学完第 2 章第 1 讲', [makeCourse()], NO_PLANS)?.unitId).toBe('s2u1')
  })
})

describe('完成整段待办 → 这一段每一节都算完成', () => {
  const todo = (overrides: Partial<Todo>): Todo => ({
    id: 't1',
    title: '学完阶段一',
    date: '2026-09-25',
    done: false,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  })

  it('勾掉"阶段一"的待办，第一阶段全部划掉，第二阶段不受影响', () => {
    const course = makeCourse()
    const done = doneUnitIds(course, undefined, [
      todo({ stageId: 's1', courseId: 'c1', done: true }),
    ])

    expect([...done].sort()).toEqual(['s1u1', 's1u2', 's1u3'])
    expect(done.has('s2u1')).toBe(false)
  })

  it('没勾掉就不算完成', () => {
    const done = doneUnitIds(makeCourse(), undefined, [
      todo({ stageId: 's1', courseId: 'c1', done: false }),
    ])
    expect(done.size).toBe(0)
  })

  it('周目标不参与：它是"这周想做的事"，颗粒度不对', () => {
    const done = doneUnitIds(makeCourse(), undefined, [
      todo({ stageId: 's1', courseId: 'c1', done: true, weekStart: '2026-09-21' }),
    ])
    expect(done.size).toBe(0)
  })

  it('stageIdOfUnit 能定位某一节属于哪一段', () => {
    const course = makeCourse()
    expect(stageIdOfUnit(course, 's2u1')).toBe('s2')
    expect(stageIdOfUnit(course, '不存在')).toBeUndefined()
  })
})

describe('修正历史数据：只挂在某一节上的"整段"待办', () => {
  const todo = (overrides: Partial<Todo>): Todo => ({
    id: 't1',
    title: '学完 C语言 阶段一',
    date: '2026-09-25',
    done: false,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    useCourseStore.setState({ courses: [makeCourse()] })
    usePlanStore.setState({ plans: {} })
    useTodoStore.setState({ todos: [] })
  })

  it('标题说了整段、却挂在这一段的第一节上 → 升级成整段', () => {
    useTodoStore.setState({
      todos: [todo({ courseId: 'c1', unitId: 's1u1', planItemId: 'p1' })],
    })

    expect(repairStageLinks()).toBe(1)
    const fixed = useTodoStore.getState().todos[0]!
    expect(fixed.stageId).toBe('s1')
    expect(fixed.unitId).toBeUndefined()
    expect(fixed.planItemId).toBeUndefined()
  })

  it('幂等：修过之后再跑不会重复计数', () => {
    useTodoStore.setState({ todos: [todo({ courseId: 'c1', unitId: 's1u1' })] })
    expect(repairStageLinks()).toBe(1)
    expect(repairStageLinks()).toBe(0)
  })

  it('挂的是别的段里的某一节时不动它（用户手动调过的关联不该被覆盖）', () => {
    useTodoStore.setState({ todos: [todo({ courseId: 'c1', unitId: 's2u1' })] })
    expect(repairStageLinks()).toBe(0)
    expect(useTodoStore.getState().todos[0]?.unitId).toBe('s2u1')
  })

  it('标题里认不出阶段时不碰', () => {
    useTodoStore.setState({ todos: [todo({ title: '随便一件事', unitId: 's1u1' })] })
    expect(repairStageLinks()).toBe(0)
  })
})

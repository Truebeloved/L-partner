import { describe, expect, it } from 'vitest'

import {
  doneUnitIds,
  isWeeklyTodo,
  matchTodoToCourse,
  normalizeForMatch,
  resolveWhen,
  weekStartOf,
} from '@/features/today/autoTodo'
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

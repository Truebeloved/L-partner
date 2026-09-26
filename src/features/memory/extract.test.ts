import { beforeEach, describe, expect, it } from 'vitest'

import { applyExtractedTodos } from '@/features/memory/extract'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, Plan } from '@/types/models'

/**
 * 「全局 AI」最重要的一条链路：对话里说的话 → 待办栏。
 *
 * 它跨了三个 store（课程 / 计划 / 待办），而真正容易出错的地方全在细节上：
 * 日期解析、兜底、去重、课程关联。所以这里直接喂一份"模型返回的 JSON"，
 * 断言落库后的结果 —— 与线上走的是同一条代码路径。
 */

const NOW = new Date('2026-09-23T10:00:00') // 周三

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
          knowledgePoints: [],
          estimatedMinutes: 60,
          order: 0,
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
    { id: 'i1', courseId: 'c1', unitId: 'u1', date: '2026-09-24', minutes: 60, status: 'todo' },
  ],
}

beforeEach(() => {
  useTodoStore.setState({ todos: [] })
  usePlanStore.setState({ plans: { c1: plan } })
  useCourseStore.setState({ courses: [course] })
})

describe('applyExtractedTodos', () => {
  it('今天的事落到今天，「下周三」落到下周三', () => {
    const created = applyExtractedTodos(
      { todos: [{ title: '复习闭包', when: '今天' }, { title: '交作业', when: '下周三' }] },
      { now: NOW },
    )

    expect(created).toBe(2)
    const dates = useTodoStore
      .getState()
      .todos.map((todo) => `${todo.title}@${todo.date}`)
      .sort()
    expect(dates).toEqual(['交作业@2026-09-30', '复习闭包@2026-09-23'])
  })

  it('时间认不出来时兜底成今天，而不是丢进一个没人看的日期', () => {
    applyExtractedTodos({ todos: [{ title: '整理笔记', when: '有空的时候' }] }, { now: NOW })
    expect(useTodoStore.getState().todos[0]?.date).toBe('2026-09-23')
  })

  it('「这周想做到」变成周目标：日期落在本周一，并带周标记', () => {
    const created = applyExtractedTodos(
      { todos: [{ title: '把第一章过一遍', when: '这周' }], weekly: ['这周背完 500 个单词'] },
      { now: NOW },
    )

    expect(created).toBe(2)
    for (const todo of useTodoStore.getState().todos) {
      expect(todo.weekStart).toBe('2026-09-21')
      expect(todo.date).toBe('2026-09-21')
    }
  })

  it('同一天同名的不重复落库 —— 同一件事在对话里常被提起好几次', () => {
    const payload = { todos: [{ title: '交作业', when: '明天' }] }
    expect(applyExtractedTodos(payload, { now: NOW })).toBe(1)
    expect(applyExtractedTodos(payload, { now: NOW })).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(1)
  })

  it('能对上课程内容时，自动挂上课程与单元（勾掉它课程结构就会划掉）', () => {
    applyExtractedTodos(
      { todos: [{ title: '今天把「环境与第一个组件」看完', when: '今天' }] },
      { now: NOW },
    )

    const todo = useTodoStore.getState().todos[0]
    expect(todo?.courseId).toBe('c1')
    expect(todo?.unitId).toBe('u1')
    expect(todo?.planItemId).toBe('i1')
  })

  it('对不上课程也不影响它成为一条待办', () => {
    applyExtractedTodos({ todos: [{ title: '去拿快递', when: '今天' }] }, { now: NOW })
    const todo = useTodoStore.getState().todos[0]
    expect(todo?.title).toBe('去拿快递')
    expect(todo?.courseId).toBeUndefined()
    expect(todo?.unitId).toBeUndefined()
  })

  it('模型把多件事合成一条时，本地也会切开', () => {
    // 提示词里要求模型自己拆，但合并成一条的概率不低 —— 这里兜住
    applyExtractedTodos(
      { todos: [{ title: '今天看完第一章，然后写作业，还有复习单词', when: '今天' }] },
      { now: NOW },
    )

    const titles = useTodoStore
      .getState()
      .todos.map((todo) => todo.title)
      .sort()
    expect(titles).toHaveLength(3)
    expect(titles.join('|')).toContain('第一章')
    expect(titles.join('|')).toContain('单词')
  })

  it('空标题、空数组都不会造出垃圾数据', () => {
    expect(applyExtractedTodos({}, { now: NOW })).toBe(0)
    expect(applyExtractedTodos({ todos: [{ title: '   ' }], weekly: [''] }, { now: NOW })).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(0)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'

import {
  computeUnitProgress,
  deriveMasteryDrafts,
  syncMasteryFromPlan,
} from '@/features/memory/mastery'
import { useMemoryStore } from '@/store/memory'
import type { Course, Plan } from '@/types/models'

function makeCourse(): Course {
  return {
    id: 'c1',
    title: 'React 入门',
    source: 'manual',
    stages: [
      {
        id: 's1',
        title: '基础',
        order: 0,
        units: [
          {
            id: 'u1',
            title: 'JSX',
            knowledgePoints: ['JSX 语法', '表达式嵌入'],
            estimatedMinutes: 60,
            order: 0,
          },
          {
            id: 'u2',
            title: '状态',
            knowledgePoints: ['useState'],
            estimatedMinutes: 90,
            order: 1,
          },
        ],
      },
    ],
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  }
}

function makePlan(statuses: Record<string, 'todo' | 'done' | 'skipped'>): Plan {
  return {
    id: 'p1',
    courseId: 'c1',
    generatedBy: 'rule',
    createdAt: '2026-09-25T00:00:00.000Z',
    items: Object.entries(statuses).map(([unitId, status], index) => ({
      id: `i${index}`,
      courseId: 'c1',
      unitId,
      date: '2026-09-25',
      minutes: 60,
      status,
    })),
  }
}

beforeEach(() => {
  useMemoryStore.setState({ entries: [] })
})

describe('computeUnitProgress', () => {
  it('按单元汇总任务数与完成数', () => {
    const plan = makePlan({ u1: 'done', u2: 'todo' })
    const progress = computeUnitProgress(makeCourse(), plan)

    expect(progress).toHaveLength(2)
    expect(progress[0]).toMatchObject({ unitId: 'u1', total: 1, done: 1 })
    expect(progress[1]).toMatchObject({ unitId: 'u2', total: 1, done: 0 })
  })

  it('没有排期的单元也会出现在结果里，计数为零', () => {
    const progress = computeUnitProgress(makeCourse(), makePlan({ u1: 'done' }))
    expect(progress[1]).toMatchObject({ unitId: 'u2', total: 0, done: 0 })
  })

  it('一个单元被拆成多天时合并计数', () => {
    const plan = makePlan({ u1: 'done' })
    plan.items.push({
      id: 'i9',
      courseId: 'c1',
      unitId: 'u1',
      date: '2026-09-26',
      minutes: 30,
      status: 'done',
    })
    const progress = computeUnitProgress(makeCourse(), plan)
    expect(progress[0]).toMatchObject({ unitId: 'u1', total: 2, done: 2 })
  })
})

describe('deriveMasteryDrafts', () => {
  it('只有全部任务完成的单元才产生掌握状态', () => {
    const plan = makePlan({ u1: 'done', u2: 'todo' })
    const drafts = deriveMasteryDrafts(makeCourse(), plan)

    // u1 有两个知识点，u2 未完成所以不产生
    expect(drafts).toHaveLength(2)
    expect(drafts.every((draft) => draft.knowledgePoint)).toBe(true)
    expect(drafts.map((draft) => draft.knowledgePoint)).toEqual(['JSX 语法', '表达式嵌入'])
  })

  it('规则推导只会给出「学习中」，绝不擅自判定「已掌握」', () => {
    const drafts = deriveMasteryDrafts(makeCourse(), makePlan({ u1: 'done' }))
    expect(drafts.every((draft) => draft.level === 'learning')).toBe(true)
    expect(drafts.some((draft) => draft.level === 'mastered')).toBe(false)
  })

  it('skipped 不算完成', () => {
    const drafts = deriveMasteryDrafts(makeCourse(), makePlan({ u1: 'skipped', u2: 'done' }))
    expect(drafts.map((draft) => draft.knowledgePoint)).toEqual(['useState'])
  })

  it('无法推导时返回空数组', () => {
    expect(deriveMasteryDrafts(makeCourse(), makePlan({ u1: 'todo', u2: 'todo' }))).toEqual([])
  })
})

describe('syncMasteryFromPlan', () => {
  it('首次同步会写入记忆', () => {
    const changed = syncMasteryFromPlan(makeCourse(), makePlan({ u1: 'done' }))
    expect(changed).toBe(2)
    expect(useMemoryStore.getState().entries).toHaveLength(2)
  })

  it('重复同步不会产生重复条目', () => {
    const course = makeCourse()
    const plan = makePlan({ u1: 'done' })
    syncMasteryFromPlan(course, plan)
    const changed = syncMasteryFromPlan(course, plan)

    expect(changed).toBe(0)
    expect(useMemoryStore.getState().entries).toHaveLength(2)
  })

  it('不覆盖已有的「已掌握」判定 —— 规则推导不该降级更可靠的结论', () => {
    const course = makeCourse()
    const plan = makePlan({ u1: 'done' })

    useMemoryStore.getState().add({
      layer: 'mastery',
      courseId: 'c1',
      knowledgePoint: 'JSX 语法',
      content: '能独立解释 JSX 与 createElement 的关系',
      level: 'mastered',
      confidence: 0.9,
      source: 'ai-extract',
    })

    syncMasteryFromPlan(course, plan)

    const entry = useMemoryStore
      .getState()
      .entries.find((item) => item.knowledgePoint === 'JSX 语法')
    expect(entry?.level).toBe('mastered')
    expect(entry?.content).toBe('能独立解释 JSX 与 createElement 的关系')
  })

  it('把「未接触」升级为「学习中」是允许的', () => {
    const course = makeCourse()
    const plan = makePlan({ u1: 'done' })

    useMemoryStore.getState().add({
      layer: 'mastery',
      courseId: 'c1',
      knowledgePoint: 'JSX 语法',
      content: '还没学过',
      level: 'unknown',
      confidence: 0.9,
      source: 'user',
    })

    syncMasteryFromPlan(course, plan)

    const entry = useMemoryStore
      .getState()
      .entries.find((item) => item.knowledgePoint === 'JSX 语法')
    expect(entry?.level).toBe('learning')
  })
})

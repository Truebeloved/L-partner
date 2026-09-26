import { describe, expect, it } from 'vitest'

import { buildStablePrompt, buildSystemPrompt, buildVolatilePrompt } from '@/lib/llm/prompts'
import type { Course, Persona, Plan } from '@/types/models'

const PERSONA: Persona = {
  id: 'p1',
  name: '顾舟',
  avatar: 'quill',
  identity: '带过三届考研的计算机讲师',
  personality: '直接、不留情面',
  speakingStyle: '口语化，多用类比',
  teachingStrategy: '先给例子再讲原理',
  taboos: '不要空泛鼓励',
  builtin: true,
  createdAt: '2026-09-01T00:00:00.000Z',
}

const COURSE: Course = {
  id: 'c1',
  title: '两个月上手 React',
  source: 'manual',
  goal: '能独立搭一个多页面应用',
  deadline: '2026-11-25',
  weeklyMinutes: 600,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  stages: [
    {
      id: 's1',
      title: '起步',
      objective: '跑起来',
      order: 0,
      units: [
        { id: 'u1', title: '环境与第一个组件', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
        { id: 'u2', title: '状态与事件', knowledgePoints: [], estimatedMinutes: 90, order: 1 },
      ],
    },
    {
      id: 's2',
      title: '进阶',
      objective: '拆组件',
      order: 1,
      units: [
        { id: 'u3', title: '组合与复用', knowledgePoints: [], estimatedMinutes: 120, order: 0 },
      ],
    },
  ],
}

const PLAN: Plan = {
  id: 'plan1',
  courseId: 'c1',
  generatedBy: 'rule',
  createdAt: '2026-09-01T00:00:00.000Z',
  items: [
    {
      id: 'i1',
      courseId: 'c1',
      unitId: 'u1',
      date: '2026-09-20',
      minutes: 60,
      status: 'done',
    },
    {
      id: 'i2',
      courseId: 'c1',
      unitId: 'u2',
      date: '2026-09-27',
      minutes: 90,
      status: 'todo',
    },
  ],
}

describe('buildStablePrompt', () => {
  it('只含人设与准则，不含任何会变的内容', () => {
    const stable = buildStablePrompt(PERSONA)
    expect(stable).toContain('顾舟')
    expect(stable).toContain('回答准则')
    // 日期、课程进度、记忆都属于易变信息，出现任何一个都会让前缀缓存失效
    expect(stable).not.toContain('今天是')
    expect(stable).not.toContain('两个月上手 React')
    expect(stable).not.toContain('记忆')
  })

  it('同样的角色两次调用逐字节相同（前缀缓存的前提）', () => {
    expect(buildStablePrompt(PERSONA)).toBe(buildStablePrompt(PERSONA))
  })
})

describe('buildVolatilePrompt 的课程段', () => {
  it('省流模式下不列整棵大纲，只给当前阶段与下一个单元', () => {
    const text = buildVolatilePrompt({ persona: PERSONA, course: COURSE, plan: PLAN, efficient: true })

    expect(text).toContain('当前阶段：起步')
    expect(text).toContain('下一个要学的单元：状态与事件')
    // 大纲里的其它单元不该出现 —— 那是课程页的事，每轮都发等于白烧钱
    expect(text).not.toContain('组合与复用')
    expect(text).not.toContain('环境与第一个组件')
  })

  it('非省流模式保留完整大纲', () => {
    const text = buildVolatilePrompt({
      persona: PERSONA,
      course: COURSE,
      plan: PLAN,
      efficient: false,
    })
    expect(text).toContain('组合与复用')
    expect(text).toContain('环境与第一个组件')
  })

  it('计划全部完成时也能说清走到哪了', () => {
    const text = buildVolatilePrompt({
      persona: PERSONA,
      course: COURSE,
      plan: { ...PLAN, items: PLAN.items.map((item) => ({ ...item, status: 'done' as const })) },
      efficient: true,
    })
    expect(text).toContain('已完成')
  })
})

describe('buildSystemPrompt', () => {
  it('是稳定段与易变段的拼接', () => {
    const full = buildSystemPrompt({ persona: PERSONA, course: COURSE, plan: PLAN })
    expect(full.startsWith(buildStablePrompt(PERSONA))).toBe(true)
    expect(full).toContain('两个月上手 React')
  })
})

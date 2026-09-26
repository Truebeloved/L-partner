import { describe, expect, it } from 'vitest'

import { looksLikeFollowUp, matchCourseForMessage } from '@/features/chat/routing'
import type { Course } from '@/types/models'

/**
 * 分类器的行为分两层：
 * - 认出某门课 → 归到那门课（由 matchCourseForMessage 决定）；
 * - 认不出 → 由路由决定去主对话还是留在原地（由 looksLikeFollowUp 决定）。
 * 这一组用例把两层都钉住。
 */

function makeCourse(id: string, title: string, units: { title: string; points: string[] }[]): Course {
  return {
    id,
    title,
    source: 'manual',
    stages: [
      {
        id: `${id}-s1`,
        title: '第一阶段',
        order: 0,
        units: units.map((unit, index) => ({
          id: `${id}-u${index}`,
          title: unit.title,
          knowledgePoints: unit.points,
          estimatedMinutes: 60,
          order: index,
        })),
      },
    ],
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  }
}

const wenyan = makeCourse('c-wenyan', '文言文阅读 · 中高考贯通', [
  { title: '一词多义：120 个高频实词怎么记才不混', points: ['一词多义', '语境推断法'] },
  { title: '特殊句式：判断、被动、宾语前置、状语后置、定语后置', points: ['宾语前置句', '被动句'] },
  { title: '《劝学》（荀子）· 比喻论证怎么把道理说透', points: ['比喻论证', '论证层次'] },
])

const react = makeCourse('c-react', '两个月上手 React', [
  { title: '状态与事件', points: ['useState', '受控表单'] },
  { title: '副作用与数据获取', points: ['useEffect 与依赖数组'] },
])

const COURSES = [wenyan, react]

describe('对话自动分类', () => {
  it('提到课程名里的关键词就归到那门课', () => {
    expect(matchCourseForMessage('文言文怎么学才有效', COURSES)?.courseId).toBe('c-wenyan')
    expect(matchCourseForMessage('React 的 useState 有什么用', COURSES)?.courseId).toBe('c-react')
  })

  it('说的是课程里的知识点/单元，也算与课程有关', () => {
    expect(matchCourseForMessage('宾语前置到底怎么判断', COURSES)?.courseId).toBe('c-wenyan')
    expect(matchCourseForMessage('帮我讲讲比喻论证', COURSES)?.courseId).toBe('c-wenyan')
    expect(matchCourseForMessage('useEffect 的依赖数组怎么填', COURSES)?.courseId).toBe('c-react')
  })

  it('与课程无关的话不归类 —— 由调用方留在主对话', () => {
    expect(matchCourseForMessage('我今天有点学不进去', COURSES)).toBeNull()
    expect(matchCourseForMessage('帮我看看今天该学什么', COURSES)).toBeNull()
    expect(matchCourseForMessage('你好', COURSES)).toBeNull()
    // 「阅读」「高考」这种通用词只有两个字的重叠，不该把整门课吸过来：
    // 说了「阅读」不等于在聊文言文阅读
    expect(matchCourseForMessage('我阅读速度太慢了', COURSES)).toBeNull()
    expect(matchCourseForMessage('高考怎么准备', COURSES)).toBeNull()
  })

  it('命中越具体越优先：同时提到两门课时，取更具体的那个词', () => {
    // 「比喻论证」比「文言文」更具体，命中的字数也更多
    const match = matchCourseForMessage('文言文里的比喻论证是什么', COURSES)
    expect(match?.courseId).toBe('c-wenyan')
    expect(match?.matched).toContain('比喻论证')
  })

  it('单字不参与匹配，避免"学""做"这类词把无关的话吸进来', () => {
    const course = makeCourse('c-x', '书法', [{ title: '执笔', points: ['运笔'] }])
    expect(matchCourseForMessage('我在学这个', [course])).toBeNull()
  })

  it('没有课程时返回 null', () => {
    expect(matchCourseForMessage('随便聊聊', [])).toBeNull()
  })

  it('与课程无关的闲话不归类 —— 哪怕当前就在某门课的对话里', () => {
    // 这几句是用户实际踩到的：「说说你的经历」被归进了文言文课程
    expect(matchCourseForMessage('说说你的经历', COURSES)).toBeNull()
    expect(matchCourseForMessage('你叫什么名字', COURSES)).toBeNull()
    expect(matchCourseForMessage('我今天有点累', COURSES)).toBeNull()
  })
})

describe('认不出课程时：追问留下、闲话回主对话', () => {
  it('追问留在原地', () => {
    expect(looksLikeFollowUp('再讲一遍')).toBe(true)
    expect(looksLikeFollowUp('为什么')).toBe(true)
    expect(looksLikeFollowUp('这里没懂')).toBe(true)
    expect(looksLikeFollowUp('第二讲讲了什么')).toBe(true)
    expect(looksLikeFollowUp('第 3 章难吗')).toBe(true)
  })

  it('自成一体的闲话不算追问 —— 它该回主对话', () => {
    expect(looksLikeFollowUp('说说你的经历')).toBe(false)
    expect(looksLikeFollowUp('你叫什么名字')).toBe(false)
    expect(looksLikeFollowUp('我今天有点累')).toBe(false)
    expect(looksLikeFollowUp('帮我看看今天该学什么')).toBe(false)
  })
})

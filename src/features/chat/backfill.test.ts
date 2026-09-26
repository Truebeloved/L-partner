import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { backfillCourseConversation } from '@/features/chat/backfill'
import { createCourse } from '@/features/course/courseActions'
import type { CoursePlanDraft } from '@/features/course/drafts'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { usePersonaStore } from '@/store/personas'
import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import type { ChatMessage } from '@/types/models'

/**
 * 建课之后的对话回填。
 *
 * 守的是用户提的那条："之后建立了新的课程，主对话中有相关内容的就复制一份过去"，
 * 而且整个过程**无感** —— 不弹窗、不提问、不把他从正在看的对话里拽走。
 */

const AT = '2026-09-20T08:00:00.000Z'

function message(id: string, role: ChatMessage['role'], content: string, minutes: number): ChatMessage {
  return { id, role, content, createdAt: new Date(Date.UTC(2026, 8, 20, 8, minutes)).toISOString() }
}

/** 一段主对话：聊编曲的一问一答 + 一段无关的闲话 */
function seedMainConversation() {
  useChatStore.setState({
    conversations: [
      {
        id: 'main',
        personaId: 'builtin-senior',
        title: '主对话',
        messages: [
          message('m1', 'user', '我想学编曲，从哪开始', 0),
          message('m2', 'assistant', '先摸清宿主软件，再学基础乐理。', 1),
          message('m3', 'user', '我今天有点累', 2),
          message('m4', 'assistant', '那就歇着。', 3),
          message('m5', 'user', '编曲入门需要买什么设备吗', 4),
          message('m6', 'assistant', '一副监听耳机就够开始了。', 5),
        ],
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    activeId: 'main',
  })
}

const DRAFT: CoursePlanDraft = {
  title: '编曲入门',
  goal: '能用宿主软件做出一段完整的 loop',
  stages: [
    {
      title: '起步',
      units: [{ title: '认识宿主软件', knowledgePoints: ['音轨与片段'] }],
    },
  ],
}

beforeEach(() => {
  useCourseStore.setState({ courses: [], seededAt: null })
  useChatStore.setState({ conversations: [], activeId: null })
  usePersonaStore.setState({ personas: BUILTIN_PERSONAS })
  seedMainConversation()
})

describe('backfillCourseConversation', () => {
  it('把主对话里与该课程相关的往来复制一份过去', () => {
    const courseId = createCourse(DRAFT, { originPhrase: '我想学编曲，从哪开始' })

    const courseConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.courseId === courseId)

    expect(courseConversation?.messages.map((item) => item.id)).toEqual(['m1', 'm2', 'm5', 'm6'])
    // 无关的那两句不该被带过去
    expect(courseConversation?.messages.some((item) => item.id === 'm3')).toBe(false)
  })

  it('课程名认不出、但用户当初那句话认得出时，也要带上（「编曲入门」↔「我想学编曲」）', () => {
    // 「编曲入门」与 m5「编曲入门需要买什么设备吗」共享 4 字，m1 只共享 2 字 ——
    // m1 只能靠 originPhrase 认出来，而它恰恰是这门课之所以存在的那一句
    const courseId = createCourse(DRAFT, { originPhrase: '我想学编曲，从哪开始' })
    const courseConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.courseId === courseId)

    expect(courseConversation?.messages.some((item) => item.id === 'm1')).toBe(true)
  })

  it('没有 originPhrase 时退化成纯课程词表匹配（不会因此崩或乱带）', () => {
    const courseId = createCourse(DRAFT)
    const courseConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.courseId === courseId)

    expect(courseConversation?.messages.map((item) => item.id)).toEqual(['m5', 'm6'])
  })

  it('**只复制不移除** —— 主对话必须保持连续', () => {
    createCourse(DRAFT, { originPhrase: '我想学编曲' })

    const main = useChatStore.getState().conversations.find((c) => !c.courseId)
    expect(main?.messages).toHaveLength(6)
  })

  it('无感：不会把用户从原来那一场拽到新建的课程对话里', () => {
    createCourse(DRAFT, { originPhrase: '我想学编曲' })

    expect(useChatStore.getState().activeId).toBe('main')
  })

  it('复制过来的消息保留**本来**的时间，而不是全堆在"刚刚"', () => {
    createCourse(DRAFT, { originPhrase: '我想学编曲' })

    const courseConversation = useChatStore
      .getState()
      .conversations.find((c) => c.courseId === useCourseStore.getState().courses[0]?.id)
    const times = courseConversation?.messages.map((item) => item.createdAt) ?? []

    expect(times[0]).toBe('2026-09-20T08:00:00.000Z')
    expect(times).toEqual([...times].sort())
  })

  it('主对话里没有相关内容时什么都不做 —— 不留一个空对话', () => {
    useChatStore.setState({
      conversations: [
        {
          id: 'main',
          personaId: 'builtin-senior',
          title: '主对话',
          messages: [message('m1', 'user', '今天天气不错', 0)],
          createdAt: AT,
          updatedAt: AT,
        },
      ],
      activeId: 'main',
    })

    createCourse(DRAFT)

    expect(useChatStore.getState().conversations.filter((c) => c.courseId)).toHaveLength(0)
  })

  it('主对话不存在（全新用户）时不报错', () => {
    useChatStore.setState({ conversations: [], activeId: null })
    expect(() => createCourse(DRAFT)).not.toThrow()
    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it('已经复制过就不再复制 —— 重复调用不会把记录翻倍', () => {
    const courseId = createCourse(DRAFT, { originPhrase: '我想学编曲' })
    expect(backfillCourseConversation(courseId)).toBe(0)

    const courseConversation = useChatStore
      .getState()
      .conversations.find((c) => c.courseId === courseId)
    expect(courseConversation?.messages).toHaveLength(4)
  })
})

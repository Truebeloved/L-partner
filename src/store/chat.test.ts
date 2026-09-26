import { beforeEach, describe, expect, it } from 'vitest'

import {
  consolidateConversations,
  MAIN_CONVERSATION_ID,
  MAIN_CONVERSATION_TITLE,
  useChatStore,
} from '@/store/chat'
import type { ChatMessage, Conversation } from '@/types/models'

function message(id: string, content: string, createdAt: string): ChatMessage {
  return { id, role: 'user', content, createdAt }
}

function conversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    personaId: 'builtin-senior',
    title: '新的对话',
    messages: [],
    createdAt: '2026-09-25T08:00:00.000Z',
    updatedAt: '2026-09-25T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  useChatStore.setState({ conversations: [], activeId: null })
})

describe('历史对话收敛', () => {
  it('与课程无关的多场对话合并成一场主对话，消息按时间排好', () => {
    const merged = consolidateConversations([
      conversation({
        id: 'a',
        messages: [message('m1', '第一句', '2026-09-25T08:00:00.000Z')],
        createdAt: '2026-09-25T08:00:00.000Z',
        updatedAt: '2026-09-25T08:00:00.000Z',
      }),
      conversation({
        id: 'b',
        messages: [message('m2', '第二句', '2026-09-25T09:00:00.000Z')],
        createdAt: '2026-09-25T09:00:00.000Z',
        updatedAt: '2026-09-25T09:00:00.000Z',
      }),
      conversation({
        id: 'c',
        messages: [message('m3', '更早的一句', '2026-09-25T07:00:00.000Z')],
        createdAt: '2026-09-25T07:00:00.000Z',
        updatedAt: '2026-09-25T07:00:00.000Z',
      }),
    ])

    expect(merged).toHaveLength(1)
    const main = merged[0]!
    expect(main.id).toBe(MAIN_CONVERSATION_ID)
    expect(main.title).toBe(MAIN_CONVERSATION_TITLE)
    expect(main.messages.map((m) => m.content)).toEqual(['更早的一句', '第一句', '第二句'])
    // 时间跨度要覆盖全部来源，否则列表排序会把这场排到错误的位置
    expect(main.createdAt).toBe('2026-09-25T07:00:00.000Z')
    expect(main.updatedAt).toBe('2026-09-25T09:00:00.000Z')
  })

  it('每门课各留一场，不与主对话混在一起', () => {
    const merged = consolidateConversations([
      conversation({ id: 'a', messages: [message('m1', '闲话', '2026-09-25T08:00:00.000Z')] }),
      conversation({
        id: 'course-1a',
        courseId: 'c1',
        messages: [message('m2', '文言文的问题', '2026-09-25T08:10:00.000Z')],
      }),
      conversation({
        id: 'course-1b',
        courseId: 'c1',
        messages: [message('m3', '又一个文言文问题', '2026-09-25T08:20:00.000Z')],
      }),
      conversation({
        id: 'course-2a',
        courseId: 'c2',
        messages: [message('m4', 'React 的问题', '2026-09-25T08:30:00.000Z')],
      }),
    ])

    expect(merged).toHaveLength(3)
    const byCourse = new Map(merged.map((item) => [item.courseId ?? 'main', item]))
    expect(byCourse.get('main')?.messages).toHaveLength(1)
    expect(byCourse.get('c1')?.messages.map((m) => m.content)).toEqual([
      '文言文的问题',
      '又一个文言文问题',
    ])
    expect(byCourse.get('c2')?.messages).toHaveLength(1)
  })

  it('摘要保留下来（超长记忆不能因为合并丢掉），下标归零交给下一轮重算', () => {
    const merged = consolidateConversations([
      conversation({
        id: 'a',
        summary: '用户想两个月上手 React',
        summaryUpTo: 8,
        messages: [message('m1', 'x', '2026-09-25T08:00:00.000Z')],
      }),
      conversation({
        id: 'b',
        summary: '用户偏好早上学习',
        summaryUpTo: 6,
        messages: [message('m2', 'y', '2026-09-25T09:00:00.000Z')],
      }),
    ])

    const main = merged[0]!
    expect(main.summary).toContain('React')
    expect(main.summary).toContain('早上学习')
    expect(main.summaryUpTo).toBe(0)
  })

  it('幂等：已经收敛过的数据再跑一次不会有任何变化', () => {
    const once = consolidateConversations([
      conversation({ id: 'a', messages: [message('m1', 'x', '2026-09-25T08:00:00.000Z')] }),
      conversation({
        id: 'course-1',
        courseId: 'c1',
        messages: [message('m2', 'y', '2026-09-25T09:00:00.000Z')],
      }),
    ])

    expect(consolidateConversations(once)).toEqual(once)
  })

  it('重复的消息按 id 去重，不会因为合并被复制', () => {
    const shared = message('same', '同一句', '2026-09-25T08:00:00.000Z')
    const merged = consolidateConversations([
      conversation({ id: 'a', messages: [shared] }),
      conversation({ id: 'b', messages: [shared] }),
    ])

    expect(merged[0]!.messages).toHaveLength(1)
  })
})

describe('回答的角色署名', () => {
  it('切换角色时，还没署名的历史回答归给旧角色', () => {
    useChatStore.setState({
      conversations: [
        conversation({
          id: 'c1',
          personaId: 'builtin-senior',
          messages: [
            { id: 'm1', role: 'user', content: '你好', createdAt: '2026-09-25T08:00:00.000Z' },
            {
              id: 'm2',
              role: 'assistant',
              content: '在的',
              createdAt: '2026-09-25T08:00:10.000Z',
            },
          ],
        }),
      ],
    })

    useChatStore.getState().setPersona('c1', 'builtin-strict')

    const updated = useChatStore.getState().getById('c1')!
    expect(updated.personaId).toBe('builtin-strict')
    // 那条回答是"耐心学长"说的，换角色不该把它算到新角色头上
    expect(updated.messages[0]?.personaId).toBeUndefined()
    expect(updated.messages[1]?.personaId).toBe('builtin-senior')
  })

  it('已经署名的回答不会被之后的切换改写', () => {
    useChatStore.setState({
      conversations: [
        conversation({
          id: 'c1',
          personaId: 'builtin-strict',
          messages: [
            {
              id: 'm1',
              role: 'assistant',
              content: '我是严格督学说的',
              createdAt: '2026-09-25T08:00:00.000Z',
              personaId: 'builtin-strict',
            },
          ],
        }),
      ],
    })

    useChatStore.getState().setPersona('c1', 'builtin-ta')

    expect(useChatStore.getState().getById('c1')?.messages[0]?.personaId).toBe('builtin-strict')
  })

  it('署名以最后一条已署名的回答为准，而不是会话上可能过期的字段', () => {
    useChatStore.setState({
      conversations: [
        conversation({
          id: 'c1',
          // 会话字段停留在老角色上（角色可能是在别的页面被改的）
          personaId: 'builtin-senior',
          messages: [
            {
              id: 'm1',
              role: 'assistant',
              content: '实际是助教在说话',
              createdAt: '2026-09-25T08:00:00.000Z',
              personaId: 'builtin-ta',
            },
            {
              id: 'm2',
              role: 'assistant',
              content: '这条还没署名',
              createdAt: '2026-09-25T08:00:10.000Z',
            },
          ],
        }),
      ],
    })

    useChatStore.getState().setPersona('c1', 'builtin-strict')

    expect(useChatStore.getState().getById('c1')?.messages[1]?.personaId).toBe('builtin-ta')
  })
})

describe('ensureConversation', () => {
  it('主对话全局唯一：反复要也只建一场', () => {
    const first = useChatStore.getState().ensureConversation({ personaId: 'builtin-senior' })
    const second = useChatStore.getState().ensureConversation({ personaId: 'builtin-senior' })

    expect(first).toBe(second)
    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState().conversations[0]?.courseId).toBeUndefined()
  })

  it('每门课一场，标题用课程名', () => {
    const first = useChatStore
      .getState()
      .ensureConversation({ personaId: 'builtin-senior', courseId: 'c1', title: '文言文阅读' })
    const again = useChatStore
      .getState()
      .ensureConversation({ personaId: 'builtin-senior', courseId: 'c1', title: '文言文阅读' })
    const other = useChatStore
      .getState()
      .ensureConversation({ personaId: 'builtin-senior', courseId: 'c2', title: 'React' })

    expect(first).toBe(again)
    expect(first).not.toBe(other)
    expect(useChatStore.getState().getById(first)?.title).toBe('文言文阅读')
    expect(useChatStore.getState().conversations).toHaveLength(2)
  })
})

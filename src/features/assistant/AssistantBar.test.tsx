import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AssistantBar } from '@/features/assistant/AssistantBar'
import { ChatSessionContext } from '@/features/chat/context'
import type { ChatSession } from '@/features/chat/useChatSession'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import type { ChatMessage, Conversation } from '@/types/models'

/*
 * jsdom 不做排版：scrollWidth / clientWidth 永远是 0，于是"有没有被截断"这个判断
 * 在测试里恒为 false。这里把 scrollWidth 打桩成可控值，用来分别模拟
 * "短回答（放得下）"与"长回答（放不下）"两种情形。
 */
let stubScrollWidth = 0
beforeEach(() => {
  stubScrollWidth = 0
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return stubScrollWidth
    },
  })
})

function makeConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'main',
    personaId: 'builtin-senior',
    title: '主对话',
    messages,
    createdAt: '2026-09-25T08:00:00.000Z',
    updatedAt: '2026-09-25T08:00:00.000Z',
  }
}

const message = (id: string, role: ChatMessage['role'], content: string): ChatMessage => ({
  id,
  role,
  content,
  createdAt: '2026-09-25T08:00:00.000Z',
})

function renderBar(messages: ChatMessage[] = []) {
  useChatStore.setState({ conversations: [makeConversation(messages)], activeId: 'main' })
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      llm: { ...useSettingsStore.getState().settings.llm, apiKey: 'sk-test', model: 'm' },
    },
  })

  const send = vi.fn(async (text: string) => {
    // 模拟一次完整的问答：用户问题 + 学伴回答都落进会话
    useChatStore.getState().appendMessage('main', { role: 'user', content: text })
    useChatStore.getState().appendMessage('main', {
      role: 'assistant',
      content: '这是一条回答。',
      personaId: 'builtin-senior',
    })
  })

  const session: ChatSession = {
    streaming: false,
    error: null,
    usedMemoryCount: 0,
    contextTokens: 0,
    receipts: [],
    pendingActions: [],
    dismissReceipts: vi.fn(),
    confirmPendingAction: vi.fn(),
    dismissPendingAction: vi.fn(),
    send,
    stop: vi.fn(),
    rememberNow: vi.fn(async () => 0),
  }

  /*
   * 外壳必须订阅会话 store：真实的 ChatSessionProvider 就是这么把消息喂给输入条的，
   * 传一份固定数组的话，回答写进 store 也不会重新渲染 —— 测的就不是真实链路了。
   */
  function Harness() {
    const conversation = useChatStore(
      (state) => state.conversations.find((item) => item.id === state.activeId) ?? null,
    )
    const messageList = conversation?.messages ?? []
    return (
      <ChatSessionContext.Provider
        value={{ ...session, conversation, messages: messageList }}
      >
        <AssistantBar placement="top" />
      </ChatSessionContext.Provider>
    )
  }

  render(<Harness />)

  return { send }
}

afterEach(() => {
  cleanup()
  useChatStore.setState({ conversations: [], activeId: null })
  vi.useRealTimers()
})

/** 收起态那一层的 max-height：1.5em 表示"只有一行" */
function collapsedHeight(): string {
  const node = document.querySelector('[data-assistant-collapsed]')
  const wrapper = node?.parentElement as HTMLElement | null
  return wrapper?.style.maxHeight ?? ''
}

describe('回答气泡的展开逻辑', () => {
  it('内容放得下就不展开 —— 短回答一直待在缩略的一行里', async () => {
    stubScrollWidth = 0
    renderBar()

    await userEvent.type(screen.getByLabelText('问学伴'), '你好{Enter}')

    // 回答已出来（收起态那一层在），而容器高度始终是"一行"
    await waitFor(() => expect(document.querySelector('[data-assistant-collapsed]')).not.toBeNull())
    expect(collapsedHeight()).toBe('1.5em')
  })

  it('内容一行放不下才展开，并且一会儿之后自己收回缩略态', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubScrollWidth = 800 // 模拟"被截断"
    renderBar()

    await userEvent.type(screen.getByLabelText('问学伴'), '讲个长问题{Enter}')

    // 量出被截断 → 自动展开（不再是 1.5em）
    await waitFor(() => expect(collapsedHeight()).not.toBe('1.5em'))

    // 停留一会儿之后收回一行：默认状态就是缩略态
    await vi.advanceTimersByTimeAsync(3600)
    await waitFor(() => expect(collapsedHeight()).toBe('1.5em'))
  })

  it('用户自己收起过的回答不会被再次自动展开', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubScrollWidth = 800
    renderBar()

    await userEvent.type(screen.getByLabelText('问学伴'), '讲个长问题{Enter}')
    await waitFor(() => expect(collapsedHeight()).not.toBe('1.5em'))

    // 点回答气泡本身收起（两层文字用 getByText 会命中两个元素）
    const bubble = document.querySelector('[data-assistant-answer]') as HTMLElement
    await userEvent.click(bubble)
    await waitFor(() => expect(collapsedHeight()).toBe('1.5em'))

    // 再等一轮：不该被"自动展开"重新撑开
    await vi.advanceTimersByTimeAsync(1000)
    expect(collapsedHeight()).toBe('1.5em')
  })

  it('换页回来不会把上一条旧回答重新撑开', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubScrollWidth = 800
    renderBar()

    // 第一轮：长回答展开，随后自己收回
    await userEvent.type(screen.getByLabelText('问学伴'), '讲个长问题{Enter}')
    await waitFor(() => expect(collapsedHeight()).not.toBe('1.5em'))
    await vi.advanceTimersByTimeAsync(3600)
    await waitFor(() => expect(collapsedHeight()).toBe('1.5em'))

    /*
     * 模拟换页：输入条是常驻单例，换页时它会重新测量一次。
     * 只有"刚刚提交的那一轮"允许自动展开，所以这次重新测量不该再把它撑开 ——
     * 用户报的正是"发起一轮对话后，去别的界面再回来它又展开了"。
     */
    const bubble = document.querySelector('[data-assistant-answer]') as HTMLElement
    await userEvent.click(bubble) // 触发一次重渲染
    await userEvent.click(bubble)
    await vi.advanceTimersByTimeAsync(500)

    expect(collapsedHeight()).toBe('1.5em')
  })
})

describe('回车键的语义', () => {
  it('答完之后按回车回到输入态，并把光标放进输入框', async () => {
    stubScrollWidth = 0
    renderBar([message('m1', 'user', '之前的问题'), message('m2', 'assistant', '之前的回答')])

    // 先发送一次，进入"气泡态"
    await userEvent.type(screen.getByLabelText('问学伴'), '问一句{Enter}')
    await waitFor(() => expect(screen.queryByLabelText('问学伴')).not.toBeInTheDocument())

    // 气泡态下按回车 = 问新问题
    await userEvent.keyboard('{Enter}')

    const input = await screen.findByLabelText('问学伴')
    expect(input).toHaveFocus()
  })

  it('在输入框里回车就是发送', async () => {
    stubScrollWidth = 0
    const { send } = renderBar()

    await userEvent.type(screen.getByLabelText('问学伴'), '这就是要发的内容{Enter}')

    expect(send).toHaveBeenCalledWith('这就是要发的内容')
  })
})

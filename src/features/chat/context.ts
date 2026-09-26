import { createContext, useContext } from 'react'

import type { ChatSession } from '@/features/chat/useChatSession'
import type { ChatMessage, Conversation } from '@/types/models'

/**
 * 会话上下文。
 *
 * 为什么要提升成 context 而不是每个组件各自 `useChatSession()`：
 * 「学伴输入条」和「学伴对话」页看的是**同一场对话**，而流式状态（正在生成的回答、
 * 错误、本轮引用了多少记忆）是会话级的、有状态的。两处各起一份的话，
 * 页面上点发送、输入条却不知道正在流式输出 —— 两份状态必然对不上。
 * 提升到应用外壳后，谁发起、谁展示，见到的都是同一份。
 */
export interface ChatSessionContextValue extends ChatSession {
  /** 当前会话（未开始时为 null） */
  conversation: Conversation | null
  /** 当前会话的消息，按时间顺序 */
  messages: ChatMessage[]
}

export const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

export function useChatSessionContext(): ChatSessionContextValue {
  const value = useContext(ChatSessionContext)
  if (!value) {
    throw new Error('useChatSessionContext 必须在 ChatSessionProvider 内部使用')
  }
  return value
}

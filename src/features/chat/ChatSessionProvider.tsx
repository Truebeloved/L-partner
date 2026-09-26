import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { ChatSessionContext } from '@/features/chat/context'
import type { ChatSessionContextValue } from '@/features/chat/context'
import { useActiveConversation, useChatSession } from '@/features/chat/useChatSession'

/**
 * 会话宿主。
 *
 * 挂在路由之外（见 App.tsx），因为「学伴输入条」在一级界面的外壳里、
 * 在二级界面的页面里都各出现一次，而它们必须共用同一场对话。
 */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const session = useChatSession()
  const conversation = useActiveConversation()

  const value = useMemo<ChatSessionContextValue>(
    () => ({ ...session, conversation, messages: conversation?.messages ?? [] }),
    [session, conversation],
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

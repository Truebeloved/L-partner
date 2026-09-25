import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { extractMemories, EXTRACTION_INTERVAL } from '@/features/memory/extract'
import { retrieveMemories } from '@/features/memory/retrieve'
import { createProvider } from '@/lib/llm'
import { buildSystemPrompt } from '@/lib/llm/prompts'
import { LlmError } from '@/lib/llm/types'
import type { LlmMessage } from '@/lib/llm/types'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import { todayKey } from '@/lib/date'

/** 送入模型的历史消息条数上限。更早的内容靠会话摘要承载 */
const HISTORY_WINDOW = 12

export interface ChatSession {
  streaming: boolean
  error: { message: string; hint?: string } | null
  /** 本轮回答实际带上了几条记忆 —— 在界面上如实展示，让「记忆」不是黑盒 */
  usedMemoryCount: number
  send: (text: string) => Promise<void>
  stop: () => void
  rememberNow: () => Promise<number>
}

/**
 * 对话会话逻辑。
 *
 * 一次 send 做四件事：检索记忆 → 组装 system prompt → 流式请求 → 按策略抽取新记忆。
 * 抽出来单独放，是为了让 ChatPage 只关心渲染。
 */
export function useChatSession(): ChatSession {
  const settings = useSettingsStore((state) => state.settings)
  const conversationId = useChatStore((state) => state.activeId)

  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<ChatSession['error']>(null)
  const [usedMemoryCount, setUsedMemoryCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // 卸载时中断在途请求，避免往已卸载的 store 里写状态
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!settings.llm.baseUrl || !settings.llm.apiKey || !settings.llm.model) {
        setError({
          message: '还没有配置大模型 API',
          hint: '到「设置」里填入 API 地址、模型名称和密钥后即可开始对话。',
        })
        return
      }

      setError(null)

      const chat = useChatStore.getState()
      // 没有会话就现开一个，用的是当前选中的角色
      const targetId = chat.activeId ?? chat.create(settings.activePersonaId)

      const before = useChatStore.getState().getById(targetId)
      const history = before?.messages ?? []

      chat.appendMessage(targetId, { role: 'user', content: trimmed })
      const assistantMessageId = useChatStore
        .getState()
        .appendMessage(targetId, { role: 'assistant', content: '' })

      // ---- 组装上下文 ----
      const persona =
        usePersonaStore.getState().getById(settings.activePersonaId) ??
        usePersonaStore.getState().personas[0]

      if (!persona) {
        setError({ message: '找不到可用的角色，请到「角色」页创建一个' })
        return
      }

      const courseId = before?.courseId
      const course = courseId ? useCourseStore.getState().getById(courseId) : undefined
      const plan = courseId ? usePlanStore.getState().getByCourse(courseId) : undefined
      // 只带未完成的今日任务 —— 已完成的没有信息量，还会白占 context
      const todayTodos = useTodoStore
        .getState()
        .todos.filter((todo) => todo.date === todayKey() && !todo.done)

      const query = [
        ...history.filter((message) => message.role === 'user').slice(-4),
        { content: trimmed },
      ]
        .map((message) => message.content)
        .join(' ')

      const memories = retrieveMemories({
        entries: useMemoryStore.getState().entries,
        courseId,
        query,
        limit: 8,
      })
      setUsedMemoryCount(memories.length)
      // 记录「被使用过」，这是记忆演化（常用加权 / 长期不用降权）的数据来源
      useMemoryStore.getState().touch(memories.map((memory) => memory.id))

      const system = buildSystemPrompt({ persona, course, plan, todayTodos, memories })

      const llmMessages: LlmMessage[] = [
        { role: 'system', content: system },
        ...(before?.summary
          ? [{ role: 'system' as const, content: `之前对话的摘要：\n${before.summary}` }]
          : []),
        ...history.slice(-HISTORY_WINDOW).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: 'user', content: trimmed },
      ]

      // ---- 流式请求 ----
      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)

      let accumulated = ''
      try {
        const provider = createProvider(settings.llm)
        await provider.chat(llmMessages, {
          signal: controller.signal,
          onDelta: (delta) => {
            accumulated += delta
            useChatStore
              .getState()
              .updateMessage(targetId, assistantMessageId, { content: accumulated })
          },
        })
      } catch (caught) {
        const isAbort = caught instanceof LlmError && caught.code === 'aborted'
        const message = isAbort
          ? accumulated || '（已停止生成）'
          : caught instanceof LlmError
            ? caught.message
            : String(caught)

        useChatStore.getState().updateMessage(targetId, assistantMessageId, {
          content: message,
          failed: !isAbort,
        })

        if (!isAbort) {
          setError({
            message,
            hint: caught instanceof LlmError ? caught.hint : undefined,
          })
        }
      } finally {
        abortRef.current = null
        setStreaming(false)
      }

      // ---- 按策略抽取记忆 ----
      // 放在 finally 之后：即使这轮失败也不影响后续；抽取本身失败也只是静默跳过
      const after = useChatStore.getState().getById(targetId)
      if (
        after &&
        settings.autoExtractMemory &&
        after.messages.length % EXTRACTION_INTERVAL === 0
      ) {
        void extractMemories({
          provider: createProvider(settings.llm),
          messages: after.messages,
          courseId: after.courseId,
          conversationId: after.id,
        })
      }
    },
    [settings],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** 手动「记住这个」：不等到轮次阈值，立刻抽一次 */
  const rememberNow = useCallback(async (): Promise<number> => {
    if (!conversationId) return 0
    const conversation = useChatStore.getState().getById(conversationId)
    if (!conversation || conversation.messages.length === 0) return 0
    if (!settings.llm.baseUrl || !settings.llm.apiKey) return 0

    return extractMemories({
      provider: createProvider(settings.llm),
      messages: conversation.messages,
      courseId: conversation.courseId,
      conversationId: conversation.id,
    })
  }, [conversationId, settings.llm])

  return useMemo(
    () => ({ streaming, error, usedMemoryCount, send, stop, rememberNow }),
    [streaming, error, usedMemoryCount, send, stop, rememberNow],
  )
}

/** 便捷读取：当前会话对象 */
export function useActiveConversation() {
  const activeId = useChatStore((state) => state.activeId)
  const conversations = useChatStore((state) => state.conversations)
  return useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId],
  )
}

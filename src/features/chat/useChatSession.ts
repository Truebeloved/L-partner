import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { extractMemories, EXTRACTION_INTERVAL } from '@/features/memory/extract'
import { retrieveMemories } from '@/features/memory/retrieve'
import { createProvider } from '@/lib/llm'
import { assembleMessages, clampText, estimateMessagesTokens } from '@/lib/llm/context'
import { buildStablePrompt, buildVolatilePrompt } from '@/lib/llm/prompts'
import { LlmError } from '@/lib/llm/types'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import { todayKey } from '@/lib/date'

export interface ChatSession {
  streaming: boolean
  error: { message: string; hint?: string } | null
  /** 本轮回答实际带上了几条记忆 —— 在界面上如实展示，让「记忆」不是黑盒 */
  usedMemoryCount: number
  /** 本轮请求的上下文估算 token 数 —— 让"花了多少"可见，而不是月底看账单 */
  contextTokens: number
  send: (text: string) => Promise<void>
  stop: () => void
  rememberNow: () => Promise<number>
}

/**
 * 对话会话逻辑。
 *
 * 一次 send 做四件事：检索记忆 → 组装上下文（省流）→ 流式请求 → 按策略抽取新记忆。
 * 抽出来单独放，是为了让 ChatPage 只关心渲染。
 */
export function useChatSession(): ChatSession {
  const settings = useSettingsStore((state) => state.settings)
  const conversationId = useChatStore((state) => state.activeId)

  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<ChatSession['error']>(null)
  const [usedMemoryCount, setUsedMemoryCount] = useState(0)
  const [contextTokens, setContextTokens] = useState(0)
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

      // 省流模式下少带几条记忆、每条也短一些 —— 记忆是"辅助"，不该喧宾夺主
      const efficient = settings.efficientMode
      const memories = retrieveMemories({
        entries: useMemoryStore.getState().entries,
        courseId,
        query,
        limit: efficient ? 5 : 8,
      })
      setUsedMemoryCount(memories.length)
      // 记录「被使用过」，这是记忆演化（常用加权 / 长期不用降权）的数据来源
      useMemoryStore.getState().touch(memories.map((memory) => memory.id))

      const promptContext = {
        persona,
        course,
        plan,
        todayTodos,
        memories: efficient
          ? memories.map((memory) => ({
              ...memory,
              content: clampText(memory.content, 80),
            }))
          : memories,
        efficient,
      }

      /*
       * 组装消息：稳定前缀（人设 + 准则）在最前，易变部分（课程进度、今日安排、记忆）其后。
       * 顺序决定缓存能否命中，见 lib/llm/context.ts 的说明。
       */
      const llmMessages = assembleMessages({
        systemStable: buildStablePrompt(persona),
        systemVolatile: buildVolatilePrompt(promptContext),
        summary: before?.summary,
        history,
        question: trimmed,
        efficient,
      })
      setContextTokens(estimateMessagesTokens(llmMessages))

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
    () => ({ streaming, error, usedMemoryCount, contextTokens, send, stop, rememberNow }),
    [streaming, error, usedMemoryCount, contextTokens, send, stop, rememberNow],
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

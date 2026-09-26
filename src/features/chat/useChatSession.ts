import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  extractMemories,
  EXTRACTION_INTERVAL,
  planSummary,
  summarizeConversation,
} from '@/features/memory/extract'
import { detectIntent, isAgentCommand, isExplicitTodoCommand } from '@/features/today/intent'
import type { PendingAction } from '@/features/agent/execute'
import { looksLikeFollowUp, matchCourseForMessage } from '@/features/chat/routing'
import { retrieveMemories } from '@/features/memory/retrieve'
import { createProvider } from '@/lib/llm'
import { assembleMessages, clampText, estimateMessagesTokens } from '@/lib/llm/context'
import { buildStablePrompt, buildVolatilePrompt } from '@/lib/llm/prompts'
import { replyPolicyFor } from '@/lib/llm/reply-policy'
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
  /**
   * 学伴刚刚替你做掉的事，一句话一条（含"没做成"的原因）。
   *
   * 抽取是后台跑的，不把结果说出来，用户就只会看到"我说了要办，界面什么都没发生" ——
   * 而这个应用里"它真的办了"恰恰是最需要被看见的一件事。
   */
  receipts: string[]
  /** 不可撤销、等用户点头的动作。它们**不会**被自动执行 */
  pendingActions: PendingAction[]
  /** 确认并执行一条待确认动作；执行后的回执会补进 receipts */
  confirmPendingAction: (id: string) => void
  dismissPendingAction: (id: string) => void
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
  const [receipts, setReceipts] = useState<string[]>([])
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const abortRef = useRef<AbortController | null>(null)
  /** 回执的退场计时器 —— 它是一次性提示，不该永久占着位置 */
  const noticeTimerRef = useRef<number | null>(null)

  // 卸载时中断在途请求，避免往已卸载的 store 里写状态
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const scheduleReceiptClear = useCallback(() => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    /*
     * 回执**只**靠这个计时器退场，界面上没有"知道了"按钮 ——
     * 用户要的是"看一眼就知道它办了事"，而不是每次都被要求点一下。
     * 3 秒（用户指定的时长）：他关心的只是"到底办没办"，一句话看完就走，
     * 停留更久就变成占地方了。
     *
     * ⚠️ 待确认的动作（删课程/删计划/清空待办）**不**跟着一起消失：那是一句问话，
     * 得等用户回答，自动消失等于默默替他做了决定。
     */
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null
      setReceipts([])
    }, 3000)
  }, [])

  const dismissPendingAction = useCallback((id: string) => {
    setPendingActions((list) => list.filter((action) => action.id !== id))
  }, [])

  const confirmPendingAction = useCallback(
    (id: string) => {
      const action = pendingActions.find((item) => item.id === id)
      if (!action || action.kind !== 'destructive') return

      /*
       * 闭包在生成动作时就已经把目标解析成了 id，所以这里不会再"重新认一遍是哪门课"——
       * 用户点的是他刚看到的那句话，执行的就必须是那一刻的对象。
       */
      const receipt = action.run()
      setPendingActions((list) => list.filter((item) => item.id !== id))
      setReceipts((list) => [...list, receipt])
      scheduleReceiptClear()
    },
    [pendingActions, scheduleReceiptClear],
  )

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
      const courses = useCourseStore.getState().courses
      const active = chat.activeId ? chat.getById(chat.activeId) : undefined

      /*
       * ---- 自动分类 ----
       *
       * 用户定的口径：与课程内容有关 → 进那门课的对话；无关 → 进主对话。
       *
       * 三种落点：
       * 1. 认出某门课 → 那门课的对话；
       * 2. 认不出，但这句话明显是在**接着上一轮说**（"再讲一遍""为什么"）→ 留在原地，
       *    否则一段连贯的课程讨论会被拆成两半；
       * 3. 其余（"说说你的经历""我今天很累"这种自成一体的闲话）→ 主对话。
       *
       * 第 3 条是这一版的修正：原来一律"认不出就留在当前这一场"，
       * 于是用户在课程对话里问一句"说说你的经历"，这句无关的话却被归进了那门课。
       */
      const match = matchCourseForMessage(trimmed, courses)
      const staysInPlace = !match && active?.courseId && looksLikeFollowUp(trimmed)
      const targetCourseId = match?.courseId ?? (staysInPlace ? active?.courseId : undefined)
      const targetCourse = targetCourseId
        ? courses.find((course) => course.id === targetCourseId)
        : undefined

      const targetId = chat.ensureConversation({
        personaId: settings.activePersonaId,
        courseId: targetCourseId,
        title: targetCourse?.title,
      })
      if (chat.activeId !== targetId) chat.setActive(targetId)

      const before = useChatStore.getState().getById(targetId)
      const history = before?.messages ?? []

      /*
       * 会话上记的角色要跟这一轮真正用的角色对齐。
       * 角色可能在别处被改过（学伴设定页），而不只是在这页的下拉框里 ——
       * 对齐的同时会把"还没署名"的历史回答按旧角色补上署名（见 store 的 setPersona）。
       */
      if (before && before.personaId !== settings.activePersonaId) {
        chat.setPersona(targetId, settings.activePersonaId)
      }

      chat.appendMessage(targetId, { role: 'user', content: trimmed })
      const assistantMessageId = useChatStore
        .getState()
        .appendMessage(targetId, {
          role: 'assistant',
          content: '',
          // 逐条记住是谁在回答：中途换角色时，历史不能跟着改
          personaId: settings.activePersonaId,
        })

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

      /*
       * 记忆注入改成按**字符预算**取，不再只给 5 条。
       *
       * 之前省流模式只带 5 条记忆（宽松 8 条），对于"它记得我"这件事来说太薄了：
       * 一条记忆往往只有一句话，5 句话装不下一个人。现在按相关度排序、
       * 装满预算为止 —— 短句记忆能进去几十条，而总长度仍然可控（不会失控烧 token）。
       */
      const efficient = settings.efficientMode
      const memories = retrieveMemories({
        entries: useMemoryStore.getState().entries,
        courseId,
        query,
        maxChars: efficient ? 2600 : 6000,
        limit: efficient ? 30 : 60,
      })
      setUsedMemoryCount(memories.length)
      // 记录「被使用过」，这是记忆演化（常用加权 / 长期不用降权）的数据来源
      useMemoryStore.getState().touch(memories.map((memory) => memory.id))

      const promptContext = {
        persona,
        course,
        plan,
        todayTodos,
        // 单条记忆不再砍到 80 字：长记忆往往正是"有细节的那条"，砍了就等于没记
        memories: efficient
          ? memories.map((memory) => ({ ...memory, content: clampText(memory.content, 160) }))
          : memories,
        efficient,
      }

      /*
       * 动态回复策略：先看他这句话是打招呼、小问题、要解释，还是明确要展开，
       * 再把对应的长度策略追加到本轮的易变部分。
       *
       * 放在易变部分而不是稳定前缀里，是因为它**每轮都不一样** ——
       * 塞进前缀等于每轮都让厂商的上下文缓存失效，省下的那点输出 token 还不够赔。
       */
      const policy = replyPolicyFor(trimmed, settings.llm.maxTokens)

      /*
       * 组装消息：稳定前缀（人设 + 准则）在最前，易变部分（课程进度、今日安排、记忆、
       * 本轮长度策略）其后。顺序决定缓存能否命中，见 lib/llm/context.ts 的说明。
       */
      const llmMessages = assembleMessages({
        systemStable: buildStablePrompt(persona),
        systemVolatile: `${buildVolatilePrompt(promptContext)}\n\n## 这一轮怎么回\n${policy.instruction}`,
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
          // 这一轮的长度上限由策略给出：寒暄不会写成一篇，明确要展开的也不会被卡住
          maxTokens: policy.maxTokens,
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
      if (!after) return

      /*
       * 触发条件有三条，而且都指向同一件事 —— **别让用户觉得"我说了它没记住"**：
       *
       * 1. **他明确开口了**（"帮我记一下周五交报告""把周三那条挪到周五"）：一定抽。
       *    而且**不受「自动抽取记忆」开关约束** —— 那个开关的语义是"别偷偷替我记"，
       *    不是"我让你记你也别记"。关掉它却因此连明确指令都失效，是上一版的漏洞。
       *    指挥类的话（isAgentCommand）同理：那是让我去改数据，等不得。
       * 2. **这一句里有要做的事**（本地规则判定，零成本）：立刻抽一次。
       *    原来只有周期触发（每 8 条消息），于是"我今天想把第一章看完"这种话
       *    说完什么都不发生，用户得再聊三四个来回才可能见到待办 ——
       *    他报的正是这个："只会分析出待办任务但不会添加到待办区域"。
       * 3. **攒够了一个周期**：兜底那些不像"要做的事"、但其实值得记的对话。
       */
      const explicit = isExplicitTodoCommand(trimmed) || isAgentCommand(trimmed)
      const eager = detectIntent(trimmed)
      const periodic = after.messages.length % EXTRACTION_INTERVAL === 0

      if ((settings.autoExtractMemory || explicit) && (eager || periodic)) {
        /*
         * 只发**还没抽过的那一批**。
         *
         * 原来每一轮都取"最近 24 条"，于是同一句话会被反复抽取：待办靠"同天同名去重"
         * 侥幸没翻倍，而**动作没有第二道防线** —— 用户说了一句"我想学编曲"，
         * 之后每抽一次就再弹一遍"要按『我想学编曲』新建课程吗"。用户报的
         * "这个弹窗不需要反复弹出"就是这个。顺带这里也是省 token 的一处：
         * 重叠窗口意味着同一段对话平均要被发三遍。
         */
        const pending = after.messages.slice(after.extractUpTo ?? 0)
        const totalAtCall = after.messages.length

        void extractMemories({
          provider: createProvider(settings.llm),
          messages: pending,
          courseId: after.courseId,
          conversationId: after.id,
          /*
           * 告诉他"这一轮是用户在指挥我办事"。抽取层据此在**没产出任何动作**时
           * 打一条诊断日志（含模型原始输出）—— 这一条是踩过坑才加的：
           * 当时的表现是"我说了删那条待办，它毫无反应"，而根因在提示词里
           * （清单只给最旧的 20 条 + "抄不出来就别发"），从界面上完全看不出来。
           */
          expectAction: explicit,
        }).then((outcome) => {
          // 跑成了才记账：失败还推进的话，这一批消息就永远不会再被处理
          if (outcome.ok) {
            useChatStore.getState().setExtractUpTo(after.id, totalAtCall)
          }
          // 新增待办先合成一条自己的回执，再拼上动作的回执 ——
          // 界面上看到的是"它办了哪些事"的一份完整清单
          const lines = [
            ...(outcome.todos.length > 0
              ? [`已加入待办：${outcome.todos.map((todo) => todo.title).join('、')}`]
              : []),
            ...outcome.receipts,
          ]

          if (lines.length > 0) {
            setReceipts(lines)
            scheduleReceiptClear()
          }
          if (outcome.pending.length > 0) {
            // 追加而不是覆盖：上一轮还没回答的问题不该被这一轮挤掉
            setPendingActions((list) => [...list, ...outcome.pending])
          }
        })
      }

      /*
       * ---- 滚动更新会话摘要 ----
       *
       * 这一步是"超长记忆"的关键：注入的历史只有 4000 字符（最近几个来回），
       * 再往前的对话如果不压进摘要，就是**真的丢了**，用户会觉得"它怎么不记得我们聊过"。
       *
       * 它同时也是一次额外的模型调用（每 12 条消息一次、输出上限 512），
       * 所以跟着「自动抽取记忆」这个开关一起走 —— 用户关掉自动抽取时，
       * 不该有另一个后台调用偷偷花钱。
       */
      if (settings.autoExtractMemory) {
        const plan = planSummary({
          messageCount: after.messages.length,
          summaryUpTo: after.summaryUpTo ?? 0,
        })
        if (plan.needed) {
          void summarizeConversation({
            provider: createProvider(settings.llm),
            previousSummary: after.summary,
            // 只把"即将滑出注入窗口"的那一段交给它，已经摘要过的不重复送
            messages: after.messages.slice(after.summaryUpTo ?? 0, plan.upTo),
          }).then((summary) => {
            if (!summary) return
            useChatStore.getState().setSummary(after.id, summary, plan.upTo)
          })
        }
      }
    },
    [settings, scheduleReceiptClear],
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

    // 与自动抽取同一套增量口径：不重复处理已经抽过的消息（也就不会重放旧动作）
    const pending = conversation.messages.slice(conversation.extractUpTo ?? 0)
    if (pending.length === 0) return 0

    // 这里只关心"新记住了多少条"，顺手落下的待办由页面的待办栏自己体现
    const outcome = await extractMemories({
      provider: createProvider(settings.llm),
      messages: pending,
      courseId: conversation.courseId,
      conversationId: conversation.id,
      expectAction: true,
    })

    if (outcome.ok) {
      useChatStore.getState().setExtractUpTo(conversation.id, conversation.messages.length)
    }
    return outcome.memories
  }, [conversationId, settings.llm])

  return useMemo(
    () => ({
      streaming,
      error,
      usedMemoryCount,
      contextTokens,
      receipts,
      pendingActions,
      confirmPendingAction,
      dismissPendingAction,
      send,
      stop,
      rememberNow,
    }),
    [
      streaming,
      error,
      usedMemoryCount,
      contextTokens,
      receipts,
      pendingActions,
      confirmPendingAction,
      dismissPendingAction,
      send,
      stop,
      rememberNow,
    ],
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

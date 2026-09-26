import type { LlmMessage } from '@/lib/llm/types'
import type { ChatMessage } from '@/types/models'

/**
 * 上下文的组装与预算控制 —— 省流模式的核心。
 *
 * 为什么要单独一个模块：token 花在哪儿，只有把"发出去的那串消息"当成一个整体来管理才看得清。
 * 之前是各处各拼一段（历史 12 条 + 记忆 8 条 + 课程整棵大纲），每一处都觉得自己很克制，
 * 合起来却是每轮几千 token —— 而且**条数根本不等于长度**：12 条很短的历史可能只有 400 token，
 * 而一条长回答就顶 2000 token。所以这里统一按"预算"来装，而不是按"条数"。
 *
 * 另一个同样重要的点：**稳定前缀**。厂商（DeepSeek / Moonshot 等）对命中的上下文缓存
 * 只收 1/10 的价格，而缓存是按前缀匹配的 —— 只要把固定不变的部分（人设、准则）放在最前面、
 * 易变的部分（课程进度、待办、记忆）放在后面，同一段人设就能在整场对话里反复命中缓存。
 * 反过来放，等于每轮都为同一段文字付全价。
 */

/** 粗略的中文 token 估算：一个汉字 ≈ 1 token，4 个其他字符 ≈ 1 token。只用于预算与展示 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length
  const rest = text.length - cjk
  return Math.ceil(cjk + rest / 4)
}

export function estimateMessagesTokens(messages: LlmMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0)
}

/** 给人看的 token 数：850 / 1.2k / 12k。精确到个位没有意义，估算本身就有误差 */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  const thousands = count / 1000
  return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`
}

export interface HistoryBudget {
  /** 整段历史的字符预算（不是 token —— 字符更直观，也便于给单条设上限） */
  maxChars: number
  /** 较早消息的单条字符上限 */
  perMessageChars: number
  /**
   * 最后一条助手消息的字符上限。
   *
   * 刻意比其它消息宽松得多：用户追问「刚才第三点再展开讲讲」时，
   * 被截断的恰恰是最需要完整保留的那条回答。省流不能省掉回答质量。
   */
  lastAssistantChars: number
}

export const DEFAULT_HISTORY_BUDGET: HistoryBudget = {
  maxChars: 4000,
  perMessageChars: 400,
  lastAssistantChars: 2400,
}

/** 不省流时的预算：几乎等于"全都带上"，保留这个常量是为了让两档行为有明确对照 */
export const ROOMY_HISTORY_BUDGET: HistoryBudget = {
  maxChars: 12000,
  perMessageChars: 2000,
  lastAssistantChars: 8000,
}

/**
 * 按预算从最近往回装历史消息。
 *
 * 三条规则：
 * 1. 从最新往回装，装不下为止 —— 越近的对话越重要；
 * 2. 单条太长就截断（保留开头 + 结尾提示），**不整条丢掉** ——
 *    丢掉一条会让模型以为那轮对话没发生过，比截断更容易答歪；
 * 3. 最新的那条助手回答放宽上限，见 HistoryBudget.lastAssistantChars。
 */
export function trimHistory(
  messages: ChatMessage[],
  budget: HistoryBudget = DEFAULT_HISTORY_BUDGET,
): LlmMessage[] {
  const picked: LlmMessage[] = []
  let used = 0

  // 从最新往回找第一条助手消息，它享受更宽的上限
  let lastAssistantIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      lastAssistantIndex = index
      break
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue

    const limit =
      index === lastAssistantIndex ? budget.lastAssistantChars : budget.perMessageChars
    const content = clampText(message.content, limit)

    // 至少保证最新一条进得去，否则用户刚说的话会被自己的预算挡在外面
    if (used + content.length > budget.maxChars && picked.length > 0) break

    picked.push({ role: message.role, content })
    used += content.length
  }

  return picked.reverse()
}

/** 超出上限就截断，中间用省略号标出来（保留头部信息 + 尾部结论） */
export function clampText(text: string, limit: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  // 头部多留一些：「回答的结论」常在开头，而结尾往往只是收束语
  const head = Math.floor(limit * 0.7)
  const tail = limit - head
  return `${trimmed.slice(0, head)}…（中间省略）…${trimmed.slice(-tail)}`
}

export interface AssembleOptions {
  /** 稳定前缀：人设 + 准则。放在最前面才能命中厂商的上下文缓存 */
  systemStable: string
  /** 易变部分：课程进度、今日安排、相关记忆。放在稳定前缀之后 */
  systemVolatile?: string
  /** 会话摘要（比逐条历史便宜，且不受窗口限制） */
  summary?: string
  history: ChatMessage[]
  /** 用户这一轮说的话 */
  question: string
  efficient: boolean
}

/**
 * 组装一次请求的全部消息。
 *
 * 顺序即成本：`[稳定人设] → [摘要] → [历史] → [当前问题]`，
 * 易变的课程/待办/记忆跟在稳定人设后面、作为第二条 system 消息 ——
 * 这样缓存能覆盖第一条 system 的绝大部分，而第二条无论如何都会变，放在后面损失最小。
 */
export function assembleMessages(options: AssembleOptions): LlmMessage[] {
  const { systemStable, systemVolatile, summary, history, question, efficient } = options
  const budget = efficient ? DEFAULT_HISTORY_BUDGET : ROOMY_HISTORY_BUDGET

  const messages: LlmMessage[] = [{ role: 'system', content: systemStable }]
  if (systemVolatile && systemVolatile.trim() !== '') {
    messages.push({ role: 'system', content: systemVolatile })
  }
  if (summary) {
    messages.push({ role: 'system', content: `之前对话的摘要：\n${summary}` })
  }

  messages.push(...trimHistory(history, budget))
  messages.push({ role: 'user', content: question })

  return messages
}

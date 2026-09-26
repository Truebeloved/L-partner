import type { ChatMessage } from '@/types/models'

/**
 * 一次「问答对」—— 输入条翻历史时的最小单位。
 *
 * 为什么按对而不是按条：输入条上的滚轮交互是「上一条 / 下一条对话」，
 * 用户脑子里的单位就是"我刚才问的那个问题 + 它怎么答的"，
 * 而不是两条孤立的聊天记录。分成两条会让滚轮翻一半。
 */
export interface Exchange {
  /** 用提问消息的 id 做键：它天然唯一，且不会随流式更新而变化 */
  id: string
  question: string
  answer: string
  at: string
}

/**
 * 把消息列表切成问答对。
 *
 * 规则：
 * - 一条 user 后面跟着的 assistant 就是它的答案；没有答案（正在生成 / 失败）时 answer 为空串；
 * - 连续多条 user（用户连发）分别成为独立的对，避免把两句提问糊成一句；
 * - assistant 的连续多条（分片）合并进同一对。
 *
 * 纯函数，不读 store —— 输入条的状态机要靠它做单元测试。
 */
export function toExchanges(messages: ChatMessage[]): Exchange[] {
  const exchanges: Exchange[] = []
  let current: Exchange | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      current = { id: message.id, question: message.content, answer: '', at: message.createdAt }
      exchanges.push(current)
      continue
    }

    if (!current) {
      // 开场就有一条助手消息（例如课程页自动生成的问候）：也算一对，只是没有问题
      current = { id: message.id, question: '', answer: message.content, at: message.createdAt }
      exchanges.push(current)
      continue
    }

    current.answer = current.answer ? `${current.answer}\n${message.content}` : message.content
  }

  return exchanges
}

/**
 * 滚轮翻历史：把下标往指定方向挪一格。
 *
 * 返回 null 表示"没有可翻的"或"已经到头"——调用方据此决定要不要拦掉页面滚动：
 * 翻不动的时候还拦着用户滚动，会让人以为页面卡住了。
 */
export function stepExchange(
  index: number | null,
  total: number,
  direction: 'up' | 'down',
): number | null {
  if (total === 0) return null

  // null = 停在最新一条
  const current = index ?? total - 1
  const next = direction === 'up' ? current - 1 : current + 1

  if (next < 0 || next > total - 1) return null
  return next
}

/** 缩略：把一段可能很长的文本压成一行，供收起态与翻历史时显示 */
export function ellipsize(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit)}…`
}

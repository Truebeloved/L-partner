import { describe, expect, it } from 'vitest'

import {
  assembleMessages,
  clampText,
  DEFAULT_HISTORY_BUDGET,
  estimateMessagesTokens,
  estimateTokens,
  formatTokens,
  trimHistory,
} from '@/lib/llm/context'
import type { ChatMessage } from '@/types/models'

/** 造一条消息。id/createdAt 与预算无关，给固定值即可 */
function message(role: ChatMessage['role'], content: string, index: number): ChatMessage {
  return { id: `m${index}`, role, content, createdAt: '2026-09-26T10:00:00.000Z' }
}

describe('estimateTokens', () => {
  it('中文按一个字一个 token 估', () => {
    expect(estimateTokens('今天学什么')).toBe(5)
  })

  it('英文按四个字符一个 token 估', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('空字符串是 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('中英混排分别计算', () => {
    // 2 个汉字 + 5 个字母（5 字符 ≈ 1.25 → 进位 2）= 4
    expect(estimateTokens('学习react')).toBe(4)
  })
})

describe('formatTokens', () => {
  it('一千以内直接显示数字', () => {
    expect(formatTokens(850)).toBe('850')
  })

  it('一千以上用 k，避免标签宽度乱跳', () => {
    expect(formatTokens(1200)).toBe('1.2k')
    expect(formatTokens(12345)).toBe('12k')
  })
})

describe('clampText', () => {
  it('没超长就原样返回（只去首尾空白）', () => {
    expect(clampText('  短文本  ', 100)).toBe('短文本')
  })

  it('超长时保留头尾并标出省略', () => {
    const text = 'A'.repeat(100)
    const clamped = clampText(text, 20)
    expect(clamped).toContain('（中间省略）')
    // 20 = 头 14 + 尾 6，加上省略标记本身
    expect(clamped.startsWith('A'.repeat(14))).toBe(true)
    expect(clamped.endsWith('A'.repeat(6))).toBe(true)
  })
})

describe('trimHistory', () => {
  it('装不下的老消息被丢掉，最近的一定在', () => {
    const messages = Array.from({ length: 20 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', '内'.repeat(100), index),
    )
    const kept = trimHistory(messages, { ...DEFAULT_HISTORY_BUDGET, maxChars: 600 })
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(messages.length)
    // 最后一条必须在
    expect(kept[kept.length - 1]?.content).toContain('内')
  })

  it('单条太长就截断，而不是整条丢掉', () => {
    const messages = [
      message('user', '早'.repeat(2000), 0),
      message('assistant', '晚'.repeat(2000), 1),
      message('user', '现在的问题', 2),
    ]
    const kept = trimHistory(messages, DEFAULT_HISTORY_BUDGET)
    // 三条都在（前两条被截断），这样模型不会以为那两轮没发生过
    expect(kept).toHaveLength(3)
    expect(kept[0]?.content).toContain('（中间省略）')
  })

  /*
   * 这条是"省流不能省掉回答质量"的守门测试。
   * 用户追问「刚才第三点再展开讲讲」时，被截断的恰恰是最该完整保留的那条回答。
   */
  it('最新的那条助手回答享受更宽的上限', () => {
    const long = '答'.repeat(1000)
    const messages = [
      message('assistant', long, 0),
      message('user', '继续', 1),
      message('assistant', long, 2),
    ]
    const kept = trimHistory(messages, { ...DEFAULT_HISTORY_BUDGET, maxChars: 4000 })

    // 较早的那条被压到 perMessageChars，最新的那条保留了更多
    expect(kept[0]?.content.length).toBeLessThan(kept[2]?.content.length ?? 0)
    expect(kept[2]?.content.length).toBeGreaterThan(DEFAULT_HISTORY_BUDGET.perMessageChars)
  })

  it('即使预算很小，用户刚说的话也要能进去', () => {
    const messages = [message('user', '刚说的一句话', 0)]
    const kept = trimHistory(messages, { ...DEFAULT_HISTORY_BUDGET, maxChars: 1 })
    expect(kept).toHaveLength(1)
  })
})

describe('assembleMessages', () => {
  const base = {
    systemStable: '## 你是谁\n名字：学姐',
    systemVolatile: '## 现在\n今天是 2026年9月26日',
    history: [message('user', '第一个问题', 0), message('assistant', '第一个回答', 1)],
    question: '第二个问题',
    efficient: true,
  }

  it('顺序是「稳定人设 → 易变信息 → 摘要 → 历史 → 当前问题」', () => {
    const messages = assembleMessages({ ...base, summary: '之前聊过 A' })

    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('名字：学姐')
    expect(messages[1]?.content).toContain('今天是')
    expect(messages[2]?.content).toContain('之前聊过 A')
    expect(messages[messages.length - 1]?.content).toBe('第二个问题')
  })

  /*
   * 前缀缓存是省流里最值钱的一条：厂商按**前缀**匹配缓存，命中只收 1/10 价格。
   * 所以第一条 system 消息必须逐字节稳定 —— 一旦把日期、进度塞进去，缓存永远命中不了。
   */
  it('第一条 system 消息只包含稳定内容，不含日期与记忆', () => {
    const messages = assembleMessages(base)
    const stable = messages[0]?.content ?? ''
    expect(stable).not.toContain('今天是')
    expect(stable).not.toContain('记忆')
  })

  it('没有易变内容时不塞空的 system 消息', () => {
    const messages = assembleMessages({ ...base, systemVolatile: '   ', summary: undefined })
    expect(messages.filter((item) => item.role === 'system')).toHaveLength(1)
  })

  it('省流模式下的上下文明显小于不省流', () => {
    const history = Array.from({ length: 24 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', '内容'.repeat(200), index),
    )
    const tight = estimateMessagesTokens(assembleMessages({ ...base, history, efficient: true }))
    const roomy = estimateMessagesTokens(assembleMessages({ ...base, history, efficient: false }))
    expect(tight).toBeLessThan(roomy)
  })
})

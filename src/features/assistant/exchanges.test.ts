import { describe, expect, it } from 'vitest'

import { ellipsize, stepExchange, toExchanges } from '@/features/assistant/exchanges'
import type { ChatMessage } from '@/types/models'

function message(role: ChatMessage['role'], content: string, index: number): ChatMessage {
  return { id: `m${index}`, role, content, createdAt: '2026-09-26T10:00:00.000Z' }
}

describe('toExchanges', () => {
  it('一问一答配成一对', () => {
    const pairs = toExchanges([
      message('user', '什么是闭包', 0),
      message('assistant', '闭包是……', 1),
      message('user', '再举个例子', 2),
      message('assistant', '比如……', 3),
    ])

    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ question: '什么是闭包', answer: '闭包是……' })
    expect(pairs[1]).toMatchObject({ question: '再举个例子', answer: '比如……' })
  })

  it('正在生成时答案为空串，不会丢掉这一对', () => {
    const pairs = toExchanges([message('user', '在吗', 0), message('assistant', '', 1)])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.question).toBe('在吗')
    expect(pairs[0]?.answer).toBe('')
  })

  it('用户连发两条各自成对，不会被糊成一对', () => {
    const pairs = toExchanges([
      message('user', '第一个问题', 0),
      message('user', '第二个问题', 1),
      message('assistant', '一起答', 2),
    ])
    expect(pairs.map((pair) => pair.question)).toEqual(['第一个问题', '第二个问题'])
    // 答案挂在最后一条提问上
    expect(pairs[1]?.answer).toBe('一起答')
  })

  it('开场就有一条助手消息时也算一对', () => {
    const pairs = toExchanges([message('assistant', '今天想学点什么？', 0)])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.question).toBe('')
  })

  it('空列表返回空', () => {
    expect(toExchanges([])).toEqual([])
  })
})

describe('stepExchange', () => {
  it('从最新一条往上翻', () => {
    // null 表示停在最新（下标 2），往上一条是 1
    expect(stepExchange(null, 3, 'up')).toBe(1)
    expect(stepExchange(1, 3, 'up')).toBe(0)
  })

  it('翻到头返回 null，调用方据此不拦页面滚动', () => {
    expect(stepExchange(0, 3, 'up')).toBeNull()
    expect(stepExchange(2, 3, 'down')).toBeNull()
    expect(stepExchange(null, 3, 'down')).toBeNull()
  })

  it('没有条目时永远是 null', () => {
    expect(stepExchange(null, 0, 'up')).toBeNull()
    expect(stepExchange(null, 0, 'down')).toBeNull()
  })
})

describe('ellipsize', () => {
  it('短文本原样返回（换行折成空格）', () => {
    expect(ellipsize('你好\n世界', 20)).toBe('你好 世界')
  })

  it('超长截断并补省略号', () => {
    expect(ellipsize('一'.repeat(30), 10)).toBe(`${'一'.repeat(10)}…`)
  })
})

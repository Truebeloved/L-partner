import { describe, expect, it } from 'vitest'

import { classifyMessage, replyPolicyFor } from '@/lib/llm/reply-policy'

const CEILING = 2048

describe('classifyMessage', () => {
  /*
   * 这一组是"活人感"的守门测试。
   * 用户的要求很明确：小问题不能长回复，但也不能过于精简 ——
   * 所以策略必须**分类**，而不是给所有输入套同一个长度。
   */
  it('寒暄、应声、情绪都归为 chat', () => {
    for (const text of ['在吗', '你好呀', '早', '谢谢', '好的', '嗯嗯', '哈哈', '今天好累', '学不进去了']) {
      expect(classifyMessage(text), text).toBe('chat')
    }
  })

  it('短小的问题归为 quick', () => {
    for (const text of ['闭包是什么', '这个怎么读', 'useState 呢', '几点了']) {
      expect(classifyMessage(text), text).toBe('quick')
    }
  })

  it('要解释的（但没要求展开的）问题归为 explain', () => {
    for (const text of [
      '我写了两个组件，为什么父组件更新的时候子组件也跟着重渲染了',
      '这两个组件之间传数据，状态应该放在父组件还是子组件里比较合适呢',
    ]) {
      expect(classifyMessage(text), text).toBe('explain')
    }
  })

  it('短促的追问算 deep：他要的是接着说，不是短答了事', () => {
    for (const text of ['为什么？', '然后呢', '继续', '再多讲点']) {
      expect(classifyMessage(text), text).toBe('deep')
    }
  })

  it('明确要求展开的归为 deep', () => {
    for (const text of [
      '详细讲讲闭包',
      '展开说说',
      '一步步教我怎么做',
      '举个例子说明一下',
      '深入讲讲事件循环',
      '这两者的区别是什么',
      '这个的原理是什么',
    ]) {
      expect(classifyMessage(text), text).toBe('deep')
    }
  })

  it('空输入不会崩，按最小的档处理', () => {
    expect(classifyMessage('   ')).toBe('quick')
  })
})

describe('replyPolicyFor', () => {
  it('短答档的 token 上限明显低于展开档', () => {
    const chat = replyPolicyFor('在吗', CEILING)
    const quick = replyPolicyFor('闭包是什么', CEILING)
    const deep = replyPolicyFor('详细讲讲闭包', CEILING)

    expect(chat.maxTokens).toBeLessThan(quick.maxTokens)
    expect(quick.maxTokens).toBeLessThan(deep.maxTokens)
    // 明确要展开时不能被这里卡住 —— 上限就是用户自己设的那个值
    expect(deep.maxTokens).toBe(CEILING)
  })

  it('用户把输出上限调得很低时，所有档都跟着降下来', () => {
    for (const text of ['在吗', '闭包是什么', '我写了两个组件为什么子组件也重渲染', '详细讲讲']) {
      expect(replyPolicyFor(text, 256).maxTokens).toBeLessThanOrEqual(256)
    }
  })

  it('每一档都给出一句可执行的长度策略', () => {
    const kinds = ['在吗', '闭包是什么', '我写了两个组件为什么子组件也重渲染', '详细讲讲']
    for (const text of kinds) {
      const policy = replyPolicyFor(text, CEILING)
      expect(policy.instruction.length).toBeGreaterThan(10)
    }
  })

  it('chat 档明确要求不要趁机开讲', () => {
    expect(replyPolicyFor('今天好累', CEILING).instruction).toContain('不要顺势开讲')
  })
})

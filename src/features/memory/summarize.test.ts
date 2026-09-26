import { describe, expect, it } from 'vitest'

import { planSummary, SUMMARY_EVERY, SUMMARY_KEEP_RECENT } from '@/features/memory/extract'

/**
 * 「超长记忆」的守门测试。
 *
 * 这段边界最容易写错，而写错的表现是"聊了很久却什么都没记住" ——
 * 界面上完全看不出来，只有用户会隐约觉得"它忘了"。所以把三个边界钉死：
 * 够不够、覆盖到哪、有没有新内容。
 */
describe('planSummary', () => {
  it('刚开聊时不摘要：没什么可压的', () => {
    expect(planSummary({ messageCount: 4, summaryUpTo: 0 }).needed).toBe(false)
  })

  it('积累够一轮（12 条）才摘要，且留最近几条以原文保留', () => {
    const messageCount = SUMMARY_EVERY + SUMMARY_KEEP_RECENT
    const plan = planSummary({ messageCount, summaryUpTo: 0 })

    expect(plan.needed).toBe(true)
    // 覆盖到"总数 - 保留条数"，最近这几条不进摘要
    expect(plan.upTo).toBe(SUMMARY_EVERY)
  })

  it('覆盖范围永不后退 —— 否则摘要会重复吃进同一段对话', () => {
    const plan = planSummary({ messageCount: 2, summaryUpTo: 40 })
    expect(plan.needed).toBe(false)
    expect(plan.upTo).toBe(40)
  })

  it('上一次摘要之后新增不足一轮时，先攒着', () => {
    const plan = planSummary({ messageCount: 30, summaryUpTo: 24 })
    expect(plan.needed).toBe(false)
    expect(plan.upTo).toBe(24)
  })

  it('攒够了就继续往下覆盖，且只覆盖新增的那一段', () => {
    // 40 条里覆盖到 34，距上次（24）新增 10 条 —— 还不到一轮，先攒着
    expect(planSummary({ messageCount: 40, summaryUpTo: 24 }).needed).toBe(false)

    // 再多两条就够一轮了
    const plan = planSummary({ messageCount: 44, summaryUpTo: 24 })
    expect(plan.needed).toBe(true)
    expect(plan.upTo).toBe(44 - SUMMARY_KEEP_RECENT)
  })

  it('长对话里反复调用是收敛的：连续两次不会重复摘要同一个区间', () => {
    const first = planSummary({ messageCount: 40, summaryUpTo: 0 })
    expect(first.needed).toBe(true)

    // 摘完之后再用同样的消息数问一次 —— 不该再需要
    const second = planSummary({ messageCount: 40, summaryUpTo: first.upTo })
    expect(second.needed).toBe(false)
  })
})

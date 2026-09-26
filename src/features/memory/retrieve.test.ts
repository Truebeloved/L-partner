import { describe, expect, it } from 'vitest'

import { retrieveMemories, tokenize } from '@/features/memory/retrieve'
import { newId } from '@/lib/id'
import type { MemoryEntry } from '@/types/models'

/** 造一条记忆，测试里用它减少噪音 */
export function makeMemory(
  overrides: Partial<MemoryEntry> & Pick<MemoryEntry, 'content'>,
): MemoryEntry {
  return {
    id: newId(),
    layer: 'fact',
    confidence: 0.8,
    source: 'ai-extract',
    createdAt: '2026-09-01T00:00:00.000Z',
    useCount: 0,
    ...overrides,
  }
}

const NOW = new Date('2026-09-25T12:00:00.000Z')

describe('retrieveMemories 的字符预算', () => {
  /** 造 n 条同样相关度的短记忆 */
  function manyMemories(count: number, content = '他晚上效率更高'): MemoryEntry[] {
    return Array.from({ length: count }, (_, index) =>
      makeMemory({ content: `${content} ${index}` }),
    )
  }

  /*
   * 这一组是「超长记忆」的守门测试。
   * 以前注入是按**条数**卡的（省流模式只有 5 条），一条记忆往往只有一句话，
   * 5 句话装不下一个人 —— 用户会说"它记性太差"。现在按字符预算取。
   */
  it('预算够时能塞进远超以往条数上限的记忆', () => {
    const result = retrieveMemories({ entries: manyMemories(40), maxChars: 2000, limit: 30, now: NOW })
    expect(result.length).toBeGreaterThan(10)
  })

  it('预算是硬的：同样的预算，长文带得少、短句带得多', () => {
    const budgetCost = (list: MemoryEntry[]) =>
      list.reduce((sum, entry) => sum + entry.content.length + 8, 0)

    const long = retrieveMemories({
      entries: manyMemories(40, '这是一条比较长的记忆内容用来占用预算'),
      maxChars: 300,
      limit: 30,
      now: NOW,
    })
    const short = retrieveMemories({ entries: manyMemories(40), maxChars: 300, limit: 30, now: NOW })

    expect(budgetCost(long)).toBeLessThanOrEqual(300)
    expect(budgetCost(short)).toBeLessThanOrEqual(300)
    // 同一笔预算，短句装得下更多条 —— 这就是"按长度而不是按条数"的意义
    expect(long.length).toBeLessThan(short.length)
  })

  it('条数上限仍然生效（预算是主要约束，条数是兜底）', () => {
    const result = retrieveMemories({ entries: manyMemories(40), maxChars: 99_999, limit: 6, now: NOW })
    expect(result).toHaveLength(6)
  })

  it('即使预算极紧，也至少带一条进去 —— 一条都没有等于这套记忆不存在', () => {
    const result = retrieveMemories({
      entries: manyMemories(5, '很长很长的一条记忆内容'),
      maxChars: 1,
      now: NOW,
    })
    expect(result).toHaveLength(1)
  })

  it('不传预算时保持原来的量级（不传参不会突然变贵）', () => {
    const result = retrieveMemories({ entries: manyMemories(40), now: NOW })
    expect(result.length).toBeLessThanOrEqual(8)
  })
})

describe('retrieveMemories', () => {
  it('排除已归档与低置信度的记忆', () => {
    const kept = makeMemory({ content: '他是计算机专业大三学生' })
    const archived = makeMemory({ content: '他好像喜欢晚上学习', archived: true })
    const shaky = makeMemory({ content: '他可能想考研', confidence: 0.1 })

    const result = retrieveMemories({ entries: [kept, archived, shaky], now: NOW })
    expect(result.map((entry) => entry.id)).toEqual([kept.id])
  })

  it('同课程的记忆优先于其他课程的记忆', () => {
    const sameCourse = makeMemory({ content: 'A', courseId: 'course-1' })
    const otherCourse = makeMemory({ content: 'B', courseId: 'course-2' })

    const result = retrieveMemories({
      entries: [otherCourse, sameCourse],
      courseId: 'course-1',
      now: NOW,
    })
    expect(result[0]?.id).toBe(sameCourse.id)
  })

  it('全局记忆比其他课程的记忆更靠前', () => {
    const global = makeMemory({ content: '他是计算机专业大三学生' })
    const otherCourse = makeMemory({ content: '另一门课的笔记', courseId: 'course-2' })

    const result = retrieveMemories({
      entries: [otherCourse, global],
      courseId: 'course-1',
      now: NOW,
    })
    expect(result[0]?.id).toBe(global.id)
  })

  it('与查询关键词重叠的记忆会被提到前面', () => {
    const relevant = makeMemory({ content: '他在 useEffect 的依赖数组上容易漏写' })
    const irrelevant = makeMemory({ content: '他喜欢用纸质笔记本做笔记' })

    const result = retrieveMemories({
      entries: [irrelevant, relevant],
      query: 'useEffect 的依赖数组到底该写什么',
      now: NOW,
    })
    expect(result[0]?.id).toBe(relevant.id)
  })

  it('没有查询文本时只按层级与新鲜度排序', () => {
    const mastery = makeMemory({ layer: 'mastery', content: '闭包：薄弱', courseId: 'c1' })
    const episode = makeMemory({
      layer: 'episode',
      content: '聊了闭包',
      courseId: 'c1',
      createdAt: '2026-09-24T00:00:00.000Z',
    })

    const result = retrieveMemories({ entries: [episode, mastery], courseId: 'c1', now: NOW })
    expect(result[0]?.id).toBe(mastery.id)
  })

  it('遵守 limit 上限', () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      makeMemory({ content: `记忆 ${index}`, courseId: 'c1' }),
    )
    expect(retrieveMemories({ entries, courseId: 'c1', limit: 5, now: NOW })).toHaveLength(5)
  })

  it('陈旧的情景记忆会被新鲜的情景记忆超过', () => {
    const fresh = makeMemory({
      layer: 'episode',
      content: '昨天问了闭包',
      courseId: 'c1',
      createdAt: '2026-09-24T00:00:00.000Z',
    })
    const stale = makeMemory({
      layer: 'episode',
      content: '半年前问过变量提升',
      courseId: 'c1',
      createdAt: '2026-03-01T00:00:00.000Z',
    })

    const result = retrieveMemories({ entries: [stale, fresh], courseId: 'c1', now: NOW })
    expect(result[0]?.id).toBe(fresh.id)
  })

  it('空输入返回空数组', () => {
    expect(retrieveMemories({ entries: [], now: NOW })).toEqual([])
  })
})

describe('tokenize', () => {
  it('中文切成二元组，英文按词', () => {
    const tokens = tokenize('useEffect 依赖数组')
    expect(tokens.has('useeffect')).toBe(true)
    expect(tokens.has('依赖')).toBe(true)
    expect(tokens.has('赖数')).toBe(true)
  })

  it('单字中文也能保留', () => {
    expect(tokenize('学').has('学')).toBe(true)
  })

  it('过滤掉单字符英文噪音', () => {
    expect(tokenize('a b cd').has('a')).toBe(false)
    expect(tokenize('a b cd').has('cd')).toBe(true)
  })
})

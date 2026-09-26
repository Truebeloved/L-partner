import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage/idbStorage', () => {
  const store = new Map<string, string>()
  return {
    STORAGE_PREFIX: 'lpartner-test',
    createIdbJSONStorage: () => ({
      getItem: async (name: string) => {
        const raw = store.get(name)
        return raw === undefined ? null : JSON.parse(raw)
      },
      setItem: async (name: string, value: unknown) => {
        store.set(name, JSON.stringify(value))
      },
      removeItem: async (name: string) => {
        store.delete(name)
      },
    }),
  }
})

import { buildCompactMessages, compactMemories, planCompaction } from '@/features/memory/compact'
import type { LlmProvider } from '@/lib/llm/types'
import { useMemoryStore } from '@/store/memory'
import type { MemoryEntry, MemoryLayer } from '@/types/models'

/**
 * 记忆整理机制。
 *
 * 守的是两件最容易做反的事：
 * - **不该整理的时候别整理**（每次都跑 = 把省下的钱又花回去）；
 * - **整理失败时一条都别动**（半途失败还删了原文，用户就直接丢记忆了）。
 */

const AT = '2026-09-20T08:00:00.000Z'

function entry(
  id: string,
  layer: MemoryLayer,
  content: string,
  extra: Partial<MemoryEntry> = {},
): MemoryEntry {
  return {
    id,
    layer,
    content,
    confidence: 0.7,
    source: 'ai-extract',
    createdAt: AT,
    useCount: 0,
    ...extra,
  }
}

/** 造 n 条同层条目 */
function many(layer: MemoryLayer, count: number, prefix = '条目'): MemoryEntry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(`${layer}-${index}`, layer, `${prefix} ${index}`),
  )
}

function stubProvider(reply: string): LlmProvider {
  return {
    endpoint: 'stub://',
    chat: async () => reply,
    testConnection: async () => ({ ok: true }),
  }
}

beforeEach(() => {
  useMemoryStore.setState({ entries: [] })
})

describe('planCompaction', () => {
  it('没到阈值就不整理 —— 整理本身要花一次调用', () => {
    expect(planCompaction(many('fact', 23))).toBeNull()
    expect(planCompaction(many('episode', 29))).toBeNull()
  })

  it('到阈值才整理，并给出目标条数', () => {
    const plan = planCompaction(many('fact', 24))
    expect(plan?.layer).toBe('fact')
    expect(plan?.entries).toHaveLength(24)
    expect(plan?.target).toBe(12)
  })

  it('掌握状态永不参与 —— 合并两个知识点比留三条重复糟得多', () => {
    expect(planCompaction(many('mastery', 60))).toBeNull()
  })

  it('已归档的条目不算数', () => {
    const archived = many('fact', 30).map((item) => ({ ...item, archived: true }))
    expect(planCompaction(archived)).toBeNull()
  })

  it('两层都超标时，先整理超得最多的那一层', () => {
    const plan = planCompaction([...many('fact', 25), ...many('episode', 40)])
    expect(plan?.layer).toBe('episode')
  })
})

describe('buildCompactMessages', () => {
  it('把要整理的条目列给模型，并要求不许丢信息、不许编造', () => {
    const messages = buildCompactMessages('fact', many('fact', 24, '他喜欢'))
    const system = messages[0]?.content ?? ''
    const user = messages[1]?.content ?? ''

    expect(system).toContain('不要丢信息')
    expect(system).toContain('不要编造')
    expect(user).toContain('他喜欢 0')
    expect(user).toContain('他喜欢 23')
    // 目标条数写在正文里，模型才有明确的收敛目标
    expect(user).toContain('不超过 12 条')
  })
})

describe('compactMemories', () => {
  it('把一堆零碎条目换成更少的完整条目', async () => {
    const entries = [
      entry('f1', 'fact', '他在学吉他', { confidence: 0.8 }),
      entry('f2', 'fact', '他喜欢弹吉他'),
      entry('f3', 'fact', '他最近在练吉他'),
      ...many('fact', 21),
    ]
    useMemoryStore.setState({ entries })

    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    const replaced = await compactMemories({
      provider: stubProvider(JSON.stringify({ items: ['他喜欢弹吉他，最近在练'] })),
      plan,
    })

    expect(replaced).toBe(24)
    const after = useMemoryStore.getState().entries
    expect(after).toHaveLength(1)
    expect(after[0]?.content).toBe('他喜欢弹吉他，最近在练')
    // 整理出来的条目至少和原材料一样可信，否则几次整理后置信度会跌到注入门槛以下
    expect(after[0]?.confidence).toBe(0.8)
  })

  it('全部同属一门课时合并结果仍挂在那门课上', async () => {
    useMemoryStore.setState({
      entries: many('fact', 24).map((item) => ({ ...item, courseId: 'c1' })),
    })
    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    await compactMemories({ provider: stubProvider('{"items":["合并后的事实"]}'), plan })

    expect(useMemoryStore.getState().entries[0]?.courseId).toBe('c1')
  })

  it('混着归属时归为全局 —— 22 条全局记忆不该因为掺了 2 条课程的就挂到那门课上', async () => {
    useMemoryStore.setState({
      entries: [
        entry('f1', 'fact', 'A', { courseId: 'c1' }),
        entry('f2', 'fact', 'B', { courseId: 'c1' }),
        ...many('fact', 22),
      ],
    })
    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    await compactMemories({ provider: stubProvider('{"items":["合并后的事实"]}'), plan })

    const after = useMemoryStore.getState().entries
    expect(after).toHaveLength(1)
    expect(after[0]?.courseId).toBeUndefined()
  })

  it('模型没照做（越整理越多）时不采纳', async () => {
    useMemoryStore.setState({ entries: many('fact', 24) })
    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    const replaced = await compactMemories({
      provider: stubProvider(JSON.stringify({ items: many('fact', 40).map((item) => item.content) })),
      plan,
    })

    expect(replaced).toBe(0)
    expect(useMemoryStore.getState().entries).toHaveLength(24)
  })

  it('整理失败时**一条都不动**', async () => {
    useMemoryStore.setState({ entries: many('fact', 24) })
    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    const failing: LlmProvider = {
      endpoint: 'stub://',
      chat: async () => {
        throw new Error('网络炸了')
      },
      testConnection: async () => ({ ok: true }),
    }

    const replaced = await compactMemories({ provider: failing, plan })

    expect(replaced).toBe(0)
    expect(useMemoryStore.getState().entries).toHaveLength(24)
  })

  it('模型返回空数组时也不动任何条目', async () => {
    useMemoryStore.setState({ entries: many('fact', 24) })
    const plan = planCompaction(useMemoryStore.getState().entries)
    if (!plan) throw new Error('应当需要整理')

    expect(await compactMemories({ provider: stubProvider('{"items":[]}'), plan })).toBe(0)
    expect(useMemoryStore.getState().entries).toHaveLength(24)
  })
})

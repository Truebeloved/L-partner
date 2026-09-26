import type { LlmMessage, LlmProvider } from '@/lib/llm/types'
import { extractJson } from '@/lib/llm'
import { clampText } from '@/lib/llm/context'
import { useMemoryStore } from '@/store/memory'
import type { MemoryEntry, MemoryLayer } from '@/types/models'

/**
 * 记忆条目的**压缩**机制。
 *
 * 为什么需要它：抽取是"每轮往里加"，而没有任何一步是"把旧账理一理"。
 * 于是随口聊几句就攒出一堆彼此重叠的条目（「他在学吉他」「他最近在学吉他」
 * 「他喜欢弹吉他」），注入上下文时它们互相挤占预算，检索排序也被稀释 ——
 * 用户的原话是「随便的对话产生好多条条目，完全可以整合压缩，节省 token」。
 *
 * 已有的一层保护不够用：`findSimilar` 只在**写入那一刻**比较单条新旧（LCS ≥ 70% 才合并），
 * 它处理不了"三条各自都不像、合起来其实是同一件事"这种情况，也管不了条目总量。
 *
 * 所以这里做的是**一次批量整理**：攒到阈值以上时，让模型把这一层重写一遍 ——
 * 少而完整，而不是多而零碎。
 *
 * 三条边界，缺一条都会变成"越整理越糟"：
 * 1. **只在超过阈值时才跑**。整理本身要花一次调用，太频繁就是把省下来的钱又花回去。
 * 2. **掌握状态永不参与**。它按知识点对齐，合并两个知识点比留三条重复糟得多。
 * 3. **整理失败就什么都不做**。宁可留着零碎条目，也不能因为一次失败的整理丢掉用户的记忆。
 */

/** 各层的触发阈值与目标条数。到阈值才整理，整理到目标条数为止 */
const COMPACTION_PLAN: Partial<Record<MemoryLayer, { trigger: number; target: number }>> = {
  // 事实是"认识他"的主体，条数不需要多，但每条要装得住东西
  fact: { trigger: 24, target: 12 },
  // 情景记忆天然最多（聊一次就可能出一条），阈值给高一点，整理收益也最大
  episode: { trigger: 30, target: 12 },
}

export interface CompactionPlan {
  layer: MemoryLayer
  entries: MemoryEntry[]
  target: number
}

/**
 * 判断要不要整理，以及整理哪一层。
 *
 * 纯函数：它决定的是"什么时候花一次调用"，而这个判断出错的表现是
 * "记忆越攒越乱"或"每轮都在整理"，两种都很贵，值得钉死。
 * 一次只整理一层 —— 同时整理两层的代价是两次调用，而收益是同一批 token。
 */
export function planCompaction(entries: MemoryEntry[]): CompactionPlan | null {
  let best: CompactionPlan | null = null

  for (const [layer, config] of Object.entries(COMPACTION_PLAN) as [
    MemoryLayer,
    { trigger: number; target: number },
  ][]) {
    const active = entries.filter((entry) => entry.layer === layer && !entry.archived)
    if (active.length < config.trigger) continue

    // 超得最多的那一层先整理
    if (!best || active.length > best.entries.length) {
      best = { layer, entries: active, target: config.target }
    }
  }

  return best
}

/**
 * 整理提示词。
 *
 * 与抽取提示词一样是"只输出 JSON"，但目标不同：那边是**发现新信息**，
 * 这边是**把已知信息压到更少的条目里**。所以这里最要紧的两条是
 * "不要丢信息"和"不要编造" —— 压缩最容易出的问题就是模型顺手把细节抹平了，
 * 而记忆的价值恰恰全在细节上（"他大三""他转了专业"这种）。
 */
export function buildCompactMessages(layer: MemoryLayer, entries: MemoryEntry[]): LlmMessage[] {
  const kind = layer === 'fact' ? '关于这个人的事实' : '你们聊过的经历'
  const list = entries.map((entry) => `- ${clampText(entry.content, 120)}`).join('\n')

  return [
    {
      role: 'system',
      content: `你在整理一份长期记忆。下面这些${kind}条目零碎、彼此重叠，请把它们**合并成更少的条目**。

只输出 JSON，不要任何解释：{"items": ["合并后的条目", "..."]}

规则：
- **不要丢信息**。年龄、专业、职业、城市、目标、偏好、习惯、关系、身体与情绪状态、重大经历 —— 一条都不能少。
- **不要编造**。原文里没有的推断一律不要写。
- 合并不是删减：把说的是同一件事的几条并成一条更完整的，其余的按主题归并。
- 每条一句话、第三人称、尽量具体（保留原文里的具体名词与数字）。不要写「他有一些学习习惯」这种空话。
- 条目之间不要互相重复。`,
    },
    { role: 'user', content: `${list}\n\n请合并成不超过 ${Math.max(4, Math.round(entries.length / 2))} 条。` },
  ]
}

/**
 * 跑一次整理。返回被替换掉的条目数（0 表示没整理或整理失败）。
 *
 * ⚠️ 失败时**一个条目都不动**：整理是后台维护，不是用户要的动作。
 * 半途失败还删掉原文的话，用户会直接丢掉一部分记忆 —— 那比零碎条目糟得多。
 */
export async function compactMemories(input: {
  provider: LlmProvider
  plan: CompactionPlan
}): Promise<number> {
  const { provider, plan } = input

  let merged: string[]
  try {
    const raw = await provider.chat(buildCompactMessages(plan.layer, plan.entries), {
      temperature: 0,
      maxTokens: 1024,
    })
    const parsed = extractJson<{ items?: unknown }>(raw)
    merged = asStringArray(parsed.items)
  } catch (error) {
    console.warn('[L-partner] 记忆整理失败，本次不动任何条目：', error)
    return 0
  }

  if (merged.length === 0) return 0
  // 越整理越多说明模型没照做，那就不采纳 —— 否则"整理"反而把库撑大了
  if (merged.length >= plan.entries.length) return 0

  const store = useMemoryStore.getState()
  const courseId = sharedCourseId(plan.entries)

  /*
   * 先写入新的，再删旧的。
   *
   * 顺序不能反：反过来的话，中间那一刻的记忆是空的，而这段时间里
   * 可能有一次对话正在进行、正在检索记忆（用户会明显感觉到"它突然不认识我了"）。
   */
  const replacedIds = new Set(plan.entries.map((entry) => entry.id))
  store.addMany(
    merged.map((content) => ({
      layer: plan.layer,
      content,
      ...(courseId ? { courseId } : {}),
      // 整理出来的条目至少和原材料一样可信；用最高置信度而不是平均值，
      // 否则几次整理之后置信度会一路下滑，最后跌破注入门槛（0.3）
      confidence: Math.max(...plan.entries.map((entry) => entry.confidence), 0.7),
      source: 'ai-extract' as const,
    })),
  )

  for (const id of replacedIds) useMemoryStore.getState().remove(id)

  return replacedIds.size
}

/**
 * 这一批条目是否**全部**同属一门课。
 *
 * 必须要求"全部"，而不是"出现过的那门课"：22 条全局记忆里混着 2 条属于某门课的，
 * 按后者会把合并结果挂到那门课上 —— 一条"他是计算机专业大三"于是变成了
 * "学 React 时记下的事"，之后检索时的课程归属加分就全错了。
 */
function sharedCourseId(entries: MemoryEntry[]): MemoryEntry['courseId'] {
  const ids = new Set(entries.map((entry) => entry.courseId ?? '__global__'))
  if (ids.size !== 1) return undefined
  const [only] = [...ids]
  return only === '__global__' ? undefined : only
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

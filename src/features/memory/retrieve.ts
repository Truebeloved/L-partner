import type { Id, MemoryEntry } from '@/types/models'

export interface RetrieveOptions {
  entries: MemoryEntry[]
  /** 当前课程。同课程的记忆优先，全局记忆（如「他是计算机专业」）也始终带上 */
  courseId?: Id
  /** 查询文本，通常取最近几条用户消息拼起来 */
  query?: string
  limit?: number
  /** 注入当前时间，便于测试 */
  now?: Date
}

const DEFAULT_LIMIT = 8
/** 置信度低于这个值的记忆不注入 —— 宁可少记，也不要拿不确定的印象误导模型 */
const MIN_CONFIDENCE = 0.3

/** 不同层级的先验权重：掌握状态最影响教学决策，闲聊记忆最不重要 */
const LAYER_WEIGHT: Record<MemoryEntry['layer'], number> = {
  mastery: 1.3,
  fact: 1.2,
  episode: 0.9,
}

/**
 * 从全部记忆里挑出与当前对话最相关的一批，注入 system prompt。
 *
 * 纯前端环境没有向量库，但这不构成阻碍：记忆条数通常在几百量级，
 * 用「关键词重叠 + 课程归属 + 新鲜度 + 使用频次」打分排序已经够用，
 * 而且打分过程完全可解释 —— 用户在记忆面板里能看懂「为什么它记得这个」。
 */
export function retrieveMemories(options: RetrieveOptions): MemoryEntry[] {
  const { entries, courseId, query, limit = DEFAULT_LIMIT, now = new Date() } = options

  const queryTokens = query ? tokenize(query) : new Set<string>()
  const nowMs = now.getTime()

  const scored = entries
    .filter((entry) => !entry.archived && entry.confidence >= MIN_CONFIDENCE)
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens, courseId, nowMs) }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((item) => item.entry)
}

export function scoreEntry(
  entry: MemoryEntry,
  queryTokens: Set<string>,
  courseId: Id | undefined,
  nowMs: number,
): number {
  let score = entry.confidence * LAYER_WEIGHT[entry.layer]

  // 课程归属：同课程最相关；全局记忆带轻微加成，因为它对任何话题都成立
  if (entry.courseId) {
    if (entry.courseId === courseId) score += 1.5
    else score -= 0.4
  } else {
    score += 0.3
  }

  // 关键词重叠。中文按二元组切，不依赖分词器
  if (queryTokens.size > 0) {
    const entryTokens = tokenize(`${entry.content} ${entry.knowledgePoint ?? ''}`)
    let overlap = 0
    for (const token of entryTokens) {
      if (queryTokens.has(token)) overlap += 1
    }
    // 用查询词数归一化，避免长文本靠字数堆分
    score += (overlap / Math.sqrt(queryTokens.size)) * 1.6
  }

  // 新鲜度：情景记忆越近越有用；事实与掌握状态本来就稳定，衰减要慢
  const ageDays = Math.max(0, (nowMs - new Date(entry.createdAt).getTime()) / 86_400_000)
  const halfLife = entry.layer === 'episode' ? 14 : 120
  score += Math.pow(0.5, ageDays / halfLife) * 0.8

  // 被反复用到的记忆更可能是真的
  score += Math.min(Math.log2(entry.useCount + 1) * 0.15, 0.6)

  // 被用到过但很久没动的，轻微降权（记忆演化的「遗忘」一侧）
  if (entry.lastUsedAt) {
    const idleDays = Math.max(0, (nowMs - new Date(entry.lastUsedAt).getTime()) / 86_400_000)
    if (idleDays > 60) score -= 0.2
  }

  return score
}

/**
 * 极简分词：英文按词，中文按二元组。
 * 引入真正的分词器对这个规模来说是过度设计，二元组的召回率已经够用。
 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()

  for (const word of lower.match(/[a-z0-9_+#.]+/g) ?? []) {
    if (word.length >= 2) tokens.add(word)
  }

  for (const run of lower.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) {
      tokens.add(run)
      continue
    }
    for (let index = 0; index + 1 < run.length; index += 1) {
      tokens.add(run.slice(index, index + 2))
    }
  }

  return tokens
}

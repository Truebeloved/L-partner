import type { Id, MemoryEntry } from '@/types/models'

export interface RetrieveOptions {
  entries: MemoryEntry[]
  /** 当前课程。同课程的记忆优先，全局记忆（如「他是计算机专业」）也始终带上 */
  courseId?: Id
  /** 查询文本，通常取最近几条用户消息拼起来 */
  query?: string
  /** 条数上限（配合 maxChars 用，两个都到才算满） */
  limit?: number
  /**
   * 字符预算：按相关度从高到低取，直到装不下为止。
   *
   * 为什么不能只靠条数：记忆有长有短，'条数上限 = 8' 既可能只带进 8 条一句话的印象，
   * 也可能塞进 8 段长文本。真正该控的是**总长度**（也就是 token），
   * 条数只作为"别带太多条"的兜底。用户要的"超长记忆"正是靠这个预算放开的 ——
   * 短句记忆可以带进去几十条，而总长度仍然可控。
   */
  maxChars?: number
  /** 注入当前时间，便于测试 */
  now?: Date
}

const DEFAULT_LIMIT = 8
/** 不传 maxChars 时的默认字符预算（约等于以前 8 条中长记忆的量） */
const DEFAULT_MAX_CHARS = 1600
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
 *
 * 取的时候同时受两个约束：**字符预算**（主要）与**条数上限**（兜底）。
 * 预算至少保证第一条进得来 —— 一条都带不进去的话，这套记忆等于不存在。
 */
export function retrieveMemories(options: RetrieveOptions): MemoryEntry[] {
  const {
    entries,
    courseId,
    query,
    limit = DEFAULT_LIMIT,
    maxChars = DEFAULT_MAX_CHARS,
    now = new Date(),
  } = options

  const queryTokens = query ? tokenize(query) : new Set<string>()
  const nowMs = now.getTime()

  const scored = entries
    .filter((entry) => !entry.archived && entry.confidence >= MIN_CONFIDENCE)
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens, courseId, nowMs) }))

  scored.sort((a, b) => b.score - a.score)

  const picked: MemoryEntry[] = []
  let used = 0
  for (const item of scored) {
    if (picked.length >= limit) break
    const cost = memoryCost(item.entry)
    if (picked.length > 0 && used + cost > maxChars) continue
    picked.push(item.entry)
    used += cost
  }

  return picked
}

/** 一条记忆在上下文里大致占多少字符（内容 + 知识点标注） */
export function memoryCost(entry: MemoryEntry): number {
  return entry.content.length + (entry.knowledgePoint?.length ?? 0) + 8
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

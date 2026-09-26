import { extractJson } from '@/lib/llm'
import { buildMemoryExtractionMessages, buildSummaryMessages } from '@/lib/llm/prompts'
import type { LlmProvider } from '@/lib/llm/types'
import { useMemoryStore } from '@/store/memory'
import type { MemoryDraft } from '@/store/memory'
import type { ChatMessage, Id, MasteryLevel, MemoryEntry } from '@/types/models'

/**
 * 每积累这么多条新消息才触发一次记忆抽取。
 *
 * 这是 token 成本与记忆质量的权衡点：每轮都抽最准，但对话一长 token 消耗会失控；
 * 隔太久又会让记忆滞后。8 条（约 4 个来回）是个偏保守的取值 ——
 * 用户可随时用「记住这个」手动触发，也可以在设置里关掉自动抽取。
 */
export const EXTRACTION_INTERVAL = 8

/**
 * 单次抽取最多回看多少条消息。
 *
 * 与 EXTRACTION_INTERVAL 的关系：正常节奏下增量就是 8 条左右，这个上限只在
 * 「手动点了记住这个」「关了自动抽取很久之后又打开」这类情况下兜底。
 */
export const EXTRACTION_WINDOW = 24

const VALID_LEVELS: MasteryLevel[] = ['unknown', 'learning', 'weak', 'mastered']

interface RawExtraction {
  facts?: unknown
  mastery?: unknown
  episodes?: unknown
}

export function shouldExtractMemory(
  messageCount: number,
  options: { autoExtract: boolean; messagesSinceLastExtraction: number },
): boolean {
  if (!options.autoExtract) return false
  if (messageCount < 2) return false
  return options.messagesSinceLastExtraction >= EXTRACTION_INTERVAL
}

/**
 * 从对话里抽取记忆并落库，返回新增条数。
 *
 * 失败时静默返回 0 而不是抛错：抽取记忆是**后台增强**，不该因为它失败
 * 就让用户眼前这次对话看起来出错了。
 */
export async function extractMemories(input: {
  provider: LlmProvider
  messages: ChatMessage[]
  courseId?: Id
  conversationId?: Id
}): Promise<number> {
  const { provider, messages, courseId, conversationId } = input
  if (messages.length === 0) return 0

  /*
   * 只发**自上次抽取以来的增量**，而不是整段对话。
   *
   * 原来每一轮抽取都把全部历史重发一遍：对话到 100 条时，每 8 条消息就要重发一次全部内容 ——
   * 抽取本意是"省着点花"，结果成了最贵的一个调用。截取最近 EXTRACTION_WINDOW 条就够了：
   * 更早的内容早就抽过了。
   */
  const recent = messages.slice(-EXTRACTION_WINDOW)

  const existing = useMemoryStore.getState().entries

  let parsed: RawExtraction
  try {
    const raw = await provider.chat(buildMemoryExtractionMessages(recent, existing), {
      // 抽取任务要的是稳定输出，不是创造力
      temperature: 0,
      maxTokens: 1024,
    })
    parsed = extractJson<RawExtraction>(raw)
  } catch (error) {
    console.warn('[L-partner] 记忆抽取失败，已跳过本次：', error)
    return 0
  }

  const drafts: MemoryDraft[] = []

  for (const fact of asStringArray(parsed.facts)) {
    drafts.push({
      layer: 'fact',
      courseId,
      content: fact,
      confidence: 0.7,
      source: 'ai-extract',
      sourceConversationId: conversationId,
    })
  }

  for (const item of asObjectArray(parsed.mastery)) {
    const knowledgePoint = typeof item.knowledgePoint === 'string' ? item.knowledgePoint.trim() : ''
    if (!knowledgePoint) continue
    const level = VALID_LEVELS.includes(item.level as MasteryLevel)
      ? (item.level as MasteryLevel)
      : 'learning'
    const reason = typeof item.reason === 'string' ? item.reason.trim() : ''

    drafts.push({
      layer: 'mastery',
      courseId,
      knowledgePoint,
      content: reason || `对话中判断为「${level}」`,
      level,
      confidence: 0.75,
      source: 'ai-extract',
      sourceConversationId: conversationId,
    })
  }

  for (const episode of asStringArray(parsed.episodes)) {
    drafts.push({
      layer: 'episode',
      courseId,
      content: episode,
      confidence: 0.65,
      source: 'ai-extract',
      sourceConversationId: conversationId,
    })
  }

  const fresh = drafts.filter((draft) => !isDuplicate(draft, existing))
  if (fresh.length === 0) return 0

  useMemoryStore.getState().addMany(fresh)
  return fresh.length
}

/** 会话摘要（记忆第 1 层）：对话变长后，用摘要替换掉冗长的原始历史 */
export async function summarizeConversation(input: {
  provider: LlmProvider
  previousSummary?: string
  messages: ChatMessage[]
}): Promise<string | null> {
  const { provider, previousSummary, messages } = input
  if (messages.length < 4) return null

  try {
    const summary = await provider.chat(buildSummaryMessages(previousSummary, messages), {
      temperature: 0.3,
      maxTokens: 512,
    })
    return summary.trim() || null
  } catch (error) {
    console.warn('[L-partner] 会话摘要生成失败，已跳过：', error)
    return null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  )
}

/**
 * 去重：归一化后比较。
 * 模型经常把同一件事换个说法再报一遍，不去重的话记忆面板很快就会变成一锅粥。
 */
function isDuplicate(draft: MemoryDraft, existing: MemoryEntry[]): boolean {
  const normalized = normalize(draft.content)
  return existing.some((entry) => {
    if (entry.layer !== draft.layer || entry.archived) return false
    if (draft.layer === 'mastery' && draft.knowledgePoint) {
      return entry.knowledgePoint === draft.knowledgePoint
    }
    return normalize(entry.content) === normalized
  })
}

function normalize(text: string): string {
  // \p{P} 覆盖全部 Unicode 标点，不用逐个列举中英文标点 —— 列举法一定会漏
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

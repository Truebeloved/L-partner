import {
  matchTodoToCourse,
  mentionedCourse,
  normalizeForMatch,
  resolveWhen,
  weekStartOf,
} from '@/features/today/autoTodo'
import { splitIntent } from '@/features/today/intent'
import { extractJson } from '@/lib/llm'
import { buildMemoryExtractionMessages, buildSummaryMessages } from '@/lib/llm/prompts'
import type { LlmProvider } from '@/lib/llm/types'
import { toDateKey } from '@/lib/date'
import { longestCommonSubstring } from '@/lib/text'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import type { MemoryDraft } from '@/store/memory'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { TodoDraft } from '@/store/todos'
import type { ChatMessage, DateKey, Id, MasteryLevel, MemoryEntry } from '@/types/models'

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
  todos?: unknown
  weekly?: unknown
  todoLinks?: unknown
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

  /*
   * 规则匹配不上归属的待办，顺带请模型判定一次（同一次调用，不额外花钱）。
   * 只挑最近的几条、且只挑"还没挂上课程"的 —— 清单越短，模型越不会乱挂。
   */
  const pendingTodos = useTodoStore
    .getState()
    .todos.filter((todo) => !todo.unitId && !todo.weekStart && !todo.planItemId)
    .slice(-PENDING_LINK_LIMIT)
    .map((todo) => todo.title)

  const courseUnits = useCourseStore
    .getState()
    .courses.flatMap((course) =>
      course.stages.flatMap((stage) =>
        stage.units.map((unit) => ({ course: course.title, unit: unit.title })),
      ),
    )

  let parsed: RawExtraction
  try {
    const raw = await provider.chat(
      buildMemoryExtractionMessages(recent, existing, { pendingTodos, courseUnits }),
      {
        // 抽取任务要的是稳定输出，不是创造力
        temperature: 0,
        maxTokens: 1024,
      },
    )
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
  if (fresh.length > 0) useMemoryStore.getState().addMany(fresh)

  /*
   * 与已有条目"说的是同一件事但换了说法"时，不新增，而是**把那条更新掉**。
   *
   * 为什么必须做：模型每次都会用自己的话重述一遍（"他是计算机专业大三学生" /
   * "他在读计算机，大三"），只按字符串相等去重的话，记忆面板很快就变成一锅粥，
   * 而"了解你"这件事恰恰最怕被同一件事的十种说法稀释。
   * 保留信息量更大的那一版（字数多的），并刷新时间与置信度。
   */
  for (const draft of drafts) {
    const similar = findSimilar(draft, existing)
    if (!similar) continue
    const better = draft.content.length > similar.content.length ? draft.content : similar.content
    useMemoryStore.getState().update(similar.id, {
      content: better,
      confidence: Math.max(similar.confidence, draft.confidence),
    })
  }

  /*
   * 同一次调用里顺手把「他说要做的事」落成待办 —— 这就是「全局 AI」的无感部分：
   * 不额外请求、不额外花钱，用户只是在聊天，待办栏里自己就多了东西。
   */
  const createdTodos = applyExtractedTodos(parsed, { courseId })
  const linked = applyTodoLinks(parsed)

  return fresh.length + createdTodos + linked
}

/** 请模型判定的待办条数上限：清单越长，模型越容易乱挂 */
export const PENDING_LINK_LIMIT = 5

/** 一条抽取结果最多切成几条：防止模型返回一句超长的话被切成十几条 */
const MAX_SPLIT_PER_ITEM = 4

/**
 * 应用模型给出的「待办 → 单元」归属。
 *
 * 两道校验缺一不可：待办标题必须真在库里，单元标题必须真能匹配到某个单元 ——
 * 模型偶尔会把标题写得不太一样，直接把它的答案写进数据里，就会出现指向不存在单元的悬空关联。
 */
export function applyTodoLinks(parsed: RawExtraction): number {
  const links = asObjectArray(parsed.todoLinks)
  if (links.length === 0) return 0

  const todos = useTodoStore.getState().todos
  const courses = useCourseStore.getState().courses
  const plans = usePlanStore.getState().plans
  let applied = 0

  for (const link of links) {
    const todoTitle = typeof link.todo === 'string' ? link.todo.trim() : ''
    // 模型可以给"某一节"，也可以给"某一段/某一章"（整段一起划掉）
    const unitTitle =
      typeof link.unit === 'string' && link.unit.trim()
        ? link.unit.trim()
        : typeof link.stage === 'string'
          ? link.stage.trim()
          : ''
    if (!todoTitle || !unitTitle) continue

    const target = todos.find(
      (todo) =>
        !todo.unitId &&
        !todo.stageId &&
        !todo.weekStart &&
        normalizeForMatch(todo.title) === normalizeForMatch(todoTitle),
    )
    if (!target) continue

    /*
     * 先拿**待办标题本身**过一遍规则，再轮到模型给的那个词。
     *
     * 顺序很关键：用户自己写的就是最可靠的依据。模型常常把"学完阶段一"
     * 好心细化成它看到的第一节（"C语言简史"），照着它关联就会只勾掉那一节 ——
     * 用户报的正是这个。标题里明说了阶段，就以阶段为准；标题认不出来时，
     * 才退回去看模型给的提示（"待关联的待办"那一轮专门干这个）。
     */
    const fromTitle = matchTodoToCourse(todoTitle, courses, plans)
    const fromHint = matchTodoToCourse(unitTitle, courses, plans)
    const resolved = fromTitle ?? fromHint
    if (!resolved) continue

    useTodoStore.getState().update(target.id, {
      courseId: resolved.courseId,
      unitId: resolved.unitId,
      stageId: resolved.stageId,
      planItemId: resolved.planItemId,
    })
    applied += 1
  }

  return applied
}

/**
 * 把抽取出来的待办写进待办库。
 *
 * 三件事值得说明：
 * 1. 日期用 resolveWhen 解析**原话里的时间说法**（"下周三"这类），模型不需要算日期；
 * 2. 解析不出来时兜底成"今天" —— 最坏结果是早提醒一天，而不是把任务丢进一个没人看的日期；
 * 3. 落库前先按"同一天 + 同名"去重：对话里同一件事常常被提起好几次。
 */
export function applyExtractedTodos(
  parsed: RawExtraction,
  options: { courseId?: Id; now?: Date } = {},
): number {
  const now = options.now ?? new Date()
  const today = toDateKey(now)

  interface PendingDraft {
    title: string
    date: DateKey
    weekStart?: DateKey
  }

  const pending: PendingDraft[] = []

  for (const item of asObjectArray(parsed.todos)) {
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!title) continue
    const when = typeof item.when === 'string' ? item.when : ''
    const resolved = resolveWhen(when, now)

    /*
     * 本地再切一刀：提示词里已经要求模型"一句话里几件事就拆几条"，
     * 但那是最好情况。用户一口气说三件事时，模型合并成一条的概率不低 ——
     * 切多了最多是多一条可以删的待办，切少了就是"我说了它没记住"，
     * 两者的代价不对称，所以宁可多切。
     */
    const parts = splitIntent(title).slice(0, MAX_SPLIT_PER_ITEM)

    for (const part of parts) {
      if (resolved.kind === 'week') {
        /*
         * 周目标：date 与 weekStart 都落在本周一。
         *
         * ⚠️ 这里必须用它自己的日期，不能兜底成 today ——
         * 否则它会同时出现在「本周」和「今日」两处，用户会以为有两件事要做。
         */
        pending.push({ title: part, date: resolved.weekStart, weekStart: resolved.weekStart })
        continue
      }

      pending.push({ title: part, date: resolved.kind === 'day' ? resolved.date : today })
    }
  }

  for (const goal of asStringArray(parsed.weekly)) {
    const title = goal.trim()
    if (!title) continue
    // 周目标：date 落在本周一，这样它不会混进"今日"清单，而是走「本周」那一块
    pending.push({ title, date: weekStartOf(today), weekStart: weekStartOf(today) })
  }

  if (pending.length === 0) return 0

  const todos = useTodoStore.getState().todos
  const seen = new Set(todos.map((todo) => `${todo.date}|${normalizeForMatch(todo.title)}`))
  const courses = useCourseStore.getState().courses
  const plans = usePlanStore.getState().plans

  const drafts: TodoDraft[] = []
  for (const item of pending) {
    const key = `${item.date}|${normalizeForMatch(item.title)}`
    if (seen.has(key)) continue
    seen.add(key)

    /*
     * 课程关联：规则先匹配。匹配不上不留空 —— 待办照常存在，
     * 只是不带课程标签；拿不准的由下一次抽取（见 buildMemoryExtractionMessages
     * 里的「待关联待办」）让模型判定。
     *
     * ⚠️ 兜底用"当前对话绑的课程"时有个前提：**标题没有点名别的课**。
     * 用户在《文言文》的对话里说"学完 C 语言阶段一"，标题写着 C 语言，
     * 却因为会话绑着文言文而被挂到文言文上 —— 那正是用户报的串课。
     */
    const link = matchTodoToCourse(item.title, courses, plans)
    const named = mentionedCourse(courses, item.title)
    const fallbackCourse = named && named.id !== options.courseId ? undefined : options.courseId

    drafts.push({
      title: item.title,
      date: item.date,
      courseId: link?.courseId ?? fallbackCourse,
      unitId: link?.unitId,
      stageId: link?.stageId,
      planItemId: link?.planItemId,
      ...(item.weekStart ? { weekStart: item.weekStart } : {}),
      source: 'ai-extract',
    })
  }

  if (drafts.length === 0) return 0
  useTodoStore.getState().addMany(drafts)
  return drafts.length
}

/** 会话摘要（记忆第 1 层）：对话变长后，用摘要替换掉冗长的原始历史 */

/**
 * 每积累这么多条**新**消息，就滚动更新一次会话摘要。
 *
 * 这是"超长记忆"的关键：每轮注入的历史只有 4000 字符（约最近几个来回），
 * 更早的内容如果没有摘要承载，就是**真的丢了** —— 用户会说"它怎么不记得我们聊过"。
 * 12 条（约 6 个来回）一次，配上 512 的输出上限，是"记得住"与"花得起"之间的平衡点。
 */
export const SUMMARY_EVERY = 12

/**
 * 最近这么多条消息不进入摘要，始终以原文保留。
 *
 * 它们本来就在注入窗口里，压进摘要反而丢掉原话的语气与细节 ——
 * 摘要负责"很久以前"，原文负责"刚刚"。
 */
export const SUMMARY_KEEP_RECENT = 6

/**
 * 判断这一轮结束后要不要更新摘要，以及摘要该覆盖到第几条消息。
 *
 * 抽成纯函数：这段边界条件（够不够、覆盖到哪、还有没有新内容）最容易写错，
 * 而写错的表现是"聊了很久却什么都没记住"，在界面上根本看不出来。
 */
export function planSummary(input: {
  messageCount: number
  summaryUpTo: number
}): { needed: boolean; upTo: number } {
  const { messageCount, summaryUpTo } = input
  const upTo = messageCount - SUMMARY_KEEP_RECENT

  if (upTo <= summaryUpTo) return { needed: false, upTo: summaryUpTo }
  if (upTo - summaryUpTo < SUMMARY_EVERY) return { needed: false, upTo: summaryUpTo }
  return { needed: true, upTo }
}

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
 * 去重：完全一样（归一化后）的直接丢掉。
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

/**
 * 找出"说的是同一件事"的已有条目（换了个说法的那种）。
 *
 * 判据是最长公共子串占较短那条的比例 —— 中文里换个说法重述，
 * 字面重合度通常仍然很高（"大三学生/在读大三"），而两件真正不同的事几乎不会
 * 共享一长串连续文字。阈值 0.7：既能吃掉重述，又不会把两条独立事实并成一条。
 */
const SIMILAR_RATIO = 0.7

function findSimilar(draft: MemoryDraft, existing: MemoryEntry[]): MemoryEntry | undefined {
  const normalized = normalize(draft.content)
  if (normalized.length < 6) return undefined

  return existing.find((entry) => {
    if (entry.layer !== draft.layer || entry.archived) return false
    // 掌握状态按知识点对齐，不参与模糊合并（合并错知识点比重复更糟）
    if (entry.layer === 'mastery') return false

    const other = normalize(entry.content)
    if (other.length === 0) return false
    const overlap = longestCommonSubstring(normalized, other)
    return overlap / Math.min(normalized.length, other.length) >= SIMILAR_RATIO
  })
}

function normalize(text: string): string {
  // \p{P} 覆盖全部 Unicode 标点，不用逐个列举中英文标点 —— 列举法一定会漏
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

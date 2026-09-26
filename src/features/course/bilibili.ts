import type { CoursePlanDraft, StageDraft, UnitDraft } from '@/features/course/drafts'

/**
 * 把 B 站合集的目录变成一份课程方案。
 *
 * 这是"课程内容太少"的正解：C 语言那门课 B 站上有一百多讲，而模型凭记忆只写得出
 * 十几个单元 —— 与其让它编，不如把**真实存在的讲次**搬进来：
 * 一门 100 讲的课就是 100 个单元，一节都不多不少，而且每一讲都有能打开的链接。
 *
 * 纯函数：抓取（要真实浏览器）在主进程，这里只负责"目录 → 方案"的转换，可以被单测钉死。
 */

export interface BilibiliEpisode {
  title: string
  bvid: string
  /** 多 P 视频里的第几 P；合集里每集是自己的视频，固定为 1 */
  page: number
  /** 时长（秒）；读不到就是 0 */
  seconds: number
  /** 合集内的分区名（B 站合集可以自己分区）；没有就是空串 */
  section: string
}

export interface BilibiliCollection {
  title: string
  episodes: BilibiliEpisode[]
}

/**
 * 每一讲的时长范围。
 *
 * 下限取 10 而不是 30（课程表单里的默认下限）：这里的时长是**视频的真实长度**，
 * 翁恺那门课里有 5 分钟的短讲 —— 把它强行记成 30 分钟，排期就会明显偏长，
 * 用户按计划学时发现"怎么半小时就讲完了"。真实值优先，只做边界兜底。
 */
const MIN_MINUTES = 10
const MAX_MINUTES = 180
/** 没有分区信息时，每多少讲归一个阶段 */
const FALLBACK_GROUP_SIZE = 10

/** 一集的观看地址：多 P 用 ?p=N，合集里每集是自己的 BV 号 */
export function episodeUrl(episode: BilibiliEpisode): string {
  const base = `https://www.bilibili.com/video/${episode.bvid}`
  return episode.page > 1 ? `${base}?p=${episode.page}` : base
}

/**
 * 从标题里取知识点。
 *
 * 目录标题通常写成「1.1 变量与数据类型」或「第 3 讲 表达式」这种，
 * 直接整句当知识点太长（掌握状态面板里会被截断），所以剥掉序号再切一刀。
 */
export function knowledgePointsFromTitle(title: string): string[] {
  const cleaned = title
    .replace(/^\s*[（(【[]?\d+(\.\d+)*[）)】\]]?\s*/, '')
    .replace(/^\s*第\s*\d+\s*[讲课章节集]\s*/, '')
    .replace(/[|｜]/g, ' ')
    .trim()

  const parts = cleaned
    .split(/[\s，,、；;：:]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)

  if (parts.length === 0) return cleaned ? [cleaned] : []
  return parts.slice(0, 3)
}

function minutesFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 60
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(seconds / 60)))
}

/**
 * 目录 → 课程草稿。
 *
 * 分阶段按这个优先级选：
 * 1. **合集自带的分区**（B 站允许作者分区，那正是最好的章节划分）；
 * 2. **标题里的编号**（「1.2.3 简单历史」→ 归到第 1 章）—— 教材自己的章节划分
 *    比任何猜测都准，翁恺那门 100 讲就是这么组织的；
 * 3. 都没有才按每 10 讲一组兜底 —— 一百讲铺成一个平铺列表没法用。
 */
export function draftFromCollection(
  collection: BilibiliCollection,
  options: { goal?: string; weeklyHours?: number; deadline?: string } = {},
): CoursePlanDraft {
  const stages = groupIntoStages(collection.episodes)
  const total = collection.episodes.length

  return {
    title: collection.title || options.goal || 'B 站课程',
    description: `按 B 站合集的真实分集整理：共 ${total} 讲、${stages.length} 个阶段，每一讲都指向原视频。`,
    goal: options.goal || `学完《${collection.title || '这门课'}》的全部 ${total} 讲`,
    deadline: options.deadline,
    weeklyMinutes: options.weeklyHours ? options.weeklyHours * 60 : undefined,
    stages,
  }
}

/** 从「1.2.3 简单历史」里取出编号路径；没有编号返回 null */
export function titleNumber(title: string): string[] | null {
  const matched = /^\s*(\d+(?:\.\d+)*)/.exec(title)
  if (!matched) return null
  return matched[1]!.split('.')
}

function groupIntoStages(episodes: BilibiliEpisode[]): StageDraft[] {
  // 1) 作者分区
  if (episodes.some((episode) => episode.section)) {
    const groups = new Map<string, BilibiliEpisode[]>()
    for (const episode of episodes) {
      const key = episode.section || '其他'
      const bucket = groups.get(key)
      if (bucket) bucket.push(episode)
      else groups.set(key, [episode])
    }
    return [...groups].map(([title, items]) => buildStage(title, items))
  }

  // 2) 标题编号：先试一级（章），章数不合理再退到二级（节）
  const byChapter = groupByNumberDepth(episodes, 1)
  if (byChapter && byChapter.size >= 3 && byChapter.size <= 20) {
    return [...byChapter].map(([title, items]) => buildStage(`第 ${title} 章`, items))
  }
  const bySection = groupByNumberDepth(episodes, 2)
  if (bySection && bySection.size >= 3 && bySection.size <= 30) {
    return [...bySection].map(([title, items]) => buildStage(`第 ${title} 节`, items))
  }

  // 3) 兜底：每 FALLBACK_GROUP_SIZE 讲一个阶段
  const stages: StageDraft[] = []
  for (let index = 0; index < episodes.length; index += FALLBACK_GROUP_SIZE) {
    const chunk = episodes.slice(index, index + FALLBACK_GROUP_SIZE)
    stages.push(buildStage(`第 ${index + 1}~${index + chunk.length} 讲`, chunk))
  }
  return stages
}

/**
 * 按标题编号的第 depth 级分组。
 *
 * 有编号的讲次不足八成时返回 null —— 那种情况下"编号"多半是零散的年份或序号，
 * 拿它分组会把同一章的内容拆得到处都是。
 */
function groupByNumberDepth(
  episodes: BilibiliEpisode[],
  depth: 1 | 2,
): Map<string, BilibiliEpisode[]> | null {
  const numbered = episodes.filter((episode) => titleNumber(episode.title))
  if (numbered.length < episodes.length * 0.8) return null

  const groups = new Map<string, BilibiliEpisode[]>()
  for (const episode of episodes) {
    const path = titleNumber(episode.title)
    const key = path ? path.slice(0, depth).join('.') : '其他'
    const bucket = groups.get(key)
    if (bucket) bucket.push(episode)
    else groups.set(key, [episode])
  }

  // 分组要大体按编号升序（Map 保留插入顺序，而插入顺序就是目录顺序）
  return groups
}

function buildStage(title: string, episodes: BilibiliEpisode[]): StageDraft {
  const units: UnitDraft[] = episodes.map((episode) => ({
    title: episode.title || '未命名的一讲',
    knowledgePoints: knowledgePointsFromTitle(episode.title),
    estimatedMinutes: minutesFromSeconds(episode.seconds),
    resourceUrl: episodeUrl(episode),
    resourceLabel: `B 站原视频 · ${episode.title}`.slice(0, 60),
  }))

  return {
    title,
    objective: `看完这 ${episodes.length} 讲`,
    units,
  }
}

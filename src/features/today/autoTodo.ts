import { planItemState } from '@/features/course/courseActions'
import { dayjs, todayKey, toDateKey } from '@/lib/date'
import type { Course, DateKey, Id, Plan, Todo } from '@/types/models'

/**
 * 「全局 AI」的规则层。
 *
 * 这一层刻意不碰模型：日期解析与课程匹配都是**确定性**的事，
 * 用规则做既免费又瞬时，还能被单测钉死。只有规则拿不准的部分
 * （对话里说的话到底指哪门课）才交给模型 —— 而且复用的是每 8 条消息
 * 已有的那次记忆抽取调用，不额外花钱。见 docs/ui-spec.md 的说明。
 */

// ---------------------------------------------------------------------------
// 周
// ---------------------------------------------------------------------------

/** 某一周的第一天（周一）。待办的「周标记」存的就是它：可排序、可跨天比较 */
export function weekStartOf(key: DateKey): DateKey {
  return toDateKey(dayjs(key).startOf('isoWeek'))
}

/** 这个待办是不是「本周想做到的事」 */
export function isWeeklyTodo(todo: Todo, today: DateKey = todayKey()): boolean {
  return Boolean(todo.weekStart) && todo.weekStart === weekStartOf(today)
}

// ---------------------------------------------------------------------------
// 「哪天」——把自然语言解析成具体日期
// ---------------------------------------------------------------------------

export type WhenResolution =
  /** 某一天的事 */
  | { kind: 'day'; date: DateKey }
  /** 某一周想做到的事 */
  | { kind: 'week'; weekStart: DateKey }
  /** 认不出来 —— 调用方按"今天"兜底 */
  | { kind: 'unknown' }

const WEEKDAY_NAMES: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
}

/**
 * 解析「今天 / 明天 / 周三 / 下月 3 号 / 这周」这类说法。
 *
 * 认不出来时返回 unknown 而不是抛错或硬猜：调用方会兜底成"今天"，
 * 最坏结果只是提醒早了一天，而不是把任务丢进一个没人看的日期里。
 */
export function resolveWhen(when: string | undefined | null, now: Date = new Date()): WhenResolution {
  const raw = (when ?? '').trim()
  if (!raw) return { kind: 'unknown' }
  const text = raw.replace(/\s+/g, '')
  const base = dayjs(now)

  // 已经是标准日期就直接用
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { kind: 'day', date: text }

  if (/^(今天|今日|本日)$/.test(text)) return { kind: 'day', date: toDateKey(base) }
  if (/^(明天|明日)$/.test(text)) return { kind: 'day', date: toDateKey(base.add(1, 'day')) }
  if (/^后天$/.test(text)) return { kind: 'day', date: toDateKey(base.add(2, 'day')) }
  if (/^大后天$/.test(text)) return { kind: 'day', date: toDateKey(base.add(3, 'day')) }

  // 周：这一周 / 下一周 / 上周
  if (/^(这|本|这一)(周|星期|礼拜)(内|里)?$/.test(text)) {
    return { kind: 'week', weekStart: weekStartOf(toDateKey(base)) }
  }
  if (/^(下|下一)(周|星期|礼拜)$/.test(text)) {
    return { kind: 'week', weekStart: weekStartOf(toDateKey(base.add(1, 'week'))) }
  }
  if (/^(这|本)周末$/.test(text)) {
    // 周末按周六算：它比"本周"具体，落到一天更符合"我周末要做完"的语感
    return { kind: 'day', date: toDateKey(base.startOf('isoWeek').add(5, 'day')) }
  }

  // 周几：周三 / 星期三 / 下周三
  const weekday = /^(下|下个|本|这)?(?:周|星期|礼拜)([一二三四五六日天])$/.exec(text)
  if (weekday) {
    const target = WEEKDAY_NAMES[weekday[2] ?? ''] ?? 7
    const isNext = weekday[1] === '下' || weekday[1] === '下个'
    let candidate = base.isoWeekday(target).startOf('day')
    if (isNext) candidate = candidate.add(1, 'week')
    // 不带"下周"且今天已经过了这一天 → 顺延到下一次，而不是回到过去
    else if (candidate.isBefore(base.startOf('day'))) candidate = candidate.add(1, 'week')
    return { kind: 'day', date: toDateKey(candidate) }
  }

  // N 月 M 日 / 号
  const monthDay = /^(\d{1,2})月(\d{1,2})(日|号)?$/.exec(text)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let candidate = base.month(month - 1).date(day).startOf('day')
      if (candidate.isBefore(base.startOf('day'))) candidate = candidate.add(1, 'year')
      return { kind: 'day', date: toDateKey(candidate) }
    }
  }

  // N 天后 / N 天内
  const daysLater = /^(\d{1,3})天(后|内|以后)$/.exec(text)
  if (daysLater) {
    const days = Number(daysLater[1])
    if (Number.isFinite(days)) return { kind: 'day', date: toDateKey(base.add(days, 'day')) }
  }

  return { kind: 'unknown' }
}

// ---------------------------------------------------------------------------
// 待办 ↔ 课程内容
// ---------------------------------------------------------------------------

export interface CourseLink {
  courseId: Id
  /**
   * 命中的**整个阶段**（"我要学完阶段一"这类）。
   *
   * 为什么要单独一个字段而不是退化成"阶段里的第一节"：用户说"学完阶段一"，
   * 他要的是那一章全部划掉。上一版只能落到某一个单元上，于是勾完之后
   * 被划掉的是别的某一节 —— 用户报的"它给我划掉的是阶段二中的第一个课程"就是这个。
   */
  stageId?: Id
  /** 命中的**具体某一节**（比阶段更精确时才用） */
  unitId?: Id
  /** 该单元在计划里的排期项（有的话）。完成待办时回流更新它 */
  planItemId?: Id
  /** 匹配得分：命中的字越多越具体 */
  score: number
}

/** 中文数字 → 阿拉伯数字（只处理 1~99，「阶段一」「第十章」够用了） */
const CHINESE_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

/**
 * 把「一」「十」「十一」「二十一」「3」解析成序号。
 *
 * ⚠️ 返回的是**从 1 开始的序号**，不是数组下标 —— 调用方取 stages[n - 1]。
 * 这类"第 N 段"的解析最容易犯的错就是把它当 0 基下标用，
 * 症状是"说阶段一，动的却是阶段二"，而且看起来像随机错位、极难查。
 */
export function parseOrdinal(raw: string): number | null {
  const text = raw.trim()
  if (/^\d+$/.test(text)) return Number(text)

  const tensMatch = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(text)
  if (tensMatch) {
    const tens = tensMatch[1] ? (CHINESE_DIGITS[tensMatch[1]] ?? 1) : 1
    const ones = tensMatch[2] ? (CHINESE_DIGITS[tensMatch[2]] ?? 0) : 0
    return tens * 10 + ones
  }

  return CHINESE_DIGITS[text] ?? null
}

/**
 * 把一段自由文本匹配到课程内容上。
 *
 * 两条依据，优先级不同：
 * 1. **明说了第几阶段/第几章** → 整个阶段（"我要学完阶段一"）。
 *    除非同一句话里还精确点名了某一节，那时以那一节为准。
 * 2. 否则按**单元标题与知识点**匹配：整段包含或整体被包含，且至少 2 个字 ——
 *    单字匹配（"学""做"）几乎必然误伤，宁可不匹配。
 */
export function matchTodoToCourse(
  title: string,
  courses: Course[],
  plans: Record<Id, Plan>,
): CourseLink | null {
  const target = normalizeForMatch(title)
  if (target.length < 2) return null

  let best: CourseLink | null = null

  for (const course of courses) {
    const unitMatch = matchUnit(course, target)
    const namedStage = namedStageOf(course, target)

    /*
     * 同一句话里既点了阶段、又点了阶段内的某一节 → 以那一节为准（更精确）。
     * 点了阶段但没点到节 → 整个阶段。
     */
    const unitInsideNamedStage =
      unitMatch && namedStage && course.stages.some((stage) =>
        stage.id === namedStage.id && stage.units.some((unit) => unit.id === unitMatch.unitId),
      )

    const candidate: CourseLink | null =
      unitMatch && (!namedStage || unitInsideNamedStage)
        ? unitMatch
        : namedStage
          ? { courseId: course.id, stageId: namedStage.id, score: namedStage.score }
          : unitMatch

    if (candidate && (!best || candidate.score > best.score)) best = candidate
  }

  if (!best) return null

  const plan = plans[best.courseId]
  if (!best.unitId) return best
  const item = plan?.items.find((candidate) => candidate.unitId === best?.unitId)
  return item ? { ...best, planItemId: item.id } : best
}

/** 逐单元比对标题与知识点 */
function matchUnit(course: Course, target: string): CourseLink | null {
  let best: CourseLink | null = null

  for (const stage of course.stages) {
    for (const unit of stage.units) {
      for (const alias of [unit.title, ...unit.knowledgePoints]) {
        const candidate = normalizeForMatch(alias)
        if (candidate.length < 2) continue
        if (!target.includes(candidate) && !candidate.includes(target)) continue

        // 命中的字数越多越具体；同分时保留先遇到的（阶段/单元顺序即课程自身的顺序）
        if (!best || candidate.length > best.score) {
          best = { courseId: course.id, unitId: unit.id, score: candidate.length }
        }
      }
    }
  }

  return best
}

/**
 * 这句话点名的阶段。
 *
 * 两种说法都要认：
 * - **序号**：「阶段一」「第 2 章」「第三部分」—— 序号从 1 开始，取 stages[n - 1]；
 * - **标题**：用户直接把阶段名写出来（「先把字词句读通」）。
 *   标题匹配要求至少 4 个字：阶段名常常是「起步」这种两字词，两字全课程撞车的概率太高。
 */
function namedStageOf(course: Course, target: string): { id: Id; score: number } | null {
  /*
   * 两种语序都要认：
   * - 序号在前：「第一阶段」「第 2 章」「第三部分」
   * - 序号在后：「阶段一」「章三」（口语里更常说"学完阶段一"）
   * 只认前一种的话，"我要学完阶段一"会被判成没点名任何阶段。
   */
  const ordinal =
    /第\s*([一二三四五六七八九十\d]+)\s*个?\s*(?:阶段|章|部分|单元组)/.exec(target) ??
    /(?:阶段|单元组|章|部分)\s*([一二三四五六七八九十\d]+)/.exec(target)

  if (ordinal) {
    const index = parseOrdinal(ordinal[1] ?? '')
    // 序号越界就当没点名（说"第九阶段"而课程只有三段时，不该硬套到某一段上）
    if (index !== null && index >= 1 && index <= course.stages.length) {
      const stage = course.stages[index - 1]!
      // 得分加上序号本身的长度：明说"阶段一"比撞上一个长标题更可信
      return { id: stage.id, score: (ordinal[1] ?? '').length + 4 }
    }
  }

  let best: { id: Id; score: number } | null = null
  for (const stage of course.stages) {
    const candidate = normalizeForMatch(stage.title)
    if (candidate.length < 4) continue
    if (!target.includes(candidate)) continue
    if (!best || candidate.length > best.score) best = { id: stage.id, score: candidate.length }
  }

  return best
}

/** 某个单元属于哪个阶段（完成判定要用） */
export function stageIdOfUnit(course: Course, unitId: Id): Id | undefined {
  return course.stages.find((stage) => stage.units.some((unit) => unit.id === unitId))?.id
}

/** 归一化：去掉空白与标点、统一小写，只留下用来比对的字 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 课程结构里哪些单元该显示成"已完成"（灰态 + 删除线）。
 *
 * 两条来源都要认，缺一个就会出现"我明明勾完了，课程结构里还是没划掉"：
 * 1. 计划排期项：以单元为单位的正式排期，全部完成即该单元完成；
 *    完成判定复用 planItemState（与掌握状态、今日页同一口径）。
 * 2. 直接关联的待办：手输的、或对话里抽出来的，它们没有排期项，
 *    但用户心里的"这门课的这件事"就是它 —— 全部勾掉同样算完成。
 *
 * 两者是"或"的关系：任意一条链路能证明做完了，就画成完成。
 * 带周标记的待办不参与 —— 它是"这一周想做的事"，颗粒度不对，不该把某个单元划掉。
 */
export function doneUnitIds(course: Course, plan: Plan | undefined, todos: Todo[]): Set<Id> {
  const done = new Set<Id>()

  /*
   * 先收一遍"整段完成"：说"我要学完阶段一"的那种待办挂在阶段上，
   * 勾掉它就该把这一段里**每一节**都划掉（用户明确要求的行为）。
   */
  const doneStages = new Set(
    todos
      .filter((todo) => todo.done && !todo.weekStart && todo.stageId)
      .map((todo) => todo.stageId as Id),
  )

  for (const stage of course.stages) {
    const stageFinished = doneStages.has(stage.id)

    for (const unit of stage.units) {
      if (stageFinished) {
        done.add(unit.id)
        continue
      }

      const items = plan?.items.filter((item) => item.unitId === unit.id) ?? []
      const linked = todos.filter((todo) => todo.unitId === unit.id && !todo.weekStart)

      const planDone =
        items.length > 0 &&
        items.every((item) => planItemState(item, todos, course) === 'done')
      const linkedDone = linked.length > 0 && linked.every((todo) => todo.done)

      if (planDone || linkedDone) done.add(unit.id)
    }
  }

  return done
}

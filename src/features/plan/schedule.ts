import { dayjs } from '@/lib/date'
import type { DateKey, Id } from '@/types/models'

/** 参与排期的最小单元（从 Course 里展平而来） */
export interface SchedulableUnit {
  unitId: Id
  title: string
  estimatedMinutes: number
}

export interface ScheduleOptions {
  units: SchedulableUnit[]
  startDate: DateKey
  /** 期望完成日期；不传则纯按每日预算往后排 */
  deadline?: DateKey
  /** 每周可投入分钟数 */
  weeklyMinutes?: number
  /** 学习日，0=周日 … 6=周六，默认每天都能学 */
  studyWeekdays?: number[]
  /** 单日学习上限（分钟）。排太满一定执行不下去，所以必须有上限 */
  maxMinutesPerDay?: number
  /** 单个学习日的最低投入，避免把 10 分钟碎片也排成一天 */
  minMinutesPerDay?: number
}

export interface SchedulePlanItem {
  unitId: Id
  date: DateKey
  minutes: number
}

export interface ScheduleResult {
  items: SchedulePlanItem[]
  totalMinutes: number
  /** 实际采用的每日预算 */
  dailyMinutes: number
  /** 预计完成日期 */
  finishDate: DateKey | null
  /** 按当前预算排下来会晚于 deadline —— UI 需要提示用户，而不是假装排得下 */
  exceedsDeadline: boolean
  /** 没有可排内容，或学习日配置为空 */
  empty: boolean
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
const DEFAULT_MAX_MINUTES_PER_DAY = 90
const DEFAULT_MIN_MINUTES_PER_DAY = 30
/** 安全阀：防止参数异常时死循环 */
const MAX_DAY_LOOKAHEAD = 3650

/**
 * 规则排期：把一串学习单元铺到日历上。
 *
 * 这是一个**纯函数** —— 不碰 store、不碰 DOM，给定输入必定得到相同输出。
 * 好处有两个：可以用单测把边界情况钉死；以及它同时服务于两条线路 ——
 * 没有 API Key 时它就是最终排期器，有 Key 时它是 AI 排期的兜底与校验基准。
 *
 * 规则优先级：
 *   1. deadline 优先。若按每周预算排不完，就提高每日投入（但不超过单日上限）。
 *   2. 单日上限是硬约束。宁可晚于 deadline 并如实告知，也不排出「一天学 5 小时」
 *      这种不可能执行的计划。
 *   3. 单元优先保持完整；只有单个单元就超过单日预算时才跨天拆分。
 */
export function buildSchedule(options: ScheduleOptions): ScheduleResult {
  const {
    units,
    startDate,
    deadline,
    weeklyMinutes,
    studyWeekdays = ALL_WEEKDAYS,
    maxMinutesPerDay = DEFAULT_MAX_MINUTES_PER_DAY,
    minMinutesPerDay = DEFAULT_MIN_MINUTES_PER_DAY,
  } = options

  const totalMinutes = units.reduce((sum, unit) => sum + Math.max(0, unit.estimatedMinutes), 0)
  const studyDaySet = new Set(studyWeekdays)

  if (studyDaySet.size === 0 || totalMinutes === 0) {
    return {
      items: [],
      totalMinutes,
      dailyMinutes: 0,
      finishDate: null,
      exceedsDeadline: false,
      empty: true,
    }
  }

  const start = dayjs(startDate).startOf('day')
  const studyDaysPerWeek = studyDaySet.size

  // ---- 1. 由「每周可投入」推导每日预算 ----
  const budgetFromWeek =
    weeklyMinutes && weeklyMinutes > 0
      ? Math.floor(weeklyMinutes / studyDaysPerWeek)
      : maxMinutesPerDay

  let dailyMinutes = clamp(budgetFromWeek, minMinutesPerDay, maxMinutesPerDay)

  // ---- 2. deadline 反过来压缩每日预算 ----
  const deadlineDay = deadline ? dayjs(deadline).startOf('day') : null
  const hasUsableDeadline = deadlineDay !== null && !deadlineDay.isBefore(start, 'day')

  if (hasUsableDeadline && deadlineDay) {
    const availableDays = countStudyDays(start, deadlineDay, studyDaySet)
    if (availableDays > 0) {
      const needed = Math.ceil(totalMinutes / availableDays)
      // 只往上抬，不往下压 —— 用户给的每周预算是下限意愿，不是上限强迫
      dailyMinutes = clamp(Math.max(dailyMinutes, needed), minMinutesPerDay, maxMinutesPerDay)
    }
  }

  // ---- 3. 逐日填充 ----
  const items: SchedulePlanItem[] = []
  const remaining = units.map((unit) => ({
    unitId: unit.unitId,
    minutes: Math.max(1, Math.round(unit.estimatedMinutes)),
  }))

  let queueIndex = 0
  let dayOffset = 0
  let guard = 0
  let finishDate: DateKey | null = null

  while (queueIndex < remaining.length && guard < MAX_DAY_LOOKAHEAD) {
    guard += 1
    const day = start.add(dayOffset, 'day')
    dayOffset += 1

    if (!studyDaySet.has(day.day())) continue

    const dateKey = day.format('YYYY-MM-DD')
    let budget = dailyMinutes

    while (budget > 0 && queueIndex < remaining.length) {
      const current = remaining[queueIndex]
      if (!current) break

      // 保持单元完整：当天已经放了东西、又装不下这个单元时，整体挪到明天，
      // 而不是切一小块下来（把 40 分钟的单元切成 10 + 30 会让人很难受）。
      // 只有当天还空着就装不下，才真正跨天拆分。
      const isDayEmpty = budget === dailyMinutes
      if (!isDayEmpty && current.minutes > budget) break

      const take = Math.min(budget, current.minutes)
      items.push({ unitId: current.unitId, date: dateKey, minutes: take })
      current.minutes -= take
      budget -= take

      if (current.minutes <= 0) queueIndex += 1
    }

    finishDate = dateKey
  }

  return {
    items,
    totalMinutes,
    dailyMinutes,
    finishDate,
    exceedsDeadline:
      hasUsableDeadline && finishDate !== null && deadlineDay !== null
        ? dayjs(finishDate).isAfter(deadlineDay, 'day')
        : false,
    empty: items.length === 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 统计 [from, to] 闭区间内落在学习日上的天数 */
function countStudyDays(from: dayjs.Dayjs, to: dayjs.Dayjs, studyDaySet: Set<number>): number {
  let count = 0
  let cursor = from
  let guard = 0
  while (!cursor.isAfter(to, 'day') && guard < MAX_DAY_LOOKAHEAD) {
    if (studyDaySet.has(cursor.day())) count += 1
    cursor = cursor.add(1, 'day')
    guard += 1
  }
  return count
}

/** 把排期结果按日期归组，UI 渲染日历时直接用 */
export function groupByDate(items: SchedulePlanItem[]): Map<DateKey, SchedulePlanItem[]> {
  const grouped = new Map<DateKey, SchedulePlanItem[]>()
  for (const item of items) {
    const bucket = grouped.get(item.date)
    if (bucket) bucket.push(item)
    else grouped.set(item.date, [item])
  }
  return grouped
}

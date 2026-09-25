import { dayjs, toDateKey } from '@/lib/date'
import type { ReminderKind, ReminderLog, TimeKey } from '@/types/models'

/**
 * 提醒时刻的计算 —— 整个提醒功能里唯一可以被单测钉死的部分。
 *
 * 刻意做成**纯函数**：不读系统时间（`now` 一律由参数传入）、不碰 store、不碰 DOM。
 * 否则「跨天 / 跨月 / 秒级精度 / 脏设置项」这些真正容易出错的地方就只能靠手工点页面验证，
 * 而它们恰好是提醒最容易悄悄失灵的地方（比如差一天、差一秒就整天不提醒）。
 */

/** 设置项损坏时的兜底时刻：退化成次日零点。抛异常会让整个调度器停摆，不如降级 */
const FALLBACK_TIME = { hours: 0, minutes: 0 }

const TIME_KEY_PATTERN = /^(\d{1,2}):(\d{2})$/

/**
 * 补发窗口：页面从后台切回来时，若错过的提醒时刻还在 2 小时以内就补发一次。
 * 窗口太长，用户半夜切回页面会被「该学习了」打扰；太短，等于切回页面就丢掉一整天的提醒。
 */
export const MISSED_REMINDER_GRACE_MS = 2 * 60 * 60 * 1000

/**
 * 距离下一次目标时刻的毫秒数。
 *
 * 目标时刻今天已过则顺延到明天；**恰好等于当前时刻也顺延到明天** ——
 * 返回 0 会让调用方立即触发，触发后重新计算又是 0，直接变成死循环。
 * 「此刻正是提醒点」这件事由 `missedFireToday` 负责，见下面的分工说明。
 */
export function computeNextFireDelay(now: Date, targetTime: TimeKey): number {
  return resolveNextFireAt(now, targetTime).getTime() - now.getTime()
}

/**
 * 下一次触发的具体时刻。
 * 与 `computeNextFireDelay` 是同一件事的两种表达，UI 要显示「下次提醒：明天 20:00」时用这个。
 */
export function resolveNextFireAt(now: Date, targetTime: TimeKey): Date {
  const today = fireAtOnSameDay(now, targetTime)
  // 严格大于而不是大于等于：见 computeNextFireDelay 的注释，这里不能返回「现在」
  return today.isAfter(now) ? today.toDate() : today.add(1, 'day').toDate()
}

/**
 * 今天的提醒是否「刚错过、值得补发」。返回当时的时刻，不需要补发则返回 null。
 *
 * 分工：`computeNextFireDelay` 回答「定时器还要等多久」，这个函数回答「现在是不是该补一次」。
 * 浏览器会节流后台标签页的定时器，定时器醒来时可能已经过了目标时刻，
 * 只靠前者会一路顺延到明天 —— 用户切回页面就会觉得提醒凭空消失了。
 */
export function missedFireToday(now: Date, targetTime: TimeKey): Date | null {
  const today = fireAtOnSameDay(now, targetTime)
  if (today.isAfter(now)) return null
  return now.getTime() - today.valueOf() <= MISSED_REMINDER_GRACE_MS ? today.toDate() : null
}

/** 同一天、同一类型的提醒是否已经弹过，用于避免重复打扰 */
export function hasFiredToday(logs: ReminderLog[], now: Date, kind: ReminderKind): boolean {
  const today = toDateKey(now)
  return logs.some((log) => log.kind === kind && toDateKey(new Date(log.firedAt)) === today)
}

/** 目标时刻落在 now 同一天的 Date；秒与毫秒归零，让「到点」有唯一的判定基准 */
function fireAtOnSameDay(now: Date, targetTime: TimeKey): dayjs.Dayjs {
  const { hours, minutes } = parseTimeKey(targetTime)
  return dayjs(now).hour(hours).minute(minutes).second(0).millisecond(0)
}

/**
 * 解析 `HH:mm`。持久化数据可能来自旧版本（缺字段）或被直接改坏（`25:99`），
 * 所以这里不抛异常，一律退化成兜底时刻 —— 提醒晚一点，好过整个功能崩掉。
 */
function parseTimeKey(time: TimeKey): { hours: number; minutes: number } {
  const matched = typeof time === 'string' ? TIME_KEY_PATTERN.exec(time.trim()) : null
  if (!matched) return FALLBACK_TIME

  const hours = Number(matched[1])
  const minutes = Number(matched[2])
  if (hours > 23 || minutes > 59) return FALLBACK_TIME

  return { hours, minutes }
}

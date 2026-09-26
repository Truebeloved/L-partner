import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/zh-cn'

import type { DateKey } from '@/types/models'

dayjs.extend(isoWeek)
dayjs.locale('zh-cn')

export { dayjs }

/** 今天的日期键（本地时区），排期与待办统一用它 */
export function todayKey(): DateKey {
  return dayjs().format('YYYY-MM-DD')
}

export function toDateKey(date: Date | dayjs.Dayjs | string): DateKey {
  return dayjs(date).format('YYYY-MM-DD')
}

/** 人类可读的日期，如「9月27日 周日」 */
export function formatDateHuman(key: DateKey): string {
  return dayjs(key).format('M月D日 ddd')
}

/** 相对今天的自然语言描述：今天 / 明天 / 昨天 / 3 天后 / 2 天前 */
export function formatRelativeDay(key: DateKey): string {
  const diff = dayjs(key).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  if (diff === -1) return '昨天'
  return diff > 0 ? `${diff} 天后` : `${-diff} 天前`
}

/** 把分钟数转成「1 小时 30 分」这类可读文本 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

/** 判断日期是否已经过去（早于今天） */
export function isOverdue(key: DateKey): boolean {
  return dayjs(key).isBefore(dayjs(), 'day')
}

/** `HH:mm` 的宽松解析结果：解析失败时退回兜底值，绝不抛异常 */
const TIME_KEY_PATTERN = /^(\d{1,2}):(\d{2})$/

/**
 * 解析 `HH:mm`，**永不抛异常**。
 *
 * 为什么必须宽容：持久化数据可能来自旧版本（字段根本不存在）或被直接改坏（`25:99`）。
 * 曾经真的出过一次事故 —— 旧版本存下来的 settings 里没有 `desktopReminderFrom`，
 * 用户打开桌面提醒开关后取到 undefined，`undefined.split(':')` 直接把整棵 React 树
 * 掀掉，界面变成一片空白，而且因为开关已经存进本地，之后每次启动都是空白。
 * 所以时间解析只有一条规则：宁可退化成兜底时刻（提醒晚一点），也不能让功能崩掉。
 */
export function parseTimeKey(time: unknown, fallback: { hours: number; minutes: number }): {
  hours: number
  minutes: number
} {
  const matched = typeof time === 'string' ? TIME_KEY_PATTERN.exec(time.trim()) : null
  if (!matched) return fallback

  const hours = Number(matched[1])
  const minutes = Number(matched[2])
  if (hours > 23 || minutes > 59) return fallback

  return { hours, minutes }
}

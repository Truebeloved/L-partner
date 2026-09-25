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

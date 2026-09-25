import { describe, expect, it } from 'vitest'

import {
  MISSED_REMINDER_GRACE_MS,
  computeNextFireDelay,
  hasFiredToday,
  missedFireToday,
  resolveNextFireAt,
} from '@/features/reminder/reminder'
import { toDateKey } from '@/lib/date'
import type { ReminderLog } from '@/types/models'

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/**
 * 一律用「本地时间」构造基准时刻。
 * 提醒是给用户所在时区算的，用 'Z' 结尾的 ISO 字符串构造会让断言随 CI 时区漂移。
 */
function at(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(year, month - 1, day, hours, minutes, seconds, ms)
}

function log(firedAt: Date, kind: ReminderLog['kind'] = 'daily'): ReminderLog {
  return { id: `log-${firedAt.getTime()}`, kind, firedAt: firedAt.toISOString() }
}

/** 2026-09-25 是周五，跨天/跨月用例都以它前后为基准 */
describe('computeNextFireDelay', () => {
  it('目标时刻今天还没到：直接等到今天那一刻', () => {
    const now = at(2026, 9, 25, 8, 30)
    expect(computeNextFireDelay(now, '20:00')).toBe(11.5 * HOUR)
  })

  it('目标时刻今天已经过去：顺延到明天同一时刻', () => {
    const now = at(2026, 9, 25, 21, 0)
    expect(computeNextFireDelay(now, '20:00')).toBe(23 * HOUR)
    expect(toDateKey(resolveNextFireAt(now, '20:00'))).toBe('2026-09-26')
  })

  it('恰好等于当前时刻：不返回 0（否则会立刻重复触发），顺延明天', () => {
    const now = at(2026, 9, 25, 20, 0, 0, 0)
    const delay = computeNextFireDelay(now, '20:00')
    expect(delay).toBe(24 * HOUR)
    expect(delay).toBeGreaterThan(0)
    expect(toDateKey(resolveNextFireAt(now, '20:00'))).toBe('2026-09-26')
  })

  it('同一分钟内的毫秒偏差也算已过：按整点顺延，不做四舍五入', () => {
    const now = at(2026, 9, 25, 20, 0, 0, 500)
    expect(computeNextFireDelay(now, '20:00')).toBe(24 * HOUR - 500)
  })

  it('跨天：23:30 时目标 00:15 落在明天凌晨', () => {
    const now = at(2026, 9, 25, 23, 30)
    expect(computeNextFireDelay(now, '00:15')).toBe(45 * MINUTE)
    expect(toDateKey(resolveNextFireAt(now, '00:15'))).toBe('2026-09-26')
  })

  it('跨月：9 月 30 日 23:50 的下一次 00:10 落在 10 月 1 日', () => {
    const now = at(2026, 9, 30, 23, 50)
    expect(computeNextFireDelay(now, '00:10')).toBe(20 * MINUTE)
    expect(toDateKey(resolveNextFireAt(now, '00:10'))).toBe('2026-10-01')
  })

  it('跨月：1 月 31 日的下一次落在 2 月 1 日（不会溢出成 2 月 31 日）', () => {
    const now = at(2026, 1, 31, 23, 0)
    expect(computeNextFireDelay(now, '02:30')).toBe(3.5 * HOUR)
    expect(toDateKey(resolveNextFireAt(now, '02:30'))).toBe('2026-02-01')
  })

  it('跨年：12 月 31 日的下一次落在次年 1 月 1 日', () => {
    const now = at(2026, 12, 31, 23, 0)
    expect(computeNextFireDelay(now, '00:30')).toBe(90 * MINUTE)
    expect(toDateKey(resolveNextFireAt(now, '00:30'))).toBe('2027-01-01')
  })

  it('闰日：2 月 28 日的下一次落在 2 月 29 日', () => {
    const now = at(2028, 2, 28, 23, 0)
    expect(toDateKey(resolveNextFireAt(now, '06:00'))).toBe('2028-02-29')
  })

  it('小时写成一位数也能解析', () => {
    const now = at(2026, 9, 25, 8, 0)
    expect(computeNextFireDelay(now, '9:05')).toBe(65 * MINUTE)
  })

  it('设置项被改坏时退化成次日零点，而不是抛异常把调度器弄停摆', () => {
    const now = at(2026, 9, 25, 10, 0)
    expect(computeNextFireDelay(now, '25:99')).toBe(14 * HOUR)
    expect(computeNextFireDelay(now, 'abc')).toBe(14 * HOUR)
    expect(computeNextFireDelay(now, '')).toBe(14 * HOUR)
  })
})

describe('missedFireToday', () => {
  it('刚错过几分钟：给出当时的时刻，用于切回页面时补发', () => {
    const now = at(2026, 9, 25, 20, 5)
    expect(missedFireToday(now, '20:00')?.getTime()).toBe(at(2026, 9, 25, 20, 0).getTime())
  })

  it('恰好等于当前时刻：算作需要补发 —— 此刻正是提醒点', () => {
    const now = at(2026, 9, 25, 20, 0)
    expect(missedFireToday(now, '20:00')?.getTime()).toBe(now.getTime())
  })

  it('目标时刻还没到：不需要补发', () => {
    expect(missedFireToday(at(2026, 9, 25, 19, 0), '20:00')).toBeNull()
  })

  it('错过太久（超过补发窗口）就不补了，免得半夜弹「该学习了」', () => {
    expect(missedFireToday(at(2026, 9, 25, 23, 0), '20:00')).toBeNull()
  })

  it('补发窗口的边界上仍然补发，边界外不补', () => {
    const exact = new Date(at(2026, 9, 25, 20, 0).getTime() + MISSED_REMINDER_GRACE_MS)
    expect(missedFireToday(exact, '20:00')).not.toBeNull()

    const justOver = new Date(exact.getTime() + 1)
    expect(missedFireToday(justOver, '20:00')).toBeNull()
  })
})

describe('hasFiredToday', () => {
  const now = at(2026, 9, 25, 20, 30)

  it('没有任何记录时返回 false', () => {
    expect(hasFiredToday([], now, 'daily')).toBe(false)
  })

  it('今天已经弹过同类型提醒：返回 true，避免重复打扰', () => {
    expect(hasFiredToday([log(at(2026, 9, 25, 20, 0))], now, 'daily')).toBe(true)
  })

  it('昨天弹过不算今天弹过', () => {
    expect(hasFiredToday([log(at(2026, 9, 24, 20, 0))], now, 'daily')).toBe(false)
  })

  it('同一天的记录里类型不匹配时不算数', () => {
    expect(hasFiredToday([log(at(2026, 9, 25, 20, 0), 'study')], now, 'daily')).toBe(false)
  })

  it('按本地日期判定：昨晚 23:59 的记录不属于今天', () => {
    const justBeforeMidnight = at(2026, 9, 24, 23, 59)
    expect(hasFiredToday([log(justBeforeMidnight)], at(2026, 9, 25, 0, 1), 'daily')).toBe(false)
  })

  it('记录时间戳损坏时按「没提醒过」处理，而不是抛异常', () => {
    const broken: ReminderLog = { id: 'broken', kind: 'daily', firedAt: '不是时间' }
    expect(hasFiredToday([broken], now, 'daily')).toBe(false)
  })
})

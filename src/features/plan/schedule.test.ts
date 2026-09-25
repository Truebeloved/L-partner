import { describe, expect, it } from 'vitest'

import { buildSchedule, groupByDate } from '@/features/plan/schedule'
import type { SchedulableUnit } from '@/features/plan/schedule'

/** 2026-09-25 是周五，后面几个用例的日期推算都以它为基准 */
const FRIDAY = '2026-09-25'

function units(...minutes: number[]): SchedulableUnit[] {
  return minutes.map((value, index) => ({
    unitId: `u${index + 1}`,
    title: `单元 ${index + 1}`,
    estimatedMinutes: value,
  }))
}

describe('buildSchedule', () => {
  it('没有学习单元时返回空计划', () => {
    const result = buildSchedule({ units: [], startDate: FRIDAY })
    expect(result.empty).toBe(true)
    expect(result.items).toHaveLength(0)
    expect(result.finishDate).toBeNull()
  })

  it('学习日配置为空时返回空计划，而不是死循环', () => {
    const result = buildSchedule({ units: units(60), startDate: FRIDAY, studyWeekdays: [] })
    expect(result.empty).toBe(true)
  })

  it('量小到一天能装下时只排一天', () => {
    const result = buildSchedule({ units: units(90), startDate: FRIDAY, maxMinutesPerDay: 90 })
    expect(result.items).toEqual([{ unitId: 'u1', date: FRIDAY, minutes: 90 }])
    expect(result.finishDate).toBe(FRIDAY)
  })

  it('默认单日上限 90 分钟，300 分钟的量铺成四天而不是一天塞满', () => {
    const result = buildSchedule({ units: units(300), startDate: FRIDAY })
    expect(result.items.map((item) => item.minutes)).toEqual([90, 90, 90, 30])
    expect(result.items.map((item) => item.date)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ])
    expect(result.finishDate).toBe('2026-09-28')
  })

  it('单个单元超过单日预算时跨天拆分', () => {
    const result = buildSchedule({ units: units(200), startDate: FRIDAY, maxMinutesPerDay: 90 })
    expect(result.items).toHaveLength(3)
    expect(result.items.every((item) => item.unitId === 'u1')).toBe(true)
    expect(result.items.map((item) => item.minutes)).toEqual([90, 90, 20])
  })

  it('跳过非学习日：只把周一设为学习日时，第一个任务落在下周一', () => {
    const result = buildSchedule({
      units: units(60),
      startDate: FRIDAY,
      studyWeekdays: [1],
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.date).toBe('2026-09-28')
  })

  it('尽量保持单元完整：小单元不会被拆开', () => {
    const result = buildSchedule({
      units: units(40, 40, 40),
      startDate: FRIDAY,
      maxMinutesPerDay: 90,
    })
    // 40 + 40 = 80 放第一天，第三个 40 放第二天
    expect(result.items).toHaveLength(3)
    expect(result.items.map((item) => [item.unitId, item.date, item.minutes])).toEqual([
      ['u1', '2026-09-25', 40],
      ['u2', '2026-09-25', 40],
      ['u3', '2026-09-26', 40],
    ])
  })

  it('每周可投入时长会压低每日预算', () => {
    // 每周 210 分钟摊到 7 天 = 每天 30 分钟
    const result = buildSchedule({ units: units(90), startDate: FRIDAY, weeklyMinutes: 210 })
    expect(result.dailyMinutes).toBe(30)
    expect(result.items.map((item) => item.date)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
  })

  it('deadline 排得下时不报警', () => {
    const result = buildSchedule({
      units: units(300),
      startDate: FRIDAY,
      deadline: '2026-09-27',
      maxMinutesPerDay: 120,
    })
    expect(result.exceedsDeadline).toBe(false)
    expect(result.finishDate).toBe('2026-09-27')
  })

  it('deadline 排不下时如实标记，而不是硬塞进一天', () => {
    const result = buildSchedule({
      units: units(300),
      startDate: FRIDAY,
      deadline: '2026-09-26',
      maxMinutesPerDay: 90,
    })
    expect(result.exceedsDeadline).toBe(true)
    expect(result.finishDate).toBe('2026-09-28')
    // 关键：任何一天都不超过单日上限
    for (const item of result.items) {
      expect(item.minutes).toBeLessThanOrEqual(90)
    }
  })

  it('每日时长合计等于总时长', () => {
    const result = buildSchedule({
      units: units(45, 30, 75, 120, 20),
      startDate: FRIDAY,
      deadline: '2026-10-05',
      weeklyMinutes: 600,
    })
    const sum = result.items.reduce((total, item) => total + item.minutes, 0)
    expect(sum).toBe(45 + 30 + 75 + 120 + 20)
  })

  it('deadline 早于开始日期时按无 deadline 处理', () => {
    const result = buildSchedule({
      units: units(90),
      startDate: FRIDAY,
      deadline: '2026-09-01',
    })
    expect(result.exceedsDeadline).toBe(false)
    expect(result.empty).toBe(false)
  })
})

describe('groupByDate', () => {
  it('把排期项按日期归组', () => {
    const result = buildSchedule({
      units: units(100, 50, 50),
      startDate: FRIDAY,
      maxMinutesPerDay: 100,
    })
    // 第一天被 100 分钟的单元占满，后两个 50 分钟单元落在一起
    const grouped = groupByDate(result.items)
    expect([...grouped.keys()]).toEqual(['2026-09-25', '2026-09-26'])
    expect(grouped.get('2026-09-25')).toHaveLength(1)
    expect(grouped.get('2026-09-26')).toHaveLength(2)
  })
})

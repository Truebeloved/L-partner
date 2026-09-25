import { describe, expect, it } from 'vitest'

import {
  buildShelfLayout,
  bookMetrics,
  hashString,
  HEIGHT_TIER_COUNT,
  perRowForWidth,
  THICKNESS_TIER_COUNT,
} from '@/features/shelf/shelfLayout'

const WIDE = 1400

describe('perRowForWidth', () => {
  it('标准窗口宽度下一排 8 本', () => {
    expect(perRowForWidth(1400)).toBe(8)
    expect(perRowForWidth(1180)).toBe(8)
  })

  it('窗口变窄时逐级减少列数', () => {
    expect(perRowForWidth(1100)).toBe(7)
    expect(perRowForWidth(900)).toBe(6)
    expect(perRowForWidth(800)).toBe(5)
    expect(perRowForWidth(600)).toBe(4)
    expect(perRowForWidth(400)).toBe(3)
  })

  it('极窄窗口下也不会低于 3 列', () => {
    expect(perRowForWidth(0)).toBe(3)
    expect(perRowForWidth(-100)).toBe(3)
  })
})

describe('buildShelfLayout', () => {
  it('课程不足一排时用空书脊补满', () => {
    const layout = buildShelfLayout(['a', 'b', 'c'], WIDE)
    expect(layout.perRow).toBe(8)
    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0]?.slots).toHaveLength(8)
    expect(layout.fillerCount).toBe(5)
  })

  it('刚好填满一排时不产生空书脊', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `c${index}`)
    const layout = buildShelfLayout(ids, WIDE)
    expect(layout.rows).toHaveLength(1)
    expect(layout.fillerCount).toBe(0)
  })

  it('超过一排时每行都单独补齐', () => {
    const ids = Array.from({ length: 9 }, (_, index) => `c${index}`)
    const layout = buildShelfLayout(ids, WIDE)
    expect(layout.rows).toHaveLength(2)
    // 第一行 8 本真书 + 0 空；第二行 1 本真书 + 7 空
    expect(layout.rows[0]?.slots.filter((slot) => slot.kind === 'course')).toHaveLength(8)
    expect(layout.rows[1]?.slots.filter((slot) => slot.kind === 'course')).toHaveLength(1)
    expect(layout.fillerCount).toBe(7)
  })

  it('没有任何课程时也撑出一排空书脊，而不是空白一片', () => {
    const layout = buildShelfLayout([], WIDE)
    expect(layout.rows).toHaveLength(1)
    expect(layout.fillerCount).toBe(8)
    expect(layout.rows[0]?.slots.every((slot) => slot.kind === 'filler')).toBe(true)
  })

  it('窗口变窄时空书脊随之减少（先削装饰、不动真书）', () => {
    const ids = ['a', 'b', 'c']
    const wide = buildShelfLayout(ids, 1400)
    const narrow = buildShelfLayout(ids, 600)

    expect(wide.fillerCount).toBe(5)
    expect(narrow.fillerCount).toBe(1)

    // 关键：无论怎么缩，真实书籍一本都不能少
    const countReal = (layout: typeof wide) =>
      layout.rows.flatMap((row) => row.slots).filter((slot) => slot.kind === 'course').length
    expect(countReal(wide)).toBe(3)
    expect(countReal(narrow)).toBe(3)
    expect(narrow.courseCount).toBe(3)
  })

  it('任何窗口宽度下所有真实课程都在结果里且顺序不变', () => {
    const ids = Array.from({ length: 13 }, (_, index) => `course-${index}`)
    for (const width of [1400, 1100, 900, 800, 600, 300]) {
      const layout = buildShelfLayout(ids, width)
      const placed = layout.rows
        .flatMap((row) => row.slots)
        .filter((slot) => slot.kind === 'course')
        .map((slot) => slot.key)
      expect(placed).toEqual(ids)
    }
  })

  it('同一个位置在任何宽度下都对应同一本书（key 全局唯一）', () => {
    const ids = ['a', 'b', 'c', 'd']
    const layout = buildShelfLayout(ids, WIDE)
    const keys = layout.rows.flatMap((row) => row.slots).map((slot) => slot.key)
    expect(new Set(keys).size).toBe(keys.length)

    // 占位 key 带行列号，换宽度重排也不会跟别的格子撞上
    const narrow = buildShelfLayout(ids, 600)
    const narrowKeys = narrow.rows.flatMap((row) => row.slots).map((slot) => slot.key)
    expect(new Set(narrowKeys).size).toBe(narrowKeys.length)
  })
})

describe('hashString', () => {
  it('同样的输入永远得到同样的结果', () => {
    expect(hashString('course-a')).toBe(hashString('course-a'))
  })

  it('相似输入也会分散到不同结果', () => {
    expect(hashString('course-a')).not.toBe(hashString('course-b'))
    expect(hashString('filler-0-1')).not.toBe(hashString('filler-0-2'))
  })

  it('返回 32 位无符号整数', () => {
    const value = hashString('任意中文也应当稳定')
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('bookMetrics', () => {
  it('同一本书每次拿到同样的尺寸 —— 这是书架不抖动的前提', () => {
    const first = bookMetrics('course-a')
    const second = bookMetrics('course-a')
    expect(first).toEqual(second)
  })

  it('档位始终落在合法范围内', () => {
    for (const seed of ['a', 'b', 'c', 'filler-0-1', '很长的中文课程名称', '']) {
      const metrics = bookMetrics(seed)
      expect(metrics.heightTier).toBeGreaterThanOrEqual(0)
      expect(metrics.heightTier).toBeLessThan(HEIGHT_TIER_COUNT)
      expect(metrics.thicknessTier).toBeGreaterThanOrEqual(0)
      expect(metrics.thicknessTier).toBeLessThan(THICKNESS_TIER_COUNT)
    }
  })

  it('一批课程的高度不会全挤在同一档（否则就没有"错落"了）', () => {
    const seeds = Array.from({ length: 16 }, (_, index) => `course-${index}`)
    const tiers = new Set(seeds.map((seed) => bookMetrics(seed).heightTier))
    expect(tiers.size).toBeGreaterThan(1)
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildMessagePool,
  pickToastMessage,
  planNextToast,
} from '@/features/reminder/desktopReminder'
import type { ToastContext } from '@/features/reminder/desktopReminder'

/** 固定随机源，让"随机"的结果在测试里可复现 */
function fixedRandom(...values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length] ?? 0
}

const BASE = {
  activeFrom: '09:00' as const,
  activeTo: '21:30' as const,
  minGapMinutes: 60,
  maxGapMinutes: 120,
  firedToday: 0,
  maxPerDay: 4,
}

describe('planNextToast', () => {
  it('在活跃时段内随机出一个时刻', () => {
    const now = new Date('2026-09-25T10:00:00')
    // random=0 → 取下限 60 分钟
    expect(planNextToast(now, { ...BASE, random: fixedRandom(0) })?.toISOString()).toBe(
      new Date('2026-09-25T11:00:00').toISOString(),
    )
    // random=1 → 取上限 120 分钟
    expect(planNextToast(now, { ...BASE, random: fixedRandom(1) })?.toISOString()).toBe(
      new Date('2026-09-25T12:00:00').toISOString(),
    )
  })

  it('随机时刻越过收尾时刻时今天就到此为止', () => {
    const now = new Date('2026-09-25T21:00:00')
    // 21:00 + 60~120 分钟必然越过 21:30
    expect(planNextToast(now, { ...BASE, random: fixedRandom(0) })).toBeNull()
  })

  it('已经过了活跃时段就不再安排', () => {
    const now = new Date('2026-09-25T22:30:00')
    expect(planNextToast(now, { ...BASE, random: fixedRandom(0) })).toBeNull()
  })

  it('达到当日上限后不再安排', () => {
    const now = new Date('2026-09-25T10:00:00')
    expect(planNextToast(now, { ...BASE, firedToday: 4, random: fixedRandom(0) })).toBeNull()
  })

  it('凌晨启动时不会立刻弹，而是顺延到活跃时段开始', () => {
    const now = new Date('2026-09-25T03:00:00')
    const next = planNextToast(now, { ...BASE, random: fixedRandom(0) })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T09:00:00').toISOString())
  })

  it('返回的时刻永远落在活跃时段内', () => {
    for (let step = 0; step < 40; step += 1) {
      const now = new Date(2026, 8, 25, 9 + (step % 12), (step * 7) % 60)
      const next = planNextToast(now, { ...BASE, random: fixedRandom((step % 10) / 10) })
      if (!next) continue
      const hour = next.getHours()
      const minute = next.getMinutes()
      expect(hour * 60 + minute).toBeGreaterThanOrEqual(9 * 60)
      expect(hour * 60 + minute).toBeLessThanOrEqual(21 * 60 + 30)
    }
  })
})

describe('planNextToast 与每日固定提醒的避让', () => {
  /** 10:00 出发、间隔 60 分钟 → 随机结果恒定落在 11:00 */
  const NOW = new Date('2026-09-25T10:00:00')

  it('没开固定提醒时不避让', () => {
    const next = planNextToast(NOW, { ...BASE, dailyReminderTime: null, random: fixedRandom(0) })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T11:00:00').toISOString())
  })

  it('随机时刻离固定提醒足够远时照常安排', () => {
    const next = planNextToast(NOW, { ...BASE, dailyReminderTime: '20:00', random: fixedRandom(0) })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T11:00:00').toISOString())
  })

  it('随机时刻撞进固定提醒前后 10 分钟时重抽', () => {
    // 固定提醒 11:00，正好压住随机出来的 11:00 —— 第二次抽到上限 12:00，躲开了
    const next = planNextToast(NOW, {
      ...BASE,
      dailyReminderTime: '11:00',
      random: fixedRandom(0, 1),
    })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T12:00:00').toISOString())
  })

  it('重抽也躲不开时让到固定提醒之后，而不是今天不提醒', () => {
    // 随机源恒定返回 0（永远 11:00，永远撞上），只能靠退让
    const next = planNextToast(NOW, {
      ...BASE,
      dailyReminderTime: '11:00',
      random: fixedRandom(0),
    })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T11:10:00').toISOString())
  })

  it('避让窗口的边界是"前后各 10 分钟"，正好 10 分钟不算撞上', () => {
    // 固定提醒 11:10 → 11:00 恰好在窗口边缘（差 10 分钟），不该避让
    const edge = planNextToast(NOW, {
      ...BASE,
      dailyReminderTime: '11:10',
      random: fixedRandom(0),
    })
    expect(edge?.toISOString()).toBe(new Date('2026-09-25T11:00:00').toISOString())

    // 固定提醒 11:09 → 差 9 分钟，属于撞上
    const inside = planNextToast(NOW, {
      ...BASE,
      dailyReminderTime: '11:09',
      random: fixedRandom(0),
    })
    expect(inside?.toISOString()).toBe(new Date('2026-09-25T11:19:00').toISOString())
  })

  it('让到固定提醒之后会超出活跃时段时，退回原时刻而不是今天不提醒', () => {
    // 20:20 + 60 分钟 = 21:20，固定提醒 21:25（差 5 分钟算撞上）；
    // 让到 21:35 就出了活跃时段（21:30），所以只能接受 21:20 这一点点重叠
    const next = planNextToast(new Date('2026-09-25T20:20:00'), {
      ...BASE,
      dailyReminderTime: '21:25',
      random: fixedRandom(0),
    })
    expect(next?.toISOString()).toBe(new Date('2026-09-25T21:20:00').toISOString())
  })
})

const RICH: ToastContext = {
  name: '休伯利安',
  todayTotal: 5,
  todayDone: 2,
  overdueCount: 3,
  activeCourses: [
    { title: '两个月上手 React', daysLeft: 12 },
    { title: '线性代数', daysLeft: 30 },
  ],
}

const EMPTY: ToastContext = {
  name: '休伯利安',
  todayTotal: 0,
  todayDone: 0,
  overdueCount: 0,
  activeCourses: [],
}

describe('buildMessagePool', () => {
  it('有数据时包含进度、逾期与最近的 DDL', () => {
    const pool = buildMessagePool(RICH)
    const titles = pool.map((message) => message.title)
    // 进度这类具体数字放在 body 里（标题要短，一眼能读完），所以这里查合并文本
    const joined = pool.map((message) => `${message.title} ${message.body}`).join(' ')
    expect(joined).toContain('已完成 2/5')
    expect(titles.some((title) => title.includes('昨天还有 3 项'))).toBe(true)
    expect(titles.some((title) => title.includes('两个月上手 React'))).toBe(true)
  })

  it('没有数据时不会说出不成立的文案', () => {
    const pool = buildMessagePool(EMPTY)
    const joined = pool.map((message) => `${message.title}${message.body}`).join(' ')
    // 没有逾期就不该提逾期，没有课程就不该提 DDL
    expect(joined).not.toContain('昨天还有')
    expect(joined).not.toContain('距离「')
    expect(pool.some((message) => message.title.includes('今天还没有安排'))).toBe(true)
  })

  it('今天的任务全部完成时说的是完成，而不是催', () => {
    const pool = buildMessagePool({ ...RICH, todayTotal: 5, todayDone: 5 })
    const joined = pool.map((message) => message.title).join(' ')
    expect(joined).toContain('今天的任务都完成了')
    expect(joined).not.toContain('还差')
  })

  it('池子永远非空（最坏情况也有通用开场）', () => {
    expect(buildMessagePool(EMPTY).length).toBeGreaterThan(0)
  })
})

describe('pickToastMessage', () => {
  it('同样随机值下结果可复现', () => {
    expect(pickToastMessage(RICH, fixedRandom(0.3))).toEqual(
      pickToastMessage(RICH, fixedRandom(0.3)),
    )
  })

  it('随机值取到边界也不会越界', () => {
    expect(pickToastMessage(RICH, fixedRandom(0)).title).toBeTruthy()
    expect(pickToastMessage(RICH, fixedRandom(0.999999)).title).toBeTruthy()
    // 极端情况下 random 返回 1，索引不能溢出
    expect(pickToastMessage(RICH, fixedRandom(1)).title).toBeTruthy()
  })

  it('称呼出现在文案里', () => {
    for (const value of [0, 0.2, 0.4, 0.6, 0.8]) {
      const message = pickToastMessage(RICH, fixedRandom(value))
      expect(typeof message.title).toBe('string')
      expect(message.title.length).toBeGreaterThan(0)
    }
  })
})

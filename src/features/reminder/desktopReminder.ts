import { dayjs } from '@/lib/date'
import type { TimeKey } from '@/types/models'

/**
 * 桌面小窗提醒的纯逻辑。
 *
 * 与 reminder.ts 的分工：那边管的是「每日固定时刻的页面内提醒」，
 * 这边管的是「一天内随机时刻的桌面小窗」—— 两者是不同的产品行为，
 * 混在一个模块里会让"什么时候该响"变得没法推理。
 */

export interface ToastPlanOptions {
  /** 活跃时段的起止时刻，之外不打扰 */
  activeFrom: TimeKey
  activeTo: TimeKey
  /** 两次提醒之间的随机间隔区间（分钟） */
  minGapMinutes: number
  maxGapMinutes: number
  /** 今天已经弹过几条 */
  firedToday: number
  /** 一天最多几条 —— 提醒过密会变成骚扰，上限是必须的 */
  maxPerDay: number
  /**
   * 每日固定提醒的时刻；null / 不传表示没开固定提醒，不需要避让。
   *
   * 两个提醒是各自独立的开关，但**不能在同一时刻各响一次** ——
   * 用户收到的是"重复打扰"，而不是"两次提醒"。
   */
  dailyReminderTime?: TimeKey | null
  /** 注入随机源，测试里可替换成确定序列 */
  random: () => number
}

/**
 * 随机提醒与每日固定提醒之间必须空出的时间（前后各这么多分钟）。
 *
 * 取 10 分钟：小于它，两条提醒在人感觉上是"同时来的"；
 * 大于它，活跃时段里被挖掉一大块，随机提醒会显得稀少。
 */
export const DAILY_CLEARANCE_MINUTES = 10

/** 撞上固定提醒时最多重抽几次。抽不中就退让到固定时刻之后，不会丢掉今天的额度 */
const CLEARANCE_REDRAWS = 4

/**
 * 算出下一次该弹的时刻；返回 null 表示今天不再弹。
 *
 * 之所以返回「时刻」而不是「延迟毫秒数」：调用方需要重新校准
 * （页面从后台回来、系统休眠唤醒、用户改了设置），
 * 而时刻是稳定的，延迟不是。
 */
export function planNextToast(now: Date, options: ToastPlanOptions): Date | null {
  const { activeFrom, activeTo, minGapMinutes, maxGapMinutes, firedToday, maxPerDay, random } =
    options
  const dailyTime = options.dailyReminderTime ?? null

  if (firedToday >= maxPerDay) return null

  const current = dayjs(now)
  const endOfWindow = atTime(current, activeTo)

  // 已经出了活跃时段就不再安排今天的了；明天的日程在跨天后重新算
  if (!current.isBefore(endOfWindow)) return null

  const startOfWindow = atTime(current, activeFrom)
  const span = Math.max(0, maxGapMinutes - minGapMinutes)

  const draw = (): dayjs.Dayjs | null => {
    const candidate = current.add(minGapMinutes + random() * span, 'minute')
    // 随机出来的时刻可能越过收尾时刻 —— 那就今天不弹了，
    // 而不是硬把它挤到收尾前（那会让最后一条提醒必然在最晚点响，反而可预测）
    if (candidate.isAfter(endOfWindow)) return null
    // 也不该早于活跃时段的开始（例如应用在凌晨启动）
    return candidate.isBefore(startOfWindow) ? startOfWindow : candidate
  }

  const first = draw()
  if (!first) return null
  if (!hitsDailyReminder(first, dailyTime)) return first.toDate()

  // 正好落在固定提醒附近：重抽。重抽只在"真的撞上"时才发生，
  // 所以绝大多数情况下这条路径的耗时为 0，随机源的调用次数也和以前一样。
  for (let attempt = 0; attempt < CLEARANCE_REDRAWS; attempt += 1) {
    const retry = draw()
    if (retry && !hitsDailyReminder(retry, dailyTime)) return retry.toDate()
  }

  // 活跃时段很窄，怎么抽都躲不开：让到固定提醒之后。
  const afterDaily = dailyTime
    ? atTime(current, dailyTime).add(DAILY_CLEARANCE_MINUTES, 'minute')
    : null
  // 让不过去（已经在固定提醒之后、或让过去就出了活跃时段）就退回原时刻 ——
  // 少一次避让总好过今天一整天不再提醒
  if (!afterDaily || !afterDaily.isAfter(current) || !afterDaily.isBefore(endOfWindow)) {
    return first.toDate()
  }
  return afterDaily.toDate()
}

/** 判断某个时刻是否落在「每日固定提醒」的避让窗口内（前后各 DAILY_CLEARANCE_MINUTES 分钟） */
function hitsDailyReminder(at: dayjs.Dayjs, dailyTime: TimeKey | null): boolean {
  if (!dailyTime) return false
  return Math.abs(at.diff(atTime(at, dailyTime), 'minute')) < DAILY_CLEARANCE_MINUTES
}

function atTime(reference: dayjs.Dayjs, time: TimeKey): dayjs.Dayjs {
  const [hour, minute] = time.split(':').map(Number)
  return reference
    .hour(hour ?? 0)
    .minute(minute ?? 0)
    .second(0)
    .millisecond(0)
}

// ---------------------------------------------------------------------------
// 提醒文案
// ---------------------------------------------------------------------------

export interface ToastMessage {
  title: string
  /** 一行补充信息，可以直接为空（标题自己就够） */
  body: string
}

export interface ToastContext {
  /** 称呼。与开屏一致，用计算机名 */
  name: string
  todayTotal: number
  todayDone: number
  /** 逾期未完成的条数 */
  overdueCount: number
  /** 正在进行的课程（有计划且未全部完成），按 deadline 从近到远 */
  activeCourses: { title: string; daysLeft: number | null }[]
}

/**
 * 按当前真实数据拼出候选文案池。
 *
 * 为什么做成"池"而不是直接返回一条：不同数据状态下能说的话不一样 ——
 * 今天还没开始、学了一半、有逾期、有临近的 DDL，各自该说不同的话。
 * 先把可用的都列出来，再随机抽一条，既保证多样性又不会说出不成立的话
 * （比如在没有逾期的时候说"昨天还有 3 项没学完"）。
 */
export function buildMessagePool(context: ToastContext): ToastMessage[] {
  const { name, todayTotal, todayDone, overdueCount, activeCourses } = context
  const rest = Math.max(0, todayTotal - todayDone)
  const pool: ToastMessage[] = []

  // 通用的开场：任何时候都成立
  pool.push({ title: `${name}，今天学点什么？`, body: '书架上的课还在等你翻' })

  if (todayTotal === 0) {
    pool.push({ title: `${name}，今天还没有安排`, body: '去书架挑一门课，生成学习计划' })
  } else if (rest === 0) {
    pool.push({ title: `${name}，今天的任务都完成了`, body: '剩下的时间留给自己' })
  } else if (todayDone === 0) {
    pool.push({ title: `${name}，今天还没开始`, body: `先挑最短的那件做，还有 ${rest} 项` })
  } else {
    pool.push({
      title: `${name}，学完今天的了吗？`,
      body: `已完成 ${todayDone}/${todayTotal}，还差 ${rest} 项`,
    })
  }

  if (overdueCount > 0) {
    pool.push({
      title: `昨天还有 ${overdueCount} 项没学完噢`,
      body: `${name}，抽几分钟补上？`,
    })
  }

  const nearest = activeCourses.find((course) => course.daysLeft !== null) ?? activeCourses[0]
  if (nearest) {
    if (nearest.daysLeft !== null) {
      const days = nearest.daysLeft
      pool.push({
        title: `距离「${nearest.title}」还有 ${days} 天`,
        body: days <= 3 ? '时间不多了，今天推进一点' : `${name}，按计划走就不会慌`,
      })
    } else {
      pool.push({ title: `「${nearest.title}」今天该学了`, body: `${name}，别断了节奏` })
    }
  }

  if (activeCourses.length > 1) {
    pool.push({
      title: `${name}，${activeCourses.length} 门课正在进行`,
      body: '先去书架看看哪门最急',
    })
  }

  pool.push({ title: `${name}，歇够了就回来吧`, body: '哪怕只学十分钟也算数' })

  return pool
}

/** 从池子里随机抽一条。random 可注入，测试里就能钉死结果 */
export function pickToastMessage(context: ToastContext, random: () => number): ToastMessage {
  const pool = buildMessagePool(context)
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[Math.max(0, index)] ?? { title: `${context.name}，今天学点什么？`, body: '' }
}

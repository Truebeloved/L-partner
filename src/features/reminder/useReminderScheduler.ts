import { useCallback, useEffect, useRef, useState } from 'react'

import {
  computeNextFireDelay,
  hasFiredToday,
  missedFireToday,
  resolveNextFireAt,
} from '@/features/reminder/reminder'
import { newId } from '@/lib/id'
import { STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import { useSettingsStore } from '@/store/settings'
import type { ReminderKind, ReminderLog } from '@/types/models'

/**
 * 每日学习提醒的调度器。
 *
 * 实现形态见 docs/design-decisions.md 的 D2：页面内提醒为主，系统通知为辅。
 * 三条硬约束贯穿本文件：
 *   1. 不用 setInterval 轮询 —— 目标时刻是已知的，轮询只会把「准不准」交给间隔长度；
 *   2. 页面重新可见时必须重新校准 —— 浏览器会节流甚至冻结后台标签页的定时器；
 *   3. 页面关掉就真的没有提醒 —— 这是网页应用的边界，UI 上必须说清楚，不能假装能做到。
 */

/** 浏览器通知授权状态；不支持 Notification API 时用 'unsupported' 兜住，UI 据此给出不同文案 */
export type NotificationPermissionState = NotificationPermission | 'unsupported'

export interface ReminderMessage {
  title: string
  body: string
}

/** 当前正在展示的页面内提醒 */
export interface ActiveReminder extends ReminderMessage {
  kind: ReminderKind
  firedAt: Date
}

interface UseReminderSchedulerOptions {
  /**
   * 到点时生成文案。
   * 由调用方去读业务 store 拼文案（比如「今天还有 3 项没完成」），
   * 调度器本身不关心待办数据，这样它也能被别的页面复用。
   */
  buildMessage: (kind: ReminderKind) => ReminderMessage
}

export interface ReminderScheduler {
  /** 需要展示的页面内提醒，null 表示当前没有 */
  activeReminder: ActiveReminder | null
  dismiss: () => void
  /** 系统通知授权状态 —— 这里只反映浏览器给的答案，不代表一定能弹出来 */
  permission: NotificationPermissionState
  /** 必须在用户手势里调用（浏览器要求），所以由 UI 的按钮触发 */
  requestPermission: () => Promise<void>
  /** 下一次预计触发的时刻，UI 用来显示「下次提醒」；未开启提醒时为 null */
  nextFireAt: Date | null
}

/**
 * 提醒日志存 localStorage：它的作用就是「今天已经提醒过就别再打扰」，跨标签页、跨刷新都该成立。
 * 反过来，没有记录就意味着「今天还没提醒过」—— 页面当时没开着的话，切回来仍会补发。
 * 一天最多一条，留最近若干条就够。
 */
const LOG_STORAGE_KEY = `${STORAGE_PREFIX}.reminder-logs`

/** 上限只是防止存储无限增长，判定「今天提醒过没有」只看当天 */
const MAX_KEPT_LOGS = 20

export function useReminderScheduler({
  buildMessage,
}: UseReminderSchedulerOptions): ReminderScheduler {
  const reminderEnabled = useSettingsStore((state) => state.settings.reminderEnabled)
  const dailyReminderTime = useSettingsStore((state) => state.settings.dailyReminderTime)

  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null)
  const [permission, setPermission] = useState<NotificationPermissionState>(readPermission)

  // 文案生成函数放进 ref：调用方忘了用 useCallback 也不会导致定时器被反复重建
  const buildMessageRef = useRef(buildMessage)
  useEffect(() => {
    buildMessageRef.current = buildMessage
  })

  useEffect(() => {
    if (!reminderEnabled) return

    let timerId: number | null = null

    const clearTimer = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId)
        timerId = null
      }
    }

    const markFired = (kind: ReminderKind) => {
      const log: ReminderLog = { id: newId(), kind, firedAt: new Date().toISOString() }
      saveLogs([...loadLogs(), log].slice(-MAX_KEPT_LOGS))
    }

    const notifySystem = (message: ReminderMessage) => {
      // 系统通知只是补充路径：页面内提醒已经弹过了，所以这里任何一种失败都不值得打扰用户
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      try {
        const notification = new Notification(message.title, {
          body: message.body,
          // 同一个 tag 的通知会互相替换，避免系统通知中心里堆一排「该学习了」
          tag: 'lpartner-daily-reminder',
        })
        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      } catch {
        // 部分移动端浏览器只允许 Service Worker 发通知，构造会直接抛错 —— 静默跳过
      }
    }

    const fire = (kind: ReminderKind) => {
      markFired(kind)
      const message = buildMessageRef.current(kind)
      // ① 页面内提醒：主路径。系统通知可能被拒绝、被静默丢弃、甚至不支持，
      //    页面内横幅没有这些不确定性。
      setActiveReminder({ kind, firedAt: new Date(), ...message })
      // ② 授权通过时再补一条系统通知，让用户切到别的标签页也能看见
      notifySystem(message)
    }

    /**
     * 校准定时器：补发错过的提醒，然后精确定时到下一次。
     * 首次挂载、定时器到点、页面重新可见，三种情况都走这里，逻辑只有一份。
     */
    const arm = () => {
      clearTimer()
      const now = new Date()

      // 每次校准都重新读一遍日志：多个标签页共享同一份存储，
      // 各自在内存里记一份的话，两个标签页会同时弹同一条提醒
      const firedToday = hasFiredToday(loadLogs(), now, 'daily')

      if (!firedToday && missedFireToday(now, dailyReminderTime)) {
        // 页面在后台时定时器可能已经被节流或冻结，醒过来时目标时刻早就过去了。
        // 如果这里只排下一次，用户切回页面看到的将是「下次提醒：明天」—— 今天的提醒凭空消失。
        fire('daily')
      }

      const delay = computeNextFireDelay(new Date(), dailyReminderTime)
      // 不用 setInterval：轮询的准确度取决于间隔长度，间隔小了费电、大了不准，
      // 而且后台标签页里每次轮询都可能被节流，误差会累积。
      // 提醒时刻是**已知**的，所以直接算出距离那一刻的毫秒数，一次性定时到点；
      // 到点后 arm 会自己再排下一天，不依赖任何周期性心跳。
      timerId = window.setTimeout(arm, delay)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      // 切回页面时重新对表：既纠正被节流的定时器，也顺便刷新一下授权状态
      // （用户可能在浏览器设置里改过通知权限）
      setPermission(readPermission())
      arm()
    }

    arm()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [reminderEnabled, dailyReminderTime])

  const dismiss = useCallback(() => setActiveReminder(null), [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    try {
      setPermission(await Notification.requestPermission())
    } catch {
      // 非安全上下文或缺少用户手势时浏览器会拒绝这个调用，保持原状态即可 ——
      // 系统通知拿不到不代表提醒失效，页面内提醒照常工作
      setPermission(readPermission())
    }
  }, [])

  return {
    activeReminder,
    dismiss,
    permission,
    requestPermission,
    // 派生而不是存进 state：下一次触发时刻完全由「当前时间 + 设置」决定，
    // 存成 state 只会在开关/改时间时多一轮级联渲染，没有任何额外信息量
    nextFireAt: reminderEnabled ? resolveNextFireAt(new Date(), dailyReminderTime) : null,
  }
}

function readPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

function loadLogs(): ReminderLog[] {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ReminderLog[]) : []
  } catch {
    // 无痕模式、存储被禁用、数据被改坏：退化成「没有记录」，
    // 最坏结果只是当天可能多提醒一次，功能本身不能因此挂掉
    return []
  }
}

function saveLogs(logs: ReminderLog[]): void {
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs))
  } catch {
    // 写失败意味着「今天是否提醒过」记不住，提醒本身照常发出
  }
}

import { createContext, useContext } from 'react'

import type { ReminderScheduler } from '@/features/reminder/useReminderScheduler'

/**
 * 提醒调度器的共享入口。
 *
 * 为什么需要它：调度器最初挂在「今日」页里，结果只有在今日页时才可能收到提醒 ——
 * 而用户完全可能正在课程页或对话页学习。提醒是全局能力，必须挂在应用外壳上。
 * 但「今日」页仍要展示提醒状态面板，所以调度器需要被两处同时读到，
 * 于是用一个 context 把它提升上来，而不是实例化两份（那会重复提醒）。
 */
export const ReminderContext = createContext<ReminderScheduler | null>(null)

export function useReminder(): ReminderScheduler {
  const value = useContext(ReminderContext)
  if (!value) {
    throw new Error('useReminder 必须在 ReminderProvider 内部使用')
  }
  return value
}

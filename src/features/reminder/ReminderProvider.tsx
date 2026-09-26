import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { ReminderBanner } from '@/features/reminder/components/ReminderBanner'
import { DesktopReminderContext, ReminderContext } from '@/features/reminder/context'
import { useDesktopReminder } from '@/features/reminder/useDesktopReminder'
import { useReminderScheduler } from '@/features/reminder/useReminderScheduler'
import { todayKey } from '@/lib/date'
import { useTodoStore } from '@/store/todos'
import type { ReminderKind } from '@/types/models'

/**
 * 提醒的全局宿主。
 *
 * 它挂在应用外壳上而不是某个页面里 —— 提醒是「到点就该响」的能力，
 * 不该因为用户此刻正在课程页或对话页就失效。
 * 横幅用固定定位渲染成浮层，所以不会挤动任何页面的布局。
 *
 * 这里同时托管**两套提醒**，它们的开关与可达范围都不同：
 * - useReminderScheduler：每日固定时刻的页面内横幅，只在应用开着时看得到
 * - useDesktopReminder：一天内随机时刻的桌面小窗，应用收进托盘后照样会弹
 */
export function ReminderProvider({ children }: { children: ReactNode }) {
  /**
   * 到点时用来拼文案。
   * 这里现读 store（getState）而不是订阅：提醒只需在触发的那一刻拿到最新数据，
   * 订阅反而会让文案函数频繁换身份、把定时器重建掉。
   */
  const buildMessage = useCallback((_kind: ReminderKind) => {
    const pending = useTodoStore
      .getState()
      .listByDate(todayKey())
      .filter((todo) => !todo.done)

    if (pending.length === 0) {
      return { title: '今天的学习已安排完成', body: '任务都勾完了，想加练可以再添一条。' }
    }
    return {
      title: '该学习了',
      body: `今天还有 ${pending.length} 项没完成，先挑最短的那件开始。`,
    }
  }, [])

  const scheduler = useReminderScheduler({ buildMessage })
  const desktop = useDesktopReminder()

  return (
    <DesktopReminderContext.Provider value={desktop}>
      <ReminderContext.Provider value={scheduler}>
        {children}
        {scheduler.activeReminder && (
          <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-lg">
              <ReminderBanner reminder={scheduler.activeReminder} onDismiss={scheduler.dismiss} />
            </div>
          </div>
        )}
      </ReminderContext.Provider>
    </DesktopReminderContext.Provider>
  )
}

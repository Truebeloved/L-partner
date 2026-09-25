import type { ActiveReminder } from '@/features/reminder/useReminderScheduler'

interface ReminderBannerProps {
  reminder: ActiveReminder | null
  onDismiss: () => void
}

/**
 * 到点时弹出的页面内提醒 —— 提醒的主路径。
 *
 * 为什么把它当主路径：系统通知要先拿到授权，还可能被浏览器静默丢弃（专注模式、
 * 免打扰、部分移动端要求走 Service Worker），页面内横幅没有这些不确定性。
 */
export function ReminderBanner({ reminder, onDismiss }: ReminderBannerProps) {
  if (!reminder) return null

  return (
    <div
      // role="status" 让读屏软件在提醒出现时报读，而不是静默插入一段文字
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
    >
      <span className="text-xl leading-none">⏰</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-900">{reminder.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-brand-700">{reminder.body}</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onDismiss}>
        知道了
      </button>
    </div>
  )
}

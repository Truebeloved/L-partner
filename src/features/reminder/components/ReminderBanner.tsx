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
 *
 * 视觉上刻意**不用红色**：设计系统里红色只表示「出错了 / 逾期了」，
 * 而提醒是到点该学习了，不是故障。这里用黑底标签 + 黑字来表达「重要」。
 */
export function ReminderBanner({ reminder, onDismiss }: ReminderBannerProps) {
  if (!reminder) return null

  return (
    <div
      // role="status" 让读屏软件在提醒出现时报读，而不是静默插入一段文字
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-raised px-4 py-3 shadow-pop"
    >
      {/* 原来是 ⏰ emoji。彩色 emoji 在这套单色系里是唯一的例外色，换成黑底标签更统一 */}
      <span className="badge-solid shrink-0">提醒</span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-ink">{reminder.title}</p>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">{reminder.body}</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onDismiss}>
        知道了
      </button>
    </div>
  )
}

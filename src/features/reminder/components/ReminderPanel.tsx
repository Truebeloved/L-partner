import { Link } from 'react-router-dom'

import type { NotificationPermissionState } from '@/features/reminder/useReminderScheduler'
import { dayjs, formatRelativeDay, toDateKey } from '@/lib/date'
import type { TimeKey } from '@/types/models'

interface ReminderPanelProps {
  enabled: boolean
  time: TimeKey
  /** 没有下一次触发时刻（未开启提醒）时为 null */
  nextFireAt: Date | null
  permission: NotificationPermissionState
  onRequestPermission: () => void
}

/** `8月30日 20:00` 这种完整描述留给设置页，这里只关心「今天还是明天」 */
function describeNextFire(at: Date): string {
  return `${formatRelativeDay(toDateKey(at))} ${dayjs(at).format('HH:mm')}`
}

/**
 * 提醒状态面板：只**展示**当前状态，开关和时刻都归「设置」页管 ——
 * 同一个设置项有两个入口，迟早会出现两处显示不一致。
 *
 * 这里是唯一把限制写明的地方：用户得在页面上看到「页面关掉就不会提醒」，
 * 才不会在第二天以为提醒坏了。
 */
export function ReminderPanel({
  enabled,
  time,
  nextFireAt,
  permission,
  onRequestPermission,
}: ReminderPanelProps) {
  return (
    <section className="card mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">每日学习提醒</h2>
        <Link to="/settings" className="btn btn-outline">
          去设置里调整
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {enabled ? (
          <>
            <span className="badge bg-brand-50 text-brand-700">已开启 · 每天 {time}</span>
            {nextFireAt && <span className="muted">下一次：{describeNextFire(nextFireAt)}</span>}
          </>
        ) : (
          <>
            <span className="badge bg-slate-100 text-slate-500">未开启</span>
            <span className="muted">去「设置」页开启后，每天到点会在这里提醒你开始学习。</span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">系统通知</span>
        {permission === 'granted' && (
          <span className="badge bg-emerald-50 text-emerald-700">已授权</span>
        )}
        {permission === 'default' && (
          <>
            <span className="badge bg-slate-100 text-slate-500">未授权</span>
            <button type="button" className="btn btn-outline" onClick={onRequestPermission}>
              开启系统通知
            </button>
            <span className="text-xs text-slate-400">
              授权后切到别的标签页也能看到通知，但页面内提醒才是主要方式
            </span>
          </>
        )}
        {permission === 'denied' && (
          <>
            <span className="badge bg-slate-100 text-slate-500">已被浏览器拒绝</span>
            <span className="text-xs text-slate-400">
              需要在浏览器的站点设置里重新允许；页面内提醒不受影响
            </span>
          </>
        )}
        {permission === 'unsupported' && (
          <span className="badge bg-slate-100 text-slate-500">当前浏览器不支持</span>
        )}
      </div>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
        关于限制：这是一个网页应用，定时提醒只在
        <strong className="font-semibold">页面打开时</strong>
        有效。页面被关掉、或者标签页被浏览器休眠之后，没有任何代码在运行，到点不会有提醒 ——
        这一点我们不会假装能做到。页面重新可见时，如果错过的提醒在 2 小时以内，会立刻补上。
      </p>
    </section>
  )
}

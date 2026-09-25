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
        <h2 className="card-title">每日学习提醒</h2>
        <Link to="/settings" className="btn btn-secondary">
          去设置里调整
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {enabled ? (
          <>
            <span className="badge">已开启 · 每天 {time}</span>
            {nextFireAt && <span className="muted">下一次：{describeNextFire(nextFireAt)}</span>}
          </>
        ) : (
          <>
            <span className="badge">未开启</span>
            <span className="muted">去「设置」页开启后，每天到点会在这里提醒你开始学习。</span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <span className="hint">系统通知</span>
        {/* 曾经用绿色表示「已授权」。单色系里没有绿色，也不该用红色（授权成功不是错误），
            所以状态差异靠**填充与描边**区分：已授权用实心标签，其余用描边标签 */}
        {permission === 'granted' && <span className="badge-solid">已授权</span>}
        {permission === 'default' && (
          <>
            <span className="badge">未授权</span>
            <button type="button" className="btn btn-secondary" onClick={onRequestPermission}>
              开启系统通知
            </button>
            <span className="hint">授权后切到别的标签页也能看到通知，但页面内提醒才是主要方式</span>
          </>
        )}
        {permission === 'denied' && (
          <>
            <span className="badge">已被浏览器拒绝</span>
            <span className="hint">需要在浏览器的站点设置里重新允许；页面内提醒不受影响</span>
          </>
        )}
        {permission === 'unsupported' && <span className="badge">当前浏览器不支持</span>}
      </div>

      {/* 这一段原来是琥珀色警示底。按设计约束，红色只能用于逾期 / 错误 / 破坏性操作，
          而「页面关掉后不会提醒」是一条功能限制说明，不是错误，所以用中性底纹。
          注：正文里的「这是一个网页应用」在当前桌面版下已经过时，但按约定不改文案（测试依赖它）。 */}
      <p className="mt-4 rounded-sm bg-ink/5 px-3 py-2 text-small leading-relaxed text-ink">
        关于限制：这是一个网页应用，定时提醒只在
        <strong className="font-bold">页面打开时</strong>
        有效。页面被关掉、或者标签页被浏览器休眠之后，没有任何代码在运行，到点不会有提醒 ——
        这一点我们不会假装能做到。页面重新可见时，如果错过的提醒在 2 小时以内，会立刻补上。
      </p>
    </section>
  )
}

import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { LlmSettingsCard } from '@/features/settings/components/LlmSettingsCard'
import { todayKey } from '@/lib/date'
import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'

const REMINDER_TIMES = ['08:00', '12:30', '18:00', '20:00', '21:30', '22:00']

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotice('当前浏览器不支持系统通知')
      return
    }
    const permission = await Notification.requestPermission()
    setNotice(
      permission === 'granted'
        ? '已获得系统通知权限'
        : '未获得系统通知权限，提醒仍会以页面内弹窗的形式出现',
    )
  }

  function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: useSettingsStore.getState().settings,
      personas: usePersonaStore.getState().personas,
      courses: useCourseStore.getState().courses,
      plans: usePlanStore.getState().plans,
      todos: useTodoStore.getState().todos,
      memories: useMemoryStore.getState().entries,
      conversations: useChatStore.getState().conversations,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `l-partner-backup-${todayKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('已导出备份文件')
  }

  function clearAllData() {
    usePlanStore.setState({ plans: {} })
    useTodoStore.setState({ todos: [] })
    useMemoryStore.setState({ entries: [] })
    useChatStore.setState({ conversations: [], activeId: null })
    useCourseStore.setState({ courses: [] })
    usePersonaStore.setState({ personas: BUILTIN_PERSONAS })
    useSettingsStore.getState().reset()
    setClearConfirm(false)
    setNotice('本地数据已全部清除')
  }

  return (
    <>
      <PageHeader title="设置" description="接入你自己的大模型，以及提醒与记忆偏好" />

      <div className="max-w-3xl space-y-5 px-6 pb-8">
        <LlmSettingsCard />

        <section className="card">
          <h2 className="section-title">学习提醒</h2>
          <p className="muted mt-2">
            到点提醒你今天的学习任务。系统通知需要授权，且只在页面打开时有效。
          </p>

          <label className="mt-4 flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="size-4 accent-ink"
              checked={settings.reminderEnabled}
              onChange={(event) => update({ reminderEnabled: event.target.checked })}
            />
            <span className="text-body text-ink">开启每日提醒</span>
          </label>

          <div className="mt-4">
            <span className="label">提醒时刻</span>
            {/* 与「记忆」页的筛选器同一套单色分段控件：选中=黑底白字，未选中=幽灵按钮 */}
            <div className="flex flex-wrap gap-2">
              {REMINDER_TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  className={
                    settings.dailyReminderTime === time
                      ? 'btn bg-ink text-ink-inverse btn-sm'
                      : 'btn btn-ghost btn-sm'
                  }
                  onClick={() => update({ dailyReminderTime: time })}
                >
                  {time}
                </button>
              ))}
              <input
                type="time"
                className="input w-32 py-1 text-small"
                value={settings.dailyReminderTime}
                onChange={(event) => update({ dailyReminderTime: event.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={requestNotificationPermission}
            >
              授权系统通知
            </button>
            <span className="hint">
              注意：网页关闭后无法主动提醒 —— 这是浏览器沙箱的限制，不是可以绕过的 bug。
            </span>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">记忆</h2>
          <p className="muted mt-2">
            学伴会从对话里积累对你的了解。抽取记忆需要额外调用模型，会消耗 token。
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-ink"
              checked={settings.autoExtractMemory}
              onChange={(event) => update({ autoExtractMemory: event.target.checked })}
            />
            <span className="text-body text-ink">
              自动抽取记忆
              <span className="hint mt-0.5 block">
                每积累若干轮对话才抽取一次，而不是每句都抽。关掉后仍可在对话里手动「记住这个」。
              </span>
            </span>
          </label>
        </section>

        <section className="card">
          <h2 className="section-title">数据</h2>
          <p className="muted mt-2">
            所有数据都存在这台设备的浏览器里（IndexedDB），没有服务端。换设备或清空浏览器数据都会丢失，建议定期导出备份。
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <button type="button" className="btn btn-secondary" onClick={exportData}>
              导出备份（JSON）
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setClearConfirm(true)}>
              清除全部数据
            </button>
          </div>

          {/* 破坏性操作确认：alert 红的另一个正当场景 */}
          {clearConfirm && (
            <div className="mt-3 rounded-card border border-alert bg-alert-soft px-4 py-3">
              <p className="text-body font-bold text-alert">
                确认清除？课程、计划、待办、对话与记忆都会被删除，且无法恢复。
              </p>
              <p className="mt-1 text-small text-alert">如果这些数据对你有价值，请先导出备份。</p>
              <div className="mt-3 flex gap-4">
                <button type="button" className="btn btn-danger" onClick={clearAllData}>
                  确认清除
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setClearConfirm(false)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 提示条：中性信息，用浅灰底而不是彩色 */}
        {notice && (
          <div className="rounded-sm bg-ink/5 px-4 py-2.5 text-body text-ink">{notice}</div>
        )}

        <section className="card-flat bg-ink/5">
          <h2 className="section-title">关于 L-partner</h2>
          <p className="muted mt-2 leading-relaxed">
            一个把「课程 → 学习计划 → 每日待办 → 到点提醒 →
            完成情况回流调整」串成闭环的学习辅助工具。
            学伴的角色可自定义，并会随着对话积累对你的了解。
          </p>
          <p className="hint mt-2">纯前端实现 · 数据本地存储 · 无服务端 · OH 社团面试任务作品</p>
        </section>
      </div>
    </>
  )
}

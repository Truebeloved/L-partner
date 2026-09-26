import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { useDesktopReminderState } from '@/features/reminder/context'
import { LlmSettingsCard } from '@/features/settings/components/LlmSettingsCard'
import { SettingRow } from '@/features/settings/components/SettingRow'
import { Toggle } from '@/features/settings/components/Toggle'
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
  /** 桌面提醒的调度状态由应用外壳提供 —— 它在托盘里也在跑，不只是这个页面 */
  const desktop = useDesktopReminderState()
  const [clearConfirm, setClearConfirm] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotice('当前系统不支持系统通知')
      return
    }
    const permission = await Notification.requestPermission()
    setNotice(permission === 'granted' ? '已获得系统通知权限' : '未获得系统通知权限')
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

  const maxPerDay = settings.desktopReminderMaxPerDay ?? 4

  return (
    <>
      <PageHeader title="设置" description="模型、提醒与数据" />

      <div className="page-container space-y-4">
        {/* 大模型接入是唯一需要常驻展开的区块：它是表单，不是开关 */}
        <LlmSettingsCard />

        <section className="card">
          <SettingRow
            title="桌面提醒"
            control={
              <Toggle
                checked={settings.desktopReminderEnabled}
                label="桌面提醒"
                onChange={(next) => update({ desktopReminderEnabled: next })}
              />
            }
          />

          {settings.desktopReminderEnabled && (
            <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-line-soft pt-4">
              <div>
                <span className="label">活跃时段</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="input w-28 py-1 text-small"
                    aria-label="活跃时段开始"
                    value={settings.desktopReminderFrom}
                    onChange={(event) => update({ desktopReminderFrom: event.target.value })}
                  />
                  <span className="text-small text-ink-faint">至</span>
                  <input
                    type="time"
                    className="input w-28 py-1 text-small"
                    aria-label="活跃时段结束"
                    value={settings.desktopReminderTo}
                    onChange={(event) => update({ desktopReminderTo: event.target.value })}
                  />
                </div>
              </div>

              <div>
                <span className="label">每天最多</span>
                <div className="flex gap-2">
                  {[2, 3, 4, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={
                        maxPerDay === count ? 'btn btn-sm bg-ink text-ink-inverse' : 'btn btn-ghost btn-sm'
                      }
                      onClick={() => update({ desktopReminderMaxPerDay: count })}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    void desktop.fireNow().then((shown) => {
                      setNotice(shown ? '已弹出，看屏幕右下角' : '本应用正在前台，按设计不弹')
                    })
                  }}
                >
                  试一条
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <SettingRow
            title="每日固定提醒"
            control={
              <Toggle
                checked={settings.reminderEnabled}
                label="每日固定提醒"
                onChange={(next) => update({ reminderEnabled: next })}
              />
            }
          />

          {settings.reminderEnabled && (
            <div className="mt-5 border-t border-line-soft pt-4">
              <span className="label">提醒时刻</span>
              <div className="flex flex-wrap items-center gap-2">
                {REMINDER_TIMES.map((time) => (
                  <button
                    key={time}
                    type="button"
                    className={
                      settings.dailyReminderTime === time
                        ? 'btn btn-sm bg-ink text-ink-inverse'
                        : 'btn btn-ghost btn-sm'
                    }
                    onClick={() => update({ dailyReminderTime: time })}
                  >
                    {time}
                  </button>
                ))}
                <input
                  type="time"
                  className="input w-28 py-1 text-small"
                  aria-label="自定义提醒时刻"
                  value={settings.dailyReminderTime}
                  onChange={(event) => update({ dailyReminderTime: event.target.value })}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={requestNotificationPermission}>
                  授权系统通知
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <SettingRow
            title="省流模式"
            hint="压缩上下文，减少 token 消耗"
            control={
              <Toggle
                checked={settings.efficientMode}
                label="省流模式"
                onChange={(next) => update({ efficientMode: next })}
              />
            }
          />
        </section>

        <section className="card">
          <SettingRow
            title="自动抽取记忆"
            hint="从对话里积累对你的了解"
            control={
              <Toggle
                checked={settings.autoExtractMemory}
                label="自动抽取记忆"
                onChange={(next) => update({ autoExtractMemory: next })}
              />
            }
          />
        </section>

        <section className="card">
          <SettingRow
            title="数据"
            hint="导出备份或清空本地数据"
            control={
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={exportData}>
                  导出备份
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setClearConfirm(true)}
                >
                  清除
                </button>
              </>
            }
          />

          {clearConfirm && (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-alert/30 pt-4">
              <p className="text-small text-alert">课程、计划、待办、对话与记忆都会被删除，无法恢复。</p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-danger btn-sm" onClick={clearAllData}>
                  确认清除
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClearConfirm(false)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </section>

        {notice && (
          <div className="rounded-card bg-ink/5 px-4 py-2.5 text-small text-ink">{notice}</div>
        )}

        <section className="card">
          <SettingRow title="关于" hint="纯前端 · 数据本地存储 · 无服务端" />
        </section>
      </div>
    </>
  )
}

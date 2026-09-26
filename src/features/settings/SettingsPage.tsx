import { useRef, useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { installSeedCourses } from '@/features/course/seedInstall'
import { applyBackup, backupFileName, collectBackup, parseBackup } from '@/features/settings/backup'
import type { BackupPayload, BackupSummary } from '@/features/settings/backup'
import { useDesktopReminderState } from '@/features/reminder/context'
import { LlmSettingsCard } from '@/features/settings/components/LlmSettingsCard'
import { SettingRow } from '@/features/settings/components/SettingRow'
import { Toggle } from '@/features/settings/components/Toggle'
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
  /** 等待确认的导入：解析成功后先给用户看清楚要覆盖什么，再落库 */
  const [pendingImport, setPendingImport] = useState<
    { payload: BackupPayload; summary: BackupSummary } | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotice('当前系统不支持系统通知')
      return
    }
    const permission = await Notification.requestPermission()
    setNotice(permission === 'granted' ? '已获得系统通知权限' : '未获得系统通知权限')
  }

  function exportData() {
    const payload = collectBackup()

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = backupFileName()
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('已导出备份文件')
  }

  /**
   * 读文件并**先解析、再确认**。
   *
   * 导入是覆盖全部数据的动作，所以中间必须有一步"让用户看到这份备份里到底有什么"。
   * 解析失败时直接说明哪里不对（选错文件、版本更新、备份是空的），
   * 而不是弹一个"导入失败"就完事。
   */
  async function handleImportFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    const result = parseBackup(text)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setNotice(null)
    setPendingImport({ payload: result.payload, summary: result.summary })
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
            title="示例课程"
            hint="随应用交付的现成教学方案，用来在零配置下走通「课程 → 计划 → 待办」"
            control={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const installed = installSeedCourses({ force: true })
                  setNotice(
                    installed > 0
                      ? `已把 ${installed} 门示例课程摆上书架`
                      : '示例课程都已经在书架上了',
                  )
                }}
              >
                载入示例课程
              </button>
            }
          />
        </section>

        <section className="card">
          <SettingRow
            title="数据"
            hint="导出备份、从备份恢复，或清空本地数据"
            control={
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={exportData}>
                  导出备份
                </button>
                {/*
                  导入用隐藏的 file input：Electron 里它会拉起系统文件选择框，
                  不需要为了这一件事单独走主进程的 dialog IPC
                */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  导入备份
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  aria-label="选择备份文件"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    // 先清空 value：同一个文件连选两次也要能触发 change
                    event.target.value = ''
                    void handleImportFile(file)
                  }}
                />
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

      {/*
        导入的二次确认放在最后：它要说清"这份备份里有什么"和"现在的什么会被覆盖"。
        只说"确定要导入吗"等于什么都没说 —— 用户没法核对这是不是他要的那一份。
      */}
      {pendingImport && (
        <ConfirmDialog
          title="用这份备份覆盖当前数据？"
          message={[
            `备份导出时间：${
              pendingImport.summary.exportedAt
                ? new Date(pendingImport.summary.exportedAt).toLocaleString()
                : '未标注'
            }`,
            `包含：${[
              `${pendingImport.summary.courses} 门课程`,
              `${pendingImport.summary.plans} 份学习计划`,
              `${pendingImport.summary.todos} 条待办`,
              `${pendingImport.summary.memories} 条记忆`,
              `${pendingImport.summary.conversations} 场对话`,
              // 设置里含 API 密钥，必须点名 —— 用户不会想到"导入备份"会换掉自己的模型配置
              pendingImport.summary.hasSettings ? '大模型接入配置' : null,
            ]
              .filter(Boolean)
              .join('、')}`,
            '当前设备上的课程、计划、待办、记忆、对话与设置都会被这份备份整份替换，无法撤销。',
          ].join('\n')}
          confirmText="导入并覆盖"
          danger
          onConfirm={() => {
            const { summary } = pendingImport
            applyBackup(pendingImport.payload)
            setPendingImport(null)
            setNotice(
              `已从备份恢复：${summary.courses} 门课程、${summary.todos} 条待办、${summary.memories} 条记忆、${summary.conversations} 场对话`,
            )
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </>
  )
}

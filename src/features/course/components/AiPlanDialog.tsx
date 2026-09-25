import { useState } from 'react'

import type { AiPlanRequest, CoursePlanDraft } from '@/features/course/drafts'

interface AiPlanDialogProps {
  /**
   * 【AI 集成点】由 AI 层注入的生成函数 —— 本组件只负责收集目标、转交请求、把结果还给页面，
   * 不发起任何网络调用。这样 LLM 接入（baseUrl / apiKey / 流式 / 提示词工程）全部留在 AI 层，
   * 课程域不必知道用的是哪家模型。
   */
  generate: (request: AiPlanRequest) => Promise<CoursePlanDraft>
  onCancel: () => void
  /** 拿到草稿后交给页面：它会打开手写表单让用户继续编辑，符合 D3「AI 产出必须可编辑后落库」 */
  onGenerated: (draft: CoursePlanDraft) => void
}

/** 「让 AI 帮我生成方案」的输入弹窗（D3 路径 A：用户只说想学什么） */
export function AiPlanDialog({ generate, onCancel, onGenerated }: AiPlanDialogProps) {
  const [goal, setGoal] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('10')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!goal.trim()) {
      setError('先说清楚你想学什么，比如「两个月上手 React」。')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const hours = Number(weeklyHours)
      const draft = await generate({
        goal: goal.trim(),
        weeklyHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
        deadline: deadline || undefined,
      })
      onGenerated(draft)
    } catch (cause) {
      // 失败必须让用户看见：静默失败会让人以为按钮没反应，进而反复点击
      setError(cause instanceof Error ? cause.message : '生成失败，请检查大模型配置后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="让 AI 帮我生成方案"
        className="w-full max-w-md rounded-card bg-raised p-5 shadow-pop"
      >
        <h2 className="card-title">让 AI 帮我生成方案</h2>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          说清楚目标，由你配置的大模型拆出阶段、单元与知识点；生成结果会先填进表单，改完再保存。
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="ai-goal">
              学习目标
            </label>
            <input
              id="ai-goal"
              className="input"
              value={goal}
              autoFocus
              placeholder="如：两个月上手 React，能自己写个小项目"
              onChange={(event) => setGoal(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ai-weekly">
                每周可投入（小时）
              </label>
              <input
                id="ai-weekly"
                type="number"
                min={1}
                step={0.5}
                className="input"
                value={weeklyHours}
                onChange={(event) => setWeeklyHours(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="ai-deadline">
                期望完成日期
              </label>
              <input
                id="ai-deadline"
                type="date"
                className="input"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 生成失败是错误信息，属于红色允许出现的场景 */}
        {error && (
          <p className="mt-3 rounded-sm border border-alert bg-alert-soft px-3 py-2 text-small text-alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={busy}
          >
            {busy ? '生成中…' : '生成方案'}
          </button>
        </div>
      </div>
    </div>
  )
}

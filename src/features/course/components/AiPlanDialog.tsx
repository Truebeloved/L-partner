import { useState } from 'react'

import { draftFromCollection } from '@/features/course/bilibili'
import type { AiPlanRequest, CoursePlanDraft } from '@/features/course/drafts'
import { fetchBilibiliCollection } from '@/lib/platform'
import { useEscapeKey } from '@/lib/useEscapeKey'

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
  const [collectionUrl, setCollectionUrl] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('10')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Esc = 取消（捕获阶段）。生成中不响应：那会把一次已经发出去的请求变成"点了没反应"
  useEscapeKey(
    () => {
      if (!busy) onCancel()
    },
    { capture: true },
  )

  async function handleGenerate() {
    if (!goal.trim() && !collectionUrl.trim()) {
      setError('先说清楚你想学什么，或者直接把 B 站合集的链接贴进来。')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const hours = Number(weeklyHours)
      const options = {
        weeklyHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
        deadline: deadline || undefined,
      }

      /*
       * 给了合集链接就走"抓真实目录"这条路：**一讲就是一个单元**。
       *
       * 这才是内容够多的正解 —— C 语言那门课 B 站上有一百多讲，
       * 让模型凭记忆写只写得出十几个，而目录是现成的、每一讲都有能打开的地址、
       * 而且一次模型调用都不用发。
       */
      if (collectionUrl.trim()) {
        const result = await fetchBilibiliCollection(collectionUrl.trim())
        if (!result.ok || !result.episodes?.length) {
          setError(result.error ?? '没有读到分集目录，换一个合集链接试试。')
          return
        }
        onGenerated(
          draftFromCollection(
            { title: result.title ?? goal.trim(), episodes: result.episodes },
            { goal: goal.trim(), ...options },
          ),
        )
        return
      }

      onGenerated(await generate({ goal: goal.trim(), ...options }))
    } catch (cause) {
      // 失败必须让用户看见：静默失败会让人以为按钮没反应，进而反复点击
      setError(cause instanceof Error ? cause.message : '生成失败，请检查大模型配置后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="让 AI 帮我生成方案"
        className="w-full max-w-md rounded-card bg-raised p-5 shadow-pop"
      >
        <h2 className="card-title">我想学什么</h2>
        <p className="mt-2 text-small leading-relaxed text-ink-soft">
          一句话说清目标就行。如果 B 站上有公认好的合集（比如 C 语言 → 浙大翁恺），
          **把合集链接贴进来**，会把它的分集目录整份读下来当课程 ——
          一讲一个单元，每讲都能直接打开，而且不消耗任何 token。
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
          <div>
            <label className="label" htmlFor="ai-collection">
              B 站合集链接（可选，推荐）
            </label>
            <input
              id="ai-collection"
              className="input"
              value={collectionUrl}
              placeholder="https://www.bilibili.com/video/BV… 或合集链接"
              onChange={(event) => setCollectionUrl(event.target.value)}
            />
            <p className="hint mt-1">
              填了它就会把整个合集的分集读下来当课程，一讲一个单元；不填则按目标让模型设计
            </p>
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

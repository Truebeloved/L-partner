import { useNavigate } from 'react-router-dom'

import type { PendingAction } from '@/features/agent/execute'
import { useCreateCourseIntent } from '@/features/course/createIntent'

export interface AgentNoticeProps {
  /** 学伴刚刚替你做掉的事，一句话一条 */
  receipts: string[]
  /** 不可撤销、等你点头的动作 */
  pending: PendingAction[]
  onConfirm: (id: string) => void
  onDismissPending: (id: string) => void
}

/**
 * 「学伴替你做了什么」。
 *
 * 为什么这件事必须显示出来：全局 AI 是在**后台**动手的（一次抽取里顺手把待办、
 * 改期、删除都办了），界面上如果一点动静都没有，用户分不清"它办成了"、
 * "它没听懂"和"它压根没动手" —— 这三件事的体验差别极大，看起来却完全一样。
 * 用户报过的问题正是这个："它只会分析出待办任务但不会给我添加到待办区域"。
 *
 * 两条界面口径（都是用户明确要求的）：
 * 1. **回执自己会走，不需要用户点"知道了"**。它是一句回话，不是待办事项 ——
 *    要用户为"看一眼"付一次点击，等于每次都打扰他一下。所以这里没有关闭按钮，
 *    退场完全交给计时器（见 useChatSession 的 scheduleReceiptClear）。
 * 2. **不可撤销的动作不跟着一起走**：那是一句问话（"要删掉这门课吗"），
 *    必须等人回答，所以它保留按钮、也不自动消失。
 *
 * 样式刻意克制（与桌面小窗同一套口径）：无图标、无重阴影、字重不加重、一行一条。
 */
export function AgentNotice({
  receipts,
  pending,
  onConfirm,
  onDismissPending,
}: AgentNoticeProps) {
  const navigate = useNavigate()
  const requestCreate = useCreateCourseIntent((state) => state.request)

  if (receipts.length === 0 && pending.length === 0) return null

  return (
    <div data-agent-notice className="space-y-2">
      {receipts.length > 0 && (
        <div className="rounded-card border border-line-soft bg-raised px-3 py-2">
          <ul className="space-y-0.5 text-small leading-relaxed text-ink">
            {receipts.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {pending.map((action) => (
        <div
          key={action.id}
          className="rounded-card border border-line-soft bg-raised px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-small leading-relaxed text-ink">{action.prompt}</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="text-micro text-ink-faint hover:text-ink"
                onClick={() => onDismissPending(action.id)}
              >
                算了
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (action.kind === 'destructive') {
                    onConfirm(action.id)
                    return
                  }
                  /*
                    新建课程：动作本身不落库（课程一律由 AI 设计、且要用户核对初稿），
                    所以这里只把目标带过去，打开「新建课程」流程让他看方案。
                  */
                  requestCreate(action.goal)
                  onDismissPending(action.id)
                  navigate('/')
                }}
              >
                {action.kind === 'destructive' ? action.confirmText : '去核对课程方案'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

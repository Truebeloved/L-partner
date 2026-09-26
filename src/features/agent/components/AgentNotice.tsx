import { useNavigate } from 'react-router-dom'

import type { PendingAction } from '@/features/agent/execute'
import { useCreateCourseIntent } from '@/features/course/createIntent'

export interface AgentNoticeProps {
  /** 学伴刚刚替你做掉的事，一句话一条 */
  receipts: string[]
  /** 不可撤销、等你点头的动作 */
  pending: PendingAction[]
  onDismissReceipts: () => void
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
 * 不可撤销的动作（删课程、删计划）在这里变成一句问话加一个按钮：
 * 它们**不会**被自动执行。这是"在规则内"的另一半 —— 能动手，但删东西前先问一句。
 *
 * 样式刻意克制（与桌面小窗同一套口径）：无图标、无重阴影、字重不加重、一行一条。
 * 它是"我办好了"的一句回话，不是需要用户处理的通知中心。
 */
export function AgentNotice({
  receipts,
  pending,
  onDismissReceipts,
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
          <div className="flex items-start gap-3">
            <ul className="min-w-0 flex-1 space-y-0.5 text-small leading-relaxed text-ink">
              {receipts.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="shrink-0 text-micro text-ink-faint hover:text-ink"
              onClick={onDismissReceipts}
              aria-label="关闭提示"
            >
              知道了
            </button>
          </div>
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

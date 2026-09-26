import { useEscapeKey } from '@/lib/useEscapeKey'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 二次确认弹窗。
 * 删除课程会连带清掉计划、待办与记忆（deleteCourseCompletely），不可撤销，
 * 所以不用 window.confirm —— 那个既没法排版，也没法把「会删掉什么」讲清楚。
 */
export function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc = 取消。用捕获阶段，这样它先于页面层的「Esc 返回」拿到按键，
  // 不会出现"关了确认框又顺手退出了页面"
  useEscapeKey(onCancel, { capture: true })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-card bg-raised p-5 shadow-pop"
      >
        <h2 className="card-title">{title}</h2>
        {/* whitespace-pre-line：调用方用换行把 message 分点写（"会删掉什么 / 会保留什么"），
            没有它时 HTML 会把换行折成空格，几条并列的信息会挤成一坨 */}
        <p className="muted mt-2 leading-relaxed whitespace-pre-line">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          {/* 破坏性操作用 btn-danger（红色在这套系统里的三个合法用途之一），
              而不是原来的「红底白字实心按钮」——实心红面积太大，与极简基调冲突 */}
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

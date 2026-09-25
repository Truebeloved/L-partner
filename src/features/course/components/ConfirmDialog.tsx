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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="muted mt-2 leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

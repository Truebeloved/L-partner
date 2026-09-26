import { SEED_COURSES, type SeedCourse } from '@/lib/seed/courses'
import { estimateUnitMinutes } from '@/features/course/drafts'
import { formatMinutes } from '@/lib/date'
import { useEscapeKey } from '@/lib/useEscapeKey'

interface SeedCourseDialogProps {
  onPick: (seed: SeedCourse) => void
  onCancel: () => void
}

/**
 * 「示例课程」选择器。
 *
 * 为什么要有它：随仓库交付的现成教学方案不止一份了（React 与文言文），
 * 空状态里那一个「载入示例课程」按钮没法区分。没有 API Key 的评审
 * 只有通过这里才能看到完整主循环，所以它必须一眼看懂：
 * 每份课程给出标题、一句话说明、以及规模（几阶段几单元多少小时）。
 *
 * 规模是从**草稿**算出来的，不是手写的数字：手写的会随内容长度过期，
 * 而这份课程恰恰是用来给评审看的，数字对不上比不写更糟。
 */
export function SeedCourseDialog({ onPick, onCancel }: SeedCourseDialogProps) {
  // Esc = 取消（捕获阶段，先于页面层的「Esc 返回」）
  useEscapeKey(onCancel, { capture: true })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="示例课程"
        className="w-full max-w-lg rounded-card bg-raised p-5 shadow-pop"
      >
        <h2 className="card-title">示例课程</h2>
        <p className="muted mt-2 leading-relaxed">
          随仓库交付的完整教学方案，不需要配置大模型也能直接跑通「课程 → 计划 → 待办」。
        </p>

        <ul className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-2">
          {SEED_COURSES.map((seed) => (
            <li key={seed.id} className="rounded-card border border-line-soft p-4">
              <h3 className="font-display text-h3 font-bold text-ink">{seed.title}</h3>
              <p className="muted mt-1 leading-relaxed">{seed.summary}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="tabular text-small text-ink-soft">{scaleOf(seed)}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPick(seed)}
                >
                  载入这份
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

/** 「6 阶段 · 45 单元 · 48 小时」——和课程卡片上那行字同一套说法 */
function scaleOf(seed: SeedCourse): string {
  const draft = seed.build()
  const units = draft.stages.flatMap((stage) => stage.units)
  const minutes = units.reduce(
    (sum, unit) =>
      sum +
      estimateUnitMinutes({
        knowledgePoints: unit.knowledgePoints,
        estimatedMinutes: unit.estimatedMinutes,
      }),
    0,
  )
  return `${draft.stages.length} 阶段 · ${units.length} 单元 · ${formatMinutes(minutes)}`
}

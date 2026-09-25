import type { CoursePlanSummary } from '@/features/course/courseActions'
import { courseTotals } from '@/features/course/drafts'
import { formatDateHuman, formatMinutes, isOverdue } from '@/lib/date'
import type { Course, CourseSource } from '@/types/models'

const SOURCE_LABEL: Record<CourseSource, string> = {
  manual: '手动创建',
  prompt: 'AI 生成',
  file: '文件导入',
}

const SOURCE_BADGE: Record<CourseSource, string> = {
  manual: 'bg-slate-100 text-slate-600',
  prompt: 'bg-brand-50 text-brand-700',
  file: 'bg-emerald-50 text-emerald-700',
}

interface CourseCardProps {
  course: Course
  summary: CoursePlanSummary
  onOpen: () => void
  onDelete: () => void
}

/** 课程卡片：一眼看完成什么、还要学多久、来不来得及 */
export function CourseCard({ course, summary, onOpen, onDelete }: CourseCardProps) {
  const totals = courseTotals(course)
  const progress =
    summary.totalMinutes > 0 ? Math.round((summary.doneMinutes / summary.totalMinutes) * 100) : 0
  const scheduled = summary.totalMinutes > 0
  const overdue = Boolean(
    course.deadline && isOverdue(course.deadline) && summary.remainingMinutes > 0,
  )

  return (
    <article className="card card-hover flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer truncate text-left text-base font-semibold text-slate-900 hover:text-brand-700"
          >
            {course.title}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${SOURCE_BADGE[course.source]}`}>
              {SOURCE_LABEL[course.source]}
            </span>
            <span className="muted text-xs">
              {totals.stageCount} 阶段 · {totals.unitCount} 单元 ·{' '}
              {formatMinutes(totals.totalMinutes)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger shrink-0 px-2 py-1 text-xs"
          onClick={onDelete}
          aria-label={`删除课程 ${course.title}`}
        >
          删除
        </button>
      </div>

      {course.goal && <p className="muted mt-2 line-clamp-2 text-xs">🎯 {course.goal}</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{scheduled ? '完成进度' : '尚未排期'}</span>
          <span>
            {scheduled
              ? `${formatMinutes(summary.doneMinutes)} / ${formatMinutes(summary.totalMinutes)}`
              : '打开课程即可生成学习计划'}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}>
          {course.deadline ? `deadline ${formatDateHuman(course.deadline)}` : '未设 deadline'}
        </span>
        {summary.finishDate && (
          <span className="text-slate-500">预计 {formatDateHuman(summary.finishDate)} 学完</span>
        )}
      </div>
    </article>
  )
}

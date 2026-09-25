import type { CoursePlanSummary } from '@/features/course/courseActions'
import { courseTotals } from '@/features/course/drafts'
import { formatDateHuman, formatMinutes, isOverdue } from '@/lib/date'
import type { Course, CourseSource } from '@/types/models'

const SOURCE_LABEL: Record<CourseSource, string> = {
  manual: '手动创建',
  prompt: 'AI 生成',
  file: '文件导入',
}

/**
 * 来源标签的样式。
 *
 * 原来是三种颜色（灰 / 紫 / 绿）—— 单色系里没有颜色可用，
 * 而来源本身也不是「好 / 坏」的区别，用颜色表达本来就牵强。
 * 现在只区分「实心 / 描边」：AI 生成是用户最需要留意的一类（内容不是自己写的），
 * 给它实心强调，其余用描边。文字的区分本来就靠 SOURCE_LABEL。
 */
const SOURCE_BADGE: Record<CourseSource, string> = {
  manual: '',
  prompt: 'badge-solid',
  file: '',
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
            className="card-title cursor-pointer truncate text-left hover:underline"
          >
            {course.title}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${SOURCE_BADGE[course.source]}`}>
              {SOURCE_LABEL[course.source]}
            </span>
            <span className="tabular text-small text-ink-soft">
              {totals.stageCount} 阶段 · {totals.unitCount} 单元 ·{' '}
              {formatMinutes(totals.totalMinutes)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm shrink-0"
          onClick={onDelete}
          aria-label={`删除课程 ${course.title}`}
        >
          删除
        </button>
      </div>

      {/* 原来这里有个彩色 emoji 做图标，单色系里不该出现图形色块，去掉后信息并不缺 */}
      {course.goal && <p className="mt-2 line-clamp-2 text-small text-ink-soft">{course.goal}</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between text-small text-ink-soft">
          <span>{scheduled ? '完成进度' : '尚未排期'}</span>
          <span className="tabular">
            {scheduled
              ? `${formatMinutes(summary.doneMinutes)} / ${formatMinutes(summary.totalMinutes)}`
              : '打开课程即可生成学习计划'}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-sunken">
          <div
            className="h-full rounded-pill bg-ink transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-small">
        {/* deadline 已经过去而任务还没做完 —— 这是「逾期」，允许用 alert */}
        <span className={overdue ? 'font-bold text-alert' : 'text-ink-soft'}>
          {course.deadline ? `deadline ${formatDateHuman(course.deadline)}` : '未设 deadline'}
        </span>
        {summary.finishDate && (
          <span className="tabular text-ink-soft">
            预计 {formatDateHuman(summary.finishDate)} 学完
          </span>
        )}
      </div>
    </article>
  )
}

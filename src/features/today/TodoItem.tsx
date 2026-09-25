import { dayjs, formatMinutes, formatRelativeDay } from '@/lib/date'
import type { Todo } from '@/types/models'

interface TodoItemProps {
  todo: Todo
  /** 所属课程名，手写待办没有课程时为空 */
  courseTitle?: string
  /** 逾期区里的条目要把计划日期显示出来，今日列表里则不必重复「今天」 */
  showDate?: boolean
  onToggle: (todo: Todo) => void
  onRemove: (todo: Todo) => void
}

/** 待办行：今日列表与逾期列表共用，两处的勾选/删除行为必须一致，不该写两份 */
export function TodoItem({ todo, courseTitle, showDate, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-all duration-200 ease-out hover:bg-ink/5">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-ink"
        checked={todo.done}
        aria-label={`完成「${todo.title}」`}
        onChange={() => onToggle(todo)}
      />

      <div className="min-w-0 flex-1">
        <p className={todo.done ? 'text-body text-ink-faint line-through' : 'text-body text-ink'}>
          {todo.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {courseTitle && <span className="badge">{courseTitle}</span>}
          {todo.minutes ? (
            <span className="tabular text-small text-ink-faint">
              预计 {formatMinutes(todo.minutes)}
            </span>
          ) : null}
          {/* 逾期日期是全应用里少数几个允许用红色的地方之一：它就是在说「这件事已经晚了」 */}
          {showDate && (
            <span className="tabular text-small text-alert">
              {formatRelativeDay(todo.date)} · 原定 {dayjs(todo.date).format('M月D日')}
            </span>
          )}
          {/* 区分来源很重要：计划派生的任务完成会回流到课程进度，手写任务不会 */}
          <span className="text-small text-ink-faint">
            {todo.planItemId ? '来自学习计划' : '手动添加'}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm shrink-0"
        onClick={() => onRemove(todo)}
        aria-label={`删除「${todo.title}」`}
      >
        删除
      </button>
    </li>
  )
}

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
    <li className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-brand-600"
        checked={todo.done}
        aria-label={`完成「${todo.title}」`}
        onChange={() => onToggle(todo)}
      />

      <div className="min-w-0 flex-1">
        <p className={todo.done ? 'text-sm text-slate-400 line-through' : 'text-sm text-slate-800'}>
          {todo.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {courseTitle && <span className="badge bg-brand-50 text-brand-700">{courseTitle}</span>}
          {todo.minutes ? (
            <span className="text-xs text-slate-400">预计 {formatMinutes(todo.minutes)}</span>
          ) : null}
          {showDate && (
            <span className="text-xs text-amber-600">
              {formatRelativeDay(todo.date)} · 原定 {dayjs(todo.date).format('M月D日')}
            </span>
          )}
          {/* 区分来源很重要：计划派生的任务完成会回流到课程进度，手写任务不会 */}
          <span className="text-xs text-slate-300">
            {todo.planItemId ? '来自学习计划' : '手动添加'}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost shrink-0 px-2 py-1 text-xs"
        onClick={() => onRemove(todo)}
        aria-label={`删除「${todo.title}」`}
      >
        删除
      </button>
    </li>
  )
}

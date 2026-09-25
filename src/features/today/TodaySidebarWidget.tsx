import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { syncMasteryForCourse } from '@/features/memory/mastery'
import { formatDateHuman, isOverdue, todayKey } from '@/lib/date'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Todo } from '@/types/models'

/**
 * 侧边栏里的今日待办。
 *
 * 这不是「今日页面的缩小版」——原来的今日页有进度环、逾期分区、提醒面板、
 * 手动添加表单，直接塞进 260px 宽的栏里会变成一坨。
 * 这里只保留在侧栏场景下真正有用的三样：
 *   今天还剩几件、它们分别是什么、随手勾掉一件。
 * 逾期任务只给一个数字入口，因为它不该在侧栏里展开成一长串（那会挤掉今日清单本身）。
 *
 * 侧栏是**常驻可见**的，所以这个组件必须能自己滚动，且高度受限 ——
 * 否则待办一多就会把上方的导航栏目挤出屏幕。
 */
export function TodaySidebarWidget() {
  const [today] = useState(todayKey)
  const [draft, setDraft] = useState('')

  const todos = useTodoStore((state) => state.todos)
  const addTodo = useTodoStore((state) => state.add)
  const toggleTodo = useTodoStore((state) => state.toggle)
  const updatePlanItemStatus = usePlanStore((state) => state.updateItemStatus)
  const courses = useCourseStore((state) => state.courses)

  // 必须订阅 courses 而不是 getState()：新建或删除课程后这里要跟着变，
  // 用 getState() 只在首次计算时取一次，之后课程名会一直显示旧值
  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  )

  const todayTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.date === today)
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1
          return a.createdAt.localeCompare(b.createdAt)
        }),
    [todos, today],
  )

  const overdue = useMemo(() => todos.filter((todo) => !todo.done && isOverdue(todo.date)), [todos])

  const doneCount = todayTodos.filter((todo) => todo.done).length
  const totalCount = todayTodos.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  function handleToggle(todo: Todo) {
    toggleTodo(todo.id)
    // 与今日页同一套回流：勾选 → 排期项状态 → 知识点掌握状态
    if (todo.planItemId && todo.courseId) {
      updatePlanItemStatus(todo.courseId, todo.planItemId, todo.done ? 'todo' : 'done')
    }
    if (todo.courseId) syncMasteryForCourse(todo.courseId)
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    addTodo({ title, date: today })
    setDraft('')
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-line-soft px-3 pt-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-label font-bold tracking-[0.05em] text-ink-soft uppercase">今日</h2>
        {/* 侧栏只放得下紧凑视图；完整版（逾期分区、提醒状态）在 /today */}
        <Link
          to="/today"
          className="text-small text-ink-faint transition-all duration-200 hover:text-ink"
          title="打开完整今日页"
        >
          全部 →
        </Link>
      </div>
      {/* 日期单独一行：和「今日」标签、和跳转链接挤在同一行会读成一串 */}
      <p className="mt-1 px-1 text-small text-ink-faint">{formatDateHuman(today)}</p>

      {/* 没有待办时整块进度都不显示 —— 否则「还没有安排」会和列表空态重复一遍，
          而重复的提示比没有提示更让人困惑 */}
      {totalCount > 0 && (
        <div className="mt-3 px-1">
          <div className="flex items-baseline justify-between text-small">
            <span className="text-ink-soft">
              {doneCount} / {totalCount} 已完成
            </span>
            {/* 完成态不用绿色（单色系没有绿色），靠字重加重来表达「达成了」 */}
            {percent === 100 && <span className="font-bold text-ink">全部完成</span>}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-pill bg-sunken">
            <div
              className="h-full rounded-pill bg-ink transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* 逾期是允许用红色的场景之一 —— 它就是在说「有事情已经晚了」 */}
      {overdue.length > 0 && (
        <p className="mx-1 mt-2 rounded-sm bg-alert-soft px-2 py-1 text-small text-alert">
          另有 {overdue.length} 项逾期未完成
        </p>
      )}

      {/* 列表自己滚动：侧栏高度必须守恒，不能待办一多就把导航挤出去 */}
      <ul className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {todayTodos.length === 0 ? (
          <li className="px-1 py-2 text-small leading-relaxed text-ink-faint">还没有安排</li>
        ) : (
          todayTodos.map((todo) => (
            <li key={todo.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1.5 transition-all duration-200 ease-out hover:bg-ink/5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 shrink-0 accent-ink"
                  checked={todo.done}
                  aria-label={`完成「${todo.title}」`}
                  onChange={() => handleToggle(todo)}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      todo.done
                        ? 'block text-small leading-snug text-ink-faint line-through'
                        : 'block text-small leading-snug text-ink'
                    }
                  >
                    {todo.title}
                  </span>
                  {todo.courseId && courseTitles.get(todo.courseId) && (
                    <span className="mt-0.5 block truncate text-micro text-ink-faint">
                      {courseTitles.get(todo.courseId)}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleAdd} className="mt-2 px-1 pb-3">
        <input
          className="input py-1.5 text-small"
          placeholder="添加今日待办…"
          aria-label="添加今日待办"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </section>
  )
}

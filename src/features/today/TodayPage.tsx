import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { PageHeader } from '@/components/PageHeader'
import { ReminderPanel } from '@/features/reminder/components/ReminderPanel'
import { useReminder } from '@/features/reminder/context'
import { syncMasteryForCourse } from '@/features/memory/mastery'
import { TodoItem } from '@/features/today/TodoItem'
import { formatDateHuman, formatMinutes, formatRelativeDay, isOverdue, todayKey } from '@/lib/date'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Todo } from '@/types/models'

/** 逾期列表按计划日期正序：最早欠下的排最前，用户才知道先补哪一件 */
function byDateAsc(a: Todo, b: Todo): number {
  return a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)
}

export function TodayPage() {
  // 「今天」是页面唯一的时间基准：先定下来，后面的筛选、展示都基于它
  const [today, setToday] = useState(todayKey)

  const allTodos = useTodoStore((state) => state.todos)
  // listByDate 每次都返回新数组（filter + sort），必须用 useShallow 做浅比较，
  // 否则 zustand v5 会认为快照一直在变，直接无限重渲染
  const todayTodos = useTodoStore(useShallow((state) => state.listByDate(today)))
  const addTodo = useTodoStore((state) => state.add)
  const toggleTodo = useTodoStore((state) => state.toggle)
  const removeTodo = useTodoStore((state) => state.remove)

  const courses = useCourseStore((state) => state.courses)
  const updatePlanItemStatus = usePlanStore((state) => state.updateItemStatus)

  // 提醒开关与时刻都由「设置」页维护，这里只读出来展示，避免同一个设置项两处显示不一致
  const reminderEnabled = useSettingsStore((state) => state.settings.reminderEnabled)
  const dailyReminderTime = useSettingsStore((state) => state.settings.dailyReminderTime)

  const [draft, setDraft] = useState('')

  /**
   * 跨过午夜时把「今天」翻页。
   * 学到凌晨是这类应用的常见场景，不翻页的话待办会一直停在昨天，
   * 用户会以为自己的记录丢了。同样用一次性 setTimeout，不用轮询。
   */
  useEffect(() => {
    let timer = 0
    const scheduleRollover = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(() => {
        setToday(todayKey())
        scheduleRollover()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleRollover()
    return () => window.clearTimeout(timer)
  }, [])

  // 调度器由应用外壳的 ReminderProvider 提供：提醒不该只在今日页生效，
  // 用户在课程页或对话页学到 20:00 同样应该被提醒。这里只读取状态用于展示。
  const { permission, requestPermission, nextFireAt } = useReminder()

  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  )

  // 逾期区：这是最容易被忽略、但用户最需要的部分 —— 漏掉的安排在页面上方主动暴露出来
  const overdueTodos = useMemo(
    () => allTodos.filter((todo) => !todo.done && isOverdue(todo.date)).sort(byDateAsc),
    [allTodos],
  )

  const doneCount = todayTodos.filter((todo) => todo.done).length
  const totalCount = todayTodos.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)
  const plannedMinutes = todayTodos.reduce((sum, todo) => sum + (todo.minutes ?? 0), 0)
  const allDone = totalCount > 0 && doneCount === totalCount

  const courseTitleOf = (todo: Todo) =>
    todo.courseId ? courseTitles.get(todo.courseId) : undefined

  const handleToggle = (todo: Todo) => {
    toggleTodo(todo.id)
    // 计划派生的待办要把状态回流给计划，否则课程页里这条还挂着「未完成」，
    // 两处状态互相矛盾，用户不知道该信哪个
    if (todo.planItemId && todo.courseId) {
      updatePlanItemStatus(todo.courseId, todo.planItemId, todo.done ? 'todo' : 'done')
    }
    // 再往前一步：把完成情况变成知识点的掌握状态。
    // 这一步是「计划会跟着我的实际进度变」的落点 —— 少了它，勾选就只是勾选。
    if (todo.courseId) {
      syncMasteryForCourse(todo.courseId)
    }
  }

  const handleRemove = (todo: Todo) => removeTodo(todo.id)

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    addTodo({ title, date: today })
    setDraft('')
  }

  return (
    <>
      <PageHeader
        title="今日"
        description={`${formatDateHuman(today)} · ${formatRelativeDay(today)}`}
      />

      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">今日完成</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {doneCount}
              <span className="text-base font-normal text-slate-400"> / {totalCount} 项</span>
            </p>
          </div>
          <p className="text-sm text-slate-500">
            {totalCount === 0 ? '今天还没有待办' : `预计学习 ${formatMinutes(plannedMinutes)}`}
          </p>
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="今日完成进度"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>

        {allDone && (
          <p className="mt-3 text-sm text-emerald-600">
            今天安排的 {totalCount} 项都打勾了。
            {overdueTodos.length > 0 ? '逾期那几项抽空收拾一下就好。' : '剩下的时间留给自己。'}
          </p>
        )}
      </section>

      <form className="mt-6 flex gap-2" onSubmit={handleAdd}>
        <input
          className="input"
          value={draft}
          aria-label="添加今日待办"
          placeholder="添加一条今天的待办，回车即可（例如：复习第 3 章）"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={draft.trim() === ''}>
          添加
        </button>
      </form>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">今日待办</h2>
          {totalCount > 0 && (
            <span className="muted">
              {doneCount} / {totalCount} 已完成
            </span>
          )}
        </div>

        {totalCount === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
            <div className="text-3xl">🗓️</div>
            <p className="mt-3 text-sm font-medium text-slate-600">今天还没有安排</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
              去「课程」页生成一份学习计划，计划会按天拆成待办自动出现在这里；
              也可以直接用上面的输入框手写一条。
            </p>
            <Link to="/courses" className="btn btn-primary mt-4">
              去课程页生成学习计划
            </Link>
          </div>
        ) : (
          <ul className="card mt-3 divide-y divide-slate-100 p-0">
            {todayTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                courseTitle={courseTitleOf(todo)}
                onToggle={handleToggle}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        )}
      </section>

      {overdueTodos.length > 0 && (
        <section className="mt-8">
          <h2 className="section-title text-amber-700">逾期未完成</h2>
          <p className="muted mt-1">
            这些任务已经过了计划日期。补上，或者直接删掉 —— 一直挂着最消耗意志力。
          </p>
          <ul className="card mt-3 divide-y divide-slate-100 p-0">
            {overdueTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                courseTitle={courseTitleOf(todo)}
                showDate
                onToggle={handleToggle}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        </section>
      )}

      <ReminderPanel
        enabled={reminderEnabled}
        time={dailyReminderTime}
        nextFireAt={nextFireAt}
        permission={permission}
        onRequestPermission={() => {
          void requestPermission()
        }}
      />
    </>
  )
}

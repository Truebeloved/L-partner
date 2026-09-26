import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { PageHeader } from '@/components/PageHeader'
import { ReminderPanel } from '@/features/reminder/components/ReminderPanel'
import { useReminder } from '@/features/reminder/context'
import { syncMasteryForCourse } from '@/features/memory/mastery'
import { TodoItem } from '@/features/today/TodoItem'
import { TodoMenuPopup } from '@/features/today/TodoMenuPopup'
import { useTodoMenu } from '@/features/today/useTodoMenu'
import { formatDateHuman, formatMinutes, isOverdue, todayKey } from '@/lib/date'
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

  /** 阶段 id → 阶段名：整段待办显示成「课程 · 阶段」 */
  const stageTitles = useMemo(
    () => new Map(courses.flatMap((course) => course.stages.map((stage) => [stage.id, stage.title]))),
    [courses],
  )

  // 逾期区：这是最容易被忽略、但用户最需要的部分 —— 漏掉的安排在页面上方主动暴露出来。
  // 周目标不算逾期：它整周都"还没到点"，把它算进去会让这一区整整一周都挂着红色
  const overdueTodos = useMemo(
    () =>
      allTodos
        .filter((todo) => !todo.done && !todo.weekStart && isOverdue(todo.date))
        .sort(byDateAsc),
    [allTodos],
  )

  /**
   * 「接下来」：今天之后的事。
   *
   * 侧栏的今日待办**只显示今天** —— 未来那些事不该挤在今天这一屏里。
   * 但"下周三要交作业"总得有个地方能提前看到、提前改，否则用户会以为它没被记住，
   * 于是又去别处记一遍。所以完整版（这一页）给一个预览分区，侧栏保持干净。
   * 带周标记的不在这里 —— 它有自己的「本周」块，颗粒度不同。
   */
  const upcomingTodos = useMemo(
    () =>
      allTodos
        .filter((todo) => todo.date > today && !todo.weekStart && !todo.done)
        .sort(byDateAsc),
    [allTodos, today],
  )

  const doneCount = todayTodos.filter((todo) => todo.done).length
  const totalCount = todayTodos.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)
  const plannedMinutes = todayTodos.reduce((sum, todo) => sum + (todo.minutes ?? 0), 0)
  const allDone = totalCount > 0 && doneCount === totalCount

  const courseTitleOf = (todo: Todo) => {
    if (!todo.courseId) return undefined
    const course = courseTitles.get(todo.courseId)
    if (!course) return undefined
    // 整段待办把阶段名也带上：勾掉它会让这一段的每一节都划掉，用户得看得出是哪一段
    const stage = todo.stageId ? stageTitles.get(todo.stageId) : undefined
    return stage ? `${course} · ${stage}` : course
  }

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

  /*
   * 右键待办 → 小窗里删除。
   * 菜单状态放在页面这一层：它是浮层，跟着页面而不是跟着某一行 ——
   * 放在行里的话，行被滚出视口或列表重排时菜单会跟着消失。
   */
  const todoMenu = useTodoMenu()

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    addTodo({ title, date: today })
    setDraft('')
  }

  return (
    <>
      {/* PageHeader 与 page-container 并列：两者都带 max-w-3xl px-8，
          嵌套会让标题多缩进 32px，与其它页面的标题对不齐 */}
      <PageHeader title="今日" description={formatDateHuman(today)} />

      <div className="page-container">

      {/* 一条待办都没有时不渲染统计卡：0 / 0 配一条全空的进度条没有任何信息量，
          反而把「今天还没安排」这个真正有用的提示挤到下面去 */}
      {totalCount > 0 && (
        <section className="card">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-body text-ink-soft">今日完成</p>
              {/* 用 h1(24px) 而不是 display(42px)：这是卡片里的一个统计数字，
                  42px 会把「今日完成」这句话压成配角，层级关系反转 */}
              <p className="tabular mt-1 font-display text-h1 font-bold text-ink">
                {doneCount}
                <span className="text-body text-ink-faint"> / {totalCount} 项</span>
              </p>
            </div>
            <p className="text-body text-ink-soft">预计学习 {formatMinutes(plannedMinutes)}</p>
          </div>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-pill bg-sunken"
            role="progressbar"
            aria-label="今日完成进度"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-pill bg-ink transition-all duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* 完成反馈不用绿色（单色系没有绿色），靠黑字本身的前后文来表达 */}
          {allDone && (
            <p className="mt-4 text-body text-ink">
              今天安排的 {totalCount} 项都打勾了。
              {overdueTodos.length > 0 ? '逾期那几项抽空收拾一下就好。' : '剩下的时间留给自己。'}
            </p>
          )}
        </section>
      )}

      {/* 输入行套一层无阴影卡片：直接浮在页面底色上会和上下两张卡片样式不一致，
          看起来像是忘了包一层容器 */}
      <form className="card-flat mt-6 flex gap-4" onSubmit={handleAdd}>
        <input
          className="input"
          value={draft}
          aria-label="添加今日待办"
          placeholder="添加一条待办，回车即可"
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
          <div className="mt-3 rounded-card border border-dashed border-line-soft bg-raised/60 px-6 py-10 text-center">
            <p className="text-body font-bold text-ink">今天还没有安排</p>
            <p className="mx-auto mt-2 max-w-md text-small leading-relaxed text-ink-faint">
              去「课程」页生成一份学习计划，计划会按天拆成待办自动出现在这里；
              也可以直接用上面的输入框手写一条。
            </p>
            <Link to="/courses" className="btn btn-primary mt-5">
              去课程页生成学习计划
            </Link>
          </div>
        ) : (
          <ul className="card mt-3 divide-y divide-line-soft p-0">
            {todayTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                courseTitle={courseTitleOf(todo)}
                onToggle={handleToggle}
                onContextMenu={todoMenu.open}
              />
            ))}
          </ul>
        )}
      </section>

      {overdueTodos.length > 0 && (
        <section className="mt-8">
          {/* 逾期是允许用红色的场景 —— 这里用 alert 表达「已经晚了」 */}
          <h2 className="section-title text-alert">逾期未完成</h2>
          <p className="muted mt-1">
            这些任务已经过了计划日期。补上，或者直接删掉 —— 一直挂着最消耗意志力。
          </p>
          <ul className="card mt-3 divide-y divide-line-soft p-0">
            {overdueTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                courseTitle={courseTitleOf(todo)}
                showDate
                onToggle={handleToggle}
                onContextMenu={todoMenu.open}
              />
            ))}
          </ul>
        </section>
      )}

      {upcomingTodos.length > 0 && (
        <section className="mt-8">
          <h2 className="section-title">接下来</h2>
          <p className="muted mt-1">
            今天之后的事。侧栏只显示当天，所以它们先在这里待着 —— 到那天自己会出现在今日清单里。
          </p>
          <ul className="card mt-3 divide-y divide-line-soft p-0">
            {upcomingTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                courseTitle={courseTitleOf(todo)}
                showDate
                onToggle={handleToggle}
                onContextMenu={todoMenu.open}
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
      </div>

      {/* 右键小窗画在最外层：它用 fixed 定位，不该被列表的滚动容器裁掉 */}
      {todoMenu.menu && (
        <TodoMenuPopup
          todo={todoMenu.menu.todo}
          anchor={todoMenu.menu.anchor}
          courseTitle={courseTitleOf(todoMenu.menu.todo)}
          onDelete={handleRemove}
          onClose={todoMenu.close}
        />
      )}
    </>
  )
}

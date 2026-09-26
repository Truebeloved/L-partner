import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { isWeeklyTodo, matchTodoToCourse, repairStageLinks } from '@/features/today/autoTodo'
import { formatDateHuman, isOverdue, todayKey } from '@/lib/date'
import { useCourseStore } from '@/store/courses'
import { TodoMenuPopup } from '@/features/today/TodoMenuPopup'
import { setTodoDone } from '@/features/today/todoActions'
import { useTodoMenu } from '@/features/today/useTodoMenu'
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
  const removeTodo = useTodoStore((state) => state.remove)
  const plans = usePlanStore((state) => state.plans)
  const courses = useCourseStore((state) => state.courses)

  /*
   * 右键待办 → 小窗里删除。菜单状态放在这一层：它是浮层，跟着面板而不是跟着某一行 ——
   * 放在行里的话，列表一重排菜单就跟着消失。
   */
  const todoMenu = useTodoMenu()
  const handleRemove = (todo: Todo) => removeTodo(todo.id)

  /*
   * 一次性修正历史数据：上一版把"学完阶段一"这类待办挂到了某一节上，
   * 而那些待办已经带着 unitId，永远不会再走"关联修正"这条路。
   * 这个面板是常驻的，借它跑一次；函数本身幂等，跑多少次都安全。
   */
  useEffect(() => {
    repairStageLinks()
  }, [])

  // 必须订阅 courses 而不是 getState()：新建或删除课程后这里要跟着变，
  // 用 getState() 只在首次计算时取一次，之后课程名会一直显示旧值
  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  )

  /** 阶段 id → 阶段名：整段待办要显示成「课程 · 阶段」而不是只给课程名 */
  const stageTitles = useMemo(
    () => new Map(courses.flatMap((course) => course.stages.map((stage) => [stage.id, stage.title]))),
    [courses],
  )

  /** 课程名（带阶段）—— 菜单里要说清这条待办挂在哪 */
  const courseTitleOf = (todo: Todo) => {
    if (!todo.courseId) return undefined
    const course = courseTitles.get(todo.courseId)
    if (!course) return undefined
    const stage = todo.stageId ? stageTitles.get(todo.stageId) : undefined
    return stage ? `${course} · ${stage}` : course
  }

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

  /**
   * 本周目标：置顶显示。
   *
   * 它的 date 落在本周一，所以天然不会混进"今天"的清单 ——
   * 两处都显示会让用户以为有两件事要做。到下周它自己就不在这里了（weekStart 不再匹配）。
   */
  const weeklyTodos = useMemo(
    () =>
      todos
        .filter((todo) => isWeeklyTodo(todo, today))
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1
          return a.createdAt.localeCompare(b.createdAt)
        }),
    [todos, today],
  )

  /**
   * 逾期：只算"某一天的事"。
   *
   * 周目标必须排除 —— 它的日期落在本周一，周一到周五都会被算成"逾期"，
   * 于是侧栏整个星期都挂着一条红色警告，而它其实只是"这周要完成"。
   */
  const overdue = useMemo(
    () => todos.filter((todo) => !todo.done && !todo.weekStart && isOverdue(todo.date)),
    [todos],
  )

  const doneCount = todayTodos.filter((todo) => todo.done).length
  const totalCount = todayTodos.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  function handleToggle(todo: Todo) {
    // 勾选 → 排期项状态 → 掌握状态，三步一体（见 todoActions 的说明）。
    // 这里原来抄了一份，抄件正是"迟早会漂"的来源
    setTodoDone(todo.id, !todo.done)
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    /*
     * 手输的待办也走一次课程匹配：用户写「看完第一章视频」，
     * 系统就该知道它对应哪门课的哪个单元 —— 勾掉它，课程结构里那一行会跟着划掉。
     * 匹配不上就只是一条普通待办，不留空字段。
     */
    const link = matchTodoToCourse(title, courses, plans)
    addTodo({
      title,
      date: today,
      courseId: link?.courseId,
      unitId: link?.unitId,
      stageId: link?.stageId,
      planItemId: link?.planItemId,
      source: 'manual',
    })
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

      {/*
        本周目标置顶：它是"这一周"的颗粒度，和下面的今日清单不是一回事，
        所以给一块独立的小标题和一条分隔线，而不是混进同一个列表。
      */}
      {/* 本周块与今日清单之间加一道分隔：两块东西颗粒度不同，不分开会读成一串 */}
      {weeklyTodos.length > 0 && (
        <div className="mx-1 mt-3 border-t border-line-soft pt-2">
          <p className="px-1 text-label font-bold tracking-[0.05em] text-ink-soft uppercase">本周</p>
          <ul className="mt-1.5 space-y-0.5">
            {weeklyTodos.map((todo) => (
              <li
                key={todo.id}
                onContextMenu={(event) => todoMenu.open(todo, event)}
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1.5 transition-all duration-200 ease-out hover:bg-ink/5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 shrink-0 accent-ink"
                    checked={todo.done}
                    aria-label={`完成本周目标「${todo.title}」`}
                    onChange={() => handleToggle(todo)}
                  />
                  <span
                    className={
                      todo.done
                        ? 'min-w-0 flex-1 text-small leading-snug text-ink-faint line-through'
                        : 'min-w-0 flex-1 text-small leading-snug text-ink'
                    }
                  >
                    {todo.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 列表自己滚动：侧栏高度必须守恒，不能待办一多就把导航挤出去 */}
      <ul className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {todayTodos.length === 0 ? (
          <li className="px-1 py-2 text-small leading-relaxed text-ink-faint">还没有安排</li>
        ) : (
          todayTodos.map((todo) => (
            <li key={todo.id} onContextMenu={(event) => todoMenu.open(todo, event)}>
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
                      {/* 挂在整段上的待办要说清是"哪一段"：勾掉它会让这一段的每一节都划掉 */}
                      {todo.stageId && stageTitles.get(todo.stageId)
                        ? ` · ${stageTitles.get(todo.stageId)}`
                        : ''}
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

      {/* 右键小窗：侧栏这一列会自滚，所以菜单画在列表之外 */}
      {todoMenu.menu && (
        <TodoMenuPopup
          todo={todoMenu.menu.todo}
          anchor={todoMenu.menu.anchor}
          courseTitle={courseTitleOf(todoMenu.menu.todo)}
          onDelete={handleRemove}
          onClose={todoMenu.close}
        />
      )}
    </section>
  )
}

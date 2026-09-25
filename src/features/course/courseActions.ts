import { buildSchedule } from '@/features/plan/schedule'
import type { SchedulableUnit, ScheduleResult } from '@/features/plan/schedule'
import { dayjs, todayKey } from '@/lib/date'
import { newId } from '@/lib/id'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, CourseSource, DateKey, Id, Plan, PlanItem, Todo } from '@/types/models'

import { buildStages, flattenUnits, unitTitleMap } from './drafts'
import type { CoursePlanDraft } from './drafts'

/** 新建课程时由界面提供的输入：草稿 + 来源标记 */
export interface NewCourseInput extends CoursePlanDraft {
  /** 不传按手动创建处理；AI 生成传 'prompt'，文件导入传 'file' */
  source?: CourseSource
}

/**
 * 创建课程。
 * 注意这里只落课程本身，不碰计划与待办 —— 用户看到内容确认无误后再点「生成学习计划」，
 * 中间留一次人工检查，是 D3「AI 产出必须可编辑后落库」的前置条件。
 */
export function createCourse(draft: NewCourseInput): Id {
  return useCourseStore.getState().add({
    title: draft.title.trim(),
    description: normalize(draft.description),
    goal: normalize(draft.goal),
    deadline: draft.deadline,
    weeklyMinutes: draft.weeklyMinutes,
    source: draft.source ?? 'manual',
    stages: buildStages(draft.stages),
  })
}

export interface PlanOptions {
  /** 从哪天开始排，默认今天 */
  startDate?: DateKey
  /** 学习日，0 = 周日 … 6 = 周六，默认每天都能学 */
  studyWeekdays?: number[]
  maxMinutesPerDay?: number
  minMinutesPerDay?: number
  /** 规则排期传 'rule'；AI 排期润色后的结果传 'ai'，UI 据此区分来源 */
  generatedBy?: 'rule' | 'ai'
}

/** 计划概览：详情页与课程卡片都靠它渲染，避免各自重算一遍还算出不同口径 */
export interface CoursePlanSummary {
  /** 计划覆盖的总时长（含已完成） */
  totalMinutes: number
  doneMinutes: number
  remainingMinutes: number
  /** 安排得最满的一天有多少分钟 —— 回答「一天要学多久」 */
  dailyMinutes: number
  /** 排期涉及的天数 */
  studyDays: number
  /** 最后一天；null 表示计划里还没有排期项 */
  finishDate: DateKey | null
  /** 按当前节奏排下来会晚于 deadline。UI 必须如实提示，而不是假装排得下 */
  exceedsDeadline: boolean
}

export interface PlanGenerationResult {
  plan: Plan
  /** 本轮由规则新排出来的部分；已完成的历史不在里面，所以它的 exceedsDeadline 只描述「还没学的部分」 */
  schedule: ScheduleResult
  /** 计划整体（含保留的历史）的概览，界面直接用它渲染 */
  summary: CoursePlanSummary
}

/**
 * 生成（或重新生成）学习计划。
 *
 * 两个刻意的设计：
 * 1. **只排「还没学的部分」**。已完成/已跳过的排期项会原样留在计划里，
 *    它们消耗掉的时长从课程总量里扣掉；否则每点一次「生成计划」，
 *    学过的内容就会被再排一遍，用户会以为自己在原地打转。
 * 2. **落库后顺手清掉失效的未完成待办**。新排期项是新 id，
 *    旧待办指向的排期项已经不存在，留着只会在今日列表里变成永远勾不掉的幽灵任务。
 */
export function generatePlanForCourse(
  courseId: Id,
  options: PlanOptions = {},
): PlanGenerationResult | null {
  const course = useCourseStore.getState().getById(courseId)
  if (!course) return null

  const todos = useTodoStore.getState().todos
  const previous = usePlanStore.getState().getByCourse(courseId)

  const schedule = buildSchedule({
    units: remainingUnits(course, previous, todos),
    startDate: options.startDate ?? todayKey(),
    deadline: course.deadline,
    weeklyMinutes: course.weeklyMinutes,
    studyWeekdays: options.studyWeekdays,
    maxMinutesPerDay: options.maxMinutesPerDay,
    minMinutesPerDay: options.minMinutesPerDay,
  })

  // 历史（已完成 / 已跳过）继续留在计划里：重新排期不能把学习记录抹掉
  const history = (previous?.items ?? []).filter((item) => planItemState(item, todos) !== 'open')

  const items: PlanItem[] = [
    ...history,
    ...schedule.items.map((item) => ({
      id: newId(),
      courseId,
      unitId: item.unitId,
      date: item.date,
      minutes: item.minutes,
      status: 'todo' as const,
    })),
  ]

  const plan: Plan = {
    id: previous?.id ?? newId(),
    courseId,
    items,
    generatedBy: options.generatedBy ?? 'rule',
    weeklyMinutes: course.weeklyMinutes,
    createdAt: new Date().toISOString(),
  }

  usePlanStore.getState().save(plan)
  pruneStaleTodos(courseId, items)

  return { plan, schedule, summary: summarizePlan(course, plan, todos) }
}

/**
 * 把排期项物化成每日待办 —— 「课程 → 计划 → 待办」主循环的最后一步。
 *
 * `todo.planItemId` 指向 PlanItem 是整条回流链路的基础：
 * 完成待办时靠它找到排期项、再找到 Unit 与知识点，从而更新掌握状态。
 * 所以这里只允许通过本函数创建派生待办，不要在别处手写 todo 绕过它。
 *
 * 幂等：同一个 planItemId 只会有一条待办，重复点击「生成计划」不会让今日列表翻倍。
 */
export function materializeTodos(courseId: Id): number {
  const course = useCourseStore.getState().getById(courseId)
  const plan = usePlanStore.getState().getByCourse(courseId)
  if (!course || !plan) return 0

  const todos = useTodoStore.getState().todos
  const materialized = new Set(
    todos.map((todo) => todo.planItemId).filter((id): id is Id => Boolean(id)),
  )
  const titleById = unitTitleMap(course)

  const drafts = plan.items
    // 已完成的不再生成待办（那是历史记录），已跳过的也不再提醒 —— 它是用户主动放弃的内容
    .filter((item) => item.status === 'todo' && !materialized.has(item.id))
    .map((item) => ({
      courseId,
      planItemId: item.id,
      title: titleById.get(item.unitId) ?? '学习任务',
      date: item.date,
      minutes: item.minutes,
    }))

  if (drafts.length === 0) return 0
  useTodoStore.getState().addMany(drafts)
  return drafts.length
}

/**
 * 彻底删除课程：课程本体、计划、待办、以及挂在这门课上的记忆一起清掉。
 * 不能只删课程 —— 留下孤儿计划与待办，今日列表里会出现点不进去的任务。
 * 全局记忆（courseId 为空，如「我是计算机专业大三」）不动：那是关于用户本人的，不该被删课牵连。
 */
export function deleteCourseCompletely(courseId: Id): void {
  useCourseStore.getState().remove(courseId)
  usePlanStore.getState().removeByCourse(courseId)
  useTodoStore.getState().removeByCourse(courseId)

  const memory = useMemoryStore.getState()
  for (const entry of memory.list({ courseId, includeArchived: true })) {
    memory.remove(entry.id)
  }
}

/**
 * 重新排期：计划赶不上变化时的入口。
 * 语义上与「生成计划」的区别在于它是一整套动作 —— 保留已完成的历史、只重排剩下的内容、
 * 并把待办按新计划重做一遍（未完成的旧待办清掉，新的补上）。
 */
export function rescheduleCourse(
  courseId: Id,
  options: PlanOptions = {},
): PlanGenerationResult | null {
  const result = generatePlanForCourse(courseId, options)
  if (!result) return null
  materializeTodos(courseId)
  return result
}

/** 把计划汇总成界面要的数字；完成判定同时看排期项状态与待办，两条线谁先写入都算数 */
export function summarizePlan(
  course: Course,
  plan: Plan | undefined,
  todos: Todo[] = [],
): CoursePlanSummary {
  const items = plan?.items ?? []
  const minutesByDate = new Map<DateKey, number>()
  let totalMinutes = 0
  let doneMinutes = 0
  let remainingMinutes = 0

  for (const item of items) {
    totalMinutes += item.minutes
    const state = planItemState(item, todos)
    if (state === 'done') doneMinutes += item.minutes
    if (state === 'open') remainingMinutes += item.minutes
    minutesByDate.set(item.date, (minutesByDate.get(item.date) ?? 0) + item.minutes)
  }

  const finishDate = [...minutesByDate.keys()].sort().at(-1) ?? null
  const dailyMinutes = [...minutesByDate.values()].reduce((max, value) => Math.max(max, value), 0)

  return {
    totalMinutes,
    doneMinutes,
    remainingMinutes,
    dailyMinutes,
    studyDays: minutesByDate.size,
    finishDate,
    exceedsDeadline:
      finishDate !== null && course.deadline
        ? dayjs(finishDate).isAfter(dayjs(course.deadline), 'day')
        : false,
  }
}

/**
 * 排期项的三态：还没学 / 学完了 / 主动放弃。
 *
 * 导出给界面用：完成状态有两个写入方 —— 排期项自己的 status，以及待办上的勾。
 * 「完成待办 → 回流更新排期项」那条链路可能还没跑完（甚至没写），
 * 所以展示与统计必须走同一个判定，否则会出现「概览说完成了 60 分钟，日历上却还是未完成」。
 */
export function planItemState(item: PlanItem, todos: Todo[]): 'open' | 'done' | 'dropped' {
  if (item.status === 'done') return 'done'
  if (item.status === 'skipped') return 'dropped'
  // 待办先打了勾、回流还没写回排期项状态时，也要按已完成处理
  return todos.some((todo) => todo.planItemId === item.id && todo.done) ? 'done' : 'open'
}

/** 课程总时长减去已完成/已放弃的部分，得到还需要排期的单元 */
function remainingUnits(course: Course, plan: Plan | undefined, todos: Todo[]): SchedulableUnit[] {
  const finishedMinutes = new Map<Id, number>()
  for (const item of plan?.items ?? []) {
    if (planItemState(item, todos) === 'open') continue
    finishedMinutes.set(item.unitId, (finishedMinutes.get(item.unitId) ?? 0) + item.minutes)
  }

  return flattenUnits(course)
    .map((unit) => ({
      ...unit,
      estimatedMinutes: unit.estimatedMinutes - (finishedMinutes.get(unit.unitId) ?? 0),
    }))
    .filter((unit) => unit.estimatedMinutes > 0)
}

/** 清掉指向已不存在排期项的未完成待办；已完成的保留，它们是学习历史 */
function pruneStaleTodos(courseId: Id, items: PlanItem[]): number {
  const validIds = new Set(items.map((item) => item.id))
  const store = useTodoStore.getState()
  const stale = store.todos.filter(
    (todo) =>
      todo.courseId === courseId &&
      todo.planItemId !== undefined &&
      !validIds.has(todo.planItemId) &&
      !todo.done,
  )

  for (const todo of stale) useTodoStore.getState().remove(todo.id)
  return stale.length
}

function normalize(value?: string): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

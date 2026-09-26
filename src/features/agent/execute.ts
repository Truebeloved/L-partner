import {
  deleteCourseCompletely,
  deletePlanForCourse,
  generatePlanForCourse,
  materializeTodos,
  rescheduleCourse,
} from '@/features/course/courseActions'
import { AGENT_ACTIONS, isKnownActionType } from '@/features/agent/actions'
import type { AgentActionType } from '@/features/agent/actions'
import { resolveCourse, resolveTodo } from '@/features/agent/resolve'
import { resolveWhen } from '@/features/today/autoTodo'
import { setTodoDone } from '@/features/today/todoActions'
import { formatDateHuman } from '@/lib/date'
import { newId } from '@/lib/id'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Id } from '@/types/models'

/**
 * 执行全局 AI 发来的动作。
 *
 * 三条贯穿始终的原则：
 *
 * 1. **不认识的动作一律拒绝并说明**。模型会编类型（"delete_everything"），
 *    而这里是把它挡在数据之外的最后一道；静默忽略则更糟 ——
 *    用户以为它做了，其实什么都没发生。
 * 2. **失败要出声**。「没认出你说的课程」必须变成一条回执回到界面上。
 *    这个应用里最伤信任的不是"没做成"，而是"我说了它没反应"。
 * 3. **不可撤销的动作不在这里执行**。它们变成一条 `pending`，
 *    等用户在界面上点一下确认 —— 见 actions.ts 里 needsConfirm 的说明。
 */

/** 模型返回的一条原始动作：类型未知，参数是任意字段 */
export type RawAction = Record<string, unknown>

export interface AppliedAction {
  type: AgentActionType
  /** 给用户看的一句话回执 */
  receipt: string
}

export type PendingAction =
  /** 不可撤销：等用户点确认，`run` 返回执行后的回执 */
  | {
      id: string
      kind: 'destructive'
      prompt: string
      confirmText: string
      run: () => string
    }
  /** 新建课程：把它带进「新建课程」流程核对方案（不直接落库） */
  | { id: string; kind: 'create_course'; prompt: string; goal: string }

export interface AgentActionResult {
  applied: AppliedAction[]
  pending: PendingAction[]
  /** 被拒绝的动作与原因 */
  rejected: string[]
}

export interface AgentActionContext {
  /** 当前这场对话绑定的课程 —— 模型省略 course 字段时的兜底 */
  conversationCourseId?: Id
}

/**
 * 动作类型的执行顺序。
 *
 * 同一轮里可能既有「改期」又有「勾掉同一条」—— 顺序固定下来才不会出现
 * "先勾后改"和"先改后勾"两种结果。删除排在最后：先改动、再删，
 * 被删掉的永远是动作发出时的那一条。
 */
const EXECUTION_ORDER: AgentActionType[] = [
  'set_reminder',
  'create_course',
  'update_todo',
  'complete_todo',
  'reschedule_course',
  'set_deadline',
  'delete_todo',
  'clear_todos',
  'delete_plan',
  'delete_course',
]

export function applyAgentActions(
  raw: unknown,
  context: AgentActionContext = {},
): AgentActionResult {
  const result: AgentActionResult = { applied: [], pending: [], rejected: [] }
  const actions = asObjectArray(raw)
  if (actions.length === 0) return result

  const ordered = [...actions].sort(
    (a, b) => rank(a.type) - rank(b.type),
  )

  for (const action of ordered) {
    if (!isKnownActionType(action.type)) {
      result.rejected.push(`不认识的动作「${String(action.type)}」，已跳过`)
      continue
    }

    const spec = AGENT_ACTIONS[action.type]
    const outcome = execute(action.type, action, context)

    if (outcome.kind === 'applied') result.applied.push({ type: action.type, receipt: outcome.receipt })
    else if (outcome.kind === 'pending') result.pending.push(outcome.pending)
    else result.rejected.push(`${spec.label}没做成：${outcome.reason}`)
  }

  return result
}

type Outcome =
  | { kind: 'applied'; receipt: string }
  | { kind: 'pending'; pending: PendingAction }
  | { kind: 'rejected'; reason: string }

function rank(type: unknown): number {
  const index = EXECUTION_ORDER.indexOf(type as AgentActionType)
  return index === -1 ? EXECUTION_ORDER.length : index
}

function execute(
  type: AgentActionType,
  action: RawAction,
  context: AgentActionContext,
): Outcome {
  switch (type) {
    case 'update_todo':
      return updateTodo(action, context)
    case 'delete_todo':
      return deleteTodo(action, context)
    case 'clear_todos':
      return clearTodos(action, context)
    case 'complete_todo':
      return completeTodo(action, context)
    case 'reschedule_course':
      return reschedule(action, context)
    case 'set_deadline':
      return setDeadline(action, context)
    case 'delete_plan':
      return deletePlan(action, context)
    case 'delete_course':
      return deleteCourse(action, context)
    case 'create_course':
      return createCourse(action)
    case 'set_reminder':
      return setReminder(action)
  }
}

// ---------------------------------------------------------------------------
// 待办
// ---------------------------------------------------------------------------

function updateTodo(action: RawAction, context: AgentActionContext): Outcome {
  const reference = asText(action.todo)
  const when = asText(action.when)
  const newTitle = asText(action.title)

  if (!reference) return { kind: 'rejected', reason: '没说是哪条待办' }
  if (!when && !newTitle) return { kind: 'rejected', reason: '没说改成什么' }

  const todo = resolveTodo(reference, {
    todos: useTodoStore.getState().todos,
    courseId: context.conversationCourseId,
  })
  if (!todo.ok) return { kind: 'rejected', reason: todo.reason }

  const patch: { title?: string; date?: string; weekStart?: string } = {}
  let dateNote = ''

  if (when) {
    const resolved = resolveWhen(when)
    if (resolved.kind === 'unknown') {
      return { kind: 'rejected', reason: `没看懂时间「${when}」` }
    }
    if (resolved.kind === 'week') {
      // 周目标：date 与 weekStart 都落在本周一（否则它会同时出现在「本周」和「今日」）
      patch.date = resolved.weekStart
      patch.weekStart = resolved.weekStart
      dateNote = `移到本周（${formatDateHuman(resolved.weekStart)} 那一周）`
    } else {
      patch.date = resolved.date
      dateNote = `改到 ${formatDateHuman(resolved.date)}`
    }
  }

  if (newTitle) patch.title = newTitle

  useTodoStore.getState().update(todo.item.id, patch)

  const parts = [dateNote, newTitle ? `改名成「${newTitle}」` : ''].filter(Boolean)
  return { kind: 'applied', receipt: `已把待办「${todo.item.title}」${parts.join('、')}` }
}

function deleteTodo(action: RawAction, context: AgentActionContext): Outcome {
  const reference = asText(action.todo)
  if (!reference) return { kind: 'rejected', reason: '没说是哪条待办' }

  const todo = resolveTodo(reference, {
    todos: useTodoStore.getState().todos,
    courseId: context.conversationCourseId,
  })
  if (!todo.ok) return { kind: 'rejected', reason: todo.reason }

  useTodoStore.getState().remove(todo.item.id)
  return { kind: 'applied', receipt: `已删掉待办「${todo.item.title}」` }
}

function completeTodo(action: RawAction, context: AgentActionContext): Outcome {
  const reference = asText(action.todo)
  if (!reference) return { kind: 'rejected', reason: '没说是哪条待办' }

  const todo = resolveTodo(reference, {
    todos: useTodoStore.getState().todos,
    courseId: context.conversationCourseId,
  })
  if (!todo.ok) return { kind: 'rejected', reason: todo.reason }

  if (todo.item.done) {
    return { kind: 'applied', receipt: `「${todo.item.title}」之前就已经完成了` }
  }

  // 走与界面勾选同一条链路：排期项状态与知识点掌握状态都要跟上
  setTodoDone(todo.item.id, true)
  return { kind: 'applied', receipt: `已把「${todo.item.title}」标记为完成` }
}

/**
 * 清空待办。
 *
 * 与「删掉一条」刻意区别对待：单条删除直接执行（轻量、常常就是用户刚说的那句话），
 * 而**批量清空必须问一句** —— 它一次抹掉的是几十条，而且往往是用户气头上说的
 * （"把这些破待办全删了"），误执行的代价与单条完全不是一个量级。
 *
 * 只删**未完成**的：已完成的那些是学习记录（完成情况已经回流到掌握状态），
 * 删掉它们等于篡改历史，而用户说"清空待办"时想清掉的是"还欠着的事"。
 */
function clearTodos(action: RawAction, context: AgentActionContext): Outcome {
  const courseRef = asText(action.course)
  const todos = useTodoStore.getState().todos.filter((todo) => !todo.done)

  let targets = todos
  let scope = '全部'

  if (courseRef) {
    const course = resolveCourse(courseRef, {
      courses: useCourseStore.getState().courses,
      conversationCourseId: context.conversationCourseId,
    })
    if (!course.ok) return { kind: 'rejected', reason: course.reason }
    targets = todos.filter((todo) => todo.courseId === course.item.id)
    scope = `《${course.item.title}》的`
  }

  if (targets.length === 0) {
    return { kind: 'applied', receipt: `${scope}未完成待办本来就是空的` }
  }

  const doneCount = useTodoStore.getState().todos.length - todos.length
  const courseId = courseRef ? targets[0]?.courseId : undefined

  return {
    kind: 'pending',
    pending: {
      id: newId(),
      kind: 'destructive',
      prompt:
        `要清空${scope}全部 ${targets.length} 条未完成待办吗？` +
        (doneCount > 0 ? `（已完成的 ${doneCount} 条会保留）` : ''),
      confirmText: `清空 ${targets.length} 条`,
      run: () => {
        const store = useTodoStore.getState()
        // 重新按同一口径取一遍：确认框停留期间用户可能又勾掉/加了几条
        const finalTargets = store.todos.filter(
          (todo) => !todo.done && (!courseRef || todo.courseId === courseId),
        )
        for (const todo of finalTargets) useTodoStore.getState().remove(todo.id)
        return `已清空 ${finalTargets.length} 条未完成待办`
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 课程与计划
// ---------------------------------------------------------------------------

function reschedule(action: RawAction, context: AgentActionContext): Outcome {
  const course = resolveCourse(asText(action.course), {
    courses: useCourseStore.getState().courses,
    conversationCourseId: context.conversationCourseId,
  })
  if (!course.ok) return { kind: 'rejected', reason: course.reason }

  const hours = asNumber(action.weekly_hours)
  if (hours !== undefined && hours > 0) {
    useCourseStore.getState().update(course.item.id, { weeklyMinutes: Math.round(hours * 60) })
  }

  const plan = usePlanStore.getState().getByCourse(course.item.id)

  /*
   * 待办条数用**前后差集**算，而不是拿物化函数的返回值。
   * rescheduleCourse 内部已经物化过一遍了，再调一次 materializeTodos 只会返回 0
   * （它是幂等的）—— 照那个数写回执就会说"新增 0 条"，而实际上刚新增了一整批。
   */
  const before = new Set(useTodoStore.getState().todos.map((todo) => todo.id))
  const result = plan ? rescheduleCourse(course.item.id) : generatePlanForCourse(course.item.id)

  if (!result) return { kind: 'rejected', reason: '这门课不存在了' }
  if (result.schedule.empty) {
    return {
      kind: 'applied',
      receipt: `《${course.item.title}》没有还没学的单元，计划不需要重排`,
    }
  }

  // 首先生成计划时要补一次物化（rescheduleCourse 已经做过了）
  if (!plan) materializeTodos(course.item.id)
  const created = useTodoStore.getState().todos.filter((todo) => !before.has(todo.id)).length

  const hoursNote = hours !== undefined && hours > 0 ? `按每周 ${hours} 小时` : '按当前每周投入'
  return {
    kind: 'applied',
    receipt:
      `已${hoursNote}重排《${course.item.title}》：${result.summary.studyDays} 个学习日` +
      (created > 0 ? `，新增 ${created} 条待办` : ''),
  }
}

function setDeadline(action: RawAction, context: AgentActionContext): Outcome {
  const course = resolveCourse(asText(action.course), {
    courses: useCourseStore.getState().courses,
    conversationCourseId: context.conversationCourseId,
  })
  if (!course.ok) return { kind: 'rejected', reason: course.reason }

  const when = asText(action.deadline)
  if (!when) return { kind: 'rejected', reason: '没说是哪天' }

  const resolved = resolveWhen(when)
  if (resolved.kind === 'unknown') {
    return { kind: 'rejected', reason: `没看懂时间「${when}」` }
  }
  if (resolved.kind === 'week') {
    return { kind: 'rejected', reason: `「${when}」是一周，期望完成日期要具体到某一天` }
  }

  useCourseStore.getState().update(course.item.id, { deadline: resolved.date })

  /*
   * 改完 deadline 顺手重排一次。
   *
   * 不重排会留下一个自相矛盾的界面：课程页一边显示新的截止日期，
   * 一边用旧排期算出的"预计完成"警告排不完。计划本来就是按 deadline 倒排的，
   * 所以这里不是"多做一个动作"，而是把同一件事做完。
   */
  const existing = usePlanStore.getState().getByCourse(course.item.id)
  if (existing) rescheduleCourse(course.item.id)

  return {
    kind: 'applied',
    receipt: `已把《${course.item.title}》的期望完成日期改到 ${formatDateHuman(resolved.date)}${
      existing ? '，并据此重排了计划' : ''
    }`,
  }
}

function deletePlan(action: RawAction, context: AgentActionContext): Outcome {
  const course = resolveCourse(asText(action.course), {
    courses: useCourseStore.getState().courses,
    conversationCourseId: context.conversationCourseId,
  })
  if (!course.ok) return { kind: 'rejected', reason: course.reason }

  if (!usePlanStore.getState().getByCourse(course.item.id)) {
    return { kind: 'applied', receipt: `《${course.item.title}》本来就没有学习计划` }
  }

  return {
    kind: 'pending',
    pending: {
      id: newId(),
      kind: 'destructive',
      prompt: `要删掉《${course.item.title}》的学习计划吗？课程内容与掌握记录会保留。`,
      confirmText: '删除计划',
      run: () => {
        const removed = deletePlanForCourse(course.item.id)
        return removed > 0
          ? `已删除《${course.item.title}》的学习计划，同时清掉 ${removed} 条派生待办`
          : `已删除《${course.item.title}》的学习计划`
      },
    },
  }
}

function deleteCourse(action: RawAction, context: AgentActionContext): Outcome {
  const course = resolveCourse(asText(action.course), {
    courses: useCourseStore.getState().courses,
    conversationCourseId: context.conversationCourseId,
  })
  if (!course.ok) return { kind: 'rejected', reason: course.reason }

  return {
    kind: 'pending',
    pending: {
      id: newId(),
      kind: 'destructive',
      prompt: `要删掉《${course.item.title}》这门课吗？它的计划、待办与相关记忆会一起删除，无法撤销。`,
      confirmText: '删除课程',
      run: () => {
        deleteCourseCompletely(course.item.id)
        return `已删除课程《${course.item.title}》`
      },
    },
  }
}

function createCourse(action: RawAction): Outcome {
  const goal = asText(action.goal)
  if (!goal) return { kind: 'rejected', reason: '没说要学什么' }

  return {
    kind: 'pending',
    pending: {
      id: newId(),
      kind: 'create_course',
      prompt: `要按「${goal}」新建一门课吗？`,
      goal,
    },
  }
}

// ---------------------------------------------------------------------------
// 提醒
// ---------------------------------------------------------------------------

function setReminder(action: RawAction): Outcome {
  const time = asText(action.time)
  if (!/^\d{1,2}:\d{2}$/.test(time)) {
    return { kind: 'rejected', reason: time ? `时间要写成 HH:MM（收到的是「${time}」）` : '没说时间' }
  }

  const [hourText, minuteText] = time.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (hour > 23 || minute > 59) return { kind: 'rejected', reason: `「${time}」不是一个有效的时刻` }

  const normalized = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const enabled = action.enabled === undefined ? true : action.enabled !== false

  useSettingsStore.getState().update({
    dailyReminderTime: normalized,
    reminderEnabled: enabled,
  })

  return {
    kind: 'applied',
    receipt: enabled ? `已把每日提醒改到 ${normalized}` : '已关掉每日固定提醒',
  }
}

// ---------------------------------------------------------------------------
// 取值助手：模型给的字段什么都可能是
// ---------------------------------------------------------------------------

/**
 * 取出动作列表。
 *
 * 兼容"只返回一个对象"这种写法（`"actions": {"type": "delete_todo", …}`）：
 * 有些模型在只有一个动作时会去掉方括号，而严格要求数组的后果是**整个动作静默消失** ——
 * 用户看到的就是"我说了它毫无反应"，且没有任何报错可查。
 * 这一段多写的几行，换的是"再也不会因为一个方括号而什么都不发生"。
 */
function asObjectArray(value: unknown): RawAction[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is RawAction => typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  }
  if (typeof value === 'object' && value !== null) return [value as RawAction]
  return []
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

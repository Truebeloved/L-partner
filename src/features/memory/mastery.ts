import { planItemState } from '@/features/course/courseActions'
import type { MemoryDraft } from '@/store/memory'
import { useMemoryStore } from '@/store/memory'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, Id, Plan, Todo } from '@/types/models'

export interface UnitProgress {
  unitId: Id
  unitTitle: string
  knowledgePoints: string[]
  /** 该单元被排期成多少个任务 */
  total: number
  done: number
}

/**
 * 按单元汇总计划完成情况 —— 记忆面板的进度条与掌握状态推导都用它。
 *
 * 完成判定**必须**复用 `planItemState` 而不是只看 `PlanItem.status`：
 * 用户是在「今日」页勾待办的，回流到排期项状态可能还没发生（甚至可能因为
 * 页面切换而没写入）。只看 status 会让「勾了一整天的任务，掌握状态却没动静」，
 * 而这类不一致极难被用户描述清楚。判定口径只有一处，才不会两边打架。
 */
export function computeUnitProgress(
  course: Course,
  plan: Plan,
  todos: Todo[] = [],
): UnitProgress[] {
  const byUnit = new Map<string, { total: number; done: number }>()
  for (const item of plan.items) {
    const bucket = byUnit.get(item.unitId) ?? { total: 0, done: 0 }
    bucket.total += 1
    if (planItemState(item, todos) === 'done') bucket.done += 1
    byUnit.set(item.unitId, bucket)
  }

  return course.stages.flatMap((stage) =>
    stage.units.map((unit) => {
      const bucket = byUnit.get(unit.id) ?? { total: 0, done: 0 }
      return {
        unitId: unit.id,
        unitTitle: unit.title,
        knowledgePoints: unit.knowledgePoints,
        total: bucket.total,
        done: bucket.done,
      }
    }),
  )
}

/**
 * 由计划完成情况推导掌握状态 —— 这一步**不消耗 LLM 调用**。
 *
 * 这里有一条刻意的诚实边界：完成待办只证明「学过了」，不证明「掌握了」。
 * 所以规则只能把单元标成 `learning`，永远不会标成 `mastered` ——
 * mastered（以及 weak）必须来自 LLM 从对话里的判断，或用户自己的标注。
 *
 * 否则「掌握状态」就退化成一个自欺欺人的进度条：
 * 任务点完了就宣称掌握了，而这个功能存在的意义恰恰是区分这两件事。
 */
export function deriveMasteryDrafts(course: Course, plan: Plan, todos: Todo[] = []): MemoryDraft[] {
  const progress = computeUnitProgress(course, plan, todos)
  const drafts: MemoryDraft[] = []

  for (const unit of progress) {
    if (unit.total === 0 || unit.done < unit.total) continue

    for (const knowledgePoint of unit.knowledgePoints) {
      drafts.push({
        layer: 'mastery',
        courseId: course.id,
        knowledgePoint,
        content: `已完成「${unit.unitTitle}」的学习任务，尚未验证掌握程度`,
        level: 'learning',
        // 规则推导的置信度给中等：它确定「学过」，但不确定「学会了」
        confidence: 0.6,
        source: 'rule',
      })
    }
  }

  return drafts
}

/**
 * 把推导结果并入记忆库，返回实际发生变更的条数。
 * 同一个知识点已存在时更新而不是新增，避免记忆面板被重复条目塞满。
 *
 * `todos` 默认现读 store：勾选发生在「今日」页，调用方多半只拿得到 course 与 plan，
 * 要求每个调用点都记得传待办，迟早会漏一个，而那一次漏掉就是「勾了没反应」。
 */
export function syncMasteryFromPlan(course: Course, plan: Plan, todos?: Todo[]): number {
  const drafts = deriveMasteryDrafts(course, plan, todos ?? useTodoStore.getState().todos)
  if (drafts.length === 0) return 0

  const store = useMemoryStore.getState()
  let changed = 0

  for (const draft of drafts) {
    const existing = store.entries.find(
      (entry) =>
        entry.layer === 'mastery' &&
        entry.courseId === draft.courseId &&
        entry.knowledgePoint === draft.knowledgePoint,
    )

    if (existing) {
      // 不覆盖更高等级：AI 或用户判定过「已掌握」的结论，不该被规则推导降级
      const isUpgrade = existing.level === 'unknown' || existing.level === undefined
      if (isUpgrade && existing.level !== draft.level) {
        store.update(existing.id, { level: draft.level, content: draft.content })
        changed += 1
      }
      continue
    }

    store.add(draft)
    changed += 1
  }

  return changed
}

/**
 * 按 courseId 做一次回流 —— 供「今日」页和课程详情页在勾选后调用。
 *
 * 之所以要这个薄封装：调用方通常在事件处理函数里，手上只有 `todo.courseId`。
 * 让每个调用点自己去取 course 和 plan 再拼参数，迟早会有人漏掉一步，
 * 而漏掉的表现是「任务勾了，掌握状态不动」—— 用户只会觉得这个功能是假的。
 */
export function syncMasteryForCourse(courseId: Id): number {
  const course = useCourseStore.getState().getById(courseId)
  const plan = usePlanStore.getState().getByCourse(courseId)
  if (!course || !plan) return 0
  return syncMasteryFromPlan(course, plan)
}

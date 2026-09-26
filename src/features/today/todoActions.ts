import { syncMasteryForCourse } from '@/features/memory/mastery'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Id } from '@/types/models'

/**
 * 「勾选一条待办」的**唯一入口**。
 *
 * 为什么值得单独抽一个函数：勾选不是一个动作，而是三个 store 的连锁反应 ——
 * 待办打勾 → 计划排期项改状态 → 知识点掌握状态回流。任何一处漏掉，
 * 表现都是「任务勾了，课程页还挂着未完成 / 掌握状态不动」，
 * 而用户完全没法描述清楚这是哪一步没做。
 *
 * 这段逻辑原来在「今日」页和侧栏各抄了一份（侧栏的注释还写着"与今日页同一套回流"），
 * 本身就是"迟早会漂"的信号。现在增加全局 AI 这个调用方时，第三份就该被拦住了。
 *
 * 参数是**目标状态**而不是"翻转"：AI 说的是"我看完了第一章"，
 * 那是"要它变成已完成"，不是"按一下开关"。已经处于目标状态时是空操作。
 */
export function setTodoDone(todoId: Id, done: boolean): void {
  const todo = useTodoStore.getState().todos.find((item) => item.id === todoId)
  if (!todo || todo.done === done) return

  useTodoStore.getState().toggle(todoId)

  // 计划派生的待办要把状态写回排期项，否则课程页里这条还挂着「未完成」
  if (todo.planItemId && todo.courseId) {
    usePlanStore
      .getState()
      .updateItemStatus(todo.courseId, todo.planItemId, done ? 'done' : 'todo')
  }

  // 再往前一步：完成情况变成知识点掌握状态（这一步不花 LLM 调用）
  if (todo.courseId) syncMasteryForCourse(todo.courseId)
}

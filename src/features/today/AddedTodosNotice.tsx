import { Link } from 'react-router-dom'

import type { DateKey } from '@/types/models'

export interface AddedTodo {
  title: string
  date: DateKey
}

/**
 * 「已加入待办」的回执。
 *
 * 为什么值得单独做一条：待办是学伴在**后台**顺手落下的，界面上如果一点动静都没有，
 * 用户没法区分"它记下了"和"它没听懂" —— 这两件事的体验差别极大，而看起来完全一样。
 * 用户报过的问题正是这个："它只会分析出待办任务但不会给我添加到待办区域"。
 *
 * 样式上刻意克制：中性底、一行小字、自己会走（8 秒），不弹窗、不要点击确认。
 * 它是"我听见了"的一句回话，不是需要用户处理的通知。
 */
export function AddedTodosNotice({
  todos,
  onDismiss,
}: {
  todos: AddedTodo[]
  onDismiss: () => void
}) {
  if (todos.length === 0) return null

  return (
    <div
      data-added-todos
      className="rounded-card border border-line-soft bg-raised px-3 py-2 shadow-lift"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-small leading-relaxed text-ink">
          已加入待办：
          <span className="font-bold">{todos.map((todo) => todo.title).join('、')}</span>
        </p>
        <Link to="/today" className="shrink-0 text-micro text-ink-soft hover:text-ink">
          去看看 →
        </Link>
        <button
          type="button"
          className="shrink-0 text-micro text-ink-faint hover:text-ink"
          onClick={onDismiss}
          aria-label="关闭待办提示"
        >
          知道了
        </button>
      </div>
    </div>
  )
}

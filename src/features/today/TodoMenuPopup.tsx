import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { formatRelativeDay } from '@/lib/date'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { MenuAnchor } from '@/features/today/useTodoMenu'
import type { Todo } from '@/types/models'

const MENU_WIDTH = 240
/** 与视口边缘至少留出的间距 */
const EDGE_MARGIN = 12

interface TodoMenuPopupProps {
  todo: Todo
  anchor: MenuAnchor
  /** 所属课程（带阶段）名，没有就不显示 */
  courseTitle?: string
  onDelete: (todo: Todo) => void
  onClose: () => void
}

/**
 * 待办的右键小窗：看一眼这是哪一条，然后决定删不删。
 *
 * 刻意做得**轻**：一块小面板、一道浅边、一层很浅的阴影（不用 shadow-pop 那种弹窗量级），
 * 一行标题 + 一行元信息 + 一个删除按钮。它要的是"顺手一划"，不是"打开一个对话框"。
 *
 * ⚠️ 它**挂在 document.body 上**（portal），而不是留在侧栏里。
 *
 * 侧栏里的今日待办是这个菜单最常见的调用方，而侧栏是一个独立的层叠上下文：
 * 光把 z-index 写大没用 —— 那个值只在侧栏内部比较，走出侧栏就被整个压在主内容区下面。
 * 表现就是"在侧栏右键删除一条待办，菜单被书架上的书盖住"（用户报的正是这个）。
 * 挂到 body 之后它和书架的小窗在**同一个**层叠上下文里比 z-index，60 > 40 才真的成立。
 * 顺带也躲开了侧栏的 overflow 裁剪。
 */
export function TodoMenuPopup({
  todo,
  anchor,
  courseTitle,
  onDelete,
  onClose,
}: TodoMenuPopupProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Esc 关（捕获阶段：它比页面层的 Esc 更内层）
  useEscapeKey(onClose, { capture: true })

  /*
   * 点别处关。判断"点在不在面板内"而不是比较 target ——
   * 面板里嵌套了好几层，点内边距命中的是内层元素，用 target 比较会误关。
   */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-todo-menu]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  const position = resolvePosition(anchor)

  return createPortal(
    <div
      ref={ref}
      data-todo-menu
      role="menu"
      aria-label={`「${todo.title}」的操作`}
      className="fixed z-[60] rounded-card border border-line-soft bg-raised p-2 shadow-lift"
      style={{ width: MENU_WIDTH, left: position.left, top: position.top }}
    >
      <p className="truncate px-1.5 pt-1 text-small font-bold text-ink" title={todo.title}>
        {todo.title}
      </p>

      <p className="mt-0.5 truncate px-1.5 text-micro text-ink-faint">
        {[
          todo.weekStart ? '本周目标' : formatRelativeDay(todo.date),
          courseTitle,
          todo.planItemId ? '来自学习计划' : '手动添加',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <button
        type="button"
        role="menuitem"
        className="btn btn-danger btn-sm mt-2 w-full"
        onClick={() => {
          onDelete(todo)
          onClose()
        }}
      >
        删除这条待办
      </button>

      <p className="mt-1.5 px-1.5 text-micro leading-relaxed text-ink-faint">
        Esc 或点击别处关闭
        {todo.planItemId ? ' · 删除不会撤销课程进度' : ''}
      </p>
    </div>,
    document.body,
  )
}

/** 贴着光标显示，放不下就翻到另一侧 —— 只做算术、不测量，避免"先渲染再挪位"的闪烁 */
function resolvePosition(anchor: MenuAnchor): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const estimatedHeight = 132

  const left =
    anchor.x + MENU_WIDTH > viewportWidth - EDGE_MARGIN
      ? Math.max(EDGE_MARGIN, anchor.x - MENU_WIDTH)
      : anchor.x

  const top =
    anchor.y + estimatedHeight > viewportHeight - EDGE_MARGIN
      ? Math.max(EDGE_MARGIN, anchor.y - estimatedHeight)
      : anchor.y

  return { left, top }
}

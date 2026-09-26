import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'

import type { Todo } from '@/types/models'

/** 右键时的落点（视口坐标） */
export interface MenuAnchor {
  x: number
  y: number
}

export interface TodoMenuState {
  todo: Todo
  anchor: MenuAnchor
}

/**
 * 待办的右键菜单状态。
 *
 * 与书架一致的手势分工：**左键做事（勾选），右键管理（删除）**。
 * 原来每行右侧常驻一个「删除」按钮 —— 一屏十几条待办里它会重复十几次，
 * 把列表读成一排按钮；而删除是低频动作，收进右键菜单更安静。
 * 键盘用户仍可用：Chromium 里按菜单键 / Shift+F10 同样会派发 contextmenu。
 *
 * 这个文件刻意只有 hook、没有组件（组件在 TodoMenuPopup.tsx）：
 * 只导出组件的文件才能被 Fast Refresh 正确热更。
 */
export function useTodoMenu() {
  const [menu, setMenu] = useState<TodoMenuState | null>(null)

  const open = useCallback((todo: Todo, event: MouseEvent) => {
    event.preventDefault()
    // 用光标位置定位：右键菜单贴着鼠标才像"从这一行弹出来的"
    setMenu({ todo, anchor: { x: event.clientX, y: event.clientY } })
  }, [])

  const close = useCallback(() => setMenu(null), [])

  return { menu, open, close }
}

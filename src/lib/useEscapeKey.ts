import { useEffect } from 'react'

interface EscapeOptions {
  enabled?: boolean
  /**
   * 弹窗这类「内层」用 true（捕获阶段），页面这类「外层」用默认的冒泡阶段。
   *
   * 为什么必须分阶段：键盘事件在 window 上的捕获监听先于冒泡监听执行，
   * 所以弹窗能在页面之前拿到 Esc 并把它吃掉（stopPropagation + preventDefault），
   * 页面那一层看到 `defaultPrevented` 就什么都不做。
   * 如果两层都注册在同一阶段，先挂载的页面会先跑 —— 结果是"按 Esc 关了弹窗，
   * 同时也退出了页面"，正是要避免的双重动作。
   */
  capture?: boolean
}

/**
 * 把 Esc 绑成「返回 / 关闭」—— 桌面端用户默认就有的预期。
 *
 * 做成 hook 而不是在应用根部装一个全局监听：「返回」退到哪一层只有当前界面知道
 * （弹窗先关弹窗、二级界面退回列表、一级界面什么都不做）。根部判断不了，
 * 硬做就会变成"有时候按 Esc 乱跳页"。规则是：**谁负责这一层，谁绑这个键**。
 */
export function useEscapeKey(onEscape: () => void, options: EscapeOptions = {}) {
  const { enabled = true, capture = false } = options

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // 输入法正在组合时，Esc 的语义是"取消候选"，不该被当成返回
      if (event.isComposing) return
      // 内层（弹窗）已经处理过这一下
      if (event.defaultPrevented) return
      if (capture) {
        event.preventDefault()
        event.stopPropagation()
      }
      onEscape()
    }
    window.addEventListener('keydown', onKeyDown, capture)
    return () => window.removeEventListener('keydown', onKeyDown, capture)
  }, [onEscape, enabled, capture])
}

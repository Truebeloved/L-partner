import { useEffect, useLayoutEffect, useState } from 'react'

import { AssistantBar } from '@/features/assistant/AssistantBar'
import { useAssistantDockState } from '@/features/assistant/dock'
import type { DockPlacement } from '@/features/assistant/dock'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

interface Layout {
  box: Box
  placement: DockPlacement
  /** 这次变化要不要过渡 */
  animate: boolean
}

/** 顶部两个位置之间才生长；与对话页底部之间的切换直接归位 */
function isTop(placement: DockPlacement): boolean {
  return placement === 'top' || placement === 'top-wide'
}

/**
 * 输入条的宿主：把页面上预留的那个空位量出来，贴上去。
 *
 * 为什么是"量"而不是"算"：一级界面的宽度要扣掉侧栏（窄屏时侧栏会消失）、
 * 二级界面是全宽、对话页在底部 —— 这些值随窗口尺寸和路由变化，
 * 用 CSS 表达式或者写死的数字去推，迟早会有一处对不上。
 * 直接读空位的矩形，是唯一"永远对"的做法。
 *
 * 动画的取舍（用户明确要求）：
 * - **一级 ↔ 二级**：走过渡。输入条左右撑开、略微变高，是一次"生长"；
 * - **任何 ↔ 对话页底部**：**不做位移动画**，直接归位。
 *   输入条在页面顶部与页面底部之间来回飞，看着是在"变来变去"，不如让它在应该出现的地方出现。
 *   对话页本身的淡入淡出已经足够交代"换页了"。
 */
export function AssistantDockHost() {
  const slot = useAssistantDockState()
  const [layout, setLayout] = useState<Layout | null>(null)

  useEffect(() => {
    const element = slot.element
    if (!element) return

    let frame = 0

    const measure = () => {
      const rect = element.getBoundingClientRect()
      // 元素已经被摘掉（或还没布局）时 rect 全是 0，这时保留上一次的位置更稳
      if (rect.width === 0 || rect.height === 0) return

      setLayout((previous) => ({
        box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        placement: slot.placement,
        /*
         * 只有"上一次也在顶部、这一次也在顶部"才过渡。
         * 首次定位（previous 为空）不过渡，否则会从 0,0 飞过来。
         */
        animate: Boolean(
          previous &&
            previous.placement !== slot.placement &&
            isTop(previous.placement) &&
            isTop(slot.placement),
        ),
      }))
    }

    // 首帧之后再量：挂载那一帧元素可能还没进布局
    frame = window.requestAnimationFrame(measure)

    /*
     * jsdom（单测环境）里没有 ResizeObserver，没有它就跳过"跟随尺寸变化"这一档能力 ——
     * 首帧那一次测量仍然是有效的，组件照常渲染，不该因为环境缺一个 API 就让整页崩掉。
     */
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    if (element.parentElement) observer?.observe(element.parentElement)

    // 二级界面的头部是 sticky：滚动时它在视口里的位置不变，但仍要重新对一次表，
    // 免得出现"页面滚了一点、输入条没跟上"的一帧错位
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [slot.element, slot.placement])

  /*
   * 换页时输入条该不该动，必须在**浏览器拍照之前**告诉 CSS。
   *
   * useLayoutEffect 的时机正好：它在 DOM 更新之后、浏览器拍新画面之前同步执行。
   * 判断依据是"新旧停靠位里有没有对话页底部"——
   * layout.placement 还是上一次量出来的旧位置，slot.placement 是这一次的新位置，
   * 换页那一帧两者都在手上，所以进出对话页都能识别出来（用 ref 记旧值会在渲染期写 ref）。
   *
   * ⚠️ 这个 hook 必须放在下面的提前 return **之前**：Hook 不能有条件地调用。
   */
  const currentPlacement = layout?.placement ?? slot.placement
  const involvesBottom = currentPlacement === 'bottom' || slot.placement === 'bottom'
  const motion = involvesBottom ? 'none' : layout?.animate ? 'grow' : 'none'

  useLayoutEffect(() => {
    document.documentElement.dataset.dockMotion = motion
  }, [motion])

  if (!layout) return null

  const { box, animate } = layout

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        minHeight: box.height,
        /*
         * view-transition-name 让换页时浏览器"认得出这是同一个元素"。
         *
         * ⚠️ 这正是"对话框平滑变成对话区域"那段动画的来源，而且**自己写的过渡关掉也没用**：
         * 换页时浏览器会拿旧位置与新位置各拍一张，然后自动把整条输入条（连同两个气泡）
         * 从旧位置演到新位置 —— 自己不写一行过渡，它也会动。
         * 所以这里必须显式关掉：见下面 html[data-dock-motion='none'] 那组规则
         * （由 useLayoutEffect 在换页那一帧之前就把属性写上去）。
         */
        viewTransitionName: 'assistant-bar',
        /*
         * 生长与位移用两套缓动：
         * - 尺寸（width / min-height）走 spring，末段有一点回弹 —— "长出来"的感觉就在这点回弹上；
         * - 位置（top / left）走 glide，位移带弹会晕。
         */
        transition: animate
          ? [
              `top 460ms var(--ease-glide)`,
              `left 460ms var(--ease-glide)`,
              `width 460ms var(--ease-spring)`,
              `min-height 460ms var(--ease-spring)`,
            ].join(', ')
          : undefined,
      }}
    >
      {/* 容器整体不接收鼠标事件（它是个定位壳，会盖住页面），交互只落在输入条自己身上 */}
      <div className="pointer-events-auto">
        <AssistantBar placement={currentPlacement} />
      </div>
    </div>
  )
}

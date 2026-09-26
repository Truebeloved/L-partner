import { useEffect, useState } from 'react'

import { AssistantBar } from '@/features/assistant/AssistantBar'
import { useAssistantDockState } from '@/features/assistant/dock'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/**
 * 输入条的宿主：把页面上预留的那个空位量出来，贴上去。
 *
 * 为什么是"量"而不是"算"：一级界面的宽度要扣掉侧栏（窄屏时侧栏会消失）、
 * 二级界面是全宽、对话页在底部 —— 这些值随窗口尺寸和路由变化，
 * 用 CSS 表达式或者写死的数字去推，迟早会有一处对不上。
 * 直接读空位的矩形，是唯一"永远对"的做法。
 *
 * 换页时组件**不卸载**：空位换了，矩形变了，于是过渡把这次变化演成一段生长动画
 * （从一级进二级，输入条会左右撑开、略微变高，而不是「啪」地换一个）。
 */
export function AssistantDockHost() {
  const slot = useAssistantDockState()
  const [box, setBox] = useState<Box | null>(null)
  /** 首次定位不开过渡，否则会从 0,0 飞过来 */
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const element = slot.element
    if (!element) return

    let frame = 0
    const measure = () => {
      const rect = element.getBoundingClientRect()
      // 元素已经被摘掉（或还没布局）时 rect 全是 0，这时保留上一次的位置更稳
      if (rect.width === 0 || rect.height === 0) return
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }

    // 首帧之后再量：挂载那一帧元素可能还没进布局
    frame = window.requestAnimationFrame(measure)
    // 过渡要等第一次定位落地之后再打开
    const readyTimer = window.setTimeout(() => setAnimated(true), 80)

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
      window.clearTimeout(readyTimer)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [slot.element])

  if (!box) return null

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        minHeight: box.height,
        transition: animated
          ? 'top 320ms cubic-bezier(0.32, 0.72, 0, 1), left 320ms cubic-bezier(0.32, 0.72, 0, 1), width 320ms cubic-bezier(0.32, 0.72, 0, 1), min-height 320ms cubic-bezier(0.32, 0.72, 0, 1)'
          : undefined,
      }}
    >
      {/* 容器整体不接收鼠标事件（它是个定位壳，会盖住页面），交互只落在输入条自己身上 */}
      <div className="pointer-events-auto">
        <AssistantBar placement={slot.placement} />
      </div>
    </div>
  )
}

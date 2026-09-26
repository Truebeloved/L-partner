import { createContext, useCallback, useContext } from 'react'

/**
 * 学伴输入条的「停靠位」。
 *
 * 为什么要做成"页面留一个空位、输入条这一份组件飘过去"：
 * 输入条在三处出现（一级界面顶部、二级界面顶部、对话页底部），
 * 如果每处各渲染一份 `<AssistantBar />`，换页时是**卸载再挂载**，
 * 于是不可能有位移和生长的动画 —— 只能看到它突然换了地方、换了宽度。
 *
 * 现在只有一份实例（挂在 App 外壳上），它把页面上那个空位量出来，
 * 用 fixed 定位贴上去；空位的矩形一变（例如从一级进二级），
 * CSS 过渡就把"变化"演成了一段生长动画。换页不销毁组件，气泡和草稿也都还在。
 *
 * 这个文件刻意只有 context 与 hooks，没有组件：给 Provider 单独一个文件，
 * 是为了让 Fast Refresh 能正常工作（只导出组件的文件才能热更组件本身）。
 */
export type DockPlacement =
  /** 一级界面：内容区顶部条带 */
  | 'top'
  /** 二级界面：整页顶部（宽度更大） */
  | 'top-wide'
  /** 对话页：页面底部的输入区 */
  | 'bottom'

export interface DockSlot {
  element: HTMLElement | null
  placement: DockPlacement
}

export interface AssistantDockContextValue {
  slot: DockSlot
  /** 页面把空位交给输入条。传 null 表示卸载（刻意不清空，见 useAssistantDock） */
  attach: (element: HTMLElement | null, placement: DockPlacement) => void
}

export const AssistantDockContext = createContext<AssistantDockContextValue | null>(null)

/**
 * 在页面上留一个空位给输入条，返回要挂在那个元素上的 ref。
 *
 * 空位自身的高度就是输入条的高度（顶部两个位置），所以页面内容不会钻到它下面。
 */
export function useAssistantDock(placement: DockPlacement) {
  const context = useContext(AssistantDockContext)
  if (!context) throw new Error('useAssistantDock 必须在 AssistantDockProvider 内部使用')

  const { attach } = context
  return useCallback(
    (element: HTMLElement | null) => {
      // 卸载时传进来的是 null：此时**不要**清掉元素。
      // 换页那一帧里新页面已经注册好了新空位，清空只会让输入条闪一下再回来。
      if (!element) return
      attach(element, placement)
    },
    [attach, placement],
  )
}

export function useAssistantDockState(): DockSlot {
  const context = useContext(AssistantDockContext)
  if (!context) throw new Error('useAssistantDockState 必须在 AssistantDockProvider 内部使用')
  return context.slot
}

/**
 * 各停靠位的高度。
 *
 * 两档高度不同（一级 40、二级 48），靠页面上的 top 留白差补回来，
 * 使两者的**重心高度**都落在 36px 上 —— 换页时输入条不该上下跳。
 */
export const DOCK_METRICS: Record<DockPlacement, { height: number }> = {
  top: { height: 40 },
  'top-wide': { height: 48 },
  bottom: { height: 48 },
}

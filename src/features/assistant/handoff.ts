import { createContext, useContext } from 'react'

/**
 * 「输入条 → 对话页」的交接动画。
 *
 * 场景：从别的页面点进「学伴对话」时，输入条上正挂着两个气泡（一问一答）。
 * 如果只是让输入条滑到底部，那两个气泡就凭空消失了 —— 而它们对应的是对话列表里
 * 真实存在的两条消息。所以这里做一次**共享元素过渡**：
 * 把两个气泡的原位置与目标位置记下来，渲染两份"影子"从原位置飞向目标位置，
 * 落定后再让真正的消息出现。
 *
 * 三件事必须分开记，否则动画会错位：
 * 1. 起点 —— 必须在离开上一页**之前**量（输入条一换停靠位，气泡就不在了），
 *    所以由输入条自己随时把气泡矩形写进 `rememberBubbleRects`；
 * 2. 终点 —— 对话页挂载后量真实消息气泡的矩形；
 * 3. 期间把真实消息藏起来，动画结束再淡入。
 *
 * 这个文件刻意只有 context 与纯函数，没有组件：Provider 与影子层各占一个文件，
 * 这样 Fast Refresh 才能正常工作（只导出组件的文件才能热更组件本身）。
 */
export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface GhostSpec {
  from: Box
  to: Box
  text: string
  kind: 'answer' | 'question'
}

export interface HandoffState {
  ghosts: GhostSpec[]
  /** 正在飞的那两条消息 id —— 它们此刻要隐形，等影子落地再出现 */
  hiddenMessageIds: string[]
}

export interface HandoffContextValue {
  handoff: HandoffState | null
  start: (ghosts: GhostSpec[], hiddenMessageIds: string[]) => void
  finish: () => void
}

export const AssistantHandoffContext = createContext<HandoffContextValue | null>(null)

export function useAssistantHandoff(): HandoffContextValue {
  const context = useContext(AssistantHandoffContext)
  if (!context) throw new Error('useAssistantHandoff 必须在 AssistantHandoffProvider 内部使用')
  return context
}

/**
 * 输入条气泡的最近一次位置。
 *
 * 刻意放在模块作用域而不是 React state：它是一份"随时可取的快照"，
 * 写入方（输入条）和读取方（对话页挂载那一刻）之间没有任何父子关系，
 * 走 state 只会多一轮渲染，而挂载那一刻根本来不及。
 */
interface BubbleSnapshot {
  answer?: Box
  question?: Box
  answerText?: string
  questionText?: string
}

const lastBubbleRects: BubbleSnapshot = {}

export function rememberBubbleRects(input: {
  answer?: Box | null
  question?: Box | null
  answerText: string
  questionText: string
}): void {
  lastBubbleRects.answer = input.answer ?? undefined
  lastBubbleRects.question = input.question ?? undefined
  lastBubbleRects.answerText = input.answerText
  lastBubbleRects.questionText = input.questionText
}

/** 取走并清空：一次交接只该发生一次，取过之后旧的坐标就是脏数据了 */
export function takeBubbleRects(): {
  answer?: Box
  question?: Box
  answerText: string
  questionText: string
} {
  const snapshot = {
    answer: lastBubbleRects.answer,
    question: lastBubbleRects.question,
    answerText: lastBubbleRects.answerText ?? '',
    questionText: lastBubbleRects.questionText ?? '',
  }
  lastBubbleRects.answer = undefined
  lastBubbleRects.question = undefined
  lastBubbleRects.answerText = undefined
  lastBubbleRects.questionText = undefined
  return snapshot
}

export function boxOf(element: Element | null): Box | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

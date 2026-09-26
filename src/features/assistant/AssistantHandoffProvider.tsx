import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AssistantHandoffContext } from '@/features/assistant/handoff'
import type { GhostSpec, HandoffState } from '@/features/assistant/handoff'

/**
 * 交接动画的状态宿主。
 *
 * 只做三件事：记住"正在飞的两条影子"、记住"哪两条消息此刻该隐形"、以及在动画结束时清空。
 * 逻辑短，但它把"输入条"和"对话页"这两个互不相识的组件连了起来 ——
 * 见 handoff.ts 顶部的说明。
 */
export function AssistantHandoffProvider({ children }: { children: ReactNode }) {
  const [handoff, setHandoff] = useState<HandoffState | null>(null)

  const start = useCallback((ghosts: GhostSpec[], hiddenMessageIds: string[]) => {
    if (ghosts.length === 0) return
    setHandoff({ ghosts, hiddenMessageIds })
  }, [])

  const finish = useCallback(() => setHandoff(null), [])

  const value = useMemo(() => ({ handoff, start, finish }), [handoff, start, finish])

  return <AssistantHandoffContext.Provider value={value}>{children}</AssistantHandoffContext.Provider>
}

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AssistantDockContext } from '@/features/assistant/dock'
import type { DockPlacement, DockSlot } from '@/features/assistant/dock'

/**
 * 输入条停靠位的注册中心。
 *
 * 它只做一件事：记住"当前页面上那个空位是哪个元素"。输入条本体（AssistantDockHost）
 * 订阅这个状态，量出矩形后把自己贴上去。逻辑本身很短，但它是"换页有生长动画"
 * 这件事的全部前提 —— 见 dock.ts 顶部的说明。
 */
export function AssistantDockProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<DockSlot>({ element: null, placement: 'top' })

  const attach = useCallback((element: HTMLElement | null, placement: DockPlacement) => {
    if (!element) return
    setSlot({ element, placement })
  }, [])

  const value = useMemo(() => ({ slot, attach }), [slot, attach])

  return <AssistantDockContext.Provider value={value}>{children}</AssistantDockContext.Provider>
}

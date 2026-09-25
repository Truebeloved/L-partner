import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'

/**
 * 所有持久化 store 的收集点。
 * 新增 store 时记得加进来，否则该模块会先渲染空状态再突然填充数据。
 */
const PERSISTED_STORES: { persist: { rehydrate: () => Promise<void> | void } }[] = [
  useSettingsStore,
  usePersonaStore,
  useCourseStore,
  usePlanStore,
  useTodoStore,
  useMemoryStore,
  useChatStore,
]

function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-center">
        <div className="animate-pulse font-display text-h1 font-bold text-ink">L-partner</div>
        <p className="hint mt-2">正在读取本地数据…</p>
      </div>
    </div>
  )
}

/**
 * 等 IndexedDB 读完再渲染。
 *
 * persist 中间件的 hydration 是异步的，直接渲染会让用户先看到一屏空状态、
 * 数据到位后再突然跳动（课程列表闪一下、今日待办从「空」变「有」）。
 * 所以这里统一等待，代价是最多几十毫秒的启动画面。
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all(PERSISTED_STORES.map((store) => store.persist.rehydrate()))
      .catch((error: unknown) => {
        // 读不出来也要让应用可用，只是数据是空的；不要把用户卡在启动画面上
        console.error('[L-partner] 本地数据读取失败：', error)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return <SplashScreen />
  return <>{children}</>
}

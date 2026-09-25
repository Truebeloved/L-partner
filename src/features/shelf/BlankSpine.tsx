import { useMemo } from 'react'

import {
  bookMetrics,
  HEIGHT_SCALE_BY_TIER,
  THICKNESS_SCALE_BY_TIER,
} from '@/features/shelf/shelfLayout'

interface BlankSpineProps {
  seed: string
  baseThickness: number
  baseHeight: number
}

/**
 * 空白书脊：撑满版面用的装饰性占位书。
 *
 * 三个刻意的处理：
 * - **刻意做得比真书矮一档、且低饱和**，让人一眼看出"这是空位"而不是一本真书。
 *   如果它和真书长得一样，用户会反复去点一本点不动的书。
 * - **用 `div` 而不是 `button`**：它不可点击。做成 button 会让键盘 Tab 停在一个
 *   没有任何动作的元素上，对读屏用户是纯噪音。
 * - 悬停只有极轻微的反应（微亮 + 微浮），不做"抽出"——抽出是本排真书的专属反馈。
 */
export function BlankSpine({ seed, baseThickness, baseHeight }: BlankSpineProps) {
  const metrics = useMemo(() => bookMetrics(seed), [seed])

  const thickness = Math.round(
    baseThickness * (THICKNESS_SCALE_BY_TIER[metrics.thicknessTier] ?? 1),
  )
  // 额外乘 0.92：空书脊统一比真书矮一点，形成"空位"的视觉语言
  const height = Math.round(baseHeight * (HEIGHT_SCALE_BY_TIER[metrics.heightTier] ?? 1) * 0.92)

  return (
    <div
      aria-hidden
      className="relative shrink-0 cursor-default"
      style={{ width: thickness, height }}
    >
      <span
        className="absolute inset-0 rounded-[3px] transition-[transform,filter] duration-300 ease-out hover:-translate-y-0.5 hover:brightness-105"
        style={{
          background: 'linear-gradient(100deg, #e7e3dc 0%, #d9d4cb 55%, #c9c3b8 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.06), 0 4px 8px -6px rgba(15, 23, 42, 0.3)',
        }}
      >
        {/* 极淡的竖向纹路，避免大片纯色显得像缺图的占位框 */}
        <span
          className="absolute inset-y-2 left-1/2 w-px opacity-60"
          style={{ background: 'linear-gradient(to bottom, transparent, #b9b2a6, transparent)' }}
        />
      </span>
    </div>
  )
}

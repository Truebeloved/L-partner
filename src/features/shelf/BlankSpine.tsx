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
 * - **刻意做得比真书矮一档、且是无彩色**，让人一眼看出"这是空位"而不是一本真书。
 *   如果它和真书长得一样，用户会反复去点一本点不动的书。
 * - **用 `div` 而不是 `button`**：它不可点击。做成 button 会让键盘 Tab 停在一个
 *   没有任何动作的元素上，对读屏用户是纯噪音。
 * - 悬停只有极轻微的反应（微亮 + 微浮），不做"抽出"——抽出是本排真书的专属反馈。
 *
 * 配色用中性灰而不是木色：整套设计系统是单色系，木色会成为画面上第二个
 * 与书本争夺注意力的色源。色彩只留给书本身。
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
        className="absolute inset-0 rounded-sm transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[0.97]"
        style={{
          background: 'linear-gradient(100deg, #e6e6e6 0%, #d4d4d4 55%, #bfbfbf 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.07)',
        }}
      >
        {/* 极淡的竖向纹路，避免大片纯色显得像缺图的占位框 */}
        <span
          className="absolute inset-y-2 left-1/2 w-px opacity-70"
          style={{ background: 'linear-gradient(to bottom, transparent, #a8a8a8, transparent)' }}
        />
      </span>
    </div>
  )
}

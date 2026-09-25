import { useMemo } from 'react'
import type { MouseEvent } from 'react'

import {
  bookMetrics,
  hashString,
  HEIGHT_SCALE_BY_TIER,
  THICKNESS_SCALE_BY_TIER,
} from '@/features/shelf/shelfLayout'

/**
 * 书脊配色。
 *
 * 刻意用低饱和的"书封"色系而不是鲜艳的原色：
 * 一排八本挨在一起，任何一本跳脱都会让整排显得廉价。
 * 颜色由课程 id 推导，所以同一门课永远是同一个颜色。
 */
const SPINE_PALETTE: readonly { from: string; to: string; text: string; edge: string }[] = [
  { from: '#44607a', to: '#2d4256', text: '#e9eff4', edge: '#243546' },
  { from: '#8a5252', to: '#653a3a', text: '#f7ebe6', edge: '#4e2c2c' },
  { from: '#50664f', to: '#384a37', text: '#ecf1e9', edge: '#2b392a' },
  { from: '#63506f', to: '#473852', text: '#f0eaf3', edge: '#362a3f' },
  { from: '#776440', to: '#56482c', text: '#f6f0e3', edge: '#423722' },
  { from: '#436663', to: '#2e4a47', text: '#e7f1f0', edge: '#223836' },
  { from: '#77505f', to: '#553946', text: '#f6e9ee', edge: '#412b35' },
  { from: '#4a5a76', to: '#333f54', text: '#e9edf4', edge: '#27303f' },
  { from: '#836f4d', to: '#5f5036', text: '#f6f1e4', edge: '#483d29' },
  { from: '#545454', to: '#3a3a3a', text: '#eeeeee', edge: '#2b2b2b' },
]

function paletteFor(seed: string) {
  return SPINE_PALETTE[hashString(seed) % SPINE_PALETTE.length] ?? SPINE_PALETTE[0]!
}

interface BookSpineProps {
  title: string
  seed: string
  /** 基准厚度（px），由书架按可用宽度算好传入 */
  baseThickness: number
  /** 基准高度（px） */
  baseHeight: number
  /** 是否处于选中态（小窗已打开）—— 选中的书会保持抽出，视觉上和悬浮态一致 */
  selected: boolean
  /** 完成进度 0~1，画成书脊底部的一条细线 */
  progress: number
  /** 需要拿到元素本身来测量位置，小窗要贴着这本书弹出来 */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * 一本拟真书籍。
 *
 * 尺寸来自 `bookMetrics(seed)`，是**确定性**的 —— 同一个课程 id 永远得到同一高度与厚度。
 * 这一点很关键：如果尺寸随机，任何一次重渲染（鼠标移动、选中态变化）都会让整排书重新洗牌，
 * 观感是书架在不停抽搐。
 *
 * 抽出动效只用 `transform` 与 `box-shadow`，两者都能交给合成器，不触发重排。
 * 用 `transition` 而不是 `animation`：动画播完会回到原位，而这里要的是"抽出后停住"。
 */
export function BookSpine({
  title,
  seed,
  baseThickness,
  baseHeight,
  selected,
  progress,
  onClick,
}: BookSpineProps) {
  const metrics = useMemo(() => bookMetrics(seed), [seed])
  const palette = useMemo(() => paletteFor(seed), [seed])

  const thickness = Math.round(
    baseThickness * (THICKNESS_SCALE_BY_TIER[metrics.thicknessTier] ?? 1),
  )
  const height = Math.round(baseHeight * (HEIGHT_SCALE_BY_TIER[metrics.heightTier] ?? 1))

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      className="group relative shrink-0 cursor-pointer outline-none"
      style={{ width: thickness, height }}
    >
      <span
        className={[
          'absolute inset-0 flex flex-col items-center justify-between rounded-sm px-1 pt-2.5 pb-2',
          'transition-[transform,box-shadow,filter] duration-200 ease-out',
          'group-hover:-translate-y-3 group-focus-visible:-translate-y-3',
          'group-hover:brightness-110 group-focus-visible:brightness-110',
          selected ? '-translate-y-3 brightness-110' : '',
        ].join(' ')}
        style={{
          background: `linear-gradient(100deg, ${palette.from} 0%, ${palette.to} 55%, ${palette.edge} 100%)`,
          // 阴影是「这本书离开了隔板」这条信息唯一的载体
          boxShadow: selected
            ? '0 14px 22px -8px rgba(0, 0, 0, 0.45)'
            : '0 6px 10px -6px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* 书脊高光：一条竖向的亮边，模拟书脊的圆角反光 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[18%] w-px opacity-25"
          style={{ background: 'linear-gradient(to bottom, transparent, #ffffff, transparent)' }}
        />

        {/* 竖向书名。中文书脊本来就是竖排，用 writing-mode 而不是逐字换行 */}
        <span
          className="max-h-[62%] overflow-hidden text-micro tracking-wider"
          style={{ writingMode: 'vertical-rl', color: palette.text }}
        >
          {title}
        </span>

        {/* 底部进度细线：这门课学到哪了。不抢视觉，但让书架承载信息而不是纯装饰 */}
        <span aria-hidden className="h-0.5 w-3/5 overflow-hidden rounded-pill bg-ink-inverse/25">
          <span
            className="block h-full rounded-pill bg-ink-inverse/80 transition-[width] duration-500"
            style={{ width: `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%` }}
          />
        </span>
      </span>
    </button>
  )
}

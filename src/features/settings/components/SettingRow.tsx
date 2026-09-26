import type { ReactNode } from 'react'

interface SettingRowProps {
  title: string
  /** 极短的一行说明（十来字）。没有就完全不显示，不占位置 */
  hint?: string
  /** 右侧控件：开关、按钮组等 */
  control?: ReactNode
}

/**
 * 设置页的功能栏。
 *
 * 一条设置 = 一行：左边功能名，右边控件，说明压成一行灰字跟在标题后面。
 *
 * 为什么把说明收成一行而不是放在标题下方另起一段：设置页原来每个区块都是
 * 「标题 + 两三行解释」，六七个区块叠起来就是一篇说明文 ——
 * 用户是来改设置的，不是来读文档的。真正的细节（活跃时段、每天上限）在开启后
 * 才展开，没开启时不占任何视觉位置。
 */
export function SettingRow({ title, hint, control }: SettingRowProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="shrink-0 text-h3 font-bold text-ink">{title}</span>
        {hint && <span className="truncate text-small text-ink-faint">{hint}</span>}
      </div>
      {control && <div className="flex shrink-0 items-center gap-3">{control}</div>}
    </div>
  )
}

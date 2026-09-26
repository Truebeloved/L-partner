import type { ReactNode, SVGProps } from 'react'

/**
 * 图标集。
 *
 * 为什么自己画而不是用 emoji 或 Unicode 几何字符：
 * - emoji 是**彩色**的，在单色系统里是异色源（书脊除外，那是内容而非界面）；
 * - `▤ ◌ ◈ ◇ ◎` 这类几何字形来自不同字体，字重与视觉尺寸都不一样，
 *   排在一起像临时占位 —— 记忆与角色两个菱形几乎无法分辨。
 *
 * 统一规格：24×24 视图框、纯描边、`currentColor`、圆头圆角、线宽统一由
 * strokeWidth 控制（默认 1.75）。任意两个图标并排放都协调。
 */
export type IconName =
  | 'shelf'
  | 'chat'
  | 'layers'
  | 'user'
  | 'sliders'
  | 'plus'
  | 'calendar'
  | 'bell'
  | 'check'
  | 'chevronRight'
  | 'arrowLeft'
  | 'trash'
  | 'pencil'
  | 'sparkle'
  | 'search'
  | 'close'
  | 'alert'
  | 'archive'
  | 'send'
  | 'chevronDown'
  | 'chevronUp'

const ICONS: Record<IconName, ReactNode> = {
  // 一排书立在一道隔板上 —— 与「书架」这个隐喻直接对应
  shelf: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20V9M11 20V5M16 20V12" />
      <path d="M5 9h2M10 5h2M15 12h2" />
    </>
  ),
  chat: <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z" />,
  // 分层：记忆本来就是四层结构，比"大脑"这种具象图形更准确也更克制
  layers: (
    <>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 17 9 4.5 9-4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" />
      <path d="M10.5 19a2 2 0 0 0 3 0" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5Z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v6M12 16.5v.5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </>
  ),
  // 向上的箭头：输入条的发送键。用箭头而不是纸飞机，是为了和「收起 / 展开」这套方向语义一致
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** 视觉尺寸（px）。默认 16，与 12–14px 的文字搭配刚好 */
  size?: number
  /** 线宽。默认 1.75 —— 太细在灰底上会糊，太粗会显得笨重 */
  strokeWidth?: number
}

export function Icon({ name, size = 16, strokeWidth = 1.75, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  )
}

import { AVATAR_MARKS, normalizeAvatar } from '@/components/avatar-marks'

interface PersonaAvatarProps {
  /** `Persona.avatar` 的原始值，可以是新的标记 key，也可以是历史 emoji */
  value: string | undefined
  /** 圆形底的直径（px） */
  size?: number
  /** 选中态：头像选择器里用 */
  selected?: boolean
  className?: string
}

/**
 * 角色头像。
 *
 * 统一套一层圆形底，是为了让它读起来是**身份标识**而不是一枚零散图标 ——
 * 这也正是它和普通图标（导航里那些）的区别所在。
 */
export function PersonaAvatar({ value, size = 36, selected, className }: PersonaAvatarProps) {
  const key = normalizeAvatar(value)
  const glyph = Math.round(size * 0.58)
  const strokeWidth = size >= 40 ? 1.5 : 1.8

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out',
        selected ? 'border-ink bg-ink text-ink-inverse' : 'border-line-soft bg-ink/5 text-ink',
        className ?? '',
      ].join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {AVATAR_MARKS[key]}
      </svg>
    </span>
  )
}

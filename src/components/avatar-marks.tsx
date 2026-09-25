import type { ReactNode } from 'react'

/**
 * 角色头像的标记集与数据归一化。
 *
 * 与组件分开放，是为了让 PersonaAvatar.tsx 只导出组件 ——
 * 同一个文件里既导出组件又导出常量会破坏 React Fast Refresh 的边界。
 *
 * 为什么不用 emoji（哪怕转成灰度）：
 * 灰度只是去掉了颜色，**形状问题一点没解决** —— emoji 各自来自不同的设计者，
 * 卡通化程度、笔画粗细、内部细节密度全都不一样，放在一起就是十种风格。
 * 这和之前导航里那堆 `▤ ◌ ◈ ◇ ◎` 几何字符是同一个病，只是症状不同。
 *
 * 这套标记的做法：
 * - 全部是**抽象几何形**，不画具象的动物或人脸 —— 具象图形在单色下容易失焦
 * - 共用同一套描边语言（24×24 视图框、round cap、线宽按尺寸缩放）
 * - 统一套在一个圆形底里，让它读起来是"身份标识"而不是一枚零散图标
 */
export const AVATAR_KEYS = [
  'target',
  'sprout',
  'column',
  'bolt',
  'lamp',
  'quill',
  'compass',
  'mountain',
  'moon',
  'spiral',
] as const

export type AvatarKey = (typeof AVATAR_KEYS)[number]

export const AVATAR_MARKS: Record<AvatarKey, ReactNode> = {
  // 聚焦的目标
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // 慢慢长出来的芽
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3-2-5-5-5 0 3 2 5 5 5Z" />
      <path d="M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
    </>
  ),
  // 学院里的立柱
  column: (
    <>
      <path d="M5 5h14M4 20h16" />
      <path d="M7 5v15M17 5v15" />
      <path d="M10.5 8v12M13.5 8v12" />
    </>
  ),
  // 一闪而过的直觉
  bolt: <path d="M13.5 2.5 6 13.5h5L10.5 21.5 18 10.5h-5l.5-8Z" />,
  // 夜里那盏灯
  lamp: (
    <>
      <path d="M6 10h9l-1.5-6h-6L6 10Z" />
      <path d="M10.5 10v8" />
      <path d="M7 21h7" />
      <path d="M16 6h2.5" />
    </>
  ),
  // 写字的羽毛笔
  quill: (
    <>
      <path d="M4.5 20 15 9.5" />
      <path d="M20 4c-5 0-8 3-8 6.5 0 2 1.5 3 3 3 3.5 0 5-4 5-9.5Z" />
    </>
  ),
  // 找方向的罗盘
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-2 4.5-4 2 2-4.5L15 9Z" />
    </>
  ),
  // 走得慢但走得远
  mountain: (
    <>
      <path d="M2.5 19.5 9 8l3.5 6" />
      <path d="M11 14.5 14.5 9l7 10.5H2.5" />
    </>
  ),
  // 静下来
  moon: <path d="M20 14.8A8.8 8.8 0 1 1 9.3 4a7 7 0 0 0 10.7 10.8Z" />,
  // 绕进去再绕出来
  spiral: (
    <>
      <path d="M12 12a3 3 0 1 1 3 3" />
      <path d="M15 15a6 6 0 1 1-6-9" />
      <path d="M9 6a9 9 0 1 1 3.5 17.3" />
    </>
  ),
}

/** 历史数据里的 emoji → 新标记。只覆盖种子数据与旧选择器里出现过的那些 */
const LEGACY_EMOJI: Record<string, AvatarKey> = {
  '🧑‍🏫': 'quill',
  '🎯': 'target',
  '🌱': 'sprout',
  '🏛️': 'column',
  '⚡': 'bolt',
  '🦉': 'compass',
  '🧭': 'compass',
  '🛠️': 'bolt',
  '📐': 'quill',
  '🐢': 'mountain',
  '🌙': 'moon',
  '🌊': 'spiral',
  '📘': 'lamp',
  '🧑‍🎓': 'quill',
  '🙂': 'sprout',
  '💬': 'spiral',
}

/** FNV-1a，与书架用的是同一个散列，保证同一个值永远映射到同一个标记 */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function isAvatarKey(value: string): value is AvatarKey {
  return (AVATAR_KEYS as readonly string[]).includes(value)
}

/**
 * 把任意历史值（emoji / 空 / 未知字符串）归一化成合法的 AvatarKey。
 * 有了它就不需要做数据迁移：旧数据直接落到合适的标记上，且结果稳定。
 */
export function normalizeAvatar(value: string | undefined): AvatarKey {
  if (!value) return 'sprout'
  if (isAvatarKey(value)) return value
  const mapped = LEGACY_EMOJI[value]
  if (mapped) return mapped
  // 未知值按哈希分配：同一个未知值每次落到同一个标记，不会在重渲染时跳变
  return AVATAR_KEYS[hash(value) % AVATAR_KEYS.length] ?? 'sprout'
}

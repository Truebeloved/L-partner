/**
 * 书架的布局计算。
 *
 * 全部是纯函数：给定「课程 id 列表 + 容器宽度」必定得到同一个结果。
 * 这么做有两个理由：
 * 1. 书架的错落感依赖**确定性**的尺寸推导 —— 一旦掺入真随机，
 *    每次重渲染书高都会变，鼠标一移整排书架就抖（见 bookMetrics 的注释）。
 * 2. 响应式规则（一排几本、补几本空书脊）可以被单测钉死，
 *    而这类规则最容易在改样式时被悄悄改坏。
 */

/**
 * 一排几本。
 *
 * 断点按**书架容器自己的宽度**算，而不是窗口宽度 —— 书架现在是限宽居中的
 * （见 Shelf 的 max-w-3xl）：排满 1174px 的 8 本书每本要 130px 厚，
 * 配 232px 高就是 1:1.8，那是盒子不是书。收窄容器之后 8 本书才可能既有书的样子、
 * 又恰好填满一排。
 *
 * 每档的取值依据：容器宽 - 左右各 24px 的内边距，再除以「书厚 + 缝宽」。
 * 例如 768px 的容器：可用 720px，(720 - 7×12) / 8 ≈ 79px 一本，正好是舒服的书厚。
 */
const WIDTH_BREAKPOINTS: readonly { minWidth: number; perRow: number }[] = [
  { minWidth: 768, perRow: 8 },
  { minWidth: 676, perRow: 7 },
  { minWidth: 584, perRow: 6 },
  { minWidth: 492, perRow: 5 },
  { minWidth: 400, perRow: 4 },
  { minWidth: 0, perRow: 3 },
]

export type ShelfSlotKind = 'course' | 'filler'

export interface ShelfSlot {
  kind: ShelfSlotKind
  /** course 为课程 id；filler 为带行号与列号的稳定占位标识 */
  key: string
  /** 推导书籍尺寸用的稳定种子 */
  seed: string
}

export interface ShelfRow {
  index: number
  slots: ShelfSlot[]
}

export interface ShelfLayout {
  perRow: number
  rows: ShelfRow[]
  courseCount: number
  fillerCount: number
}

export interface BookMetrics {
  /** 高度档位，0 最矮 */
  heightTier: number
  /** 厚度档位，0 最薄 */
  thicknessTier: number
}

/** 高度分成 4 档。用离散档位而不是连续随机：连续值看着是"乱"，离散值才像是"设计过的" */
export const HEIGHT_TIER_COUNT = 4
/** 厚度分 3 档，变化幅度比高度小 —— 厚度太夸张会显得不像书 */
export const THICKNESS_TIER_COUNT = 3

/** 每个高度档位相对基准高度的比例 */
export const HEIGHT_SCALE_BY_TIER = [0.86, 0.94, 1.0, 1.08] as const
/** 每个厚度档位相对基准厚度的比例 */
export const THICKNESS_SCALE_BY_TIER = [0.86, 1.0, 1.16] as const

/**
 * FNV-1a 32 位哈希。
 * 只要一个稳定、分布均匀的散列即可，不需要密码学强度。
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * 由种子推导书籍尺寸。
 *
 * 用不同位段取高度与厚度，避免两者被同一个低位序列绑定
 * （否则会出现"高的必然厚"这种规律，一眼就假）。
 */
export function bookMetrics(seed: string): BookMetrics {
  const hash = hashString(seed)
  return {
    heightTier: hash % HEIGHT_TIER_COUNT,
    thicknessTier: (hash >>> 11) % THICKNESS_TIER_COUNT,
  }
}

/** 依容器宽度决定一排摆几本 */
export function perRowForWidth(width: number): number {
  for (const breakpoint of WIDTH_BREAKPOINTS) {
    if (width >= breakpoint.minWidth) return breakpoint.perRow
  }
  return WIDTH_BREAKPOINTS[WIDTH_BREAKPOINTS.length - 1]?.perRow ?? 3
}

/**
 * 铺出整个书架。
 *
 * 每一行都补满空书脊（包括最后一行）—— 这正是"撑满版面"的要求：
 * 只有 3 门课时，补 5 本空书脊才像一排书架，否则右侧空一大块。
 *
 * 窗口变窄时 perRow 下降，空书脊数量随之减少；真实书籍只会被重新排布，
 * 永远不会被隐藏 —— 这是"不损失信息"的底线。
 */
export function buildShelfLayout(
  courseIds: readonly string[],
  containerWidth: number,
): ShelfLayout {
  const perRow = perRowForWidth(containerWidth)
  const rows: ShelfRow[] = []

  // 一本真书都没有时也要撑出一排空书脊：
  // 完全空白的区域会让人以为界面坏了，也丢失了"这里可以放书"的暗示
  if (courseIds.length === 0) {
    return {
      perRow,
      rows: [makeRow(0, [], perRow)],
      courseCount: 0,
      fillerCount: perRow,
    }
  }

  for (let start = 0; start < courseIds.length; start += perRow) {
    const slice = courseIds.slice(start, start + perRow)
    rows.push(makeRow(rows.length, slice, perRow))
  }

  const fillerCount = rows.length * perRow - courseIds.length
  return { perRow, rows, courseCount: courseIds.length, fillerCount }
}

function makeRow(index: number, courseIds: readonly string[], perRow: number): ShelfRow {
  const slots: ShelfSlot[] = courseIds.map((courseId) => ({
    kind: 'course',
    key: courseId,
    seed: courseId,
  }))

  for (let column = slots.length; column < perRow; column += 1) {
    // 占位 key 里带上行号与列号：同一格在任何一次渲染里都对应同一本书，
    // 高度才不会在重排时跳变
    const key = `filler-${index}-${column}`
    slots.push({ kind: 'filler', key, seed: key })
  }

  return { index, slots }
}

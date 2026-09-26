/**
 * 文本相似度的小工具。
 *
 * 放在 lib 里而不是各自的特性目录：课程匹配（今日/待办）和对话分类都要用它，
 * 而两处各写一份迟早会出现"两边判断不同"的鬼故事。
 */

/**
 * 两个串的最长公共子串长度（只要长度，不要位置）。
 *
 * 用途是判断"够不够像"：课程名叫「C语言基础入门」，用户说"C语言"，
 * 这不是包含关系，但显然指的是同一门课。字符串都很短，
 * 用滚动数组的一维 DP，开销可以忽略。
 */
export function longestCommonSubstring(a: string, b: string): number {
  let best = 0
  let previous = new Array<number>(b.length + 1).fill(0)

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] !== b[j - 1]) continue
      current[j] = previous[j - 1]! + 1
      if (current[j]! > best) best = current[j]!
    }
    previous = current
  }

  return best
}

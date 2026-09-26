import { normalizeForMatch } from '@/features/today/autoTodo'
import type { Course, Id } from '@/types/models'

/** 命中的依据 —— 界面上要能如实说出"凭什么判断这句话跟这门课有关" */
export interface CourseMatch {
  courseId: Id
  /** 命中的原词（单元名、知识点或课程名） */
  matched: string
  /** 命中的字数：越长越具体，用来在多个候选之间取舍 */
  score: number
}

/**
 * 重叠到几个字才算"有关"。
 *
 * 3 个中文字已经足够具体：「宾语前置」能认出《文言文》，而「学」「做」「今天」
 * 这类 2 字以下的碎片不会误伤 —— 下限取 2 会让几乎每句话都命中某门课。
 */
const MIN_OVERLAP = 3

/**
 * 把一句话归类到某门课程。
 *
 * 为什么用本地规则而不是让模型判断：这是**每一句话**都要跑的分类，
 * 让模型来做等于把每条消息的成本翻倍、还多一次等待；而分类依据本身是确定的 ——
 * 课程里已经存在的那套"标准说法"（单元标题、知识点、课程名）就是词表。
 * 用户确认过的口径是：
 *
 * - 与课程内容有关 → 归到那门课的对话；
 * - 与课程无关 → 留在主对话（主对话只有一场，上下文因此是连续的）。
 *
 * 所以这个函数只回答"命中哪门课"，**认不出来时返回 null**，
 * "认不出来该去哪"交给调用方（见 useChatSession：留在当前所在的那一场）。
 */
export function matchCourseForMessage(text: string, courses: Course[]): CourseMatch | null {
  const target = normalizeForMatch(text)
  if (target.length < MIN_OVERLAP) return null

  let best: CourseMatch | null = null

  for (const course of courses) {
    for (const alias of aliasesOf(course)) {
      const candidate = normalizeForMatch(alias)
      if (candidate.length < MIN_OVERLAP) continue

      /*
       * 两种命中方式：
       * 1. 互相包含 —— 说得比课程里的说法更全或更短都算（"帮我讲讲比喻论证"）
       * 2. 最长公共子串够长 —— 用户说的大多是**书面全称的前半截**
       *    （课程里叫「宾语前置句」，他说"宾语前置到底怎么判断"），
       *    这类前缀关系用"包含"一个都匹配不上。
       */
      const contained = target.includes(candidate) || candidate.includes(target)
      const overlap = contained ? candidate.length : longestCommonSubstring(target, candidate)
      if (!contained && overlap < MIN_OVERLAP) continue

      if (!best || overlap > best.score) {
        best = { courseId: course.id, matched: alias, score: overlap }
      }
    }
  }

  return best
}

/**
 * 一门课的"词表"：单元的**知识点**与**单元标题**（这门课真正在讲什么），
 * 加上**课程名**切出来的片段 —— 用户说"文言文怎么学"，
 * 而课程叫「文言文阅读 · 中高考贯通」，整串是匹配不上的，切开才有「文言文」这一段。
 */
export function aliasesOf(course: Course): string[] {
  const aliases: string[] = [course.title]

  for (const segment of course.title.split(/[\s·、：:，,。!！?？\-—_/|（）()[\]]+/)) {
    if (segment.trim()) aliases.push(segment.trim())
  }

  for (const stage of course.stages) {
    for (const unit of stage.units) {
      aliases.push(unit.title)
      aliases.push(...unit.knowledgePoints)
    }
  }

  return aliases
}

/**
 * 两个串的最长公共子串长度（只要长度，不要位置）。
 *
 * 只用来判断"够不够像"，所以用滚动数组的一维 DP：字符串都很短
 * （课程里的词十几个字、用户这一句话几十个字），开销可以忽略。
 */
function longestCommonSubstring(a: string, b: string): number {
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

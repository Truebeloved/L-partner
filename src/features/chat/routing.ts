import { normalizeForMatch } from '@/features/today/autoTodo'
import { longestCommonSubstring } from '@/lib/text'
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
 *
 * 但课程里的**单元标题与知识点**要求更严（4 个字）：它们是精确术语，
 * 3 个字的偶然重合太多。课程名与主题词放宽到 3 个字 —— 那是课程的名字，
 * 用户本来就会拿简称叫它（说"文言文"指的就是《文言文阅读 · 中高考贯通》）。
 */
const MIN_OVERLAP = 3
const MIN_CONTENT_OVERLAP = 4

/**
 * 与上一轮有关的说法。
 *
 * 用来区分"这句是接着聊"还是"这句另起一个话题"：
 * 认不出课程时，追问（"再讲一遍""为什么"）必须留在原地，
 * 而"说说你的经历"这种自成一体的闲话该回主对话。
 */
const FOLLOW_UP = new RegExp(
  [
    '继续',
    '接着',
    '再讲',
    '再说',
    '再来',
    '还有',
    '上面',
    '刚才',
    '刚刚',
    '这个',
    '那个',
    '这条',
    '那条',
    '它',
    '为什么',
    '没懂',
    '不懂',
    '听不懂',
    '详细',
    '举个例子',
    '展开',
    '重说',
    '换一个',
  ].join('|'),
)
/** 「第二讲」「第三章」「第 3 节」——提到课程的结构位置，说明在聊当前这门课 */
const COURSE_POSITION = /第\s*[一二三四五六七八九十百\d]+\s*(讲|课|章|节|单元|阶段|部分)/

/** 这句话是不是在接着上一轮说 */
export function looksLikeFollowUp(text: string): boolean {
  return FOLLOW_UP.test(text) || COURSE_POSITION.test(text)
}

/**
 * 把一句话归类到某门课程。
 *
 * 为什么用本地规则而不是让模型判断：这是**每一句话**都要跑的分类，
 * 让模型来做等于把每条消息的成本翻倍、还多一次等待；而分类依据本身是确定的 ——
 * 课程里已经存在的那套"标准说法"（单元标题、知识点、课程名）就是词表。
 *
 * 所以这个函数只回答"命中哪门课"，**认不出来时返回 null**；
 * "认不出来该去哪"由调用方决定（见 useChatSession 与 looksLikeFollowUp）。
 */
export function matchCourseForMessage(text: string, courses: Course[]): CourseMatch | null {
  const target = normalizeForMatch(text)
  if (target.length < MIN_OVERLAP) return null

  let best: CourseMatch | null = null

  for (const course of courses) {
    for (const alias of courseAliases(course)) {
      const candidate = normalizeForMatch(alias.text)
      if (candidate.length < MIN_OVERLAP) continue

      /*
       * 两种命中方式：
       * 1. 互相包含 —— 说得比课程里的说法更全或更短都算（"帮我讲讲比喻论证"）
       * 2. 最长公共子串够长 —— 用户说的大多是**书面全称的前半截**
       *    （课程里叫「宾语前置句」，他说"宾语前置到底怎么判断"），
       *    这类前缀关系用"包含"一个都匹配不上。
       *
       * ⚠️ 命中长度取**短的那一边**，这是这个函数最容易写错、后果也最隐蔽的一处。
       * 原来"包含"时直接拿 `candidate.length` 当分数，于是：
       * 视频导入的课有上百条长标题（「2.3.1 为什么需要变量：内存里到底发生了什么_高清 720P」），
       * 用户说一句 3 个字的「为什么」就被它包含，分数成了 26 —— 比任何真实匹配都高，
       * 于是这句追问被塞进那门课，而不是留在原地或回主对话。
       * 课程里长标题越多，这张网越大：用户看到的正是"分类分得乱了"。
       *
       * 短的那一边才是"这次到底对上了几个字"：3 个字对上一个长标题，就是只对上了 3 个字，
       * 达不到内容词的 4 字门槛，不该算命中。
       */
      const contained = target.includes(candidate) || candidate.includes(target)
      const overlap = contained
        ? Math.min(target.length, candidate.length)
        : longestCommonSubstring(target, candidate)
      const needed = alias.kind === 'title' ? MIN_OVERLAP : MIN_CONTENT_OVERLAP
      if (overlap < needed) continue

      if (!best || overlap > best.score) {
        best = { courseId: course.id, matched: alias.text, score: overlap }
      }
    }
  }

  return best
}

/** 这门课是怎么来的：词条来自哪里（课程名与目标判定宽一点，课程内容里的术语严一点） */
interface CourseAlias {
  text: string
  kind: 'title' | 'content'
}

/** 一门课的"词表"：**课程名**（含切开的分段 —— 用户说"文言文怎么学"，
 * 而课程叫「文言文阅读 · 中高考贯通」，整串是匹配不上的）、**学习目标**
 * 与**课程内容**（单元的标题与知识点，这门课真正在讲什么）。
 *
 * 目标也算词条，因为它是用户自己那句话的落点：「我想学编曲」→《编曲入门》，
 * 而"编曲"两个字单独是够不上课程名的门槛的。
 */
export function aliasesOf(course: Course): string[] {
  return courseAliases(course).map((alias) => alias.text)
}

function courseAliases(course: Course): CourseAlias[] {
  const aliases: CourseAlias[] = [{ text: course.title, kind: 'title' }]

  for (const segment of course.title.split(/[\s·、：:，,。!！?？\-—_/|（）()[\]]+/)) {
    if (segment.trim()) aliases.push({ text: segment.trim(), kind: 'title' })
  }

  if (course.goal) aliases.push({ text: course.goal, kind: 'title' })

  for (const stage of course.stages) {
    aliases.push({ text: stage.title, kind: 'content' })
    for (const unit of stage.units) {
      aliases.push({ text: unit.title, kind: 'content' })
      for (const point of unit.knowledgePoints) {
        aliases.push({ text: point, kind: 'content' })
      }
    }
  }

  return aliases
}

/**
 * 这句话与某个短语算不算"在说同一件事"（判据与课程匹配完全一致）。
 *
 * 用途：新建课程时回填主对话的往来。课程刚建出来，"编曲入门"和用户当时那句
 * 「我想学编曲，从哪开始」只共享两个字 —— 靠课程词表认不出来，而那句恰恰
 * 是**这门课之所以存在的原因**，不带上它，回填就漏掉了最该带上的那一条。
 */
export function matchesPhrase(text: string, phrase: string): boolean {
  const target = normalizeForMatch(text)
  const candidate = normalizeForMatch(phrase)
  if (target.length < MIN_OVERLAP || candidate.length < MIN_OVERLAP) return false

  const contained = target.includes(candidate) || candidate.includes(target)
  const overlap = contained
    ? Math.min(target.length, candidate.length)
    : longestCommonSubstring(target, candidate)

  return overlap >= MIN_OVERLAP
}

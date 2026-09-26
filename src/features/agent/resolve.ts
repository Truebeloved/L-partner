import { normalizeForMatch } from '@/features/today/autoTodo'
import { longestCommonSubstring } from '@/lib/text'
import type { Course, Id, Todo } from '@/types/models'

/**
 * 把模型说的「那门课」「那条待办」解析到真实对象上。
 *
 * 为什么这一步必须单独写、而且必须**允许失败**：
 * 模型给的是一段自然语言（"React 那门""第一章那个"），而它落到哪个 id 上
 * 决定的是"删掉哪门课"这种不可逆的事。猜错的代价远大于说一句"我不确定"，
 * 所以这里宁可返回 null 也不挑一个"最像的"。
 *
 * 打分口径与待办关联一致（项目里已经有一套）：完全相等 > 包含 > 最长公共子串 ≥ 3 字。
 * 分数并列时视为**歧义**——两门课一样像，那就是分不清。
 */

/** 匹配得分；0 表示完全不像 */
function score(candidate: string, reference: string): number {
  const target = normalizeForMatch(reference)
  const text = normalizeForMatch(candidate)
  if (text.length === 0 || target.length === 0) return 0

  if (text === target) return 1000
  if (text.includes(target) || target.includes(text)) return 500 + Math.min(text.length, target.length)
  const overlap = longestCommonSubstring(text, target)
  return overlap >= 3 ? overlap : 0
}

interface Match<T> {
  item: T
  score: number
}

/** 取分最高且**唯一**的那个；并列就认输 */
function pickUnique<T>(matched: Match<T>[], label: string): { item: T } | { error: string } {
  if (matched.length === 0) return { error: `没有找到匹配「${label}」的对象` }

  const sorted = [...matched].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  if (!best) return { error: `没有找到匹配「${label}」的对象` }

  const tied = sorted.filter((entry) => entry.score === best.score)
  if (tied.length > 1) {
    return { error: `「${label}」能对上好几个，不确定是哪一个` }
  }

  return { item: best.item }
}

export interface CourseResolveContext {
  courses: Course[]
  /** 当前这场对话绑定的课程 —— 模型省略 course 字段时的兜底 */
  conversationCourseId?: Id
}

export type ResolveResult<T> = { ok: true; item: T } | { ok: false; reason: string }

/**
 * 解析课程引用。
 *
 * 三种情况：
 * 1. 给了课程名 → 按名字匹配；
 * 2. 没给课程名，但这场对话绑着某门课 → 用它；
 * 3. 没给课程名、也没绑课 → 只有一门课时用它，多门课时拒绝
 *    （"帮我把计划删了"在主对话里说，绝不该随机挑一门课）。
 */
export function resolveCourse(
  reference: string | undefined,
  context: CourseResolveContext,
): ResolveResult<Course> {
  const ref = (reference ?? '').trim()

  if (ref.length > 0) {
    const matched = context.courses
      .map((course) => ({ item: course, score: score(course.title, ref) }))
      .filter((entry) => entry.score > 0)
    const picked = pickUnique(matched, ref)
    if ('item' in picked) return { ok: true, item: picked.item }
    return { ok: false, reason: `没认出你说的课程（「${ref}」）` }
  }

  if (context.conversationCourseId) {
    const bound = context.courses.find((course) => course.id === context.conversationCourseId)
    if (bound) return { ok: true, item: bound }
  }

  if (context.courses.length === 1) {
    const only = context.courses[0]
    if (only) return { ok: true, item: only }
  }

  return {
    ok: false,
    reason:
      context.courses.length === 0 ? '书架上还没有课程' : '这条没说是哪门课，而书架上有好几门',
  }
}

export interface TodoResolveContext {
  todos: Todo[]
  /** 优先在这门课的待办里找（有的话） */
  courseId?: Id
}

/**
 * 解析待办引用。
 *
 * 三条倾向，都来自"用户说的多半是哪一条"：
 * 1. **未完成的优先**——"把那个改到周五"绝不会是指一条已经划掉的任务；
 * 2. **本课程的优先**（`courseId` 命中时加分），跨课程同名时不至于串；
 * 3. 已完成的仍作为候选：用户确实可能说"帮我把昨天那条勾掉"（虽然它已经勾了，
 *    那是空操作，但要能认出并如实回一句）。
 */
export function resolveTodo(
  reference: string | undefined,
  context: TodoResolveContext,
): ResolveResult<Todo> {
  const ref = (reference ?? '').trim()
  if (ref.length === 0) return { ok: false, reason: '没说是哪条待办' }

  const matched = context.todos
    .map((todo) => {
      let value = score(todo.title, ref)
      if (value > 0) {
        if (!todo.done) value += 20
        if (context.courseId && todo.courseId === context.courseId) value += 10
      }
      return { item: todo, score: value }
    })
    .filter((entry) => entry.score > 0)

  const picked = pickUnique(matched, ref)
  if ('item' in picked) return { ok: true, item: picked.item }
  return { ok: false, reason: `没找到你说的待办（「${ref}」）` }
}

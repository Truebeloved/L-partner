import { useMemo } from 'react'

import { planItemState } from '@/features/course/courseActions'
import { dayjs, formatMinutes } from '@/lib/date'
import { useTodoStore } from '@/store/todos'
import type { Course, Plan } from '@/types/models'

const POPUP_WIDTH = 304
/** 与视口边缘至少留出的间距 */
const EDGE_MARGIN = 12

export interface AnchorRect {
  left: number
  top: number
  width: number
  height: number
}

interface BookDetailPopupProps {
  course: Course
  plan: Plan | undefined
  /** 被点击那本书在视口中的位置，小窗贴着它显示 */
  anchor: AnchorRect
}

/**
 * 书籍详情小窗。
 *
 * 两个刻意的设计：
 * - **贴着书显示而不是居中弹窗**：居中会有遮罩感，像"被拦住"；
 *   贴着实体的书浮出信息，才像从书架上抽出来看了一眼。
 * - **小窗本身不响应任何点击**：按约定，进入课程要再点那本书。
 *   如果小窗也能点进去，就变成两个入口抢同一个动作，单击/双击的语义会再次打架。
 *   关闭方式是点击别处或按 Esc（在 Shelf 里处理）。
 *
 * 定位只做算术、不测量：宽度固定，垂直方向夹进视口即可。
 * 避免"先渲染再测量再挪位"带来的闪烁。
 */
export function BookDetailPopup({ course, plan, anchor }: BookDetailPopupProps) {
  const todos = useTodoStore((state) => state.todos)

  const stats = useMemo(() => {
    const units = course.stages.flatMap((stage) => stage.units)
    const totalMinutes = units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0)
    const items = plan?.items ?? []
    const done = items.filter((item) => planItemState(item, todos) === 'done').length
    const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100)
    const daysLeft = course.deadline
      ? dayjs(course.deadline).startOf('day').diff(dayjs().startOf('day'), 'day')
      : null

    return {
      stageCount: course.stages.length,
      unitCount: units.length,
      totalMinutes,
      itemCount: items.length,
      percent,
      daysLeft,
    }
  }, [course, plan, todos])

  const position = useMemo(() => resolvePosition(anchor), [anchor])

  return (
    <div
      role="dialog"
      aria-label={`${course.title} 详情`}
      // 标记为交互元素：Shelf 的「点空白处关闭」以此判断是否该跳过。
      // 小窗本身不响应点击（按约定进入课程要再点那本书），但点在它上面也不该关掉它。
      data-shelf-interactive
      className="fixed z-40 rounded-card border border-line-soft bg-raised p-4 shadow-pop"
      style={{ width: POPUP_WIDTH, left: position.left, top: position.top }}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-h3 leading-snug font-bold text-ink">
          {course.title}
        </h3>
        <span className="badge shrink-0">{SOURCE_LABEL[course.source]}</span>
      </div>

      {course.goal && (
        <p className="mt-2 line-clamp-2 text-small leading-relaxed text-ink-soft">{course.goal}</p>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-line-soft py-2 text-center">
        <Stat label="进度" value={stats.itemCount === 0 ? '未排期' : `${stats.percent}%`} />
        <Stat label="单元" value={`${stats.unitCount} 个`} />
        <Stat
          label={stats.daysLeft === null ? '预计' : '剩余'}
          value={
            stats.daysLeft === null
              ? formatMinutes(stats.totalMinutes)
              : stats.daysLeft > 0
                ? `${stats.daysLeft} 天`
                : stats.daysLeft === 0
                  ? '今天截止'
                  : `超期 ${-stats.daysLeft} 天`
          }
        />
      </dl>

      {course.stages.length > 0 && (
        <ul className="mt-3 space-y-1 text-small text-ink-soft">
          {course.stages.slice(0, 3).map((stage) => (
            <li key={stage.id} className="flex gap-2">
              <span className="text-ink-faint">·</span>
              <span className="min-w-0 flex-1 truncate">{stage.title}</span>
              <span className="shrink-0 text-ink-faint">{stage.units.length} 单元</span>
            </li>
          ))}
          {course.stages.length > 3 && (
            <li className="pl-4 text-ink-faint">还有 {course.stages.length - 3} 个阶段…</li>
          )}
        </ul>
      )}

      {/* 交互提示：用黑底白字的实心标签，而不是彩色提示块 —— 单色系统里没有"信息色" */}
      <p className="mt-4 rounded-sm bg-ink/5 px-3 py-2 text-small leading-relaxed text-ink">
        再次单击这本书，进入课程开始学习
      </p>
    </div>
  )
}

const SOURCE_LABEL: Record<Course['source'], string> = {
  manual: '手动创建',
  prompt: 'AI 生成',
  file: '文件导入',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label font-bold tracking-[0.05em] text-ink-faint uppercase">{label}</dt>
      <dd className="tabular mt-1 text-body font-bold text-ink">{value}</dd>
    </div>
  )
}

function resolvePosition(anchor: AnchorRect): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight

  // 水平方向优先放书的右侧；右侧放不下就翻到左侧，再放不下就贴边
  let left = anchor.left + anchor.width + EDGE_MARGIN
  if (left + POPUP_WIDTH > viewportWidth - EDGE_MARGIN) {
    left = anchor.left - POPUP_WIDTH - EDGE_MARGIN
  }
  left = clamp(left, EDGE_MARGIN, Math.max(EDGE_MARGIN, viewportWidth - POPUP_WIDTH - EDGE_MARGIN))

  // 垂直方向与书的顶部大致齐平，并夹进视口
  const estimatedHeight = 268
  const top = clamp(
    anchor.top - 12,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, viewportHeight - estimatedHeight - EDGE_MARGIN),
  )

  return { left, top }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

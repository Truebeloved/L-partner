import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { planItemState } from '@/features/course/courseActions'
import { BlankSpine } from '@/features/shelf/BlankSpine'
import { BookDetailPopup } from '@/features/shelf/BookDetailPopup'
import type { AnchorRect } from '@/features/shelf/BookDetailPopup'
import { BookSpine } from '@/features/shelf/BookSpine'
import { buildShelfLayout, HEIGHT_SCALE_BY_TIER } from '@/features/shelf/shelfLayout'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Id } from '@/types/models'

/** 书与书之间的缝 */
const GAP = 14
const PADDING_X = 28
const BASE_HEIGHT = 196
/** 书的厚度会随可用宽度伸缩，但夹在这个区间内 —— 太薄不像书，太厚一排八本就放不下 */
const MIN_THICKNESS = 44
const MAX_THICKNESS = 88
/** 默认宽度取标准窗口下一整排 8 本的档位；真实宽度由 ResizeObserver 立刻修正 */
const DEFAULT_WIDTH = 1200

const MAX_BOOK_HEIGHT = BASE_HEIGHT * Math.max(...HEIGHT_SCALE_BY_TIER)

/**
 * 书架。
 *
 * 交互状态机（用户定的规则：单击开小窗，再点同一本进课程）：
 *
 * | 当前状态        | 点击某本书           |
 * | --------------- | -------------------- |
 * | 该书未选中      | 选中它并弹出小窗     |
 * | 该书已选中      | 进入二级界面         |
 *
 * 注意这里**不需要任何延时或双击判定**。经典的单双击冲突是因为"单击"和"双击"
 * 是两个独立手势、必须靠计时器区分；而这里的规则天然是有状态的 ——
 * 第二次点击时书已经是选中态。所以双击自然等价于"选中 → 再点 → 进课程"，
 * 语义完全一致，而单击响应是零延迟的。
 */
export function Shelf() {
  const courses = useCourseStore((state) => state.courses)
  const plans = usePlanStore((state) => state.plans)
  const todos = useTodoStore((state) => state.todos)
  const navigate = useNavigate()

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [selectedId, setSelectedId] = useState<Id | null>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)

  // 监听容器宽度，实现"窗口拉动时重排、空书脊优先消失"
  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width
      if (typeof measured === 'number' && measured > 0) setWidth(measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Esc 关闭小窗
  useEffect(() => {
    if (!selectedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  /**
   * 点击别处关闭小窗。
   * 用「点在不在交互元素内」判断，而不是比较 event.target ——
   * 书架里嵌套了好几层 flex 容器，点空白处命中的是内层 div，
   * 用 target 比较会导致明明点了空白却关不掉。
   */
  useEffect(() => {
    if (!selectedId) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-shelf-interactive]')) return
      setSelectedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [selectedId])

  const layout = useMemo(
    () =>
      buildShelfLayout(
        courses.map((course) => course.id),
        width,
      ),
    [courses, width],
  )

  const baseThickness = useMemo(() => {
    const available = width - PADDING_X * 2 - GAP * (layout.perRow - 1)
    return Math.min(Math.max(available / layout.perRow, MIN_THICKNESS), MAX_THICKNESS)
  }, [width, layout.perRow])

  const progressByCourse = useMemo(() => {
    const map = new Map<Id, number>()
    for (const course of courses) {
      const items = plans[course.id]?.items ?? []
      if (items.length === 0) {
        map.set(course.id, 0)
        continue
      }
      const done = items.filter((item) => planItemState(item, todos) === 'done').length
      map.set(course.id, done / items.length)
    }
    return map
  }, [courses, plans, todos])

  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])

  const selectedCourse = selectedId ? courseById.get(selectedId) : undefined

  function handleBookClick(courseId: Id, element: HTMLElement) {
    // 已选中 → 再点同一本 → 进课程
    if (selectedId === courseId) {
      setSelectedId(null)
      navigate(`/courses/${courseId}`)
      return
    }
    const rect = element.getBoundingClientRect()
    setAnchor({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    setSelectedId(courseId)
  }

  return (
    <div ref={containerRef} className="relative px-7 pb-6">
      {courses.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-5 py-3 text-center shadow-sm backdrop-blur">
            <p className="text-sm font-medium text-slate-700">书架还是空的</p>
            <p className="muted mt-0.5 text-xs">建立第一门课程，它就会成为这里的一本书</p>
            <Link to="/courses" className="btn btn-primary mt-2.5 text-xs">
              添加课程
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {layout.rows.map((row) => (
          <div key={row.index}>
            <div
              className="flex items-end justify-center"
              style={{ gap: GAP, minHeight: MAX_BOOK_HEIGHT }}
            >
              {row.slots.map((slot) =>
                slot.kind === 'course' ? (
                  <span key={slot.key} data-shelf-interactive className="flex items-end">
                    <BookSpine
                      title={courseById.get(slot.key)?.title ?? ''}
                      seed={slot.seed}
                      baseThickness={baseThickness}
                      baseHeight={BASE_HEIGHT}
                      selected={selectedId === slot.key}
                      progress={progressByCourse.get(slot.key) ?? 0}
                      onClick={(event) => handleBookClick(slot.key, event.currentTarget)}
                    />
                  </span>
                ) : (
                  <BlankSpine
                    key={slot.key}
                    seed={slot.seed}
                    baseThickness={baseThickness}
                    baseHeight={BASE_HEIGHT}
                  />
                ),
              )}
            </div>

            {/* 隔板：有了它整排书才"站"在什么东西上，否则像悬空漂浮 */}
            <div
              className="h-2.5 rounded-b-[3px]"
              style={{
                background: 'linear-gradient(to bottom, #cfc8bc 0%, #b8b0a2 60%, #9c9486 100%)',
                boxShadow: '0 6px 10px -6px rgba(15, 23, 42, 0.45)',
              }}
            />
          </div>
        ))}
      </div>

      {selectedCourse && anchor && (
        <BookDetailPopup course={selectedCourse} plan={plans[selectedCourse.id]} anchor={anchor} />
      )}
    </div>
  )
}

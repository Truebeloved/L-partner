import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { deleteCourseCompletely, planItemState } from '@/features/course/courseActions'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { BlankSpine } from '@/features/shelf/BlankSpine'
import { BookDetailPopup } from '@/features/shelf/BookDetailPopup'
import type { AnchorRect } from '@/features/shelf/BookDetailPopup'
import { BookSpine } from '@/features/shelf/BookSpine'
import { buildShelfLayout, HEIGHT_SCALE_BY_TIER } from '@/features/shelf/shelfLayout'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course, Id } from '@/types/models'

/** 书与书之间的缝 */
const GAP = 12
const PADDING_X = 24
/**
 * 基准尺寸按真实书籍比例定：厚高比约 1:3.3。
 *
 * 这里有个**数学上无法同时满足的三角**：一排 8 本、填满整行、保持书的比例。
 * 书架容器若铺满 1174px，8 本书每本要 130px 厚，配 232px 高就是 1:1.8 —— 那是盒子。
 * 所以解法是**把书架限宽居中**（max-w-3xl = 768px），让 8 本书填满"自己那一排"：
 * 可用 720px、8 本 + 7 道缝 → 每本约 79px，配 260px 高正好是 1:3.3。
 */
const BASE_HEIGHT = 260
/** 书厚随可用宽度伸缩，但夹在区间内 —— 太薄不像书，太厚就不是 8 本一排了 */
const MIN_THICKNESS = 38
const MAX_THICKNESS = 96
/** 默认宽度取容器上限（max-w-3xl）—— 首帧还没测量时也要排成 8 本，不能先排错再修正 */
const DEFAULT_WIDTH = 768

const MAX_BOOK_HEIGHT = BASE_HEIGHT * Math.max(...HEIGHT_SCALE_BY_TIER)

/**
 * 书架。
 *
 * 交互规则（用户定的）：
 *
 * | 手势           | 结果                                     |
 * | -------------- | ---------------------------------------- |
 * | 左键点书        | 直接进入课程（主操作，零延迟）             |
 * | 右键点书        | 弹出详情小窗（看进度、进课程、删除这门课）  |
 * | Esc / 点空白    | 关掉小窗                                  |
 *
 * 前一版是「单击开小窗、再点同一本才进课程」，代价是主操作要按两下，
 * 而"我就是要开始学"才是这里 99% 的意图；小窗该是**辅助**，所以挪到右键 ——
 * 和文件管理器、IDE 一样，右键是"关于这个东西的操作"，左键是"打开它"。
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
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null)

  // 引用保持稳定：Esc 的监听依赖它，每次渲染换一个新函数会让监听反复重挂
  const closeDetail = useCallback(() => setSelectedId(null), [])

  // 监听容器宽度，实现"窗口拉动时重排、空书脊优先消失"
  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    // 用 clientWidth（含 padding）而不是 contentRect.width（不含 padding）。
    // 这不是风格问题：下方的厚度计算已经减掉了 PADDING_X * 2，如果测量值也不含 padding，
    // 等于 padding 被扣了两次。后果很隐蔽 —— 8 本书会排成两排（7 + 1），
    // 而且不报错、不看图根本发现不了。
    const observer = new ResizeObserver(() => {
      const measured = element.clientWidth
      if (measured > 0) setWidth(measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Esc 关闭小窗（和确认框叠加时，确认框在捕获阶段先吃掉 Esc）
  useEscapeKey(closeDetail, { enabled: Boolean(selectedId) })

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

  /** 小窗贴在书上弹出，所以要先量出这本书在视口里的位置 */
  function openDetail(courseId: Id, element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    setAnchor({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    setSelectedId(courseId)
  }

  return (
    <div
      ref={containerRef}
      data-testid="shelf-surface"
      // 限宽居中：8 本一排、填满整行、保持书的比例，这三件事在同一宽度下无法同时成立
      // （见上方 BASE_HEIGHT 的注释）。收窄容器是唯一能让三者同时成立的做法，
      // 顺带也把左右留白给了出来。
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-8"
    >
      {/* 行间距要留出「书被抽出」往上走的空间，否则上移的书会压到上一行的隔板 */}
      <div className="flex flex-col gap-2">
        {layout.rows.map((row) => (
          // 隔板宽度要跟这一排书一致，所以整排（书 + 板）包在同一个 inline-block 里；
          // 直接把板拉满整页宽度会变成一条贯穿屏幕的横线，不像书架
          <div key={row.index} className="flex justify-center pt-6">
            <div className="inline-block">
              <div className="flex items-end" style={{ gap: GAP, minHeight: MAX_BOOK_HEIGHT }}>
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
                        onClick={() => navigate(`/courses/${slot.key}`)}
                        onContextMenu={(event) => {
                          // 右键在 Electron 里默认会弹出系统菜单（或什么都不弹），
                          // 这里要的是自己的详情小窗，所以必须阻止默认行为
                          event.preventDefault()
                          openDetail(slot.key, event.currentTarget)
                        }}
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

              {/* 隔板：有了它整排书才"站"在什么东西上，否则像悬空漂浮。
                  用中性灰而不是木色 —— 单色系统里木色会和书脊争色彩注意力 */}
              <div
                className="h-1.5 rounded-sm"
                style={{
                  background: 'linear-gradient(to bottom, #b4b4b4 0%, #9a9a9a 100%)',
                  boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.28)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 空状态放在书架下方的留白区，而不是浮在书上 ——
          浮层压住书脊既看不清又像渲染出错，放在下方的空区域反而把"空"变成了设计的一部分 */}
      {courses.length === 0 && (
        <div className="grid flex-1 place-items-center pt-10">
          <div className="text-center">
            <p className="font-display text-h3 font-bold text-ink">书架还是空的</p>
            <p className="hint mt-2">建立第一门课程，它就会成为这里的一本书</p>
            <Link to="/courses" className="btn btn-primary btn-sm mt-4">
              添加课程
            </Link>
          </div>
        </div>
      )}

      {selectedCourse && anchor && (
        <BookDetailPopup
          course={selectedCourse}
          plan={plans[selectedCourse.id]}
          anchor={anchor}
          onOpen={() => navigate(`/courses/${selectedCourse.id}`)}
          onDelete={() => setPendingDelete(selectedCourse)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`删除「${pendingDelete.title}」？`}
          message="这门课程的学习计划、每日待办与相关记忆会一起删除，无法撤销。"
          confirmText="删除课程"
          danger
          onConfirm={() => {
            deleteCourseCompletely(pendingDelete.id)
            setPendingDelete(null)
            closeDetail()
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

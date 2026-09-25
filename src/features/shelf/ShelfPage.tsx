import { Shelf } from '@/features/shelf/Shelf'
import { useCourseStore } from '@/store/courses'

/**
 * 一级界面：书架。
 *
 * 刻意不做大标题 —— 书架本身就是主角，压一个大 header 在上面只会抢视觉。
 * 只在左上角留一行极轻的说明，右上角给出总数，其余信息交给书本身。
 */
export function ShelfPage() {
  const courseCount = useCourseStore((state) => state.courses.length)

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-baseline justify-between px-6 pt-6 pb-1">
        <h1 className="text-label font-bold tracking-[0.05em] text-ink-soft uppercase">我的书架</h1>
        <span className="text-small text-ink-faint">
          {courseCount === 0 ? '还没有课程' : `共 ${courseCount} 门课程`}
        </span>
      </header>

      <Shelf />
    </div>
  )
}

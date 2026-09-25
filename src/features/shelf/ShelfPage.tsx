import { Shelf } from '@/features/shelf/Shelf'
import { useCourseStore } from '@/store/courses'

/**
 * 一级界面：书架。
 *
 * 刻意不做大标题 —— 书架本身就是主角，压一个大 header 在上面只会抢视觉。
 * 只在左上角留一行极轻的说明，右下角给出总数，其余信息交给书本身。
 */
export function ShelfPage() {
  const courseCount = useCourseStore((state) => state.courses.length)

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-baseline justify-between px-7 pt-6 pb-1">
        <h1 className="text-sm font-medium tracking-wide text-slate-500">我的书架</h1>
        <span className="text-xs text-slate-400">
          {courseCount === 0 ? '还没有课程' : `共 ${courseCount} 门课程`}
        </span>
      </header>

      <Shelf />
    </div>
  )
}

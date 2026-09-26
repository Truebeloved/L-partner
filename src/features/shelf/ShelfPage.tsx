import { Shelf } from '@/features/shelf/Shelf'
import { useCourseStore } from '@/store/courses'

/**
 * 一级界面：书架。
 *
 * 标题与其它页面（学伴设定 / 设置 / 添加书籍）**用同一套规格**：
 * 同一个 `page-title`（衬线 H1），同一套容器宽度与内边距（max-w-3xl + px-8）。
 *
 * 这里曾经刻意做成一行很小的全大写标签，理由是"书架本身就是主角"，
 * 但代价是换页时标题的字号、字体和左边缘都会跳一下 —— 一致性比那点主次关系重要得多。
 */
export function ShelfPage() {
  const courseCount = useCourseStore((state) => state.courses.length)

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-baseline justify-between gap-4 px-8 pt-8 pb-6">
        <h1 className="page-title">我的书架</h1>
        <span className="muted">
          {courseCount === 0 ? '还没有课程' : `共 ${courseCount} 门课程`}
        </span>
      </header>

      <Shelf />
    </div>
  )
}

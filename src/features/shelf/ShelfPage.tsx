import { NewCourseButton } from '@/features/course/components/NewCourseButton'
import { Shelf } from '@/features/shelf/Shelf'
import { useCourseStore } from '@/store/courses'

/**
 * 一级界面：书架。
 *
 * 标题与其它页面（学伴设定 / 设置）**用同一套规格**：
 * 同一个 `page-title`（衬线 H1），同一套容器宽度与内边距（max-w-3xl + px-8）。
 *
 * 这里曾经刻意做成一行很小的全大写标签，理由是"书架本身就是主角"，
 * 但代价是换页时标题的字号、字体和左边缘都会跳一下 —— 一致性比那点主次关系重要得多。
 *
 * 「新建课程」的入口在这条标题栏上：课程是在书架前决定要学什么时产生的，
 * 所以它属于这里，而不是导航栏里单独的一格。
 */
export function ShelfPage() {
  const courseCount = useCourseStore((state) => state.courses.length)

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-8 pt-8 pb-6">
        <h1 className="page-title">我的书架</h1>
        <div className="flex items-center gap-4">
          {/*
            这里原来是一个跳去 `/courses` 的链接。课程总览页早就删掉了，那条路由
            现在重定向回书架本身 —— 也就是"点了跟没点一样"。数量本身是有用的，
            所以留字、去掉那个走不通的入口。
          */}
          {courseCount > 0 && (
            <span className="tabular text-small text-ink-soft">共 {courseCount} 门课程</span>
          )}
          <NewCourseButton />
        </div>
      </header>

      <Shelf />
    </div>
  )
}

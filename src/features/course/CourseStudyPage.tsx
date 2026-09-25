import { useNavigate, useParams } from 'react-router-dom'

import { CourseDetailPage } from '@/features/course/CourseDetailPage'
import { useCourseStore } from '@/store/courses'

/**
 * 二级界面：课程学习页。
 *
 * 按约定**全屏覆盖**整个应用，连同左侧导航栏一起盖掉 ——
 * 进入课程是「翻开这本书开始读」的状态，侧栏那套索引此时是干扰。
 *
 * 返回按钮用 `navigate('/')` 而不是 `navigate(-1)`：
 * 后者在「直接打开这个地址」或「刷新后」的场景下会把用户送出应用，
 * 而回书架是永远正确的落点。
 *
 * ⏳ 「开始学习」的具体体验待用户描述（见 docs/ui-spec.md 待决事项 6）。
 * 当前这一层只负责容器：全屏 + 返回，内容沿用课程详情。
 */
export function CourseStudyPage() {
  const navigate = useNavigate()
  const { courseId } = useParams<{ courseId: string }>()
  const title = useCourseStore((state) =>
    courseId ? state.courses.find((course) => course.id === courseId)?.title : undefined,
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
          ← 返回书架
        </button>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{title ?? '课程'}</span>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <CourseDetailPage />
      </div>
    </div>
  )
}

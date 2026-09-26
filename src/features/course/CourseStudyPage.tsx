import { useNavigate, useParams } from 'react-router-dom'

import { AssistantBar } from '@/features/assistant/AssistantBar'
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
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line-soft bg-surface/95 px-6 py-3 backdrop-blur">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
          ← 返回书架
        </button>
        <span className="min-w-0 flex-1 truncate text-small text-ink-soft">{title ?? '课程'}</span>
        {/*
          二级界面同样是「顶部 + 右对齐」，只是面积更大一档。
          右内边距与一级界面一致（都是 24px），所以从书架点进课程时，
          输入条的右边缘停在原处不动 —— 换页时位置跳一下是很廉价的感觉。
        */}
        <AssistantBar variant="secondary" />
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <CourseDetailPage />
      </div>
    </div>
  )
}

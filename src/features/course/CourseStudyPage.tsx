import { useNavigate, useParams } from 'react-router-dom'

import { useAssistantDock } from '@/features/assistant/dock'
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
  const dockRef = useAssistantDock('top-wide')
  const title = useCourseStore((state) =>
    courseId ? state.courses.find((course) => course.id === courseId)?.title : undefined,
  )

  return (
    <div className="min-h-screen bg-surface">
      {/*
        二级界面的输入条在**整页顶部**，宽度占满全幅（一级界面要扣掉侧栏，所以更窄）。
        两处的高度不同（48 / 40），但 top 差正好补回来 —— 输入条的中轴始终在 36px 处，
        从书架点进课程时它不会上下跳，只是左右撑开、略微变高，也就是"生长"。
        返回与标题因此挪到第二行：输入条要求的是整幅横向长度，不能被按钮挤掉。
      */}
      <header className="sticky top-0 z-20 border-b border-line-soft bg-surface/95 px-6 pt-3 backdrop-blur">
        <div ref={dockRef} className="h-12" />
        <div className="flex items-center gap-4 pb-3 pt-1">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
            ← 返回书架
          </button>
          <span className="min-w-0 flex-1 truncate text-small text-ink-soft">{title ?? '课程'}</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <CourseDetailPage />
      </div>
    </div>
  )
}

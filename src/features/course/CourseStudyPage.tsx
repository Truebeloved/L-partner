import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAssistantDock } from '@/features/assistant/dock'
import { CourseDetailPage } from '@/features/course/CourseDetailPage'
import { useEscapeKey } from '@/lib/useEscapeKey'

/**
 * 二级界面：课程学习页。
 *
 * 按约定**全屏覆盖**整个应用，连同左侧导航栏一起盖掉 ——
 * 进入课程是「翻开这本书开始读」的状态，侧栏那套索引此时是干扰。
 *
 * 返回入口只有一个（页面标题右侧的「返回书架」，由 CourseDetailPage 提供）；
 * 这里原本还有一条「← 返回书架 + 课程名」的横条，和它做的是同一件事，
 * 顺带把已经显示在下面的课程标题又抄了一遍，用户要求删掉。
 *
 * ⏳ 「开始学习」的具体体验待用户描述（见 docs/ui-spec.md 待决事项 6）。
 * 当前这一层只负责容器：全屏 + 返回，内容沿用课程详情。
 */
export function CourseStudyPage() {
  const navigate = useNavigate()
  const dockRef = useAssistantDock('top-wide')

  // Esc = 回书架，和其他桌面软件一致。
  // 用冒泡阶段：页面上的弹窗（表单、确认框）是内层，它们在捕获阶段先吃掉 Esc，
  // 于是这里不会再跟着退页（见 useEscapeKey 的说明）。
  const goBack = useCallback(() => navigate('/'), [navigate])
  useEscapeKey(goBack)

  return (
    <div className="min-h-screen bg-surface">
      {/*
        二级界面的输入条在**整页顶部**，宽度占满全幅（一级界面要扣掉侧栏，所以更窄）。
        两处的高度不同（48 / 40），但 top 差正好补回来 —— 输入条的中轴始终在 36px 处，
        从书架点进课程时它不会上下跳，只是左右撑开、略微变高，也就是"生长"。
      */}
      <header className="sticky top-0 z-20 bg-surface/95 px-6 pt-3 backdrop-blur">
        <div ref={dockRef} className="h-12" />
      </header>

      {/* 与一级界面的内容区同名：从书架进来时，两边的页面内容做交叉淡入 */}
      <div className="mx-auto max-w-4xl px-6 py-6" style={{ viewTransitionName: 'page' }}>
        <CourseDetailPage />
      </div>
    </div>
  )
}

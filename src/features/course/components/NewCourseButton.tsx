import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createCourse } from '@/features/course/courseActions'
import { AiPlanDialog } from '@/features/course/components/AiPlanDialog'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { CourseFormDialog } from '@/features/course/components/CourseFormDialog'
import { generateCoursePlan } from '@/features/course/aiPlan'
import type { CoursePlanDraft } from '@/features/course/drafts'
import { useSettingsStore } from '@/store/settings'

/**
 * 书架上「新建课程」的入口。
 *
 * 为什么由书架承担这件事：用户是站在书架前决定"我要学一门什么课"的，
 * 原来的「添加书籍」把他推到另一个管理页面，多一跳、也把"书架 = 我的课程"
 * 这个隐喻切断了。这里只是**把入口搬过来**，弹窗、表单、生成逻辑全部复用课程页那一套。
 *
 * 手动填写课程的入口已经去掉：课程一律由 AI 设计（用户明确要求），
 * 表单只保留一个职责 —— 让用户核对 AI 生成的初稿再落库。
 *
 * ⚠️ 这个按钮**只做"新建一门课"这一件事**：上一版在没有配置大模型时会弹「示例课程」
 * 选择框，于是"点新建课程"和"我要挑一份现成教材"变成了同一个动作，而示例课程
 * 本来就已经摆在书架上了（见 seedInstall）。现在没配置大模型时只如实提示去哪里配置，
 * 不再拿示例课程顶替"新建"这个语义。
 */
export function NewCourseButton() {
  const navigate = useNavigate()
  const llmReady = useSettingsStore((state) =>
    Boolean(
      state.settings.llm.baseUrl.trim() &&
      state.settings.llm.apiKey.trim() &&
      state.settings.llm.model.trim(),
    ),
  )

  const [aiOpen, setAiOpen] = useState(false)
  const [needLlm, setNeedLlm] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState<CoursePlanDraft | null>(null)

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => (llmReady ? setAiOpen(true) : setNeedLlm(true))}
        title={
          llmReady
            ? '说说你想学什么，AI 会设计出阶段与单元'
            : '还没有配置大模型：课程由 AI 设计，先在「设置」里接入'
        }
      >
        新建课程
      </button>

      {aiOpen && (
        <AiPlanDialog
          generate={generateCoursePlan}
          onCancel={() => setAiOpen(false)}
          onGenerated={(draft) => {
            setAiOpen(false)
            // 不停在「已生成」：立刻把草稿交给表单，让用户看到 AI 到底写了什么再决定保存
            setFormInitial(draft)
            setFormOpen(true)
          }}
        />
      )}

      {formOpen && (
        <CourseFormDialog
          initialDraft={formInitial}
          fromAi
          onCancel={() => setFormOpen(false)}
          onSubmit={(draft) => {
            const id = createCourse(draft)
            setFormOpen(false)
            navigate(`/courses/${id}`)
          }}
        />
      )}

      {/*
        没配置大模型：这里**不给**手动填写课程的入口（用户定过"课程一律由 AI 设计"）。
        书架上已经有随应用交付的示例课程，所以零配置时也不是无事可做 —— 提示语里要说这一点，
        否则用户会以为"没配 key 就什么都干不了"。
      */}
      {needLlm && (
        <ConfirmDialog
          title="先接入你的大模型"
          message="课程由 AI 按你的目标设计，所以新建课程需要先配置模型。书架上的示例课程不受影响，现在就能直接学。"
          confirmText="去设置"
          onConfirm={() => {
            setNeedLlm(false)
            navigate('/settings')
          }}
          onCancel={() => setNeedLlm(false)}
        />
      )}
    </>
  )
}

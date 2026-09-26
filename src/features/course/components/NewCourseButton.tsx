import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createCourse } from '@/features/course/courseActions'
import { AiPlanDialog } from '@/features/course/components/AiPlanDialog'
import { CourseFormDialog } from '@/features/course/components/CourseFormDialog'
import { SeedCourseDialog } from '@/features/course/components/SeedCourseDialog'
import { generateCoursePlan } from '@/features/course/aiPlan'
import type { CoursePlanDraft } from '@/features/course/drafts'
import type { SeedCourse } from '@/lib/seed/courses'
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
  const [seedOpen, setSeedOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState<CoursePlanDraft | null>(null)

  function handleLoadSeed(seed: SeedCourse) {
    const id = createCourse({ ...seed.build(), source: 'manual' })
    setSeedOpen(false)
    navigate(`/courses/${id}`)
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => (llmReady ? setAiOpen(true) : setSeedOpen(true))}
        title={
          llmReady
            ? '说说你想学什么，AI 会设计出阶段与单元'
            : '还没有配置大模型：先在「设置」里接入，或先载入一份示例课程'
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

      {seedOpen && (
        <SeedCourseDialog onPick={handleLoadSeed} onCancel={() => setSeedOpen(false)} />
      )}
    </>
  )
}

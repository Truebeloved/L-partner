import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import {
  createCourse,
  deleteCourseCompletely,
  summarizePlan,
} from '@/features/course/courseActions'
import { AiPlanDialog } from '@/features/course/components/AiPlanDialog'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { CourseCard } from '@/features/course/components/CourseCard'
import { CourseFormDialog } from '@/features/course/components/CourseFormDialog'
import type { AiPlanRequest, CoursePlanDraft } from '@/features/course/drafts'
import { buildDemoCourseDraft } from '@/lib/seed/demoCourse'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course } from '@/types/models'

/**
 * 【AI 集成点】「让 AI 帮我生成方案」（设计决策 D3 路径 A）。
 *
 * 课程域只声明这个接口，不实现它：实现方（LLM 接入层）拿到用户目标，
 * 用提示词让模型产出阶段 / 单元 / 知识点，返回 CoursePlanDraft。
 * 返回的草稿会先填进手写表单让用户改，再走 createCourse 落库 ——
 * AI 与手写两条路径共用同一个数据结构，下游的计划与待办因此只需要一套逻辑。
 *
 * 未注入时入口保持可见但禁用，并引导去设置页配置 API（D1）；配好 Key 之后
 * 由 App 层把实现传进来即可，本页代码不用改。
 */
export interface CoursesPageProps {
  onGenerateWithAi?: (request: AiPlanRequest) => Promise<CoursePlanDraft>
}

const AI_DISABLED_HINT =
  '需要先在「设置」里配置大模型 API（地址与密钥只存在本机）。未配置时用示例课程或手写表单同样能走通完整主循环。'

export function CoursesPage({ onGenerateWithAi }: CoursesPageProps = {}) {
  const courses = useCourseStore((state) => state.courses)
  const plans = usePlanStore((state) => state.plans)
  const todos = useTodoStore((state) => state.todos)
  const navigate = useNavigate()

  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState<CoursePlanDraft | null>(null)
  const [formFromAi, setFormFromAi] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null)

  const aiReady = Boolean(onGenerateWithAi)

  // 进度口径与详情页共用 summarizePlan，避免卡片说 30%、详情说 50% 这种自相矛盾
  const rows = useMemo(
    () =>
      courses.map((course) => ({
        course,
        summary: summarizePlan(course, plans[course.id], todos),
      })),
    [courses, plans, todos],
  )

  function openManualForm() {
    setFormInitial(null)
    setFormFromAi(false)
    setFormOpen(true)
  }

  function handleFormSubmit(draft: CoursePlanDraft) {
    const id = createCourse(draft)
    setFormOpen(false)
    // 建完直接进详情：下一步必然要生成学习计划，少一次点击
    navigate(`/courses/${id}`)
  }

  function handleLoadDemo() {
    // 示例课程是随仓库一起交付的真实教学方案，来源如实记成「手动创建」，不冒充 AI 生成
    const id = createCourse({ ...buildDemoCourseDraft(), source: 'manual' })
    navigate(`/courses/${id}`)
  }

  function handleDelete() {
    if (!pendingDelete) return
    deleteCourseCompletely(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    // 外壳的 <main> 只负责滚动、不带内边距（这样书架这类需要自己控制
    // 边距的页面才能贴边排布），所以每个功能页要自己给边距
    <div className="px-6 pb-8">
      <PageHeader
        title="课程"
        description="导入课程或让 AI 帮你生成一份学习方案，再排成每天能执行的待办"
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAiOpen(true)}
              disabled={!aiReady}
              title={aiReady ? undefined : AI_DISABLED_HINT}
            >
              让 AI 帮我生成方案
            </button>
            <button type="button" className="btn btn-primary" onClick={openManualForm}>
              新建课程
            </button>
          </>
        }
      />

      {rows.length === 0 ? (
        <section className="card text-center">
          <h2 className="card-title">还没有课程</h2>
          <p className="muted mx-auto mt-2 max-w-lg leading-relaxed">
            课程是整条主循环的起点：课程 → 学习计划 → 每日待办 → 到点提醒。
            手头没有材料也没关系，先载入一份示例课程，完整走一遍再换成你自己的目标。
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button type="button" className="btn btn-primary px-5 py-2.5" onClick={handleLoadDemo}>
              载入示例课程
            </button>
            <button type="button" className="btn btn-secondary" onClick={openManualForm}>
              手写新建课程
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAiOpen(true)}
              disabled={!aiReady}
              title={aiReady ? undefined : AI_DISABLED_HINT}
            >
              让 AI 帮我生成方案
            </button>
          </div>

          <p className="mt-4 text-small leading-relaxed text-ink-soft">
            「两个月上手 React」共 3 个阶段 11 个单元，载入后可直接生成学习计划与今日待办。
            {!aiReady && ' AI 生成方案需要先在「设置」里配置大模型 API。'}
          </p>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ course, summary }) => (
            <CourseCard
              key={course.id}
              course={course}
              summary={summary}
              onOpen={() => navigate(`/courses/${course.id}`)}
              onDelete={() => setPendingDelete(course)}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <CourseFormDialog
          initialDraft={formInitial}
          fromAi={formFromAi}
          onCancel={() => setFormOpen(false)}
          onSubmit={handleFormSubmit}
        />
      )}

      {aiOpen && onGenerateWithAi && (
        <AiPlanDialog
          generate={onGenerateWithAi}
          onCancel={() => setAiOpen(false)}
          onGenerated={(draft) => {
            setAiOpen(false)
            // 不停在「已生成」：立刻把草稿交给表单，让用户看到 AI 到底写了什么再决定保存
            setFormInitial(draft)
            setFormFromAi(true)
            setFormOpen(true)
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`删除「${pendingDelete.title}」？`}
          message="这门课程的学习计划、每日待办与相关记忆会一起删除，无法撤销。已完成的待办记录也会一并消失。"
          confirmText="删除课程"
          danger
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

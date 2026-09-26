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
import { SeedCourseDialog } from '@/features/course/components/SeedCourseDialog'
import type { AiPlanRequest, CoursePlanDraft } from '@/features/course/drafts'
import type { SeedCourse } from '@/lib/seed/courses'
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
  const [seedOpen, setSeedOpen] = useState(false)
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

  function handleFormSubmit(draft: CoursePlanDraft) {
    const id = createCourse(draft)
    setFormOpen(false)
    // 建完直接进详情：下一步必然要生成学习计划，少一次点击
    navigate(`/courses/${id}`)
  }

  function handleLoadSeed(seed: SeedCourse) {
    // 示例课程是随仓库一起交付的真实教学方案，来源如实记成「手动创建」，不冒充 AI 生成
    const id = createCourse({ ...seed.build(), source: 'manual' })
    setSeedOpen(false)
    navigate(`/courses/${id}`)
  }

  function handleDelete() {
    if (!pendingDelete) return
    deleteCourseCompletely(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    // 外壳的 <main> 只负责滚动、不带内边距（这样书架这类需要自己控制
    // 边距的页面才能贴边排布），所以每个功能页要自己给边距。
    //
    // ⚠️ PageHeader 与 .page-container **并列**，不能嵌套：
    // 两者各自都带 `max-w-3xl px-8`，套在一起标题就会多出一层内边距，
    // 左边缘比别的页面多缩进 32px —— 那正是"标题没对齐"的来源。
    <div>
      <PageHeader
        title="课程"
        description="建立课程，生成学习计划与每日待办"
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
            {/* 已经有课程之后，"示例课程"就不再是主路径，降级成次要入口：
                留着它是为了让用户随时能看到随仓库交付的完整教学方案（比如文言文那份） */}
            <button type="button" className="btn btn-secondary" onClick={() => setSeedOpen(true)}>
              示例课程
            </button>
          </>
        }
      />

      {/* 内容自己在 page-container 里，标题在外面 —— 两者左边缘因此是同一条竖线 */}
      <div className="page-container">
        {rows.length === 0 ? (
          <section className="card py-10 text-center">
            <h2 className="card-title">还没有课程</h2>
            <p className="muted mx-auto mt-3 max-w-sm leading-relaxed">
              回到书架，用「新建课程」说说你想学什么，AI 会设计出阶段与单元；
              也可以先载入一份示例课程走一遍。
            </p>

            {/* 这里只留一个动作：新建课程的入口在书架上（唯一入口，避免两处抢同一个动作） */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <button type="button" className="btn btn-primary" onClick={() => setSeedOpen(true)}>
                载入示例课程
              </button>
            </div>
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
      </div>

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

      {seedOpen && (
        <SeedCourseDialog onPick={handleLoadSeed} onCancel={() => setSeedOpen(false)} />
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

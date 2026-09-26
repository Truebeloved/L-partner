import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  deletePlanForCourse,
  generateUnitLesson,
  summarizePlan,
} from '@/features/course/courseActions'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { CourseStructure } from '@/features/course/components/CourseStructure'
import { PlanTimeline } from '@/features/course/components/PlanTimeline'
import { courseTotals, unitTitleMap } from '@/features/course/drafts'
import { formatDateHuman, formatMinutes } from '@/lib/date'
import { createProvider } from '@/lib/llm'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Id } from '@/types/models'

/*
 * 这一页原来有一个 `SOURCE_LABEL`（手动创建 / AI 生成 / 文件导入）并把它渲染成徽章。
 * 用户要求删掉它，理由很实在：课程现在一律由 AI 设计，"来源"既说不准也没人关心，
 * 而"手动创建"这四个字摆在 AI 设计的课程上更是错的信息。
 * （书架上的书脊小窗里还有同一个徽章，那一处等用户发话。）
 */

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const course = useCourseStore((state) =>
    courseId ? state.courses.find((item) => item.id === courseId) : undefined,
  )
  const plan = usePlanStore((state) => (courseId ? state.plans[courseId] : undefined))
  const todos = useTodoStore((state) => state.todos)

  const [feedback, setFeedback] = useState<string | null>(null)
  const [deletePlanOpen, setDeletePlanOpen] = useState(false)
  /**
   * 学习计划那一段是展开还是收起。
   *
   * 必须是可控的：原来写的是 `open={!plan}`（没计划时展开、显示引导文案），
   * 后果是**刚点完「生成学习计划」它反而自己合上了** —— 用户看不到刚生成的东西，
   * 也看不到那一段里的「删除学习计划」。生成之后要留在展开态。
   */
  const [planOpen, setPlanOpen] = useState(!plan)
  const settings = useSettingsStore((state) => state.settings)

  /**
   * 让学伴写某一节的正文。
   *
   * provider 由这里创建（它才知道用哪套模型配置），课程结构那边只管"点一下"。
   * 没有可用配置时直接抛错 —— 界面会把这句话显示在按钮下面，
   * 比"点了没反应"清楚得多。
   */
  async function handleWriteLesson(unitId: Id) {
    if (!courseId) return
    if (!settings.llm.baseUrl || !settings.llm.apiKey || !settings.llm.model) {
      throw new Error('还没有接入大模型，先到「设置」里填上 API 地址与密钥。')
    }
    await generateUnitLesson({
      courseId,
      unitId,
      provider: createProvider(settings.llm),
    })
  }

  const summary = useMemo(
    () => (course ? summarizePlan(course, plan, todos) : null),
    [course, plan, todos],
  )
  const titleById = useMemo(() => (course ? unitTitleMap(course) : new Map<Id, string>()), [course])

  if (!course || !summary) {
    return (
      <>
        <header className="pb-6">
          <button
            type="button"
            className="btn btn-ghost btn-sm -ml-3 mb-3"
            onClick={() => navigate('/')}
          >
            ← 返回书架
          </button>
          <h1 className="page-title">课程不存在</h1>
          <p className="muted mt-2">它可能已经被删除，或链接来自另一个浏览器。</p>
        </header>
      </>
    )
  }

  const totals = courseTotals(course)

  return (
    <>
      {/*
        ⚠️ 这一页**不用 PageHeader**，是为了让返回键和内容真正对齐。
        
        PageHeader 自带 `mx-auto max-w-3xl px-8`，而二级界面的容器是 `max-w-4xl px-6`
        （见 CourseStudyPage）—— 两层容器的宽度和留白都不一样，于是标题比下面的卡片
        多缩进了一大截，看着像"标题浮在中间、内容贴着左边"。用户的原话是
        「所有课程的返回书架按键都要对齐，在左侧」。
        
        所以这里直接手写：返回键与标题都落在**内容容器自己的左边缘**上，
        返回键在标题上方的左侧，全应用一致。
      */}
      <header className="pb-6">
        <button
          type="button"
          className="btn btn-ghost btn-sm -ml-3 mb-3"
          onClick={() => navigate('/')}
        >
          ← 返回书架
        </button>
        <h1 className="page-title">{course.title}</h1>
        {/* 学习目标比"简介"更值得占这一行：它是这门课存在的理由。
            原来这两样都挤在下面那张介绍卡里，卡片按用户要求去掉了。 */}
        {(course.goal ?? course.description) && (
          <p className="muted mt-2">{course.goal ?? course.description}</p>
        )}
      </header>

      {/* 操作反馈是「说明」不是「错误」，所以用中性底纹 */}
      {feedback && (
        <p className="mb-4 rounded-sm bg-ink/5 px-4 py-2.5 text-body text-ink">{feedback}</p>
      )}

      {/*
        教材在前，学习计划在后 —— 这是这一页的主次关系。
        用户点进一门课，第一件事是"开始学"，不是"看排期"：
        排期是给内容服务的，把它放在内容前面，等于每次进来都先看一遍日历。
      */}
      <section className="card mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">课程结构</h2>
          <span className="text-small text-ink-soft">
            {totals.stageCount} 个阶段 · {totals.unitCount} 节
          </span>
        </div>
        <p className="muted mt-2 leading-relaxed">
          按阶段分章，点「读这一节」就能看正文。没有正文的节可以让学伴写出来，
          写完存在本地，下次直接读。
        </p>
        <div className="mt-3">
          <CourseStructure course={course} onWriteLesson={handleWriteLesson} />
        </div>
      </section>

      <details
        className="card mb-5"
        open={planOpen}
        onToggle={(event) => setPlanOpen(event.currentTarget.open)}
      >
        <summary className="section-title cursor-pointer">学习计划</summary>
        <div className="mt-3">
          {!plan ? (
            <p className="muted leading-relaxed">
              还没有排期。跟学伴说一句「帮我排一下这门课」，它会按每周可投入把
              {totals.unitCount} 节铺到日历上，并同步生成今日待办。
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-small text-ink-soft">
                  {plan.generatedBy === 'ai' ? 'AI 排期' : '规则排期'} · {summary.studyDays} 个学习日
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="计划总时长" value={formatMinutes(summary.totalMinutes)} />
                <Stat label="还没学" value={formatMinutes(summary.remainingMinutes)} />
                <Stat label="最忙的一天" value={formatMinutes(summary.dailyMinutes)} />
                <Stat
                  label="预计完成"
                  value={summary.finishDate ? formatDateHuman(summary.finishDate) : '—'}
                />
              </dl>

              {/* 「按当前投入排不完」是一个需要用户行动的问题，属于警示场景 ——
                  这是红色在这套系统里合法的三个用途之一（逾期 / 错误 / 破坏性）之外的
                  「警告」，按令牌映射表统一到 alert */}
              {summary.exceedsDeadline && course.deadline && summary.finishDate && (
                <div className="mt-4 rounded-sm border border-alert bg-alert-soft px-4 py-3 text-body text-alert">
                  <p className="font-bold">按当前每周投入排不完</p>
                  <p className="mt-1 leading-relaxed">
                    以现在的节奏，预计{' '}
                    <strong className="font-bold">{formatDateHuman(summary.finishDate)}</strong>{' '}
                    才能学完， 晚于 deadline（{formatDateHuman(course.deadline)}）。 可以二选一：把
                    deadline 放到 {formatDateHuman(summary.finishDate)} 之后，
                    或在课程设置里提高每周可投入时长。
                  </p>
                  <p className="mt-1 text-small">
                    我们没有硬把内容塞进 deadline ——
                    一天学五小时的计划执行不下去，不如如实告诉你差多少。
                  </p>
                </div>
              )}

              <div className="mt-4">
                <PlanTimeline items={plan.items} unitTitleById={titleById} todos={todos} />
              </div>

              {/* 计划的"退场"入口。放在计划内容的最下面、和上面的统计用一道分隔线隔开 ——
                  它是关于这份计划的动作，不该和"计划排得怎么样"抢视线 */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
                <p className="text-small text-ink-soft">
                  删掉计划只是把安排清空，课程内容与你的掌握记录都保留。
                </p>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setDeletePlanOpen(true)}
                >
                  删除学习计划
                </button>
              </div>
            </>
          )}
        </div>
      </details>

      {deletePlanOpen && (
        <ConfirmDialog
          title="删除学习计划？"
          message="这份排期与它生成的待办会一起删除（包括已完成的），无法撤销。课程内容、手动添加的待办和掌握记录都保留。删完可以随时重新生成一份。"
          confirmText="删除计划"
          danger
          onConfirm={() => {
            const removed = deletePlanForCourse(course.id)
            setDeletePlanOpen(false)
            setFeedback(
              removed > 0
                ? `已删除学习计划，同时清掉 ${removed} 条由它生成的待办。`
                : '已删除学习计划。',
            )
          }}
          onCancel={() => setDeletePlanOpen(false)}
        />
      )}


    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-ink/5 px-3 py-2">
      <dt className="text-small text-ink-soft">{label}</dt>
      <dd className="tabular mt-0.5 text-body font-bold text-ink">{value}</dd>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import {
  generatePlanForCourse,
  generateUnitLesson,
  materializeTodos,
  rescheduleCourse,
  summarizePlan,
} from '@/features/course/courseActions'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { CourseStructure } from '@/features/course/components/CourseStructure'
import { PlanTimeline } from '@/features/course/components/PlanTimeline'
import { courseTotals, unitTitleMap } from '@/features/course/drafts'
import { formatDateHuman, formatMinutes, isOverdue } from '@/lib/date'
import { createProvider } from '@/lib/llm'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Id } from '@/types/models'

const SOURCE_LABEL = {
  manual: '手动创建',
  prompt: 'AI 生成',
  file: '文件导入',
} as const

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const course = useCourseStore((state) =>
    courseId ? state.courses.find((item) => item.id === courseId) : undefined,
  )
  const plan = usePlanStore((state) => (courseId ? state.plans[courseId] : undefined))
  const todos = useTodoStore((state) => state.todos)

  const [feedback, setFeedback] = useState<string | null>(null)
  const [askReschedule, setAskReschedule] = useState(false)
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
        <PageHeader title="课程不存在" description="它可能已经被删除，或链接来自另一个浏览器。" />
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses')}>
          返回课程列表
        </button>
      </>
    )
  }

  const totals = courseTotals(course)

  function handleGenerate() {
    if (!courseId) return
    const result = generatePlanForCourse(courseId)
    if (!result) return

    if (result.schedule.empty) {
      setFeedback('这门课还没有可排期的单元，先补充阶段与单元再来生成计划。')
      return
    }

    const created = materializeTodos(courseId)
    setFeedback(
      created > 0
        ? `已生成计划：${result.summary.studyDays} 个学习日，并新增 ${created} 条今日待办。`
        : '已生成计划；对应的待办此前已经建过，没有重复添加。',
    )
  }

  function handleReschedule() {
    if (!courseId) return
    const result = rescheduleCourse(courseId)
    setAskReschedule(false)
    if (!result) return
    setFeedback(
      result.summary.remainingMinutes > 0
        ? `已重新排期：已完成的部分原样保留，剩下的 ${formatMinutes(result.summary.remainingMinutes)} 按当前的每周投入重新安排。`
        : '已重新排期：这门课已经全部完成，没有需要重排的内容。',
    )
  }

  return (
    <>
      <PageHeader
        title={course.title}
        description={course.description ?? '这门课程还没有简介'}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
              返回书架
            </button>
            {plan && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAskReschedule(true)}
              >
                重新排期
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={handleGenerate}>
              {plan ? '重新生成计划' : '生成学习计划'}
            </button>
          </>
        }
      />

      {/* 操作反馈是「说明」不是「错误」，所以用中性底纹 */}
      {feedback && (
        <p className="mb-4 rounded-sm bg-ink/5 px-4 py-2.5 text-body text-ink">{feedback}</p>
      )}

      <section className="card mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">{SOURCE_LABEL[course.source]}</span>
          <span className="tabular text-small text-ink-soft">
            {totals.stageCount} 阶段 · {totals.unitCount} 单元 · {totals.knowledgePointCount}{' '}
            个知识点 · {formatMinutes(totals.totalMinutes)}
          </span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-small text-ink-soft">学习目标</dt>
            <dd className="mt-0.5 text-body text-ink">{course.goal ?? '未填写'}</dd>
          </div>
          <div>
            <dt className="text-small text-ink-soft">期望完成</dt>
            <dd
              className={`tabular mt-0.5 text-body ${
                course.deadline && isOverdue(course.deadline) && summary.remainingMinutes > 0
                  ? 'font-bold text-alert'
                  : 'text-ink'
              }`}
            >
              {course.deadline ? formatDateHuman(course.deadline) : '未设置'}
            </dd>
          </div>
          <div>
            <dt className="text-small text-ink-soft">每周可投入</dt>
            <dd className="tabular mt-0.5 text-body text-ink">
              {course.weeklyMinutes ? formatMinutes(course.weeklyMinutes) : '未填写'}
            </dd>
          </div>
          <div>
            <dt className="text-small text-ink-soft">已完成</dt>
            <dd className="tabular mt-0.5 text-body text-ink">
              {formatMinutes(summary.doneMinutes)} / {formatMinutes(summary.totalMinutes)}
            </dd>
          </div>
        </dl>
      </section>

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

      <details className="card mb-5" open={!plan}>
        <summary className="section-title cursor-pointer">学习计划</summary>
        <div className="mt-3">
          {!plan ? (
            <p className="muted leading-relaxed">
              还没有排期。点右上角「生成学习计划」，会按课程的每周可投入把
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
            </>
          )}
        </div>
      </details>

      {askReschedule && (
        <ConfirmDialog
          title="重新排期？"
          message="已完成的部分会原样保留；还没学的部分会被清掉重排，对应的未完成待办也会一起重建。"
          confirmText="重新排期"
          onConfirm={handleReschedule}
          onCancel={() => setAskReschedule(false)}
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

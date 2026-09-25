import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import {
  generatePlanForCourse,
  materializeTodos,
  rescheduleCourse,
  summarizePlan,
} from '@/features/course/courseActions'
import { ConfirmDialog } from '@/features/course/components/ConfirmDialog'
import { CourseStructure } from '@/features/course/components/CourseStructure'
import { PlanTimeline } from '@/features/course/components/PlanTimeline'
import { courseTotals, unitTitleMap } from '@/features/course/drafts'
import { formatDateHuman, formatMinutes, isOverdue } from '@/lib/date'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
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

  const summary = useMemo(
    () => (course ? summarizePlan(course, plan, todos) : null),
    [course, plan, todos],
  )
  const titleById = useMemo(() => (course ? unitTitleMap(course) : new Map<Id, string>()), [course])

  if (!course || !summary) {
    return (
      <>
        <PageHeader title="课程不存在" description="它可能已经被删除，或链接来自另一个浏览器。" />
        <button type="button" className="btn btn-outline" onClick={() => navigate('/courses')}>
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
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/courses')}>
              返回列表
            </button>
            {plan && (
              <button
                type="button"
                className="btn btn-outline"
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

      {feedback && (
        <p className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          {feedback}
        </p>
      )}

      <section className="card mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-slate-100 text-slate-600">{SOURCE_LABEL[course.source]}</span>
          <span className="muted text-xs">
            {totals.stageCount} 阶段 · {totals.unitCount} 单元 · {totals.knowledgePointCount}{' '}
            个知识点 · {formatMinutes(totals.totalMinutes)}
          </span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="muted text-xs">学习目标</dt>
            <dd className="mt-0.5 text-sm text-slate-700">{course.goal ?? '未填写'}</dd>
          </div>
          <div>
            <dt className="muted text-xs">期望完成</dt>
            <dd
              className={`mt-0.5 text-sm ${
                course.deadline && isOverdue(course.deadline) && summary.remainingMinutes > 0
                  ? 'font-medium text-red-600'
                  : 'text-slate-700'
              }`}
            >
              {course.deadline ? formatDateHuman(course.deadline) : '未设置'}
            </dd>
          </div>
          <div>
            <dt className="muted text-xs">每周可投入</dt>
            <dd className="mt-0.5 text-sm text-slate-700">
              {course.weeklyMinutes ? formatMinutes(course.weeklyMinutes) : '未填写'}
            </dd>
          </div>
          <div>
            <dt className="muted text-xs">已完成</dt>
            <dd className="mt-0.5 text-sm text-slate-700">
              {formatMinutes(summary.doneMinutes)} / {formatMinutes(summary.totalMinutes)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">学习计划</h2>
          {plan && (
            <span className="muted text-xs">
              {plan.generatedBy === 'ai' ? 'AI 排期' : '规则排期'} · {summary.studyDays} 个学习日
            </span>
          )}
        </div>

        {!plan ? (
          <p className="muted mt-3 leading-relaxed">
            还没有排期。点右上角「生成学习计划」，会按课程的每周可投入把
            {totals.unitCount} 个单元铺到日历上，并同步生成今日待办。
          </p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="计划总时长" value={formatMinutes(summary.totalMinutes)} />
              <Stat label="还没学" value={formatMinutes(summary.remainingMinutes)} />
              <Stat label="最忙的一天" value={formatMinutes(summary.dailyMinutes)} />
              <Stat
                label="预计完成"
                value={summary.finishDate ? formatDateHuman(summary.finishDate) : '—'}
              />
            </dl>

            {summary.exceedsDeadline && course.deadline && summary.finishDate && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">按当前每周投入排不完</p>
                <p className="mt-1 leading-relaxed">
                  以现在的节奏，预计 <strong>{formatDateHuman(summary.finishDate)}</strong>{' '}
                  才能学完， 晚于 deadline（{formatDateHuman(course.deadline)}）。 可以二选一：把
                  deadline 放到 {formatDateHuman(summary.finishDate)} 之后，
                  或在课程设置里提高每周可投入时长。
                </p>
                <p className="mt-1 text-xs text-amber-800">
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
      </section>

      <section className="card">
        <h2 className="section-title">课程结构</h2>
        <div className="mt-3">
          <CourseStructure course={course} />
        </div>
      </section>

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
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="muted text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  )
}

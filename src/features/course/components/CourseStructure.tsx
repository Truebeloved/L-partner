import { useMemo } from 'react'

import { doneUnitIds } from '@/features/today/autoTodo'
import { formatMinutes } from '@/lib/date'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course } from '@/types/models'

interface CourseStructureProps {
  course: Course
}

/**
 * 阶段 → 单元 → 知识点。
 * 知识点单独列出来而不是收在 tooltip 里，是因为它是掌握状态的挂载点：
 * 用户想核对「我的学伴记得我学到哪」时，需要看到的就是这一串名词。
 *
 * 完成的单元（计划项全部完成，或关联到它的待办全部勾掉）显示为灰态 + 删除线 ——
 * 这条链路是「全局 AI」把待办和课程内容接起来之后用户唯一看得见的结果：
 * 在待办栏勾掉一件事，这里对应的那一行就划掉了。
 */
export function CourseStructure({ course }: CourseStructureProps) {
  const plan = usePlanStore((state) => state.plans[course.id])
  const todos = useTodoStore((state) => state.todos)

  const done = useMemo(() => doneUnitIds(course, plan, todos), [course, plan, todos])

  if (course.stages.length === 0) {
    return <p className="muted">这门课程还没有阶段与单元。</p>
  }

  return (
    <div className="space-y-3">
      {course.stages.map((stage, stageIndex) => {
        const stageMinutes = stage.units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0)
        return (
          <section key={stage.id} className="rounded-card border border-line-soft p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-h3 font-bold text-ink">
                阶段 {stageIndex + 1}｜{stage.title}
              </h3>
              <span className="tabular text-small text-ink-soft">
                {stage.units.length} 个单元 · {formatMinutes(stageMinutes)}
              </span>
            </header>
            {stage.objective && (
              <p className="mt-1 text-small text-ink-soft">目标：{stage.objective}</p>
            )}

            <ul className="mt-3 space-y-3">
              {stage.units.map((unit) => (
                <UnitRow key={unit.id} unit={unit} done={done.has(unit.id)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function UnitRow({
  unit,
  done,
}: {
  unit: Course['stages'][number]['units'][number]
  done: boolean
}) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={done ? 'text-body text-ink-faint line-through' : 'text-body text-ink'}>
          {unit.title}
        </span>
        <span className="tabular text-small text-ink-soft">
          {done ? '已完成 · ' : ''}
          {formatMinutes(unit.estimatedMinutes)}
        </span>
      </div>
      {unit.knowledgePoints.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {unit.knowledgePoints.map((point) => (
            <span
              key={point}
              className={done ? 'badge text-ink-faint line-through' : 'badge'}
            >
              {point}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

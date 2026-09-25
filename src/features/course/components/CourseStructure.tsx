import { formatMinutes } from '@/lib/date'
import type { Course } from '@/types/models'

interface CourseStructureProps {
  course: Course
}

/**
 * 阶段 → 单元 → 知识点。
 * 知识点单独列出来而不是收在 tooltip 里，是因为它是掌握状态的挂载点：
 * 用户想核对「我的学伴记得我学到哪」时，需要看到的就是这一串名词。
 */
export function CourseStructure({ course }: CourseStructureProps) {
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
                <li key={unit.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-body text-ink">{unit.title}</span>
                    <span className="tabular text-small text-ink-soft">
                      {formatMinutes(unit.estimatedMinutes)}
                    </span>
                  </div>
                  {unit.knowledgePoints.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {unit.knowledgePoints.map((point) => (
                        <span key={point} className="badge">
                          {point}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

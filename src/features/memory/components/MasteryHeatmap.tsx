import { useMemo } from 'react'

import { MASTERY_META } from '@/features/memory/components/mastery-meta'
import type { Id, MemoryEntry, MasteryLevel } from '@/types/models'

interface MasteryHeatmapProps {
  entries: MemoryEntry[]
  courseId?: Id
  courseTitle?: string
}

/**
 * 知识点掌握热力图。
 *
 * 这是「进步」唯一能被一眼看见的载体 —— 说「AI 记得我」是感受，
 * 能画出一张「12 个知识点里已掌握 7 个」的图才是功能。
 *
 * 单色编码方式（明度阶梯 + 薄弱状态额外描边）见 mastery-meta.ts 的详细说明。
 * 这里负责保证：图例始终带文字标签 —— 一旦去掉了颜色，
 * 没有文字标签的色块就真的只是几块深浅不一的灰，没人能记住哪块是哪块。
 */
export function MasteryHeatmap({ entries, courseTitle }: MasteryHeatmapProps) {
  const masteryEntries = useMemo(
    () => entries.filter((entry) => entry.layer === 'mastery' && !entry.archived),
    [entries],
  )

  const counts = useMemo(() => {
    const result: Record<MasteryLevel, number> = { unknown: 0, learning: 0, weak: 0, mastered: 0 }
    for (const entry of masteryEntries) {
      result[entry.level ?? 'unknown'] += 1
    }
    return result
  }, [masteryEntries])

  if (masteryEntries.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-soft px-4 py-6 text-center">
        <p className="text-body text-ink-soft">还没有掌握状态记录</p>
        <p className="mt-1 text-small text-ink-faint">
          完成学习计划里的任务后会出现进度；和学伴聊过之后，它还会判断你哪里薄弱。
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {courseTitle && <span className="text-body font-bold text-ink">{courseTitle}</span>}
        <span className="tabular text-small text-ink-soft">
          共 {masteryEntries.length} 个知识点 · 已掌握 {counts.mastered} · 薄弱 {counts.weak}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {masteryEntries.map((entry) => {
          const meta = MASTERY_META[entry.level ?? 'unknown']
          return (
            <div
              key={entry.id}
              title={`${entry.knowledgePoint ?? entry.content}\n${meta.hint}\n置信度 ${Math.round(entry.confidence * 100)}%`}
              className={`${meta.className} ${meta.textClassName} flex h-16 w-24 cursor-default flex-col justify-between rounded-sm p-2 text-micro leading-tight transition-all duration-200 ease-out hover:opacity-85`}
            >
              <span className="line-clamp-3 font-bold break-all">
                {entry.knowledgePoint ?? entry.content}
              </span>
              <span className="opacity-80">{meta.label}</span>
            </div>
          )
        })}
      </div>

      {/* 图例：四块灰阶 + 文字标签。文字不可省 —— 去掉颜色后，色块本身不携带语义 */}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-line-soft pt-3">
        {(Object.keys(MASTERY_META) as MasteryLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1.5 text-small text-ink-soft">
            <span className={`size-3.5 rounded-sm ${MASTERY_META[level].className}`} />
            <span className="font-bold">{MASTERY_META[level].label}</span>
            <span className="tabular text-ink-faint">({counts[level]})</span>
          </span>
        ))}
      </div>
    </div>
  )
}

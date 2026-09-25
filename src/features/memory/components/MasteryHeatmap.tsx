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
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
        <p className="text-sm text-slate-500">还没有掌握状态记录</p>
        <p className="mt-1 text-xs text-slate-400">
          完成学习计划里的任务后，这里会自动出现进度；和学伴聊过之后，它会进一步判断你哪里薄弱。
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {courseTitle && <span className="text-sm font-medium text-slate-700">{courseTitle}</span>}
        <span className="text-xs text-slate-400">
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
              className={`${meta.className} flex h-16 w-24 cursor-default flex-col justify-between rounded-lg p-2 text-[11px] leading-tight text-white/95 transition hover:opacity-85`}
            >
              <span className="line-clamp-3 font-medium break-all">
                {entry.knowledgePoint ?? entry.content}
              </span>
              <span className="opacity-80">{meta.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
        {(Object.keys(MASTERY_META) as MasteryLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`size-3 rounded ${MASTERY_META[level].className}`} />
            {MASTERY_META[level].label}
            <span className="text-slate-400">({counts[level]})</span>
          </span>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'

import { MASTERY_META } from '@/features/memory/components/mastery-meta'
import { formatRelativeDay, toDateKey } from '@/lib/date'
import type { MemoryEntry, MemoryLayer, MasteryLevel } from '@/types/models'

const LAYER_META: Record<MemoryLayer, { label: string; className: string; icon: string }> = {
  fact: { label: '事实', className: 'bg-sky-50 text-sky-700', icon: '📌' },
  mastery: { label: '掌握状态', className: 'bg-emerald-50 text-emerald-700', icon: '📈' },
  episode: { label: '情景', className: 'bg-violet-50 text-violet-700', icon: '🕘' },
}

const SOURCE_LABEL: Record<MemoryEntry['source'], string> = {
  'ai-extract': '学伴总结',
  user: '你手动添加',
  rule: '按计划自动推导',
}

interface MemoryCardProps {
  entry: MemoryEntry
  courseTitle?: string
  onUpdate: (patch: Partial<MemoryEntry>) => void
  onRemove: () => void
  onToggleArchived: () => void
}

/**
 * 单条记忆。
 *
 * 重点是**可编辑**：用户能改写甚至删掉学伴的记忆。
 * 记忆如果是个改不动的黑盒，那它就不是「了解你」，而是「偷偷给你贴标签」。
 */
export function MemoryCard({
  entry,
  courseTitle,
  onUpdate,
  onRemove,
  onToggleArchived,
}: MemoryCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.content)

  const layer = LAYER_META[entry.layer]

  function save() {
    const content = draft.trim()
    if (content) onUpdate({ content })
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${layer.className}`}>
          {layer.icon} {layer.label}
        </span>
        {entry.knowledgePoint && (
          <span className="badge bg-slate-100 text-slate-600">{entry.knowledgePoint}</span>
        )}
        {courseTitle && <span className="text-xs text-slate-400">{courseTitle}</span>}
        {entry.archived && <span className="badge bg-slate-100 text-slate-400">已归档</span>}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              setDraft(entry.content)
              setEditing((value) => !value)
            }}
          >
            {editing ? '取消' : '修正'}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={onToggleArchived}
            title="归档后不再注入给学伴，但记录保留"
          >
            {entry.archived ? '恢复' : '归档'}
          </button>
          <button type="button" className="btn btn-danger px-2 py-1 text-xs" onClick={onRemove}>
            删除
          </button>
        </span>
      </div>

      {editing ? (
        <div className="mt-2.5 space-y-2">
          <textarea
            className="input min-h-16 resize-y text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center gap-2">
            {entry.layer === 'mastery' && (
              <select
                className="input w-auto py-1 text-xs"
                value={entry.level ?? 'unknown'}
                onChange={(event) => onUpdate({ level: event.target.value as MasteryLevel })}
              >
                {(Object.keys(MASTERY_META) as MasteryLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {MASTERY_META[level].label}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn btn-primary px-2.5 py-1 text-xs" onClick={save}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{entry.content}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>{SOURCE_LABEL[entry.source]}</span>
        <span>·</span>
        <span>{formatRelativeDay(toDateKey(entry.createdAt))}</span>
        <span>·</span>
        <span title="置信度：AI 抽取低于你手动添加的，长期不用会降权">
          置信度 {Math.round(entry.confidence * 100)}%
        </span>
        {entry.useCount > 0 && (
          <>
            <span>·</span>
            <span title="这条记忆被注入提示词的次数，用得越多越可信">
              被用过 {entry.useCount} 次
            </span>
          </>
        )}
      </div>
    </div>
  )
}

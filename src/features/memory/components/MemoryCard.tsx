import { useState } from 'react'

import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'
import { MASTERY_META } from '@/features/memory/components/mastery-meta'
import { formatRelativeDay, toDateKey } from '@/lib/date'
import type { MemoryEntry, MemoryLayer, MasteryLevel } from '@/types/models'

/**
 * 三种记忆层的标签样式。
 *
 * 原来靠三种色相区分，单色系统里改为**复用已有的三个徽章变体**：
 * 描边（事实）/ 实心黑（掌握状态）/ 浅底无框（情景）。
 * 这样三种层仍然一眼可分，而且完全没有新造样式 —— 它们本来就是设计系统里
 * 已经定义好的三个层次，正好对应这里需要的三级强调。
 */
const LAYER_META: Record<MemoryLayer, { label: string; badgeClass: string; icon: IconName }> = {
  fact: { label: '事实', badgeClass: 'badge', icon: 'user' },
  mastery: { label: '掌握状态', badgeClass: 'badge-solid', icon: 'layers' },
  episode: { label: '情景', badgeClass: 'badge border-transparent bg-ink/5', icon: 'calendar' },
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
    <div className="rounded-card border border-line-soft bg-raised px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={layer.badgeClass}>
          <Icon name={layer.icon} size={12} /> {layer.label}
        </span>
        {entry.knowledgePoint && (
          <span className="badge border-transparent bg-ink/5 text-ink-soft">
            {entry.knowledgePoint}
          </span>
        )}
        {courseTitle && <span className="text-small text-ink-faint">{courseTitle}</span>}
        {entry.archived && (
          <span className="badge border-transparent bg-ink/5 text-ink-faint">已归档</span>
        )}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setDraft(entry.content)
              setEditing((value) => !value)
            }}
          >
            {editing ? '取消' : '修正'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onToggleArchived}
            title="归档后不再注入给学伴，但记录保留"
          >
            {entry.archived ? '恢复' : '归档'}
          </button>
          {/* 删除是破坏性操作 —— 这是 alert 红的正当使用场景之一 */}
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
            删除
          </button>
        </span>
      </div>

      {editing ? (
        <div className="mt-2.5 space-y-2">
          <textarea
            className="input min-h-16 resize-y"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center gap-2">
            {entry.layer === 'mastery' && (
              <select
                className="input w-auto py-1 text-small"
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
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-body leading-relaxed text-ink">{entry.content}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-faint">
        <span>{SOURCE_LABEL[entry.source]}</span>
        <span>·</span>
        <span>{formatRelativeDay(toDateKey(entry.createdAt))}</span>
        <span>·</span>
        <span className="tabular" title="置信度：AI 抽取低于你手动添加的，长期不用会降权">
          置信度 {Math.round(entry.confidence * 100)}%
        </span>
        {entry.useCount > 0 && (
          <>
            <span>·</span>
            <span className="tabular" title="这条记忆被注入提示词的次数，用得越多越可信">
              被用过 {entry.useCount} 次
            </span>
          </>
        )}
      </div>
    </div>
  )
}

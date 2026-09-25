import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'
import { MasteryHeatmap } from '@/features/memory/components/MasteryHeatmap'
import { MemoryCard } from '@/features/memory/components/MemoryCard'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import type { MemoryLayer } from '@/types/models'

type LayerFilter = MemoryLayer | 'all'

const LAYER_TABS: { value: LayerFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'fact', label: '事实记忆' },
  { value: 'mastery', label: '掌握状态' },
  { value: 'episode', label: '情景记忆' },
]

export function MemoryPage() {
  const entries = useMemoryStore((state) => state.entries)
  const update = useMemoryStore((state) => state.update)
  const remove = useMemoryStore((state) => state.remove)
  const setArchived = useMemoryStore((state) => state.setArchived)
  const add = useMemoryStore((state) => state.add)
  const courses = useCourseStore((state) => state.courses)

  const [filter, setFilter] = useState<LayerFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftLayer, setDraftLayer] = useState<MemoryLayer>('fact')
  const [draftCourseId, setDraftCourseId] = useState('')

  const courseTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const course of courses) map.set(course.id, course.title)
    return map
  }, [courses])

  const visible = useMemo(() => {
    const lowered = keyword.trim().toLowerCase()
    return entries
      .filter((entry) => (showArchived ? true : !entry.archived))
      .filter((entry) => (filter === 'all' ? true : entry.layer === filter))
      .filter((entry) =>
        lowered === ''
          ? true
          : `${entry.content} ${entry.knowledgePoint ?? ''}`.toLowerCase().includes(lowered),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [entries, filter, keyword, showArchived])

  const stats = useMemo(() => {
    const active = entries.filter((entry) => !entry.archived)
    return {
      total: active.length,
      fact: active.filter((entry) => entry.layer === 'fact').length,
      mastery: active.filter((entry) => entry.layer === 'mastery').length,
      episode: active.filter((entry) => entry.layer === 'episode').length,
      archived: entries.length - active.length,
    }
  }, [entries])

  /** 掌握状态按课程分组展示，全局记忆归到「未归属课程」 */
  const masteryGroups = useMemo(() => {
    const groups = new Map<string, typeof entries>()
    for (const entry of entries) {
      if (entry.layer !== 'mastery' || entry.archived) continue
      const key = entry.courseId ?? '__global__'
      const bucket = groups.get(key)
      if (bucket) bucket.push(entry)
      else groups.set(key, [entry])
    }
    return groups
  }, [entries])

  function handleAdd() {
    const content = draft.trim()
    if (!content) return
    add({
      layer: draftLayer,
      content,
      courseId: draftCourseId || undefined,
      // 用户手动添加的一律给高置信度 —— 本人的说法最可信
      confidence: 0.95,
      source: 'user',
      ...(draftLayer === 'mastery' ? { knowledgePoint: content, level: 'learning' as const } : {}),
    })
    setDraft('')
  }

  return (
    <>
      <PageHeader
        title="记忆"
        description="你的学伴记得什么、记错了什么，都在这里，随时可改"
        actions={
          <span className="muted tabular">
            共 {stats.total} 条{stats.archived > 0 && ` · 已归档 ${stats.archived}`}
          </span>
        }
      />

      <div className="max-w-4xl space-y-5 px-6 pb-8">
        {/* 分层说明：这是设计的一部分，值得直接讲给用户听。
            用浅底无阴影的卡片把它压成"说明性区块"，与下方功能性卡片拉开层次 */}
        <section className="card-flat bg-ink/5">
          <h2 className="section-title">记忆分四层</h2>
          {/* 每一层只留一句最关键的说明。原来的两行版把这一屏变成了说明书 ——
              需要完整解释时用户会去翻文档，界面上只要够他分辨这四层是什么 */}
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <LayerNote icon="chat" title="会话记忆" note="当前对话的上下文，过长时自动压缩" />
            <LayerNote
              icon="user"
              title="事实记忆"
              count={stats.fact}
              note="专业、目标、学习习惯"
            />
            <LayerNote
              icon="layers"
              title="掌握状态"
              count={stats.mastery}
              note="每个知识点学到什么程度"
            />
            <LayerNote
              icon="calendar"
              title="情景记忆"
              count={stats.episode}
              note="问过什么、当时弄懂没有"
            />
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">知识点掌握情况</h2>
          <p className="hint mb-4 mt-2">
            「已掌握」与「薄弱」由学伴判断或你手动修正，任务完成只会进入「学习中」。
          </p>

          {masteryGroups.size === 0 ? (
            <MasteryHeatmap entries={entries} />
          ) : (
            <div className="space-y-6">
              {[...masteryGroups.entries()].map(([courseId, groupEntries]) => (
                <MasteryHeatmap
                  key={courseId}
                  entries={groupEntries}
                  courseTitle={
                    courseId === '__global__'
                      ? '未归属课程'
                      : (courseTitleById.get(courseId) ?? '未知课程')
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="section-title mr-auto">记忆条目</h2>
            {/* 筛选器做成单色分段控件：选中态是黑底白字（设计约束里"激活"的唯一表达），
                未选中是幽灵按钮，靠底色有无来区分，而不是靠颜色 */}
            {LAYER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={
                  filter === tab.value
                    ? 'btn bg-ink text-ink-inverse btn-sm'
                    : 'btn btn-ghost btn-sm'
                }
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className="input max-w-xs flex-1 py-1.5"
              placeholder="搜索记忆内容或知识点…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-small text-ink-soft">
              <input
                type="checkbox"
                className="size-3.5 accent-ink"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              显示已归档
            </label>
          </div>

          <div className="mb-4 rounded-card border border-dashed border-line-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto py-1.5 text-small"
                value={draftLayer}
                onChange={(event) => setDraftLayer(event.target.value as MemoryLayer)}
              >
                <option value="fact">事实记忆</option>
                <option value="mastery">掌握状态</option>
                <option value="episode">情景记忆</option>
              </select>
              <select
                className="input w-auto py-1.5 text-small"
                value={draftCourseId}
                onChange={(event) => setDraftCourseId(event.target.value)}
              >
                <option value="">不绑定课程</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <input
                className="input min-w-48 flex-1 py-1.5"
                placeholder="手动添加一条记忆，例如「我晚上效率更高」"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleAdd()
                }}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd}>
                添加
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-faint">
              {entries.length === 0
                ? '还没有任何记忆。和学伴聊几次，或者在上面手动添加一条试试。'
                : '没有符合条件的记忆'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {visible.map((entry) => (
                <MemoryCard
                  key={entry.id}
                  entry={entry}
                  courseTitle={entry.courseId ? courseTitleById.get(entry.courseId) : undefined}
                  onUpdate={(patch) => update(entry.id, patch)}
                  onRemove={() => remove(entry.id)}
                  onToggleArchived={() => setArchived(entry.id, !entry.archived)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function LayerNote({
  icon,
  title,
  note,
  count,
}: {
  icon: IconName
  title: string
  note: string
  /** 有计数时才显示，避免「会话记忆（0）」这种本来就无数量的层出现括号 */
  count?: number
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-ink-soft">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-body font-bold text-ink">
          {title}
          {count !== undefined && <span className="tabular text-ink-faint"> {count}</span>}
        </div>
        <p className="mt-0.5 text-small text-ink-soft">{note}</p>
      </div>
    </div>
  )
}

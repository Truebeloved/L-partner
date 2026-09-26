import { useMemo, useState } from 'react'

import { Icon } from '@/components/Icon'
import { MarkdownLite } from '@/features/chat/components/MarkdownLite'
import { doneUnitIds } from '@/features/today/autoTodo'
import { formatMinutes } from '@/lib/date'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Course, Id } from '@/types/models'

interface CourseStructureProps {
  course: Course
  /** 让学伴写某一节的正文；由课程页注入（它才知道用哪个 provider） */
  onWriteLesson?: (unitId: Id) => Promise<void>
}

/**
 * 阶段 → 单元 → 知识点。
 * 知识点单独列出来而不是收在 tooltip 里，是因为它是掌握状态的挂载点：
 * 用户想核对「我的学伴记得我学到哪」时，需要看到的就是这一串名词。
 *
 * 每个单元还能**读到正文**（`unit.content`）—— 只有目录的课程点进去是空的，
 * 这一块才是"书里真的有字"。
 *
 * 完成的单元（计划项全部完成，或关联到它的待办全部勾掉）显示为灰态 + 删除线 ——
 * 这条链路是「全局 AI」把待办和课程内容接起来之后用户唯一看得见的结果：
 * 在待办栏勾掉一件事，这里对应的那一行就划掉了。
 */
export function CourseStructure({ course, onWriteLesson }: CourseStructureProps) {
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
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  done={done.has(unit.id)}
                  onWriteLesson={onWriteLesson}
                />
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
  onWriteLesson,
}: {
  unit: Course['stages'][number]['units'][number]
  done: boolean
  onWriteLesson?: (unitId: Id) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settings = useSettingsStore((state) => state.settings)

  const hasLesson = Boolean(unit.content)

  async function writeLesson() {
    setBusy(true)
    setError(null)
    try {
      await onWriteLesson?.(unit.id)
      setOpen(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-sm px-2 py-2 transition-colors duration-200 hover:bg-ink/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/*
          标题按**章节标题**的规格来做（原来是与正文同级的 14px 常规字重，读起来像注释），
          而它其实是用户在这门课里唯一要读的那一行。
          有视频链接时标题本身就是链接，并且带一个 ▶ 标记 ——
          只靠"悬停才出现的下划线"，用户根本不知道这里能点。
          target=_blank 交给主进程的 setWindowOpenHandler 用默认浏览器打开。
        */}
        {unit.resourceUrl ? (
          <a
            href={unit.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className={[
              'inline-flex min-w-0 items-baseline gap-1.5 text-h3 font-bold transition-colors duration-200',
              done ? 'text-ink-faint line-through' : 'text-ink hover:underline',
            ].join(' ')}
            title="用默认浏览器打开这一讲"
          >
            <span aria-hidden="true" className="text-small text-ink-faint">
              ▶
            </span>
            {unit.title}
          </a>
        ) : (
          <span
            className={
              done ? 'text-h3 font-bold text-ink-faint line-through' : 'text-h3 font-bold text-ink'
            }
          >
            {unit.title}
          </span>
        )}
        <span className="tabular text-small text-ink-soft">
          {done ? '已完成 · ' : ''}
          {formatMinutes(unit.estimatedMinutes)}
        </span>
      </div>
      {unit.knowledgePoints.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {unit.knowledgePoints.map((point) => (
            <span key={point} className={done ? 'badge text-ink-faint line-through' : 'badge'}>
              {point}
            </span>
          ))}
        </div>
      )}

      {/*
        外部视频只有**标题**这一个入口：标题已经是链接，再在下面挂一条
        「▶ B 站原视频 · … AI 提供」就是同一件事说两遍，用户明确要求去掉。
        链接交给主进程的 setWindowOpenHandler（target=_blank）去开外链，
        渲染进程不需要、也不该拿到 shell 能力。
      */}
      {/*
        正文：这是"课程不是空壳"的地方。
        但**已经有视频链接的节不提供定制教材** —— 那门课本身讲得比模型现写的更好，
        再让模型写一遍纯属浪费 token（用户明确要求）。视频才是这一节的主路径，
        正文只在"没有外部好课可用"时才是选项。
      */}
      <div className="mt-2">
        {hasLesson ? (
          /* 展开/收起做成明确的箭头 + 文字：只有文字按钮时，用户找不到"怎么收起来" */
          <button
            type="button"
            className="inline-flex items-center gap-1 text-small text-ink-soft transition-colors duration-200 hover:text-ink"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
            {open ? '收起这一节' : '展开这一节'}
          </button>
        ) : unit.resourceUrl ? null : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void writeLesson()}
            disabled={busy}
            title={
              settings.llm.apiKey
                ? '让学伴按这一节的内容写一份专属教材，写完存在本地'
                : '需要先在设置里接入大模型'
            }
          >
            {busy ? '正在定制…' : '定制个性化教材'}
          </button>
        )}

        {error && <p className="mt-1 text-small text-alert">{error}</p>}

        {hasLesson && open && (
          <div className="mt-3 rounded-card border border-line-soft bg-surface px-4 py-3">
            <MarkdownLite source={unit.content ?? ''} />
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void writeLesson()}
                disabled={busy}
              >
                {busy ? '正在重写…' : '重新定制'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-small text-ink-soft transition-colors duration-200 hover:text-ink"
                onClick={() => setOpen(false)}
              >
                <Icon name="chevronUp" size={14} />
                收起这一节
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

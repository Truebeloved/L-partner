import { useState } from 'react'

import {
  emptyStageDraft,
  emptyUnitDraft,
  estimateUnitMinutes,
  splitKnowledgePoints,
} from '@/features/course/drafts'
import type { CoursePlanDraft } from '@/features/course/drafts'
import { formatMinutes } from '@/lib/date'

/**
 * 表单内部所有字段都用字符串存。
 * 为什么：input 的 value 天生是字符串，过早转成 number 会在用户「正在输入」时丢内容
 * （比如清空输入框想重打，Number('') 会变成 0 并卡住光标）。转换只发生在提交那一刻。
 */
interface UnitForm {
  title: string
  /** 一行一个知识点，批量粘贴讲义目录比逐条点加号顺手 */
  knowledgePoints: string
  estimatedMinutes: string
}

interface StageForm {
  title: string
  objective: string
  units: UnitForm[]
}

interface FormState {
  title: string
  description: string
  goal: string
  deadline: string
  /** 界面按小时收集，落库时乘 60 换成分钟 —— 转换只在这一处发生 */
  weeklyHours: string
  stages: StageForm[]
}

interface CourseFormDialogProps {
  /** 传入时作为初始值：AI 生成的方案走这条路，用户改完再保存 */
  initialDraft?: CoursePlanDraft | null
  /** 初值来自 AI 时提示用户先核对，避免把模型编的内容直接当事实 */
  fromAi?: boolean
  onCancel: () => void
  onSubmit: (draft: CoursePlanDraft) => void
}

export function CourseFormDialog({
  initialDraft,
  fromAi = false,
  onCancel,
  onSubmit,
}: CourseFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => toForm(initialDraft))
  const [error, setError] = useState<string | null>(null)

  function patch(changes: Partial<FormState>) {
    setForm((previous) => ({ ...previous, ...changes }))
  }

  function patchStage(stageIndex: number, changes: Partial<StageForm>) {
    setForm((previous) => ({
      ...previous,
      stages: previous.stages.map((stage, index) =>
        index === stageIndex ? { ...stage, ...changes } : stage,
      ),
    }))
  }

  function patchUnit(stageIndex: number, unitIndex: number, changes: Partial<UnitForm>) {
    setForm((previous) => ({
      ...previous,
      stages: previous.stages.map((stage, index) =>
        index === stageIndex
          ? {
              ...stage,
              units: stage.units.map((unit, unitIdx) =>
                unitIdx === unitIndex ? { ...unit, ...changes } : unit,
              ),
            }
          : stage,
      ),
    }))
  }

  function addUnit(stageIndex: number) {
    setForm((previous) => ({
      ...previous,
      stages: previous.stages.map((stage, index) =>
        index === stageIndex ? { ...stage, units: [...stage.units, emptyUnitForm()] } : stage,
      ),
    }))
  }

  function removeUnit(stageIndex: number, unitIndex: number) {
    setForm((previous) => ({
      ...previous,
      stages: previous.stages.map((stage, index) =>
        index === stageIndex
          ? { ...stage, units: stage.units.filter((_, unitIdx) => unitIdx !== unitIndex) }
          : stage,
      ),
    }))
  }

  function handleSubmit() {
    const message = validate(form)
    if (message) {
      setError(message)
      return
    }
    onSubmit(toDraft(form))
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="新建课程"
        className="mx-auto w-full max-w-3xl rounded-card bg-raised p-6 shadow-pop"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="card-title">新建课程</h2>
            <p className="mt-1 text-small text-ink-soft">
              填完保存后进入课程详情，再生成学习计划与今日待办。时长留空会按知识点数量估算。
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            关闭
          </button>
        </header>

        {/* AI 初稿提示。原来是紫色信息块 —— 单色系里没有「信息色」，
            用中性底纹表达「这是一段说明」即可 */}
        {fromAi && (
          <p className="mt-4 rounded-sm bg-ink/5 px-3 py-2 text-small text-ink">
            以下内容是 AI 生成的初稿。阶段、单元、时长都可以直接改 —— 确认无误再保存。
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="course-title">
              课程标题
            </label>
            <input
              id="course-title"
              className="input"
              value={form.title}
              placeholder="如：两个月上手 React"
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="course-goal">
                学习目标
              </label>
              <input
                id="course-goal"
                className="input"
                value={form.goal}
                placeholder="学完之后能做什么"
                onChange={(event) => patch({ goal: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="course-deadline">
                期望完成日期
              </label>
              <input
                id="course-deadline"
                type="date"
                className="input"
                value={form.deadline}
                onChange={(event) => patch({ deadline: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="course-weekly">
                每周可投入（小时）
              </label>
              <input
                id="course-weekly"
                type="number"
                min={1}
                step={0.5}
                className="input"
                value={form.weeklyHours}
                onChange={(event) => patch({ weeklyHours: event.target.value })}
              />
              <p className="mt-1 text-small text-ink-soft">排期按它推算每天该学多久。</p>
            </div>
            <div>
              <label className="label" htmlFor="course-description">
                简介
              </label>
              <input
                id="course-description"
                className="input"
                value={form.description}
                placeholder="一句话说明这门课"
                onChange={(event) => patch({ description: event.target.value })}
              />
            </div>
          </div>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-bold text-ink">
              阶段与单元（{form.stages.length} 个阶段）
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  stages: [...previous.stages, emptyStageForm()],
                }))
              }
            >
              ＋ 新增阶段
            </button>
          </div>

          <div className="mt-3 space-y-4">
            {form.stages.map((stage, stageIndex) => (
              <div key={stageIndex} className="rounded-card border border-line-soft p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px] flex-1">
                    <label className="label">阶段 {stageIndex + 1} 标题</label>
                    <input
                      className="input"
                      value={stage.title}
                      placeholder="如：起步：把 React 跑起来"
                      onChange={(event) => patchStage(stageIndex, { title: event.target.value })}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <label className="label">阶段目标（可选）</label>
                    <input
                      className="input"
                      value={stage.objective}
                      placeholder="这一阶段结束时能做到什么"
                      onChange={(event) =>
                        patchStage(stageIndex, { objective: event.target.value })
                      }
                    />
                  </div>
                  {form.stages.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        setForm((previous) => ({
                          ...previous,
                          stages: previous.stages.filter((_, index) => index !== stageIndex),
                        }))
                      }
                    >
                      删除阶段
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {/* 单元块需要「比白略深一点」的凹陷感来和白色卡片分层。
                      单色系里没有「极浅灰」档位：surface(#d0d0d0) 会重得像一块砖，
                      ink/5 才是这里要的效果 */}
                  {stage.units.map((unit, unitIndex) => (
                    <div key={unitIndex} className="rounded-sm bg-ink/5 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">单元标题</label>
                          <input
                            className="input"
                            value={unit.title}
                            placeholder="如：JSX 与组件基础"
                            onChange={(event) =>
                              patchUnit(stageIndex, unitIndex, { title: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="label">预计时长（分钟，留空自动估算）</label>
                          <input
                            type="number"
                            min={1}
                            className="input"
                            value={unit.estimatedMinutes}
                            placeholder={estimateHint(unit)}
                            onChange={(event) =>
                              patchUnit(stageIndex, unitIndex, {
                                estimatedMinutes: event.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="label">知识点（一行一个）</label>
                        <textarea
                          className="input h-20 resize-y"
                          value={unit.knowledgePoints}
                          placeholder={'useState\n事件处理\n受控表单'}
                          onChange={(event) =>
                            patchUnit(stageIndex, unitIndex, {
                              knowledgePoints: event.target.value,
                            })
                          }
                        />
                      </div>
                      {stage.units.length > 1 && (
                        <div className="mt-2 text-right">
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeUnit(stageIndex, unitIndex)}
                          >
                            删除单元
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm mt-3"
                  onClick={() => addUnit(stageIndex)}
                >
                  ＋ 新增单元
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 表单校验失败是错误信息，属于红色允许出现的场景 */}
        {error && (
          <p className="mt-4 rounded-sm border border-alert bg-alert-soft px-3 py-2 text-small text-alert">
            {error}
          </p>
        )}

        <footer className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            保存课程
          </button>
        </footer>
      </div>
    </div>
  )
}

function toForm(draft?: CoursePlanDraft | null): FormState {
  if (!draft) {
    return {
      title: '',
      description: '',
      goal: '',
      deadline: '',
      weeklyHours: '10',
      stages: [emptyStageForm()],
    }
  }

  return {
    title: draft.title,
    description: draft.description ?? '',
    goal: draft.goal ?? '',
    deadline: draft.deadline ?? '',
    weeklyHours: draft.weeklyMinutes ? trimNumber(draft.weeklyMinutes / 60) : '10',
    stages:
      draft.stages.length > 0
        ? draft.stages.map((stage) => ({
            title: stage.title,
            objective: stage.objective ?? '',
            units:
              stage.units.length > 0
                ? stage.units.map((unit) => ({
                    title: unit.title,
                    knowledgePoints: unit.knowledgePoints.join('\n'),
                    estimatedMinutes: unit.estimatedMinutes ? String(unit.estimatedMinutes) : '',
                  }))
                : [emptyUnitForm()],
          }))
        : [emptyStageForm()],
  }
}

function toDraft(form: FormState): CoursePlanDraft {
  const weeklyHours = Number(form.weeklyHours)
  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    goal: form.goal.trim() || undefined,
    deadline: form.deadline || undefined,
    weeklyMinutes:
      Number.isFinite(weeklyHours) && weeklyHours > 0 ? Math.round(weeklyHours * 60) : undefined,
    stages: form.stages.map((stage) => ({
      title: stage.title.trim(),
      objective: stage.objective.trim() || undefined,
      units: stage.units.map((unit) => {
        const minutes = Number(unit.estimatedMinutes)
        return {
          title: unit.title.trim(),
          knowledgePoints: splitKnowledgePoints(unit.knowledgePoints),
          // 留空就是「让程序估」：传 undefined 而不是 0，语义才不会被误解成「预计 0 分钟」
          estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
        }
      }),
    })),
  }
}

/** 提交前的最后一道关卡：空标题、空单元的方案落库后无法排期，宁可不放行 */
function validate(form: FormState): string | null {
  if (!form.title.trim()) return '请填写课程标题。'
  if (form.stages.length === 0) return '至少需要一个阶段。'

  for (const [index, stage] of form.stages.entries()) {
    if (!stage.title.trim()) return `阶段 ${index + 1} 还没有标题。`
    if (stage.units.length === 0) return `阶段 ${index + 1} 至少需要一个单元。`
    for (const unit of stage.units) {
      if (!unit.title.trim()) return `阶段 ${index + 1} 里有单元还没有标题。`
    }
  }
  return null
}

function emptyUnitForm(): UnitForm {
  const unit = emptyUnitDraft()
  return {
    title: unit.title,
    knowledgePoints: unit.knowledgePoints.join('\n'),
    estimatedMinutes: '',
  }
}

function emptyStageForm(): StageForm {
  const stage = emptyStageDraft()
  return { title: stage.title, objective: stage.objective ?? '', units: [emptyUnitForm()] }
}

/** 时长留空时在输入框里显示估算值，让用户知道不填也不会排不出计划 */
function estimateHint(unit: UnitForm): string {
  const minutes = estimateUnitMinutes({
    knowledgePoints: splitKnowledgePoints(unit.knowledgePoints),
  })
  return `自动估算 ${formatMinutes(minutes)}`
}

function trimNumber(value: number): string {
  return String(Math.round(value * 10) / 10)
}

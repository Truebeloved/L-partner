import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { usePersonaStore } from '@/store/personas'
import type { PersonaDraft } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'
import type { Id, Persona } from '@/types/models'

const EMPTY_DRAFT: PersonaDraft = {
  name: '',
  avatar: '🧑‍🏫',
  identity: '',
  personality: '',
  speakingStyle: '',
  teachingStrategy: '',
  taboos: '',
}

const AVATAR_CHOICES = ['🧑‍🏫', '🎯', '🌱', '🏛️', '⚡', '🦉', '🧭', '🛠️', '📐', '🐢']

export function PersonaPage() {
  const personas = usePersonaStore((state) => state.personas)
  const addPersona = usePersonaStore((state) => state.add)
  const duplicatePersona = usePersonaStore((state) => state.duplicate)
  const updatePersona = usePersonaStore((state) => state.update)
  const removePersona = usePersonaStore((state) => state.remove)

  const activePersonaId = useSettingsStore((state) => state.settings.activePersonaId)
  const updateSettings = useSettingsStore((state) => state.update)

  /** null = 未在编辑；'new' = 新建；其余为被编辑的角色 id */
  const [editing, setEditing] = useState<Id | 'new' | null>(null)
  const [draft, setDraft] = useState<PersonaDraft>(EMPTY_DRAFT)

  function startCreate() {
    setDraft(EMPTY_DRAFT)
    setEditing('new')
  }

  /**
   * 内置角色不允许直接改 —— 它是「标准参照」，改坏了用户就失去了对比基准。
   * 想调整就先复制一份再改，副本是普通角色，完全可以随便改。
   */
  function startEdit(persona: Persona) {
    if (persona.builtin) {
      const copyId = duplicatePersona(persona.id)
      if (!copyId) return
      const copy = usePersonaStore.getState().getById(copyId)
      if (copy) {
        setDraft(toDraft(copy))
        setEditing(copyId)
      }
      return
    }
    setDraft(toDraft(persona))
    setEditing(persona.id)
  }

  function save() {
    const name = draft.name.trim()
    if (!name) return

    if (editing === 'new') {
      const id = addPersona({ ...draft, name })
      updateSettings({ activePersonaId: id })
    } else if (editing) {
      updatePersona(editing, { ...draft, name })
    }
    setEditing(null)
  }

  return (
    <>
      <PageHeader
        title="角色"
        description="决定你的学伴是谁、用什么方式教你"
        actions={
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            新建角色
          </button>
        }
      />

      <div className="max-w-4xl space-y-5">
        <section className="card bg-slate-50">
          <p className="text-sm leading-relaxed text-slate-600">
            记忆是<strong className="font-medium">跟着你</strong>的，角色只决定
            <strong className="font-medium">现在是谁在教你</strong>。所以随时切换角色都不会丢记忆 ——
            换个老师，他依然知道你哪块薄弱。
          </p>
        </section>

        {editing !== null && (
          <section className="card border-brand-300">
            <h2 className="section-title">{editing === 'new' ? '新建角色' : '编辑角色'}</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="label" htmlFor="persona-name">
                    名字
                  </label>
                  <input
                    id="persona-name"
                    className="input"
                    value={draft.name}
                    placeholder="例如：严厉但靠谱的学姐"
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </div>
                <div>
                  <span className="label">头像</span>
                  <div className="flex flex-wrap gap-1">
                    {AVATAR_CHOICES.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        className={
                          draft.avatar === avatar
                            ? 'rounded-lg border-2 border-brand-500 px-1.5 py-1 text-xl'
                            : 'rounded-lg border-2 border-transparent px-1.5 py-1 text-xl hover:bg-slate-100'
                        }
                        onClick={() => setDraft({ ...draft, avatar })}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Field
                id="persona-identity"
                label="身份背景"
                hint="它是谁？这个设定会明显影响它的表达方式"
                value={draft.identity}
                placeholder="例如：带过三届考研的计算机讲师"
                onChange={(value) => setDraft({ ...draft, identity: value })}
              />
              <Field
                id="persona-personality"
                label="性格"
                hint="它会怎么对待你"
                value={draft.personality}
                placeholder="例如：直接、不留情面，但从不否定人"
                onChange={(value) => setDraft({ ...draft, personality: value })}
              />
              <Field
                id="persona-style"
                label="说话风格"
                hint="语气、用词、长短"
                value={draft.speakingStyle}
                placeholder="例如：口语化，多用类比，少堆术语"
                onChange={(value) => setDraft({ ...draft, speakingStyle: value })}
              />
              <Field
                id="persona-strategy"
                label="教学方式"
                hint="这是最能拉开差距的一项：先讲原理还是先给例子？会不会反问你？"
                value={draft.teachingStrategy}
                placeholder="例如：先给一个具体例子建立直觉，再讲原理；讲完让我复述一遍"
                onChange={(value) => setDraft({ ...draft, teachingStrategy: value })}
              />
              <Field
                id="persona-taboos"
                label="不要做的事"
                hint="明确禁止比正面描述更有效"
                value={draft.taboos}
                placeholder="例如：不要空泛鼓励，不要一次抛太多内容"
                onChange={(value) => setDraft({ ...draft, taboos: value })}
              />

              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={!draft.name.trim()}
                >
                  保存
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
                  取消
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {personas.map((persona) => {
            const isActive = persona.id === activePersonaId
            return (
              <div
                key={persona.id}
                className={`card flex flex-col ${
                  isActive ? 'border-brand-400 ring-1 ring-brand-200' : 'card-hover'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl leading-none">{persona.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{persona.name}</h3>
                      {persona.builtin && (
                        <span className="badge bg-slate-100 text-slate-500">内置</span>
                      )}
                      {isActive && <span className="badge bg-brand-50 text-brand-700">使用中</span>}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      {persona.identity}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  <Row label="性格" value={persona.personality} />
                  <Row label="风格" value={persona.speakingStyle} />
                  <Row label="教法" value={persona.teachingStrategy} />
                  {persona.taboos && <Row label="禁忌" value={persona.taboos} />}
                </dl>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    className={isActive ? 'btn btn-outline text-xs' : 'btn btn-primary text-xs'}
                    onClick={() => updateSettings({ activePersonaId: persona.id })}
                    disabled={isActive}
                  >
                    {isActive ? '当前使用' : '使用这个角色'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline text-xs"
                    onClick={() => startEdit(persona)}
                    title={
                      persona.builtin ? '内置角色会先复制一份再编辑，原角色保持不变' : undefined
                    }
                  >
                    {persona.builtin ? '复制并修改' : '编辑'}
                  </button>
                  {!persona.builtin && (
                    <button
                      type="button"
                      className="btn btn-danger ml-auto text-xs"
                      onClick={() => {
                        if (persona.id === activePersonaId) {
                          updateSettings({ activePersonaId: personas[0]?.id ?? '' })
                        }
                        removePersona(persona.id)
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function toDraft(persona: Persona): PersonaDraft {
  return {
    name: persona.name,
    avatar: persona.avatar,
    identity: persona.identity,
    personality: persona.personality,
    speakingStyle: persona.speakingStyle,
    teachingStrategy: persona.teachingStrategy,
    taboos: persona.taboos,
  }
}

function Field({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <dt className="w-8 shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-slate-600">{value}</dd>
    </div>
  )
}

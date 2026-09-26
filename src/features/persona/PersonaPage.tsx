import { useState } from 'react'

import { PersonaAvatar } from '@/components/PersonaAvatar'
import { AVATAR_KEYS } from '@/components/avatar-marks'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { usePersonaStore } from '@/store/personas'
import type { PersonaDraft } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'
import type { Id, Persona } from '@/types/models'

const EMPTY_DRAFT: PersonaDraft = {
  name: '',
  avatar: 'quill',
  identity: '',
  personality: '',
  speakingStyle: '',
  teachingStrategy: '',
  taboos: '',
}

/**
 * 角色卡的面板状态。
 *
 * 一个状态机而不是两个布尔量：`open` + `editing` 那种写法必然会出现
 * "正在编辑 A，同时又打开了 B"这类不可能的组合，而它们一旦出现，
 * 界面就会呈现出没人设计过的样子。
 */
type Panel =
  | { kind: 'closed' }
  | { kind: 'view'; id: Id }
  | { kind: 'edit'; id: Id | 'new'; draft: PersonaDraft }

/**
 * 「学伴设定」里的角色区。
 *
 * 两条来自用户的要求：
 *
 * 1. **列表只显示名字**。原来每张卡把身份、性格、风格、教法、禁忌全铺出来，
 *    四个人就是四屏字 —— 那是"详情"的量，不该出现在列表里。现在列表是干净的一列，
 *    点开谁才看谁的详情。
 * 2. **内置角色可以直接改**，不必先复制一份。原来那套"复制并修改"是为了保护
 *    "标准参照"，但用户要的是"这四个人就是我的学伴，我想把林知夏改得更安静一点，
 *    为什么要先造一个副本？"—— 所以改成直接编辑，副本仍然保留（想要变体时有用）。
 */
export function PersonaSection() {
  const personas = usePersonaStore((state) => state.personas)
  const addPersona = usePersonaStore((state) => state.add)
  const duplicatePersona = usePersonaStore((state) => state.duplicate)
  const updatePersona = usePersonaStore((state) => state.update)
  const removePersona = usePersonaStore((state) => state.remove)

  const activePersonaId = useSettingsStore((state) => state.settings.activePersonaId)
  const updateSettings = useSettingsStore((state) => state.update)

  const [panel, setPanel] = useState<Panel>({ kind: 'closed' })

  const openPersona =
    panel.kind === 'view' ? personas.find((persona) => persona.id === panel.id) : undefined

  function save() {
    if (panel.kind !== 'edit') return
    const name = panel.draft.name.trim()
    if (!name) return

    if (panel.id === 'new') {
      const id = addPersona({ ...panel.draft, name })
      updateSettings({ activePersonaId: id })
      setPanel({ kind: 'view', id })
      return
    }

    updatePersona(panel.id, { ...panel.draft, name })
    setPanel({ kind: 'view', id: panel.id })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-body leading-relaxed text-ink-soft">
          记忆<strong className="font-bold text-ink">跟着你</strong>，换角色不会丢。
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm shrink-0"
          onClick={() => setPanel({ kind: 'edit', id: 'new', draft: EMPTY_DRAFT })}
        >
          新建角色
        </button>
      </div>

      {/*
        紧凑列表：只有头像和名字。
        当前使用的那个用左侧一道竖线标出来 —— 比整行黑边更轻，也不会把列表压成四块。
      */}
      <div className="card divide-y divide-line-soft p-0">
        {personas.map((persona) => {
          const isActive = persona.id === activePersonaId
          return (
            <button
              key={persona.id}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 ease-out hover:bg-ink/5"
              onClick={() => setPanel({ kind: 'view', id: persona.id })}
            >
              <PersonaAvatar value={persona.avatar} size={30} />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{persona.name}</span>
              {isActive && <span className="badge-solid shrink-0">使用中</span>}
              <span className="shrink-0 text-micro text-ink-faint">详情</span>
            </button>
          )
        })}
      </div>

      {panel.kind === 'view' && openPersona && (
        <PersonaDetail
          persona={openPersona}
          isActive={openPersona.id === activePersonaId}
          onUse={() => updateSettings({ activePersonaId: openPersona.id })}
          onEdit={() => setPanel({ kind: 'edit', id: openPersona.id, draft: toDraft(openPersona) })}
          onDuplicate={() => {
            const copyId = duplicatePersona(openPersona.id)
            const copy = copyId ? usePersonaStore.getState().getById(copyId) : undefined
            if (copy) setPanel({ kind: 'edit', id: copy.id, draft: toDraft(copy) })
          }}
          onRemove={() => {
            if (openPersona.id === activePersonaId) {
              updateSettings({ activePersonaId: personas[0]?.id ?? '' })
            }
            removePersona(openPersona.id)
            setPanel({ kind: 'closed' })
          }}
          onClose={() => setPanel({ kind: 'closed' })}
        />
      )}

      {panel.kind === 'edit' && (
        <PersonaEditor
          title={panel.id === 'new' ? '新建角色' : '修改角色'}
          draft={panel.draft}
          onChange={(draft) => setPanel({ ...panel, draft })}
          onSave={save}
          onCancel={() =>
            setPanel(panel.id === 'new' ? { kind: 'closed' } : { kind: 'view', id: panel.id })
          }
        />
      )}
    </div>
  )
}

/** 详情：这个人是什么样，以及关于他的全部操作 */
function PersonaDetail({
  persona,
  isActive,
  onUse,
  onEdit,
  onDuplicate,
  onRemove,
  onClose,
}: {
  persona: Persona
  isActive: boolean
  onUse: () => void
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
  onClose: () => void
}) {
  useEscapeKey(onClose, { capture: true })

  return (
    <Shell onClose={onClose} label={`${persona.name} 的设定`}>
      <div className="flex items-start gap-4">
        <PersonaAvatar value={persona.avatar} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="card-title">{persona.name}</h2>
            {isActive && <span className="badge-solid">使用中</span>}
            {persona.edited && <span className="badge">已改过</span>}
          </div>
          <p className="mt-2 text-small leading-relaxed text-ink-soft">{persona.identity}</p>
        </div>
      </div>

      <dl className="mt-5 space-y-3 border-t border-line-soft pt-4 text-small">
        <Row label="性格" value={persona.personality} />
        <Row label="风格" value={persona.speakingStyle} />
        <Row label="教法" value={persona.teachingStrategy} />
        <Row label="禁忌" value={persona.taboos} />
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onUse}
          disabled={isActive}
        >
          {isActive ? '正在使用' : '使用这个角色'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
          修改
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}>
          复制一份
        </button>
        {!persona.builtin && (
          <button type="button" className="btn btn-danger btn-sm ml-auto" onClick={onRemove}>
            删除
          </button>
        )}
      </div>
    </Shell>
  )
}

/** 编辑（新建与修改共用一套表单） */
function PersonaEditor({
  title,
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  title: string
  draft: PersonaDraft
  onChange: (draft: PersonaDraft) => void
  onSave: () => void
  onCancel: () => void
}) {
  useEscapeKey(onCancel, { capture: true })

  return (
    <Shell label={title}>
      <h2 className="card-title">{title}</h2>

      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <label className="label" htmlFor="persona-name">
            名字
          </label>
          <input
            id="persona-name"
            className="input"
            value={draft.name}
            placeholder="例如：林知夏"
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </div>

        {/* 头像单独占一行：和名字挤在同一行时，名字输入框会被九个头像压成一条缝 */}
        <div>
          <span className="label">头像</span>
          <div className="flex flex-wrap gap-2">
            {AVATAR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="rounded-full transition-all duration-200 ease-out hover:opacity-80"
                aria-label={`选择头像 ${key}`}
                aria-pressed={draft.avatar === key}
                onClick={() => onChange({ ...draft, avatar: key })}
              >
                <PersonaAvatar value={key} size={34} selected={draft.avatar === key} />
              </button>
            ))}
          </div>
        </div>

        <Field
          id="persona-identity"
          label="他是谁"
          hint="名字、年纪、住在哪、靠什么生活、正在经历什么"
          value={draft.identity}
          placeholder="例如：叫林知夏，去年上岸，现在读研二"
          onChange={(value) => onChange({ ...draft, identity: value })}
        />
        <Field
          id="persona-personality"
          label="性格"
          hint="他会怎么对待你，也会露出哪些小毛病"
          value={draft.personality}
          placeholder="例如：情绪稳定，几乎没见他着急过"
          onChange={(value) => onChange({ ...draft, personality: value })}
        />
        <Field
          id="persona-style"
          label="说话风格"
          hint="语气、用词、句子长短"
          value={draft.speakingStyle}
          placeholder="例如：语速偏慢，句子干净，不说空话"
          onChange={(value) => onChange({ ...draft, speakingStyle: value })}
        />
        <Field
          id="persona-strategy"
          label="教学方式"
          hint="先讲原理还是先给例子，什么时候收手"
          value={draft.teachingStrategy}
          placeholder="例如：先弄清楚你卡在哪一步，再让你自己走过去"
          onChange={(value) => onChange({ ...draft, teachingStrategy: value })}
        />
        <Field
          id="persona-taboos"
          label="不要做的事"
          hint="明确禁止比正面描述更有效"
          value={draft.taboos}
          placeholder="例如：不要空泛鼓励，也不要每次都把话题拉回学习"
          onChange={(value) => onChange({ ...draft, taboos: value })}
        />
      </div>

      <div className="mt-5 flex gap-3 border-t border-line-soft pt-4">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={!draft.name.trim()}>
          保存
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </Shell>
  )
}

/**
 * 弹层外壳。
 *
 * z-[60]：高于常驻的学伴输入条（fixed z-50），否则滚动的表单会被它压住。
 *
 * `onClose` 只在**详情**里给：编辑态底部已经有「取消」，再挂一个「关闭」
 * 是两个按钮干同一件事，用户还得猜它们有什么不同。
 */
function Shell({
  children,
  label,
  onClose,
}: {
  children: React.ReactNode
  label: string
  /** 传了才显示右下角的「关闭」 */
  onClose?: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-lg rounded-card bg-raised p-5 shadow-pop"
      >
        {children}
        {onClose && (
          <div className="mt-3 text-right">
            <button
              type="button"
              className="text-micro text-ink-faint hover:text-ink"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
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
      <textarea
        id={id}
        className="input min-h-20 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="hint mt-1">{hint}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <dt className="w-10 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-ink-soft">{value}</dd>
    </div>
  )
}

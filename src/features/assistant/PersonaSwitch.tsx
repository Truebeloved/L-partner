import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import { PersonaAvatar } from '@/components/PersonaAvatar'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { usePersonaStore } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'

/**
 * 输入框里的「切换性格」。
 *
 * 为什么不用原生 `<select>`：它弹出的是一张**操作系统**的列表 ——
 * 白底、蓝高亮、和这套单色界面毫无关系，而且列不出角色的身份说明
 * （用户的原话是"小窗没有做 UI 美化"）。所以自己做一张：贴在上方的小面板，
 * 每个角色一行，带头像、名字与一句话身份，当前那位打勾。
 *
 * 位置既定：只有对话页用它，而那里输入条固定在页面底部，所以面板一律**向上**弹出，
 * 不需要翻转逻辑。
 */
export function PersonaSwitch() {
  const personas = usePersonaStore((state) => state.personas)
  const activeId = useSettingsStore((state) => state.settings.activePersonaId)
  const update = useSettingsStore((state) => state.update)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const active = personas.find((persona) => persona.id === activeId) ?? personas[0]

  // Esc 关面板。用捕获阶段：它比页面层的「Esc 返回」更内层
  useEscapeKey(() => setOpen(false), { enabled: open, capture: true })

  /*
   * 点别处关闭。判断"点在不在面板内"而不是比较 target ——
   * 面板里嵌套了好几层，点内边距命中的是内层元素，用 target 比较会误关。
   */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-persona-switch]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (!active) return null

  return (
    <div ref={rootRef} data-persona-switch className="relative shrink-0">
      <button
        type="button"
        className="flex max-w-32 items-center gap-1 rounded-pill py-1 pr-1 pl-2 text-small text-ink-soft transition-colors duration-200 hover:text-ink"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="换一个角色来回答 —— 记忆是跨角色共享的，换了老师它依然了解你"
      >
        <span className="truncate">{active.name}</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} size={12} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="选择学伴"
          /*
            向上弹出：输入条贴在页面底部，往下就没有空间了。
            宽度给足 —— 角色的身份说明是选谁的主要依据，挤成一行省略号等于没给。
          */
          className="absolute right-0 bottom-full z-10 mb-2 w-72 rounded-card border border-line-soft bg-raised p-1 shadow-pop"
        >
          {personas.map((persona) => {
            const selected = persona.id === active.id
            return (
              <li key={persona.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    'flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors duration-200',
                    selected ? 'bg-ink/8' : 'hover:bg-ink/5',
                  ].join(' ')}
                  onClick={() => {
                    update({ activePersonaId: persona.id })
                    setOpen(false)
                  }}
                >
                  <PersonaAvatar value={persona.avatar} size={26} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          selected ? 'truncate text-body font-bold text-ink' : 'truncate text-body text-ink'
                        }
                      >
                        {persona.name}
                      </span>
                      {selected && (
                        <span className="shrink-0 text-ink-soft">
                          <Icon name="check" size={12} />
                        </span>
                      )}
                    </span>
                    {/* 身份比性格更能说明"这个人会怎么教我"，所以这里给身份 */}
                    <span className="mt-0.5 block truncate text-small text-ink-faint">
                      {persona.identity}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { MemorySection } from '@/features/memory/MemoryPage'
import { PersonaSection } from '@/features/persona/PersonaPage'

type CompanionTab = 'persona' | 'memory'

const TABS: { id: CompanionTab; label: string }[] = [
  { id: 'persona', label: '角色' },
  { id: 'memory', label: '记忆' },
]

/**
 * 学伴设定。
 *
 * 「角色」与「记忆」原本是两个独立栏目，但它们回答的是同一个问题的两面 ——
 * **这个学伴是谁**（角色）与**它了解你什么**（记忆）。分成两页会让用户在两个地方
 * 反复横跳：想调人格要去角色页，想改记忆要去记忆页，而这两件事其实是连续的动作。
 * 合成一页之后，「换个老师，它依然记得你」这个设计点也第一次变得可见 ——
 * 两个标签就在同一屏上，切换角色不会清空记忆这件事不需要再解释了。
 *
 * 用标签页而不是上下堆叠：两块内容都很长，堆在一起会让页面变成一条望不到头的走廊。
 */
export function CompanionPage() {
  const [tab, setTab] = useState<CompanionTab>('persona')

  return (
    <div className="page-container">
      {/* 标题与导航条目同名，避免"我点的是学伴设定、打开的却叫学伴"这种不一致 */}
      <PageHeader title="学伴设定" description="它是什么样的人，以及它记得你什么" />

      {/* 分段控件：选中态是黑底白字（设计约束里"激活"的唯一表达） */}
      <div className="mb-6 flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            className={
              tab === item.id
                ? 'btn btn-sm bg-ink text-ink-inverse'
                : 'btn btn-ghost btn-sm text-ink-soft'
            }
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'persona' ? <PersonaSection /> : <MemorySection />}
    </div>
  )
}

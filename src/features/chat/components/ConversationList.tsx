import { MAIN_CONVERSATION_TITLE } from '@/store/chat'
import { dayjs } from '@/lib/date'
import type { Conversation, Id } from '@/types/models'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: Id | null
  /** 课程 id → 课程名：课程对话在列表里显示课程名而不是内部标题 */
  courseTitles: Map<Id, string>
  onSelect: (id: Id) => void
}

/**
 * 对话列表。
 *
 * 存在的理由：原来切换历史对话只有一个 `<select>`，列表里的每一项只有标题 ——
 * 想知道"上一次那场聊到哪了"必须逐个点开看。微信、豆包这类聊天工具的做法是
 * 把历史摆成常驻的一列：标题 + 最后一句 + 时间，一眼扫过去就能认出来该点哪个。
 *
 * 列表里只会有两类：**主对话**（全局唯一，与课程无关的话都在这里）与
 * **每门课一场**（说话内容里认出这门课时自动进入）。所以这里没有「新对话」——
 * 对话是攒出来的，不是开出来的；上下文连续才是这套分类的目的。
 */
export function ConversationList({
  conversations,
  activeId,
  courseTitles,
  onSelect,
}: ConversationListProps) {
  const sorted = [...conversations].sort(compareConversations)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line-soft bg-raised">
      <div className="border-b border-line-soft px-3 py-2">
        <span className="text-label font-bold tracking-[0.05em] text-ink-faint uppercase">
          对话
        </span>
      </div>

      {/* 会滚动就让它看得见：一条统一风格的细滚动条比"藏起来"更有助于发现还有历史 */}
      <div className="flex-1 overflow-y-auto py-1">
        {sorted.map((conversation) => {
          const active = conversation.id === activeId
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={active ? 'true' : undefined}
              className={[
                'block w-full px-3 py-2 text-left transition-colors duration-200',
                // 选中态用浅底而不是彩色描边：整列都是同一种东西，颜色会把它变成"警告"
                active ? 'bg-ink/8' : 'hover:bg-ink/5',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={[
                    'min-w-0 flex-1 truncate text-body',
                    active ? 'font-bold text-ink' : 'text-ink',
                  ].join(' ')}
                >
                  {titleOf(conversation, courseTitles)}
                </span>
                <span className="shrink-0 text-micro text-ink-faint">
                  {formatStamp(conversation.updatedAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-small text-ink-soft">{previewOf(conversation)}</p>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

/**
 * 主对话永远排第一，其余按"最近聊过"倒序。
 *
 * 主对话是用户的默认落点（大部分话都与课程无关），把它固定在最上面，
 * 位置就不会因为某天多聊了两句课程而跳走。
 */
function compareConversations(a: Conversation, b: Conversation): number {
  const aMain = a.courseId ? 1 : 0
  const bMain = b.courseId ? 1 : 0
  if (aMain !== bMain) return aMain - bMain
  return b.updatedAt.localeCompare(a.updatedAt)
}

/** 课程对话显示课程名（课程被删掉时退回原来存的标题） */
function titleOf(conversation: Conversation, courseTitles: Map<Id, string>): string {
  if (!conversation.courseId) return MAIN_CONVERSATION_TITLE
  return courseTitles.get(conversation.courseId) ?? conversation.title
}

/** 最后一条消息的预览；只有摘要（还没有消息）时退回摘要 */
function previewOf(conversation: Conversation): string {
  const last = conversation.messages.at(-1)
  if (last) {
    const role = last.role === 'user' ? '我：' : ''
    return role + last.content.replace(/\s+/g, ' ').trim()
  }
  if (conversation.summary) return conversation.summary.replace(/\s+/g, ' ').trim()
  return '还没有消息'
}

/**
 * 时间戳按"人认时间的方式"显示：今天只给时分，昨天给「昨天」，
 * 更早给日期。全都写成完整日期反而看不出"这场是不是刚才聊的"。
 */
function formatStamp(iso: string): string {
  const at = dayjs(iso)
  if (!at.isValid()) return ''
  if (at.isSame(dayjs(), 'day')) return at.format('HH:mm')
  if (at.isSame(dayjs().subtract(1, 'day'), 'day')) return '昨天'
  if (at.isSame(dayjs(), 'year')) return at.format('M/D')
  return at.format('YY/M/D')
}

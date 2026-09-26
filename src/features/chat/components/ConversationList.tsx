import { dayjs } from '@/lib/date'
import type { Conversation, Id } from '@/types/models'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: Id | null
  onSelect: (id: Id) => void
  onCreate: () => void
}

/**
 * 对话列表。
 *
 * 存在的理由：原来切换历史对话只有一个 `<select>`，列表里的每一项只有标题 ——
 * 想知道"上一次那场聊到哪了"必须逐个点开看。微信、豆包这类聊天工具的做法是
 * 把历史摆成常驻的一列：标题 + 最后一句 + 时间，一眼扫过去就能认出来该点哪个。
 *
 * 排序按 `updatedAt` 倒序而不是数组顺序：数组是"创建顺序"，
 * 而用户找的是"最近聊过的那场"（刚回过消息的旧对话必须浮到最上面）。
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
}: ConversationListProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line-soft bg-raised">
      <div className="border-b border-line-soft p-2">
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={onCreate}>
          新对话
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto py-1">
        {sorted.length === 0 ? (
          <p className="px-3 py-6 text-center text-small leading-relaxed text-ink-faint">
            还没有对话
            <br />
            问一句就开始了
          </p>
        ) : (
          sorted.map((conversation) => {
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
                    {conversation.title}
                  </span>
                  <span className="shrink-0 text-micro text-ink-faint">
                    {formatStamp(conversation.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-small text-ink-soft">
                  {previewOf(conversation)}
                </p>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
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

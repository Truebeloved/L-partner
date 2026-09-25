import { PersonaAvatar } from '@/components/PersonaAvatar'
import { MarkdownLite } from '@/features/chat/components/MarkdownLite'
import type { ChatMessage, Persona } from '@/types/models'

interface MessageBubbleProps {
  message: ChatMessage
  persona: Persona | undefined
}

/**
 * 对话气泡。
 *
 * 单色系统里没有"品牌色"可用，所以两种角色靠**明度反转**区分：
 * 用户是黑底白字，学伴是白底黑字 + 一道浅边。
 * 这比原来的双色方案其实更清楚 —— 明度差是比色相差更强的前景/背景信号，
 * 且在灰度打印或色觉障碍下依然成立。
 */
export function MessageBubble({ message, persona }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-sm bg-ink px-4 py-2.5 text-body leading-relaxed whitespace-pre-wrap text-ink-inverse">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <PersonaAvatar value={persona?.avatar} size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-small text-ink-faint">{persona?.name ?? '学伴'}</div>
        <div
          className={
            message.failed
              ? 'rounded-card rounded-tl-sm border border-alert bg-alert-soft px-4 py-2.5 text-body leading-relaxed text-alert'
              : 'rounded-card rounded-tl-sm border border-line-soft bg-raised px-4 py-2.5 text-body leading-relaxed text-ink'
          }
        >
          {message.content === '' ? (
            <span className="inline-flex gap-1">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
          ) : (
            <MarkdownLite source={message.content} />
          )}
        </div>
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-bounce rounded-pill bg-ink-faint"
      style={{ animationDelay: delay }}
    />
  )
}

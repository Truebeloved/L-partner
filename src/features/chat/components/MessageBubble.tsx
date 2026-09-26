import { PersonaAvatar } from '@/components/PersonaAvatar'
import { MarkdownLite } from '@/features/chat/components/MarkdownLite'
import type { ChatMessage, Persona } from '@/types/models'

interface MessageBubbleProps {
  message: ChatMessage
  persona: Persona | undefined
  /**
   * 正在被交接动画"顶替"的消息：它此刻由影子气泡代表，
   * 所以自己先隐形，等影子落地再淡入 —— 否则同一句话会同时出现在两处。
   */
  hidden?: boolean
}

/**
 * 对话气泡。
 *
 * 单色系统里没有"品牌色"可用，所以两种角色靠**明度反转**区分：
 * 用户是黑底白字，学伴是白底黑字 + 一道浅边。
 * 这比原来的双色方案其实更清楚 —— 明度差是比色相更强的前景/背景信号，
 * 且在灰度打印或色觉障碍下依然成立。
 *
 * `data-chat-message` / `data-message-id` 是给交接动画定位用的锚点。
 */
export function MessageBubble({ message, persona, hidden = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const fade = `transition-opacity duration-[280ms] ease-glide ${hidden ? 'opacity-0' : 'opacity-100'}`

  if (isUser) {
    return (
      <div
        data-chat-message="user"
        data-message-id={message.id}
        className={`flex justify-end ${fade}`}
      >
        <div className="max-w-[85%] rounded-card rounded-br-sm bg-ink px-4 py-2.5 text-body leading-relaxed whitespace-pre-wrap text-ink-inverse">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div
      data-chat-message="assistant"
      data-message-id={message.id}
      className={`flex gap-2.5 ${fade}`}
    >
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

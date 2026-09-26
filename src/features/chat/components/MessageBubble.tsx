import { PersonaAvatar } from '@/components/PersonaAvatar'
import { MarkdownLite } from '@/features/chat/components/MarkdownLite'
import { usePersonaStore } from '@/store/personas'
import type { ChatMessage, Persona } from '@/types/models'

interface MessageBubbleProps {
  message: ChatMessage
  /** 当前角色：这条回答没记下是谁说的时才用它（老数据） */
  persona: Persona | undefined
}

/**
 * 对话气泡。
 *
 * 单色系统里没有"品牌色"可用，所以两种角色靠**明度反转**区分：
 * 用户是黑底白字，学伴是白底黑字 + 一道浅边。
 * 这比原来的双色方案其实更清楚 —— 明度差是比色相更强的前景/背景信号，
 * 且在灰度打印或色觉障碍下依然成立。
 *
 * 两种气泡都是**跟着内容走**的宽度，不是等宽的长条。
 *
 * ⚠️ 每条回答用**它自己那个角色**来渲染（message.personaId），
 * 而不是当前选中的角色：用户可以中途换性格接着聊，历史必须保持原样。
 */
export function MessageBubble({ message, persona }: MessageBubbleProps) {
  const personas = usePersonaStore((state) => state.personas)
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div data-chat-message="user" data-message-id={message.id} className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-sm bg-ink px-4 py-2.5 text-body leading-relaxed whitespace-pre-wrap text-ink-inverse">
          {message.content}
        </div>
      </div>
    )
  }

  // 角色被删掉时退回当前角色：宁可显示成现在这位，也不要留一个空白署名
  const speaker = message.personaId
    ? personas.find((item) => item.id === message.personaId)
    : undefined
  const shown = speaker ?? persona

  /*
   * 学伴气泡要**跟着内容走**。
   *
   * 之前这里是 `flex-1`（撑满剩余宽度），于是不管回答只有一句还是十句，
   * 气泡都是恒定极长的一条 —— 短回答看起来像一块空荡荡的板子。
   * 关键改动是去掉 flex-1、只留 `min-w-0`：flex 项默认不放大，
   * 宽度就取内容的自然宽度，而 `min-w-0` 允许它在长回答时正常换行、不超过可用宽度。
   * 用户气泡本来就是这样（max-w-[85%] 的收缩宽度），两边现在一致。
   */
  return (
    <div data-chat-message="assistant" data-message-id={message.id} className="flex gap-2.5">
      <PersonaAvatar value={shown?.avatar} size={28} className="mt-0.5" />
      <div className="min-w-0">
        <div className="mb-1 text-small text-ink-faint">{shown?.name ?? '学伴'}</div>
        <div
          className={
            message.failed
              ? 'w-fit max-w-full rounded-card rounded-tl-sm border border-alert bg-alert-soft px-4 py-2.5 text-body leading-relaxed text-alert'
              : 'w-fit max-w-full rounded-card rounded-tl-sm border border-line-soft bg-raised px-4 py-2.5 text-body leading-relaxed text-ink'
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

import { MarkdownLite } from '@/features/chat/components/MarkdownLite'
import type { ChatMessage, Persona } from '@/types/models'

interface MessageBubbleProps {
  message: ChatMessage
  persona: Persona | undefined
}

export function MessageBubble({ message, persona }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-xl leading-none">{persona?.avatar ?? '🤖'}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-slate-400">{persona?.name ?? '学伴'}</div>
        <div
          className={
            message.failed
              ? 'rounded-2xl rounded-tl-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm leading-relaxed text-red-700'
              : 'rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-700'
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
      className="inline-block size-1.5 animate-bounce rounded-full bg-slate-400"
      style={{ animationDelay: delay }}
    />
  )
}

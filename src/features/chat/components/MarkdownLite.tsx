import type { ReactNode } from 'react'

/**
 * 极简 Markdown 渲染。
 *
 * 刻意不引入 markdown-it / react-markdown 这类依赖：模型回复里真正高频出现的只有
 * 代码块、行内代码、加粗和列表，为这四样东西引入一个几百 KB 的解析器不划算，
 * 而且流式输出时半截的 Markdown 语法很容易让重量级解析器渲染出闪烁的中间态。
 *
 * 支持范围之外的内容会原样显示，不会丢失信息。
 */
export function MarkdownLite({ source }: { source: string }) {
  const blocks = parseBlocks(source)
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-sm bg-ink px-3.5 py-3 font-mono text-small leading-relaxed text-ink-inverse"
          >
            <code>{block.content}</code>
          </pre>
        ) : (
          <div key={index} className="space-y-1.5">
            {renderTextBlock(block.content)}
          </div>
        ),
      )}
    </div>
  )
}

type Block = { type: 'code'; content: string } | { type: 'text'; content: string }

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  const fence = /```[^\n]*\n?([\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(source)) !== null) {
    if (match.index > cursor) {
      blocks.push({ type: 'text', content: source.slice(cursor, match.index) })
    }
    blocks.push({ type: 'code', content: (match[1] ?? '').replace(/\n$/, '') })
    cursor = fence.lastIndex
  }

  if (cursor < source.length) {
    blocks.push({ type: 'text', content: source.slice(cursor) })
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: source }]
}

function renderTextBlock(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let listBuffer: string[] = []

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return
    nodes.push(
      <ul key={key} className="ml-4 list-disc space-y-0.5">
        {listBuffer.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2))
      return
    }

    flushList(`list-${index}`)

    if (trimmed === '') return

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      nodes.push(
        <p key={index} className="font-bold text-ink">
          {renderInline(heading[2] ?? '')}
        </p>,
      )
      return
    }

    nodes.push(<p key={index}>{renderInline(trimmed)}</p>)
  })

  flushList('list-end')
  return nodes
}

/** 处理 `行内代码` 与 **加粗** */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded-sm bg-ink/5 px-1 py-0.5 font-mono text-ink">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={index}>{part}</span>
  })
}

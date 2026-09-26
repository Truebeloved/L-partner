import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import { stepExchange, toExchanges } from '@/features/assistant/exchanges'
import { useChatSessionContext } from '@/features/chat/context'
import { usePersonaStore } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'

/**
 * 学伴输入条 —— 全应用唯一的 AI 入口。
 *
 * 它不是「另一块对话区域」，而是一条**常驻的长条**：平时是输入框，
 * 发问之后当场变成一对气泡（回答在左、提问在右），长回答向下覆盖页面内容，
 * 答完停一会再自己收成长条。设计意图是"AI 随时在手边，但不占地方"。
 *
 * 几个关键取舍：
 * - **和「学伴对话」页共用同一场对话**（同一个 store、同一份上下文），
 *   所以这里问过的问题切到对话页能接着聊，也不会为同一段上下文付两次钱。
 * - **回答展开时向下覆盖，而不是撑开页面**：输入条常驻在页面顶部，
 *   如果它一展开就把正文推下去，用户读到一半的位置会被挤走 —— 那是最让人烦的一种动效。
 * - 滚动**只在有条目可翻时才拦**，否则页面滚动会莫名其妙失灵。
 */
export type AssistantBarVariant = 'primary' | 'secondary'

interface AssistantBarProps {
  /**
   * 一级 / 二级界面用的两档尺寸。
   * 面积不同（二级更大），但**右边缘始终对齐** —— 一级的右边缘就是窗口右边缘
   * （侧栏在左边），二级全屏，所以两边其实是同一条竖线。
   */
  variant?: AssistantBarVariant
}

/** 回答展开后最多占多高，超出的部分自己滚 —— 再高就把整页盖没了 */
const ANSWER_MAX_HEIGHT = '44vh'
/** 答完之后停留多久再收成长条 */
const SETTLE_MS = 3200

const SIZES: Record<AssistantBarVariant, { width: number; height: number }> = {
  primary: { width: 420, height: 40 },
  secondary: { width: 520, height: 48 },
}

export function AssistantBar({ variant = 'primary' }: AssistantBarProps) {
  const session = useChatSessionContext()
  const settings = useSettingsStore((state) => state.settings)
  const personas = usePersonaStore((state) => state.personas)
  const persona = useMemo(
    () => personas.find((item) => item.id === settings.activePersonaId) ?? personas[0],
    [personas, settings.activePersonaId],
  )

  const size = SIZES[variant]
  const exchanges = useMemo(() => toExchanges(session.messages), [session.messages])
  const total = exchanges.length

  const [draft, setDraft] = useState('')
  /** true = 正在输入（长条显示输入框）；false = 显示问答气泡 */
  const [composing, setComposing] = useState(true)
  /** 当前停在那一对问答上；null 表示最新一对 */
  const [focused, setFocused] = useState<number | null>(null)
  /** 回答是否向下展开 */
  const [answerOpen, setAnswerOpen] = useState(false)
  /** 提问是否横向展开（展开时回答让位并收成缩略） */
  const [questionOpen, setQuestionOpen] = useState(false)
  /**
   * 「答完自动收起」是否生效。
   *
   * 只有**刚答完**的那一次该自动收：用户自己点开来看的回答、或者正在滚轮翻看的记录，
   * 3 秒后自己缩回去会非常讨厌 —— 那等于用户看什么由计时器决定，而不是由他决定。
   */
  const [autoSettle, setAutoSettle] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)

  const index = focused ?? Math.max(0, total - 1)
  const exchange = total > 0 ? exchanges[index] : undefined
  const composingNow = composing || total === 0
  // 提问展开时回答收成缩略 —— 这是"挤压"的语义，不是隐藏
  const answerExpanded = answerOpen && !questionOpen
  const streaming = session.streaming

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setComposing(false)
    setAnswerOpen(true)
    setQuestionOpen(false)
    setFocused(null)
    setAutoSettle(true)
    void session.send(text)
  }, [draft, session])

  /*
   * 答完停留一会再收成长条。
   * 退场用定时器而不是在 effect 里同步 setState —— 后者会触发级联渲染，
   * 而且"停留一会"本来就需要一个计时器。
   */
  useEffect(() => {
    if (!autoSettle || composingNow || streaming || !answerOpen) return
    const timer = window.setTimeout(() => {
      setAnswerOpen(false)
      setAutoSettle(false)
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [autoSettle, composingNow, streaming, answerOpen])

  /*
   * 滚轮翻历史。
   *
   * 必须用原生监听器才能 preventDefault —— React 的 onWheel 挂在根节点上且是 passive 的，
   * 在里面调 preventDefault 不生效，页面会一边翻记录一边滚走。
   * 另外只在**真的翻得动**的时候才拦，否则用户会发现鼠标停在这条上就滚不动页面了。
   */
  useEffect(() => {
    const node = rootRef.current
    if (!node || composingNow || total <= 1) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return

      /*
       * 回答本身滚得动的时候，滚轮要归它 —— 否则长回答的结尾永远看不到：
       * 用户想往下读，滚轮却在翻历史记录。只有滚到边界了才交给翻历史。
       */
      const scroller = (event.target as HTMLElement | null)?.closest(
        '[data-assistant-scroll]',
      ) as HTMLElement | null
      if (scroller) {
        const scrollingDown =
          event.deltaY > 0 && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
        const scrollingUp = event.deltaY < 0 && scroller.scrollTop > 1
        if (scrollingDown || scrollingUp) return
      }

      const next = stepExchange(focused, total, event.deltaY < 0 ? 'up' : 'down')
      if (next === null) return
      event.preventDefault()
      setFocused(next)
      // 翻到的每一条都先展示回答内容、提问收成缩略；既然是用户主动在翻，就不该由计时器收起
      setAnswerOpen(true)
      setQuestionOpen(false)
      setAutoSettle(false)
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [composingNow, total, focused])

  const canBrowse = !composingNow && total > 1

  return (
    <div
      ref={rootRef}
      className="relative"
      style={{ width: size.width }}
      // 展开的回答从这一层向**下**溢出，压住页面内容而不是把它推走
      data-assistant-bar={variant}
    >
      <div
        className={[
          'flex gap-2 rounded-card bg-raised shadow-lift',
          // 输入态里三个元素高度不同，要居中对齐；气泡态里回答会变高，顶部对齐才不会看着歪
          composingNow ? 'items-center' : 'items-start',
        ].join(' ')}
        style={{ minHeight: size.height }}
      >
        {composingNow ? (
          <Composer
            draft={draft}
            height={size.height}
            personaName={persona?.name ?? '学伴'}
            onChange={setDraft}
            onSubmit={submit}
            disabled={streaming}
          />
        ) : (
          <>
            {/* 回答：从左侧长出来。展开时容器变高，答案向下覆盖页面 */}
            <div
              className="min-w-0 flex-1 transition-[flex-grow] duration-300 ease-out"
              style={{ flexGrow: questionOpen ? 1 : 4 }}
            >
              <AnswerBubble
                text={exchange?.answer ?? ''}
                open={answerExpanded}
                streaming={streaming}
                onToggle={() => {
                  setAnswerOpen((value) => !value)
                  setAutoSettle(false)
                }}
              />
            </div>

            {/* 提问：压缩在右侧，缩略成省略号；点一下横向生长、把回答挤成缩略 */}
            <div
              className="min-w-0 transition-[flex-grow] duration-300 ease-out"
              style={{ flexGrow: questionOpen ? 5 : 1.6, maxWidth: questionOpen ? '70%' : '42%' }}
            >
              <QuestionBubble
                text={exchange?.question ?? ''}
                open={questionOpen}
                onToggle={() => {
                  setQuestionOpen((value) => !value)
                  setAnswerOpen(false)
                  setAutoSettle(false)
                }}
              />
            </div>

            <NewQuestionButton
              onClick={() => {
                setComposing(true)
                setQuestionOpen(false)
                setAnswerOpen(false)
                setAutoSettle(false)
              }}
            />
          </>
        )}
      </div>

      {/* 翻历史时的位置提示：一行小字比一个滚动条更省地方，也不会在 3 秒后留下残影 */}
      {canBrowse && !composingNow && (
        <div className="pointer-events-none absolute -bottom-5 right-1 text-micro text-ink-faint tabular">
          {index + 1} / {total} · 滚轮翻看
        </div>
      )}

      {session.error && (
        <div className="absolute top-full right-0 mt-2 w-full rounded-card border border-alert/40 bg-raised px-3 py-2 shadow-lift">
          <p className="text-small font-bold text-alert">{session.error.message}</p>
          {session.error.hint && (
            <p className="mt-1 text-micro leading-relaxed text-alert">{session.error.hint}</p>
          )}
          {!settings.llm.apiKey && (
            <Link to="/settings" className="btn btn-secondary btn-sm mt-2">
              去设置里填写
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** 输入态：一条细长输入框 + 发送键 */
function Composer({
  draft,
  height,
  personaName,
  onChange,
  onSubmit,
  disabled,
}: {
  draft: string
  height: number
  personaName: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
}) {
  return (
    <>
      <input
        className="min-w-0 flex-1 bg-transparent px-4 text-body text-ink outline-none placeholder:text-ink-faint"
        style={{ height }}
        value={draft}
        placeholder={`问问${personaName}…`}
        aria-label="问学伴"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <button
        type="button"
        className="mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-pill transition-all duration-200 ease-out disabled:opacity-30"
        style={{
          background: draft.trim() ? 'var(--color-ink)' : 'transparent',
          color: draft.trim() ? 'var(--color-ink-inverse)' : 'var(--color-ink-faint)',
        }}
        aria-label="发送"
        disabled={!draft.trim() || disabled}
        onClick={onSubmit}
      >
        <Icon name="send" size={15} />
      </button>
    </>
  )
}

/**
 * 回答气泡。
 *
 * 两层的做法值得说明：展开态放**全文**（`pre-wrap`，撑高容器），
 * 收起态放**同一段文字**但用 `truncate`（一行 + 真正的 CSS 省略号），绝对定位盖在首行位置，
 * 两层之间淡入淡出。这样做的原因有两个：
 * - 高度由「外层 max-height 过渡 + 全文层」驱动，收起动画是真的在缩，而不是文字瞬间变短；
 * - 省略号是浏览器画的，不用自己去截字符串 —— 手写截断还得算"多少个字放得下一行"，
 *   而那一行有多宽取决于 flex 挤压后的实际宽度，根本算不准。
 */
function AnswerBubble({
  text,
  open,
  streaming,
  onToggle,
}: {
  text: string
  open: boolean
  streaming: boolean
  onToggle: () => void
}) {
  if (!text) {
    return (
      <div className="flex items-center rounded-card bg-ink/10 px-3" style={{ minHeight: 40 }}>
        <span className="text-small text-ink-faint">{streaming ? '正在想…' : '（没有回答）'}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      data-assistant-answer
      className="block w-full rounded-card bg-ink/10 px-3 py-2 text-left transition-colors duration-200 ease-out hover:bg-ink/15"
      style={{ minHeight: 40 }}
      onClick={onToggle}
      title={open ? '收起回答' : '展开完整回答'}
      aria-expanded={open}
    >
      <div
        className="relative overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: open ? ANSWER_MAX_HEIGHT : '1.5em' }}
      >
        <p
          data-assistant-scroll
          className={[
            'text-body leading-snug whitespace-pre-wrap text-ink transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0',
            // 展开后超出上限时自己滚，不然长回答会被硬生生切掉
            open ? 'max-h-[44vh] overflow-y-auto' : '',
          ].join(' ')}
        >
          {text}
          {streaming && <span className="ml-0.5 animate-pulse">▍</span>}
        </p>
        <p
          className={[
            'absolute inset-x-0 top-0 truncate text-body leading-snug text-ink transition-opacity duration-200',
            open ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          aria-hidden={open}
        >
          {text}
        </p>
      </div>
    </button>
  )
}

/** 提问气泡：右侧、缩略成省略号；点一下横向展开、把回答挤成缩略 */
function QuestionBubble({
  text,
  open,
  onToggle,
}: {
  text: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-assistant-question
      className="block w-full rounded-card bg-ink px-3 py-2 text-left text-ink-inverse transition-opacity duration-200 ease-out hover:opacity-90"
      style={{ minHeight: 40 }}
      onClick={onToggle}
      title={open ? '收起提问' : '展开提问'}
      aria-expanded={open}
    >
      <div
        className="relative overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: open ? '10em' : '1.5em' }}
      >
        <p
          className={[
            'text-body leading-snug break-words whitespace-pre-wrap transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          {text}
        </p>
        <p
          className={[
            'absolute inset-x-0 top-0 truncate text-body leading-snug transition-opacity duration-200',
            open ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          aria-hidden={open}
        >
          {text}
        </p>
      </div>
    </button>
  )
}

/** 回到输入态。收起之后要能马上接着问，这个入口必须一直在 */
function NewQuestionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-pill text-ink-soft transition-all duration-200 ease-out hover:bg-ink/10 hover:text-ink"
      onClick={onClick}
      aria-label="问新问题"
      title="问新问题"
    >
      <Icon name="plus" size={15} />
    </button>
  )
}

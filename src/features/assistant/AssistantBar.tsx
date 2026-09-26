import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import { stepExchange, toExchanges } from '@/features/assistant/exchanges'
import { DOCK_METRICS } from '@/features/assistant/dock'
import type { DockPlacement } from '@/features/assistant/dock'
import { useChatSessionContext } from '@/features/chat/context'
import { usePersonaStore } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'

/**
 * 学伴输入条 —— 全应用唯一的 AI 入口。
 *
 * 它不是「另一块对话区域」，而是一条**长条**：平时是输入框，
 * 发问之后当场变成一对气泡（回答在左、提问在右），长回答向下覆盖页面内容，
 * 答完停一会再自己收成长条。设计意图是"AI 随时在手边，但不占地方"。
 *
 * 几个关键取舍：
 * - **和「学伴对话」页共用同一场对话**（同一个 store、同一份上下文），
 *   所以这里问过的问题切到对话页能接着聊，也不会为同一段上下文付两次钱。
 * - **回答展开时向下覆盖，而不是撑开页面**：如果它一展开就把正文推下去，
 *   用户读到一半的位置会被挤走 —— 那是最让人烦的一种动效。
 * - **组件本身不管自己在哪里**：位置由 dock（见 dock.tsx）量出来贴上去，
 *   这样换页时它是位移与生长，而不是卸载再挂载。
 * - 滚动**只在有条目可翻时才拦**，否则页面滚动会莫名其妙失灵。
 */
export interface AssistantBarProps {
  /**
   * 停靠位。决定要不要显示气泡、以及尺寸：
   * - top / top-wide：顶部两档，发问后显示一问一答两个气泡
   * - bottom：对话页底部，整页已经是对话区，这里只当输入框
   */
  placement: DockPlacement
}

/** 回答展开后最多占多高，超出的部分自己滚 —— 再高就把整页盖没了 */
const ANSWER_MAX_HEIGHT = '40vh'
/** 答完之后停留多久再收成长条 */
const SETTLE_MS = 3200

/**
 * 发送时的形变分两拍：
 * 第一拍让提问气泡以"输入框的样子"占满整条，第二拍（下一帧）它压缩到右侧变成气泡，
 * 同时回答从左边长出来。
 *
 * 为什么必须分两拍：CSS 过渡要有起始值。如果直接渲染成"右侧小气泡"，
 * 浏览器第一帧看到的就是终态，没有任何东西可以过渡 —— 那就成了瞬间切换，
 * 也就是"看起来根本没做动画"。
 */
const MORPH_MS = 460

export function AssistantBar({ placement }: AssistantBarProps) {
  const session = useChatSessionContext()
  const settings = useSettingsStore((state) => state.settings)
  const personas = usePersonaStore((state) => state.personas)
  const persona = useMemo(
    () => personas.find((item) => item.id === settings.activePersonaId) ?? personas[0],
    [personas, settings.activePersonaId],
  )

  const height = DOCK_METRICS[placement].height
  /** 对话页：整页就是对话区，这里只做输入，气泡交给页面 */
  const inputOnly = placement === 'bottom'

  const exchanges = useMemo(() => toExchanges(session.messages), [session.messages])
  const total = exchanges.length

  const [draft, setDraft] = useState('')
  /** true = 正在输入（长条显示输入框）；false = 显示问答气泡 */
  const [composing, setComposing] = useState(true)
  /**
   * 形变第一拍：提问气泡先以"输入框的样子"占满整条，下一帧再压缩到右侧。
   * 没有这一拍就没有过渡的起始值，动效会变成瞬间切换。
   */
  const [morphing, setMorphing] = useState(false)
  /**
   * 没配置大模型时，这一问不会被写进会话（store 不该留下没人回答的问题）。
   * 但**动效和反馈都要照常**：提问照样成气泡、回答侧照样长出来，里面写清楚去哪配置。
   * 之前的做法是直接弹一条错误、什么都不动 —— 从用户视角看就是"发出去没反应"。
   */
  const [localAnswer, setLocalAnswer] = useState<{ question: string; answer: string } | null>(null)
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
  const storeExchange = total > 0 ? exchanges[index] : undefined
  // 本地那一问（没配 key）优先显示，它还没进会话
  const exchange = localAnswer
    ? { id: 'local', question: localAnswer.question, answer: localAnswer.answer, at: '' }
    : storeExchange
  const composingNow = inputOnly || (composing && !localAnswer) || (!localAnswer && total === 0)
  // 提问展开时回答收成缩略 —— 这是"挤压"的语义，不是隐藏
  const answerExpanded = !inputOnly && answerOpen && !questionOpen
  const streaming = session.streaming

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setComposing(false)
    setQuestionOpen(false)
    setFocused(null)

    const configured = Boolean(
      settings.llm.baseUrl.trim() && settings.llm.apiKey.trim() && settings.llm.model.trim(),
    )

    if (!configured) {
      // 先把这一问摆出来（动效照常），回答侧给出可执行的下一步
      setLocalAnswer({
        question: text,
        answer: '还没接入大模型，所以我还答不了。到「设置 → 大模型接入」填上 API 地址和密钥，就能接着聊了。',
      })
      setAnswerOpen(true)
      setMorphing(true)
      window.setTimeout(() => setMorphing(false), 16)
      setAutoSettle(false)
      return
    }

    setLocalAnswer(null)
    setAnswerOpen(true)
    setMorphing(true)
    setAutoSettle(!inputOnly)
    // 下一帧解除形变第一拍，压缩 + 生长才有得过渡
    window.setTimeout(() => setMorphing(false), 16)
    void session.send(text)
  }, [draft, session, inputOnly, settings.llm])

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
    <div ref={rootRef} className="relative w-full" data-assistant-bar={placement}>
      {/*
        这一行**没有自己的背景**：页面上看到的就是两个气泡（回答浅、提问深），
        不是"一块白卡片里装着两个气泡"。输入态时背景留给输入框本身。
      */}
      <div
        className={['flex gap-2', composingNow ? 'items-center' : 'items-start'].join(' ')}
        style={{ minHeight: height }}
      >
        {composingNow ? (
          <Composer
            draft={draft}
            height={height}
            personaName={persona?.name ?? '学伴'}
            streaming={streaming}
            onChange={setDraft}
            onSubmit={submit}
            onStop={session.stop}
          />
        ) : (
          <>
            {/*
              回答：从左侧长出来。形变第一拍时它还没有宽度（maxWidth 0 + 透明），
              第二拍才撑开 —— 于是看到的是"回答从左边慢慢长出来"，而不是"啪"地出现。
              展开时容器变高，答案向下覆盖页面。
            */}
            <div
              className="min-w-0 transition-all ease-spring"
              style={{
                flexGrow: morphing ? 0 : questionOpen ? 1 : 4,
                maxWidth: morphing ? '0%' : '100%',
                opacity: morphing ? 0 : 1,
                transitionDuration: `${MORPH_MS}ms`,
              }}
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

            {/*
              提问：压缩在右侧，缩略成省略号；点一下横向生长、把回答挤成缩略。
              形变第一拍它先占满整条、并保持输入框的样式 ——
              用户看到的就是"刚才打的那行字"，第二拍才滑到右边、收成气泡。
            */}
            <div
              className="min-w-0 transition-all ease-spring"
              style={{
                flexGrow: questionOpen ? 5 : morphing ? 0 : 1.6,
                maxWidth: questionOpen ? '70%' : morphing ? '100%' : '42%',
                transitionDuration: `${MORPH_MS}ms`,
              }}
            >
              <QuestionBubble
                text={exchange?.question ?? ''}
                open={questionOpen}
                morphing={morphing}
                onToggle={() => {
                  setQuestionOpen((value) => !value)
                  setAnswerOpen(false)
                  setAutoSettle(false)
                }}
              />
            </div>

            <NewQuestionButton
              hidden={morphing}
              onClick={() => {
                setComposing(true)
                setQuestionOpen(false)
                setAnswerOpen(false)
                setAutoSettle(false)
                setLocalAnswer(null)
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

/**
 * 输入态：一条长条输入框。
 *
 * 只有它带背景 —— 长条本身要看起来"可以打字"，而气泡不需要外框。
 * 流式输出时把发送键换成「停止」，对话页尤其需要：那一页本来就有停止按钮的位置。
 */
function Composer({
  draft,
  height,
  personaName,
  streaming,
  onChange,
  onSubmit,
  onStop,
}: {
  draft: string
  height: number
  personaName: string
  streaming: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
}) {
  return (
    <div
      className="flex w-full items-center rounded-pill bg-raised pl-5 pr-1.5 transition-shadow duration-200 ease-out focus-within:shadow-lift"
      style={{ height }}
    >
      <input
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
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
      {streaming ? (
        <button
          type="button"
          className="shrink-0 rounded-pill px-3 text-small text-ink-soft transition-colors duration-200 hover:text-ink"
          onClick={onStop}
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-pill transition-all duration-200 ease-out disabled:opacity-30"
          style={{
            background: draft.trim() ? 'var(--color-ink)' : 'transparent',
            color: draft.trim() ? 'var(--color-ink-inverse)' : 'var(--color-ink-faint)',
          }}
          aria-label="发送"
          disabled={!draft.trim()}
          onClick={onSubmit}
        >
          <Icon name="send" size={16} />
        </button>
      )}
    </div>
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
      <div className="flex items-center rounded-card bg-raised px-4" style={{ minHeight: 40 }}>
        <span className="text-small text-ink-faint">{streaming ? '正在想…' : '（没有回答）'}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      data-assistant-answer
      /*
       * 气泡底色必须是**不透明**的：展开时它会盖住页面内容，
       * 半透明会把下面的标题、书脊透出来，字叠着字根本读不了。
       * hover 只加一层浅阴影，不再改底色 —— 改底色就等于把它又变透明了。
       */
      className="block w-full rounded-card bg-raised px-4 py-2 text-left transition-shadow duration-200 ease-out hover:shadow-lift"
      style={{ minHeight: 40 }}
      onClick={onToggle}
      title={open ? '收起回答' : '展开完整回答'}
      aria-expanded={open}
    >
      <div
        className="relative overflow-hidden transition-[max-height] duration-[420ms] ease-spring"
        style={{ maxHeight: open ? ANSWER_MAX_HEIGHT : '1.5em' }}
      >
        <p
          data-assistant-scroll
          className={[
            'no-scrollbar text-body leading-snug whitespace-pre-wrap text-ink transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0',
            // 展开后超出上限时自己滚，不然长回答会被硬生生切掉。
            // 滚动条隐藏（no-scrollbar）：这条长条上挂一根系统滚动条比"看不到结尾"更破坏观感
            open ? 'max-h-[40vh] overflow-y-auto' : '',
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

/**
 * 提问气泡：右侧、缩略成省略号；点一下横向展开、把回答挤成缩略。
 *
 * `morphing` 是发送后的第一拍：此时它**先以输入框的样子**占满整条
 * （浅底、圆角、文字在左），下一拍才滑到右边、收成深色气泡。
 * 用户看到的因此是"我刚打的那行字变成气泡滑过去了"，而不是"输入框消失、气泡凭空出现"。
 */
function QuestionBubble({
  text,
  open,
  morphing,
  onToggle,
}: {
  text: string
  open: boolean
  morphing: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-assistant-question
      className={[
        'block w-full px-4 py-2 text-left',
        'transition-[background-color,color,border-radius] duration-[380ms] ease-spring',
        morphing
          ? 'rounded-pill bg-raised text-ink'
          : 'rounded-card bg-ink text-ink-inverse hover:opacity-90',
      ].join(' ')}
      style={{ minHeight: 40 }}
      onClick={onToggle}
      title={open ? '收起提问' : '展开提问'}
      aria-expanded={open}
    >
      <div
        className="relative overflow-hidden transition-[max-height] duration-[420ms] ease-spring"
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
function NewQuestionButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={[
        'mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-pill text-ink-soft',
        'transition-[opacity,background-color,color] duration-300 ease-out hover:bg-ink/10 hover:text-ink',
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100',
      ].join(' ')}
      onClick={onClick}
      aria-label="问新问题"
      title="问新问题"
    >
      <Icon name="plus" size={16} />
    </button>
  )
}

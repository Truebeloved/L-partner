import { useEffect, useRef, useState } from 'react'

/** 两屏文字 + 收尾淡出 */
type Phase = 'greeting' | 'question' | 'leaving'

/** 每屏的停留时长（毫秒）。改这里就能调节奏，不用碰结构 */
const GREETING_HOLD = 1800
const QUESTION_HOLD = 1700
const LEAVE_DURATION = 650

interface SplashScreenProps {
  /** 开屏称呼。桌面端取计算机名，浏览器调试时回退成「同学」 */
  name: string
  onDone: () => void
}

/**
 * 开屏动画。
 *
 * 两屏文字：`欢迎回来，XXX` → `今天学点什么？`
 *
 * 几个刻意的设计决定：
 * - **可以随时跳过**：点击或敲任意键立刻结束。开屏再好看，第二次启动也会变成障碍。
 * - **不显示加载进度**：这里没有真实工作在进行，做进度条就是撒谎。它的定位是「迎接」，不是「加载」。
 * - **用 transform + opacity + blur 做动效**：这三样都能交给合成器，不触发重排，
 *   所以在低配机器上也是流畅的。用 width/top 之类做动画会掉帧。
 * - 底色是纯黑到深灰：与后面中灰的界面形成一次明确的「开场 → 进入」分界，
 *   而不是彩色渐变 —— 整套设计系统是单色系，开屏不该是唯一的例外。
 */
export function SplashScreen({ name, onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>('greeting')

  // 跳过和自动结束可能同时发生，用 ref 保证 onDone 只被调用一次
  const finished = useRef(false)
  const finish = useRef(onDone)

  useEffect(() => {
    finish.current = onDone
  })

  useEffect(() => {
    const done = () => {
      if (finished.current) return
      finished.current = true
      finish.current()
    }

    const timers = [
      window.setTimeout(() => setPhase('question'), GREETING_HOLD),
      window.setTimeout(() => setPhase('leaving'), GREETING_HOLD + QUESTION_HOLD),
      window.setTimeout(done, GREETING_HOLD + QUESTION_HOLD + LEAVE_DURATION),
    ]

    const skip = () => done()
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)

    return () => {
      timers.forEach(window.clearTimeout)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [])

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center overflow-hidden',
        'bg-[radial-gradient(120%_120%_at_50%_0%,#2b2b2b_0%,#141414_55%,#000000_100%)]',
        phase === 'leaving' ? 'splash-leaving' : '',
      ].join(' ')}
      role="presentation"
    >
      <div className="px-8 text-center">
        {phase === 'greeting' ? (
          // key 让这一屏每次进入都重新触发动画，而不是复用上一屏的动画状态
          <p key="greeting" className="splash-line font-display text-h1 text-ink-inverse/75">
            欢迎回来，
            <span className="font-bold text-ink-inverse">{name}</span>
          </p>
        ) : (
          <p
            key="question"
            className="splash-line font-display text-display font-bold tracking-tight text-ink-inverse"
          >
            今天学点什么？
          </p>
        )}
      </div>

      {/* 极暗的底部提示：只在不打扰的前提下告诉用户能跳过 */}
      <p className="absolute bottom-8 text-label tracking-[0.05em] text-ink-inverse/35 uppercase">
        点击任意处跳过
      </p>
    </div>
  )
}

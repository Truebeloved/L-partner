import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { onToastDismiss } from '@/lib/platform'

/**
 * 出现动画时长（毫秒）。
 * 主进程那边的总时长预算是：出现 + 停留 + 消失 = 3000ms，
 * 所以这里的取值会直接影响停留时间的长短。
 */
const ENTER_MS = 180

/**
 * 消失动画时长。
 *
 * ⚠️ 必须与 electron/main.cjs 的 `TOAST_EXIT_MS` 一致 ——
 * 主进程会提前这么久通知退场，早了动画被切断，晚了会黑屏干等。
 */
const EXIT_MS = 180

/**
 * 桌面提醒小窗的内容。
 *
 * 这是应用里唯一一个「闪一下就走」的表面，所以有几个不一样的做法：
 * - **不读任何 store**。文案由主窗口建好、经 URL 参数传进来 ——
 *   这个窗口不该为了显示两行字去等 IndexedDB 读完（见 main.tsx 的注释）。
 * - **计时由主进程掌握**。这里只负责播放动画：挂载时进场，收到退场通知时离场。
 *   两边各有一个计时器的话，总时长迟早会走偏。
 * - 整块**不可交互**（窗口本身 focusable: false），所以这里没有按钮、没有 hover 态：
 *   一条 3 秒的提示不该让用户产生"我该点哪里"的疑问。
 *
 * 视觉上刻意做得**轻**：不加图标、不加边框、字重只用 400、位移只有 6px。
 * 它是一条"路过"的提示，不是一块需要被阅读的面板 —— 存在感越低，越不会打断手上正在做的事。
 */
export function ToastView() {
  const [params] = useSearchParams()
  const title = params.get('title') ?? '今天学点什么？'
  const body = params.get('body') ?? ''

  /**
   * 三个阶段：entering（初始态）→ shown（到位）→ leaving（退场）。
   * 先以透明 + 下移的状态挂载、下一帧再切到 shown，CSS transition 才有起始值可过渡。
   */
  const [phase, setPhase] = useState<'entering' | 'shown' | 'leaving'>('entering')

  useEffect(() => {
    // 16ms ≈ 一帧：等首次绘制完成再切换，否则首帧和终态被合并成一次，动画不会播
    const enterTimer = window.setTimeout(() => setPhase('shown'), 16)
    return () => window.clearTimeout(enterTimer)
  }, [])

  useEffect(() => {
    // 主进程在销毁窗口前会发这个通知，收到就开始退场
    return onToastDismiss(() => setPhase('leaving'))
  }, [])

  return (
    <div data-toast-root className="flex h-screen w-screen items-center justify-center p-2">
      <div
        className={[
          /*
           * 桌面小窗的卡片。
           *
           * 底必须是**不透明**的：窗口是透明的，卡片再半透明就会把桌面壁纸透出来，
           * 字压在壁纸上根本读不了（以前是 bg-raised/95）。
           * 细边 + 浅阴影是为了在浅色壁纸上也有边界 —— 两者都很轻，
           * 它是一条"路过"的提示，不该有一块面板的重量。
           */
          'w-full rounded-card border border-line-soft bg-raised px-4 py-3 shadow-lift',
          'transition-[opacity,transform] ease-out',
          phase === 'shown' ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
        ].join(' ')}
        style={{ transitionDuration: `${phase === 'leaving' ? EXIT_MS : ENTER_MS}ms` }}
      >
        {/* 一行极小的来源标记：它是"谁在提醒你"，不是标题的一部分 */}
        <p className="text-micro tracking-[0.08em] text-ink-faint uppercase">L-partner</p>
        <p className="mt-1 truncate text-body leading-snug text-ink">{title}</p>
        {body && <p className="mt-0.5 truncate text-small leading-snug text-ink-soft">{body}</p>}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 桌面提醒小窗的内容。
 *
 * 这是应用里唯一一个「闪一下就走」的表面，所以有几个不一样的做法：
 * - **不读任何 store**。文案由主窗口建好、经 URL 参数传进来 ——
 *   这个窗口不该为了显示两行字去等 IndexedDB 读完（见 main.tsx 的注释）。
 * - 3 秒的计时由主进程负责，这里只管出现与退场动画。
 *   谁负责计时谁负责关闭，避免两边各有一个计时器互相打架。
 * - 整块**不可交互**（窗口本身 focusable: false），所以这里没有按钮、
 *   没有 hover 态：一条 3 秒的提示不该让用户产生"我该点哪里"的疑问。
 */
export function ToastView() {
  const [params] = useSearchParams()
  const title = params.get('title') ?? '今天学点什么？'
  const body = params.get('body') ?? ''

  // 进场：先以透明 + 下移的状态挂载，下一帧再切到正常态，才有"浮上来"的动效。
  // 直接渲染成最终态的话，CSS transition 没有起始值可以过渡。
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 16)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center p-2">
      <div
        className={[
          'flex w-full items-start gap-3 rounded-card border border-line-soft bg-raised px-4 py-3.5 shadow-pop',
          'transition-[opacity,transform] duration-200 ease-out',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        ].join(' ')}
      >
        {/* 用应用图标本身做标识，而不是另画一个钟表图标 ——
            用户一眼就知道这条提示来自哪个应用 */}
        <img src="./icon.svg" alt="" className="mt-0.5 size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug font-bold text-ink">{title}</p>
          {body && <p className="mt-1 text-small leading-snug text-ink-soft">{body}</p>}
        </div>
      </div>
    </div>
  )
}

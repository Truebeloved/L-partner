import { useEffect } from 'react'

import { useAssistantHandoff } from '@/features/assistant/handoff'
import type { GhostSpec } from '@/features/assistant/handoff'

/**
 * 交接动画的"影子层"。
 *
 * 它渲染在 fixed 层里，和输入条同级，所以不受任何页面裁剪影响。
 * 两个影子各自从起点飞到终点 —— 用 **CSS 动画**而不是过渡：
 * 起点与终点都是运行期量出来的，把它们写成 CSS 变量交给 keyframes 插值，
 * 就不需要"先渲染在起点、下一帧再改成终点"那套两拍状态（那会在 effect 里同步 setState，
 * 既触发级联渲染，也更容易出错）。动画结束由 animationend 通知上层收尾。
 *
 * 为什么要"影子"而不是直接移动真实元素：起点的气泡和终点的消息气泡是**两个不同的组件**
 * （一个在输入条里、一个在对话列表里），DOM 上没有任何连续性可以利用。
 * 复制一份视觉等价物来飞，是最简单也最稳的做法。
 */
export function AssistantHandoffLayer() {
  const { handoff, finish } = useAssistantHandoff()

  /*
   * 兜底超时：animationend 在元素被提前卸载、或动画被系统降级时可能不来，
   * 那会让两条消息**永远隐形** —— 那是最糟的失败方式，所以必须有一个硬超时兜住。
   */
  useEffect(() => {
    if (!handoff) return
    const timer = window.setTimeout(finish, 1000)
    return () => window.clearTimeout(timer)
  }, [handoff, finish])

  if (!handoff) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {handoff.ghosts.map((ghost, index) => (
        <Ghost key={`${ghost.kind}-${index}`} ghost={ghost} onDone={finish} />
      ))}
    </div>
  )
}

function Ghost({ ghost, onDone }: { ghost: GhostSpec; onDone: () => void }) {
  return (
    <div
      className={[
        'absolute overflow-hidden px-4 py-2 text-body leading-snug shadow-lift',
        'animate-[handoff-fly_420ms_var(--ease-glide)_forwards]',
        ghost.kind === 'answer'
          ? 'rounded-card bg-raised text-ink'
          : 'rounded-card bg-ink text-ink-inverse',
      ].join(' ')}
      style={
        {
          '--fly-from-top': `${ghost.from.top}px`,
          '--fly-from-left': `${ghost.from.left}px`,
          '--fly-from-width': `${ghost.from.width}px`,
          '--fly-from-height': `${ghost.from.height}px`,
          '--fly-to-top': `${ghost.to.top}px`,
          '--fly-to-left': `${ghost.to.left}px`,
          '--fly-to-width': `${ghost.to.width}px`,
          '--fly-to-height': `${ghost.to.height}px`,
        } as React.CSSProperties
      }
      onAnimationEnd={onDone}
    >
      {ghost.text}
    </div>
  )
}

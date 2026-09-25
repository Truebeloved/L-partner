interface ComingSoonProps {
  /** 说明这个模块接下来会做什么，让占位页面也有信息量 */
  note: string
}

/**
 * 未完成模块的占位。
 * 单色系统里没有"提示色"可用，所以靠虚线边框 + 字号对比来表达"此处待建"。
 */
export function ComingSoon({ note }: ComingSoonProps) {
  return (
    <div className="rounded-card border border-dashed border-line-soft bg-raised/60 px-6 py-12 text-center">
      <p className="font-display text-h3 font-bold text-ink">此模块正在开发中</p>
      <p className="hint mx-auto mt-2 max-w-md leading-relaxed">{note}</p>
    </div>
  )
}

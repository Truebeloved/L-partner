interface ComingSoonProps {
  /** 说明这个模块接下来会做什么，让占位页面也有信息量 */
  note: string
}

export function ComingSoon({ note }: ComingSoonProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="text-3xl">🚧</div>
      <p className="mt-3 text-sm font-medium text-slate-600">此模块正在开发中</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">{note}</p>
    </div>
  )
}

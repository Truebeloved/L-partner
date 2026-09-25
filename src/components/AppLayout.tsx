import { NavLink, Outlet } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
  /** 精确匹配：首页需要，否则任何路径都会点亮「今日」 */
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '今日', icon: '📅', end: true },
  { to: '/courses', label: '课程', icon: '📚' },
  { to: '/chat', label: '学伴', icon: '💬' },
  { to: '/memory', label: '记忆', icon: '🧠' },
  { to: '/personas', label: '角色', icon: '🎭' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')
}

/**
 * 应用外壳：桌面端左侧边栏，移动端底部导航。
 * 移动端用底部 tab 而不是汉堡菜单 —— 这是个高频切换的工具型应用，
 * 主导航应该一直可见。
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 桌面端侧边栏 */}
      <aside className="hidden shrink-0 border-r border-slate-200 bg-white md:flex md:w-56 md:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="text-2xl leading-none">📘</span>
          <div>
            <div className="text-sm font-semibold text-slate-900">L-partner</div>
            <div className="text-[11px] text-slate-400">你的学习搭档</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 pb-4">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 移动端顶部标题 */}
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-xl leading-none">📘</span>
        <span className="font-semibold text-slate-900">L-partner</span>
      </header>

      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">
        <Outlet />
      </main>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition',
                isActive ? 'text-brand-600' : 'text-slate-400',
              ].join(' ')
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

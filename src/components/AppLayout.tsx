import { NavLink, Outlet } from 'react-router-dom'

import { ReminderProvider } from '@/features/reminder/ReminderProvider'
import { TodaySidebarWidget } from '@/features/today/TodaySidebarWidget'

interface NavItem {
  to: string
  label: string
  icon: string
  /** 精确匹配：书架是首页，否则任何路径都会点亮它 */
  end?: boolean
  /** 次要动作（如「添加」），在视觉上与浏览类入口区分开 */
  action?: boolean
}

/**
 * 一级界面的索引栏目。
 *
 * ⚠️ 这是**过渡期的临时清单** —— 用户明确说过导航栏后续还要改。
 * 「今日」不再是独立页面，它已经移到侧栏下方常驻显示（TodaySidebarWidget）。
 * 「添加书籍」暂时指向旧的课程表单页，等导航栏最终定稿后会改成弹窗式入口。
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '书架', icon: '📚', end: true },
  { to: '/chat', label: '学伴对话', icon: '💬' },
  { to: '/memory', label: '记忆', icon: '🧠' },
  { to: '/personas', label: '角色', icon: '🎭' },
  { to: '/settings', label: '设置', icon: '⚙️' },
  { to: '/courses', label: '添加书籍', icon: '➕', action: true },
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
 * 一级界面外壳。
 *
 * 布局的关键约束：**左侧导航栏固定，不随滚轮滚动**。
 * 实现方式是整个外壳占满视口高度且自身不滚动（`h-screen overflow-hidden`），
 * 只有右侧内容区 `overflow-y-auto`。这样导航栏天然恒定存在，
 * 不需要 `position: fixed` 那套（后者要手动补 padding，且容易在缩放时错位）。
 *
 * 侧栏内部再分三段：品牌 / 索引栏目（不滚动）/ 今日待办（内部自己滚动）。
 * 今日待办必须能自己滚 —— 否则待办一多就会把上面的导航条目挤出屏幕。
 */
export function AppLayout() {
  return (
    <ReminderProvider>
      <div className="flex h-screen overflow-hidden">
        {/* 桌面端侧栏 */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span className="text-2xl leading-none">📘</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">L-partner</div>
              <div className="text-[11px] text-slate-400">你的学习搭档</div>
            </div>
          </div>

          <nav className="space-y-1 px-3 pb-3">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
                {item.action && <span className="ml-auto text-xs text-slate-300">新</span>}
              </NavLink>
            ))}
          </nav>

          <TodaySidebarWidget />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 窄屏顶部标题 */}
          <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            <span className="text-xl leading-none">📘</span>
            <span className="font-semibold text-slate-900">L-partner</span>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>

          {/* 窄屏底部导航 */}
          <nav className="flex border-t border-slate-200 bg-white md:hidden">
            {NAV_ITEMS.slice(0, 5).map((item) => (
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
      </div>
    </ReminderProvider>
  )
}

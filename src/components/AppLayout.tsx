import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'
import { useAssistantDock } from '@/features/assistant/dock'
import { ReminderProvider } from '@/features/reminder/ReminderProvider'
import { TodaySidebarWidget } from '@/features/today/TodaySidebarWidget'

interface NavItem {
  to: string
  label: string
  icon: IconName
  /** 精确匹配：书架是首页，否则任何路径都会点亮它 */
  end?: boolean
}

/**
 * 一级界面的索引栏目。
 *
 * ⚠️ 过渡期的临时清单 —— 用户说过导航栏后续还要改。
 * 「今日」不再是独立页面，已移到侧栏下方常驻显示（TodaySidebarWidget）。
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '书架', icon: 'shelf', end: true },
  { to: '/chat', label: '学伴对话', icon: 'chat' },
  { to: '/companion', label: '学伴设定', icon: 'user' },
  { to: '/settings', label: '设置', icon: 'sliders' },
  { to: '/courses', label: '添加书籍', icon: 'plus' },
]

/**
 * 导航项样式。
 *
 * 激活态用**黑底白字**而不是红色 —— 纯红是这套设计系统里唯一的强调色，
 * 按约定只用于警示（逾期、错误）。把导航选中态也做成红色，
 * 会让"我正在看设置"和"出错了"在视觉上无法区分。
 */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 rounded-pill px-3 py-1.5 text-body transition-all duration-200 ease-out',
    isActive ? 'bg-ink font-bold text-ink-inverse' : 'text-ink hover:bg-ink/5',
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
  const { pathname } = useLocation()
  /** 对话页的输入条在底部（整页就是对话区），顶部条带要让位 */
  const isChat = pathname.startsWith('/chat')
  const dockRef = useAssistantDock('top')

  return (
    <ReminderProvider>
      <div className="flex h-screen overflow-hidden bg-surface">
        {/* 桌面端侧栏。设计约束：导航背景与页面同色，靠一条 1px 线分隔。
            它带自己的 view-transition-name：换页时页面内容交叉淡入，而侧栏**不参与**，
            所以导航看起来始终待在原地（见 styles/index.css 的说明）。 */}
        <aside
          className="hidden w-60 shrink-0 flex-col border-r border-line-soft md:flex"
          style={{ viewTransitionName: 'sidebar' }}
        >
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span className="font-display text-h3 font-bold text-ink">L</span>
            <div>
              <div className="font-display text-body font-bold text-ink">L-partner</div>
              <div className="hint">你的学习搭档</div>
            </div>
          </div>

          <nav className="space-y-0.5 px-3 pb-4">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <Icon name={item.icon} size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <TodaySidebarWidget />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 窄屏顶部标题 */}
          <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3 md:hidden">
            <span className="font-display text-h3 font-bold text-ink">L-partner</span>
          </header>

          {/*
            学伴输入条的位置：内容区顶部一条**专属条带**。
            这里只放一个空位，输入条本体由 AssistantDockHost 量出这个矩形后贴上来 ——
            这样从一级进二级时它是"生长"，而不是卸载再挂载。

            为什么占位而不是让输入条直接浮在页面上：浮着会盖住页面顶部的内容。
            条带的高度（40）和二级界面（48）不同，但两者的**重心高度**都落在 top 36px 上，
            从书架点进课程时输入条的中轴不会上下跳。
            对话页不在这里留位：那一页的输入条在底部（见 ChatPage）。
          */}
          {!isChat && (
            <div className="shrink-0 px-6 pt-4 pb-1">
              <div ref={dockRef} className="h-10" />
            </div>
          )}

          {/* 内容区带 view-transition-name="page"：换页时淡出淡入的是它。
              侧栏与输入条各自有名字，所以它们稳在原地不动。 */}
          <main className="min-h-0 flex-1 overflow-y-auto" style={{ viewTransitionName: 'page' }}>
            <Outlet />
          </main>

          {/* 窄屏底部导航 */}
          <nav className="flex border-t border-line-soft md:hidden">
            {NAV_ITEMS.slice(0, 5).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex flex-1 flex-col items-center gap-0.5 py-2 text-micro transition-all duration-200',
                    isActive ? 'bg-ink font-bold text-ink-inverse' : 'text-ink-soft',
                  ].join(' ')
                }
              >
                <span className="text-body leading-none">
                  <Icon name={item.icon} size={16} />
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </ReminderProvider>
  )
}

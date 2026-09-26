import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { AssistantDockHost } from '@/features/assistant/AssistantDockHost'
import { AssistantDockProvider } from '@/features/assistant/AssistantDockProvider'
import { AssistantHandoffLayer } from '@/features/assistant/AssistantHandoffLayer'
import { AssistantHandoffProvider } from '@/features/assistant/AssistantHandoffProvider'
import { ChatSessionProvider } from '@/features/chat/ChatSessionProvider'
import { ChatPage } from '@/features/chat/ChatPage'
import { CompanionPage } from '@/features/companion/CompanionPage'
import { CourseStudyPage } from '@/features/course/CourseStudyPage'
import { CoursesRoute } from '@/features/course/CoursesRoute'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { ToastView } from '@/features/reminder/components/ToastView'
import { ShelfPage } from '@/features/shelf/ShelfPage'
import { SplashScreen } from '@/features/splash/SplashScreen'
import { TodayPage } from '@/features/today/TodayPage'
import { getAppInfo } from '@/lib/platform'

/**
 * 使用 HashRouter 而非 BrowserRouter：桌面端从 file:// 加载页面，
 * 而 file:// 下 history API 无法为子路由提供 fallback，BrowserRouter 会直接白屏。
 * HashRouter 在 file:// 与任何静态托管上都能工作，代价只是 URL 里多一个 #。
 *
 * 路由分成两层：
 * - **一级界面**（`<AppLayout />` 下）：带固定侧栏，书架是默认页
 * - **二级界面**（`/courses/:courseId`）：全屏覆盖，连同侧栏一起盖掉，所以放在 AppLayout 之外
 */

/** 浏览器调试时的开屏称呼兜底 —— 网页拿不到计算机名 */
const FALLBACK_NAME = '同学'

/**
 * 提醒小窗走的是同一份产物，但它是一个 3 秒就消失的表面：
 * 既不该播开屏（那 3 秒就全被开场动画占了），也不该加载应用外壳。
 */
const IS_TOAST_WINDOW = window.location.hash.startsWith('#/toast')

/** 测试环境不播开屏，否则每个路由测试都要先等 4 秒动画 */
const SPLASH_ENABLED = import.meta.env.MODE !== 'test' && !IS_TOAST_WINDOW

export default function App() {
  const [splashDone, setSplashDone] = useState(!SPLASH_ENABLED)
  const [name, setName] = useState(FALLBACK_NAME)
  /** 本机信息读完之前先不出开屏，否则会先显示「同学」再跳成「休伯利安」 */
  const [infoReady, setInfoReady] = useState(!SPLASH_ENABLED)

  useEffect(() => {
    if (!SPLASH_ENABLED) return
    let cancelled = false

    void getAppInfo().then((info) => {
      if (cancelled) return
      // 桌面端优先用计算机名；拿不到就退回用户名；再拿不到才是兜底文案
      if (info?.hostname) setName(info.hostname)
      else if (info?.username) setName(info.username)
      setInfoReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {!splashDone &&
        (infoReady ? (
          <SplashScreen name={name} onDone={() => setSplashDone(true)} />
        ) : (
          // 与开屏同一底色，避免首帧闪白
          <div className="fixed inset-0 bg-[#141414]" />
        ))}

      <HashRouter>
        {/* 会话宿主：一级界面的输入条、二级界面的输入条、对话页的输入区共用同一场对话 */}
        <ChatSessionProvider>
          <AssistantDockProvider>
            <AssistantHandoffProvider>
              {/*
                输入条的宿主挂在路由之外 —— 只有一份实例，换页时它把页面上的空位量出来贴上去，
                于是"从一级进二级"是一次位移与生长，而不是卸载再挂载。

                但要等开屏结束再挂：开屏是一块 z-50 的全屏遮罩，而输入条也是 fixed + z-50，
                两者同层时后出现的那个会盖在上面 —— 于是开屏动画里会浮出一条输入框。
                更根本的理由是：应用还没"开启"，输入条本来就不该存在。
              */}
              {splashDone && <AssistantDockHost />}
              {/* 交接动画的影子层：输入条上的两个气泡飞进对话列表 */}
              <AssistantHandoffLayer />
              <AppRoutes />
            </AssistantHandoffProvider>
          </AssistantDockProvider>
        </ChatSessionProvider>
      </HashRouter>
    </>
  )
}

/**
 * 路由表 + 切换动画。
 *
 * 必须放在 `<HashRouter>` **内部**：它要用 useLocation 才能知道该往哪个地址去。
 * 页面切换的淡入淡出交给 View Transitions —— 由合成器"拍旧图 → 换 DOM → 交叉淡入"，
 * 比自己在 React 里维护"退场中的旧页面"简单得多，也不会因为两棵树并存而状态错乱。
 *
 * 做法是把「地址栏」与「当前渲染哪个路由」分成两份状态：地址一变，
 * 就把状态更新包进 startViewTransition，浏览器因此拿到了同一帧的两种画面。
 * 左侧导航栏、学伴输入条各自带 view-transition-name（见 AppLayout / AssistantDockHost），
 * 它们**不参与**交叉淡入 —— 换页时纹丝不动，只有中间的内容淡出淡入。
 *
 * 不支持这个 API 时直接切换（少一段动画，功能不受影响）；开屏期间也跳过，
 * 那时整个屏幕都在播开场动画，再叠一层淡入只会互相打架。
 */
function AppRoutes() {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)

  /*
   * 比较「地址」而不是比较 `location.key`。
   *
   * key 看起来更省事，但它在一种情况下会骗人：直接改 `location.hash`（脚本、外部链接、
   * 旧书签）时，浏览器新建的这条历史记录里 **没有** RR 写入的 state，
   * 于是 `getLocation` 拿不到自己的 key，两个 location 的 key 都是 'default' ——
   * 一样，于是这里永远提前 return，**页面根本不会切换**。
   * 路径 + 查询串才是"要显示哪一页"的真实依据。
   */
  const target = `${location.pathname}${location.search}`
  const shown = `${displayLocation.pathname}${displayLocation.search}`

  useEffect(() => {
    if (target === shown) return

    const apply = () => setDisplayLocation(location)
    if (typeof document.startViewTransition !== 'function' || SPLASH_ENABLED) {
      apply()
      return
    }
    document.startViewTransition(apply)
  }, [target, shown, location])

  return (
    <Routes location={displayLocation}>
      {/*
        提醒小窗：一个独立、极小、无外壳的表面。
        必须在 AppLayout 之外 —— 它没有侧栏、没有导航，只有一条提示。
      */}
      <Route path="toast" element={<ToastView />} />

      {/* 二级界面：全屏，不带侧栏 */}
      <Route path="courses/:courseId" element={<CourseStudyPage />} />

      {/* 一级界面 */}
      <Route element={<AppLayout />}>
        <Route index element={<ShelfPage />} />
        {/* 今日待办在侧栏有常驻的紧凑视图；这个页面是它的完整版
            （逾期分区、提醒状态、手动添加）。侧栏里放「查看全部」入口。 */}
        <Route path="today" element={<TodayPage />} />
        <Route path="chat" element={<ChatPage />} />
        {/* 角色与记忆合并为「学伴」，旧路径保留重定向，避免旧书签直接白屏 */}
        <Route path="companion" element={<CompanionPage />} />
        <Route path="memory" element={<Navigate to="/companion" replace />} />
        <Route path="personas" element={<Navigate to="/companion" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* 过渡期：添加/编辑课程的表单页，等导航栏定稿后会改成弹窗入口 */}
        <Route path="courses" element={<CoursesRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ChatPage } from '@/features/chat/ChatPage'
import { CourseDetailPage } from '@/features/course/CourseDetailPage'
import { CoursesRoute } from '@/features/course/CoursesRoute'
import { MemoryPage } from '@/features/memory/MemoryPage'
import { PersonaPage } from '@/features/persona/PersonaPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { SplashScreen } from '@/features/splash/SplashScreen'
import { TodayPage } from '@/features/today/TodayPage'
import { getAppInfo } from '@/lib/platform'

/**
 * 使用 HashRouter 而非 BrowserRouter：桌面端从 file:// 加载页面，
 * 而 file:// 下 history API 无法为子路由提供 fallback，BrowserRouter 会直接白屏。
 * HashRouter 在 file:// 与任何静态托管上都能工作，代价只是 URL 里多一个 #。
 */

/** 浏览器调试时的开屏称呼兜底 —— 网页拿不到计算机名 */
const FALLBACK_NAME = '同学'

/** 测试环境下不播开屏，否则每个路由测试都要先等 4 秒动画 */
const SPLASH_ENABLED = import.meta.env.MODE !== 'test'

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
          <div className="fixed inset-0 bg-[#0b1020]" />
        ))}

      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<TodayPage />} />
            <Route path="courses" element={<CoursesRoute />} />
            <Route path="courses/:courseId" element={<CourseDetailPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="personas" element={<PersonaPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </>
  )
}

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ChatPage } from '@/features/chat/ChatPage'
import { CourseDetailPage } from '@/features/course/CourseDetailPage'
import { CoursesRoute } from '@/features/course/CoursesRoute'
import { MemoryPage } from '@/features/memory/MemoryPage'
import { PersonaPage } from '@/features/persona/PersonaPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TodayPage } from '@/features/today/TodayPage'

/**
 * 使用 HashRouter 而非 BrowserRouter：
 * GitHub Pages 无法为 SPA 配置 history fallback，BrowserRouter 下刷新子路由会 404。
 * HashRouter 在任何静态托管上都能直接工作，代价只是 URL 里多一个 #。
 */
export default function App() {
  return (
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
  )
}

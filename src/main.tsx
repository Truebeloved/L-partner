import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HydrationGate } from '@/components/HydrationGate'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点，请检查 index.html')
}

/**
 * 桌面提醒小窗走的是同一条构建产物，但**不经过 HydrationGate**。
 *
 * 原因很实际：HydrationGate 会等 IndexedDB 读完才渲染，而提醒小窗只停留 3 秒 ——
 * 等数据的时间里它可能已经在显示「正在读取本地数据…」了，那 3 秒就废了。
 * 而它本来也不需要任何本地数据：文案由主窗口拼好、经 URL 参数带过来。
 */
const isToastWindow = window.location.hash.startsWith('#/toast')

createRoot(container).render(
  <StrictMode>
    {/* 错误边界放在最外层：连 HydrationGate 的读盘失败也要能显示出来，
        而不是留下一块什么都没有的界面 */}
    <ErrorBoundary>
      {isToastWindow ? (
        <App />
      ) : (
        <HydrationGate>
          <App />
        </HydrationGate>
      )}
    </ErrorBoundary>
  </StrictMode>,
)

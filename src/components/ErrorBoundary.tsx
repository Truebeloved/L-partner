import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 应用级错误边界。
 *
 * 存在的理由是一个真实故障：打开提醒开关后整个界面变白，
 * 终端里一个字都没有 —— React 在渲染期抛错时会把整棵树卸掉，
 * 结果就是"窗口还在、内容全没了"，用户既看不到原因也做不了任何事。
 *
 * 这里不打算"自动恢复"（那只会掩盖问题），只做三件事：
 * 把错误摆到界面上、把细节写进 console、给一个重新加载的出口。
 * 错误边界抓不到 effect 里抛出的异步错误，所以主进程那边同时开了
 * 渲染进程日志转发（见 electron/main.cjs 的 forwardRendererLogs）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 组件栈是定位这类问题唯一有用的线索，必须完整留下
    console.error('[L-partner] 界面渲染出错：', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-8">
        <div className="card w-full max-w-lg">
          <h1 className="card-title">界面出错了</h1>
          <p className="mt-3 text-body leading-relaxed text-ink-soft">
            这一屏没能渲染出来。你的课程、计划和记忆都还安全地存在本机，
            重新加载通常就能回来。
          </p>

          {/* 错误原文用等宽字体单独放一块：截图发给别人时一眼能看清是什么错 */}
          <pre className="mt-4 max-h-40 overflow-auto rounded-sm bg-ink/5 p-3 font-mono text-small whitespace-pre-wrap text-ink-soft">
            {error.message}
          </pre>

          <div className="mt-5 flex gap-3">
            <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
              重新加载
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => this.setState({ error: null })}
            >
              再试一次
            </button>
          </div>
        </div>
      </div>
    )
  }
}

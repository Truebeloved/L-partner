import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

/**
 * 二级界面与功能页的标题区。
 * 标题走 display 字体（Josefin Sans，中文回退系统黑体），正文走 Lato。
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    // pt-8：页面标题原来是"顶格"的 —— 窗口内容区从最顶端开始，标题直接贴边，
    // 看起来像被裁掉了。桌面端页边距是 24px，纵向刻意给到 32px：
    // 横向留白由内容宽度天然提供，纵向必须手动给够才不压抑。
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 pt-8">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {/* 设计约束：标题与下方内容间距 8px */}
        {description && <p className="muted mt-2">{description}</p>}
      </div>
      {/* 设计约束：按钮横向间距 16px */}
      {actions && <div className="flex shrink-0 items-center gap-4">{actions}</div>}
    </div>
  )
}

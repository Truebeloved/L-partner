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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

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
    /*
     * 容器宽度必须和 .page-container 完全一致（max-w-3xl + px-8）。
     *
     * 之前 PageHeader 是**裸渲染在 <main> 里**的：标题铺满整行、而卡片在居中的容器里，
     * 于是标题贴左边、内容在中间，看起来像"标题顶满了左右"。
     * 让两者共用同一套宽度，对齐就是自然而然的结果，不必去改每个页面的结构。
     */
    <div className="mx-auto flex w-full max-w-3xl flex-wrap items-start justify-between gap-4 px-8 pt-8 pb-6">
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

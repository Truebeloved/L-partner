import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function MemoryPage() {
  return (
    <>
      <PageHeader title="记忆" description="你的学伴记得什么，由你决定" />
      <ComingSoon note="四层记忆视图（会话摘要 / 事实 / 掌握状态 / 情景）、知识点掌握热力图，以及可编辑删除的记忆面板。" />
    </>
  )
}

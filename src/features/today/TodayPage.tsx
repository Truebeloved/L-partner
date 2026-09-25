import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function TodayPage() {
  return (
    <>
      <PageHeader title="今日" description="今天要学什么、学到哪了" />
      <ComingSoon note="今日待办清单、完成打勾、学习进度，以及到点提醒。" />
    </>
  )
}

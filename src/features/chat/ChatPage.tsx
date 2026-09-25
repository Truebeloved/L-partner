import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function ChatPage() {
  return (
    <>
      <PageHeader title="学伴" description="带着你的课程和进度一起对话" />
      <ComingSoon note="对话界面、流式输出、角色切换，以及把课程与今日待办注入上下文。" />
    </>
  )
}

import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function CoursesPage() {
  return (
    <>
      <PageHeader title="课程" description="导入课程或让 AI 帮你生成一份学习方案" />
      <ComingSoon note="两条导入路径：口述「我想学什么」由 AI 生成教学方案；或导入 txt / md 资料解析成学习路径。" />
    </>
  )
}

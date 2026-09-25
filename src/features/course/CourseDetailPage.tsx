import { useParams } from 'react-router-dom'

import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()

  return (
    <>
      <PageHeader title="课程详情" description={`课程 ID：${courseId ?? '未知'}`} />
      <ComingSoon note="阶段与单元结构、知识点列表、学习计划排期表，以及重新排期入口。" />
    </>
  )
}

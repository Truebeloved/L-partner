import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function PersonaPage() {
  return (
    <>
      <PageHeader title="角色" description="决定你的学伴是谁、用什么方式教你" />
      <ComingSoon note="内置角色模板（严格督学 / 耐心学长 / 苏格拉底式提问者），支持复制后自定义身份、性格、说话风格与教学策略。切换角色不会丢失记忆。" />
    </>
  )
}

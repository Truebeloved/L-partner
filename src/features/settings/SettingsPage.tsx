import { ComingSoon } from '@/components/ComingSoon'
import { PageHeader } from '@/components/PageHeader'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="设置" description="接入你自己的大模型 API，以及提醒偏好" />
      <ComingSoon note="API 地址 / 密钥 / 模型配置与连通性测试、每日提醒时间，以及记忆自动抽取开关（用于控制 token 消耗）。" />
    </>
  )
}

import { generateCoursePlan } from '@/features/course/aiPlan'
import { CoursesPage } from '@/features/course/CoursesPage'
import { useSettingsStore } from '@/store/settings'

/**
 * 课程页的路由容器。
 *
 * 存在的唯一理由：只有配好了模型才把 `onGenerateWithAi` 传下去，
 * 课程页据此把「让 AI 帮我生成方案」按钮置灰并给出提示 ——
 * 比让用户点了再报错要好。所以判断必须在渲染层做，不能塞进适配器里。
 */
export function CoursesRoute() {
  const llmReady = useSettingsStore((state) =>
    Boolean(
      state.settings.llm.baseUrl.trim() &&
      state.settings.llm.apiKey.trim() &&
      state.settings.llm.model.trim(),
    ),
  )

  return <CoursesPage onGenerateWithAi={llmReady ? generateCoursePlan : undefined} />
}

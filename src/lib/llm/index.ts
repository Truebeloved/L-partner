import { createOpenAiCompatibleProvider } from '@/lib/llm/openaiCompatible'
import type { LlmProvider } from '@/lib/llm/types'
import type { LlmSettings } from '@/types/models'

export type { ChatOptions, ConnectionCheck, LlmMessage, LlmProvider } from '@/lib/llm/types'
export { LlmError } from '@/lib/llm/types'

/** 由当前设置构造提供方。设置一变就重建，避免闭包里留着旧 Key */
export function createProvider(settings: LlmSettings): LlmProvider {
  return createOpenAiCompatibleProvider(settings)
}

/** 从模型返回的自由文本里抠出 JSON —— 即使它包了 ```json 围栏或加了前后废话 */
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? raw).trim()

  try {
    return JSON.parse(candidate) as T
  } catch {
    // 退一步：截取第一个 { 到最后一个 } 之间的内容
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T
    }
    throw new Error('模型没有返回可解析的 JSON')
  }
}

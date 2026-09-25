import { estimateUnitMinutes } from '@/features/course/drafts'
import type {
  AiPlanRequest,
  CoursePlanDraft,
  StageDraft,
  UnitDraft,
} from '@/features/course/drafts'
import { createProvider, extractJson } from '@/lib/llm'
import { buildCoursePlanMessages } from '@/lib/llm/prompts'
import { LlmError } from '@/lib/llm/types'
import { useSettingsStore } from '@/store/settings'

/**
 * 「让 AI 帮我生成方案」的适配器。
 *
 * 这一层是课程域与模型层之间唯一的接缝：课程域只声明「我要一份 CoursePlanDraft」，
 * 至于用哪家模型、怎么拼提示词、流不流式，全在这里决定。
 * 好处是将来要换成别的协议实现，课程域的代码一行都不用动。
 */

interface RawPlan {
  title?: unknown
  description?: unknown
  goal?: unknown
  stages?: unknown
}

export async function generateCoursePlan(request: AiPlanRequest): Promise<CoursePlanDraft> {
  const settings = useSettingsStore.getState().settings
  const { baseUrl, apiKey, model } = settings.llm

  if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
    throw new LlmError(
      'auth',
      '还没有配置大模型 API',
      '到「设置 → 大模型接入」填入 API 地址、模型名称与密钥后即可使用。没有 Key 也不影响手写创建课程与排期。',
    )
  }

  const provider = createProvider(settings.llm)

  let raw: string
  try {
    raw = await provider.chat(buildCoursePlanMessages(describeRequest(request)), {
      // 结构设计需要一点灵活性，但不能太发散，否则阶段划分会不合理
      temperature: 0.4,
      maxTokens: 4096,
    })
  } catch (error) {
    // 网络与鉴权错误已经在适配层翻译成人话了，这里只补一句「这一步失败了」的语境
    if (error instanceof LlmError) throw error
    throw new LlmError('bad-response', `生成方案失败：${String(error)}`)
  }

  let parsed: RawPlan
  try {
    parsed = extractJson<RawPlan>(raw)
  } catch {
    throw new LlmError(
      'bad-response',
      '模型没有返回可解析的方案结构',
      '换个说法再试一次通常就能解决；如果反复出现，可能是该模型对 JSON 输出的支持较弱，可以换一个模型。',
    )
  }

  const stages = toStages(parsed.stages)
  if (stages.length === 0) {
    throw new LlmError(
      'bad-response',
      '模型返回的方案里没有可用的阶段结构',
      '把目标说得更具体一些再试，例如「两个月上手 React，能独立写一个小项目」。',
    )
  }

  return {
    title: asText(parsed.title) || request.goal.slice(0, 40),
    description: asText(parsed.description) || undefined,
    goal: asText(parsed.goal) || request.goal,
    // deadline 用用户填的那个，不让模型改 —— 这是他自己的约束
    deadline: request.deadline,
    weeklyMinutes:
      request.weeklyHours && request.weeklyHours > 0
        ? Math.round(request.weeklyHours * 60)
        : undefined,
    stages,
  }
}

function describeRequest(request: AiPlanRequest): string {
  const lines = [`我想学：${request.goal}`]
  if (request.weeklyHours && request.weeklyHours > 0) {
    lines.push(`每周大概能投入 ${request.weeklyHours} 小时`)
  }
  if (request.deadline) {
    lines.push(
      `希望 ${request.deadline} 之前学完（今天是 ${new Date().toISOString().slice(0, 10)}）`,
    )
  }
  return lines.join('\n')
}

/** 逐层校验模型的输出。宁可丢掉畸形项，也不要让 undefined 流进排期算法 */
function toStages(value: unknown): StageDraft[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const title = asText(item.title)
    if (!title) return []

    const units = toUnits(item.units)
    if (units.length === 0) return []

    return [{ title, objective: asText(item.objective) || undefined, units }]
  })
}

function toUnits(value: unknown): UnitDraft[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const title = asText(item.title)
    if (!title) return []

    const knowledgePoints = Array.isArray(item.knowledgePoints)
      ? item.knowledgePoints
          .filter((point): point is string => typeof point === 'string')
          .map((point) => point.trim())
          .filter(Boolean)
      : []

    const rawMinutes = Number(item.estimatedMinutes)

    return [
      {
        title,
        knowledgePoints,
        // 模型忘了给时长时用统一的启发式补齐，保证排期算法拿到的永远是正数
        estimatedMinutes: Number.isFinite(rawMinutes)
          ? estimateUnitMinutes({ knowledgePoints, estimatedMinutes: rawMinutes })
          : estimateUnitMinutes({ knowledgePoints }),
      },
    ]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

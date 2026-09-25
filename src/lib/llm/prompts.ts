import { dayjs } from '@/lib/date'
import type { LlmMessage } from '@/lib/llm/types'
import type { ChatMessage, Course, MemoryEntry, Persona, Plan, Todo } from '@/types/models'

export interface PromptContext {
  persona: Persona
  /** 当前绑定的课程，未绑定时不注入课程段 */
  course?: Course
  plan?: Plan
  todayTodos?: Todo[]
  /** 已检索出的相关记忆（见 features/memory/retrieve.ts） */
  memories?: MemoryEntry[]
}

/**
 * 组装 system prompt。
 *
 * 这是整个「学伴感」的来源，刻意分成四段而不是把信息混在一起：
 *   1. 角色 —— 决定「它是谁、怎么说话」
 *   2. 情境 —— 决定「它在帮你学什么、进度到哪」
 *   3. 记忆 —— 决定「它认识你多久了」（这是和通用聊天框拉开差距的地方）
 *   4. 准则 —— 约束行为边界
 */
export function buildSystemPrompt(context: PromptContext): string {
  const { persona, course, plan, todayTodos = [], memories = [] } = context
  const sections: string[] = []

  sections.push(
    [
      '你是一位学习伙伴，不是通用问答机器人。请始终以上面这个人设说话。',
      '',
      '## 你是谁',
      `名字：${persona.name}`,
      `背景：${persona.identity}`,
      `性格：${persona.personality}`,
      `说话风格：${persona.speakingStyle}`,
      `教学方式：${persona.teachingStrategy}`,
      persona.taboos ? `你不会做的事：${persona.taboos}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  if (course) {
    sections.push(buildCourseSection(course, plan))
  }

  if (todayTodos.length > 0) {
    const pending = todayTodos.filter((todo) => !todo.done)
    const lines = todayTodos.map(
      (todo) =>
        `- ${todo.done ? '✅' : '⬜'} ${todo.title}${todo.minutes ? `（${todo.minutes} 分钟）` : ''}`,
    )
    sections.push(
      [
        '## 他今天的学习安排',
        ...lines,
        pending.length === 0
          ? '今天的任务已经全部完成了。'
          : `还剩 ${pending.length} 项没完成。如果他问「接下来干什么」，直接指向这些。`,
      ].join('\n'),
    )
  }

  if (memories.length > 0) {
    sections.push(buildMemorySection(memories))
  }

  sections.push(
    [
      '## 回答准则',
      '- 用中文回答，除非他明确要求其他语言。',
      '- 不确定的事就说「我不确定」，不要编造事实、论文、版本号或 API。',
      '- 回答长度跟着问题走：简单问题就短答，别把「这是什么」答成一篇文章。',
      '- 讲到他薄弱的知识点时，可以顺着提一句，但不要每次都硬拉回学习话题。',
      '- 如果他只是在吐槽、焦虑或闲聊，先正常回应他这个人，再谈学习。',
    ].join('\n'),
  )

  return sections.join('\n\n')
}

function buildCourseSection(course: Course, plan?: Plan): string {
  const units = course.stages.flatMap((stage) => stage.units)
  const lines = [`## 你正在帮他学的东西`, `课程：${course.title}`]

  if (course.goal) lines.push(`学习目标：${course.goal}`)

  if (course.deadline) {
    const daysLeft = dayjs(course.deadline).startOf('day').diff(dayjs().startOf('day'), 'day')
    lines.push(
      `期望完成：${course.deadline}（${
        daysLeft > 0
          ? `还剩 ${daysLeft} 天`
          : daysLeft === 0
            ? '就是今天'
            : `已超期 ${-daysLeft} 天`
      }）`,
    )
  }

  if (plan) {
    const done = plan.items.filter((item) => item.status === 'done').length
    lines.push(`计划进度：${plan.items.length} 个任务中已完成 ${done} 个`)
  }

  if (units.length > 0) {
    lines.push(`内容结构：${course.stages.length} 个阶段、${units.length} 个单元`)
    const outline = course.stages
      .map((stage) => `- ${stage.title}：${stage.units.map((unit) => unit.title).join('、')}`)
      .join('\n')
    lines.push(outline)
  }

  return lines.join('\n')
}

function buildMemorySection(memories: MemoryEntry[]): string {
  const facts = memories.filter((memory) => memory.layer === 'fact')
  const mastery = memories.filter((memory) => memory.layer === 'mastery')
  const episodes = memories.filter((memory) => memory.layer === 'episode')

  const blocks: string[] = [
    '## 你记得关于他的事',
    '（这些是过去对话里积累的印象，请自然地运用，不要生硬复述。）',
  ]

  if (facts.length > 0) {
    blocks.push('【他的情况】', ...facts.map((memory) => `- ${memory.content}`))
  }

  if (mastery.length > 0) {
    const label: Record<string, string> = {
      mastered: '已掌握',
      learning: '学习中',
      weak: '薄弱',
      unknown: '未接触',
    }
    blocks.push(
      '【知识掌握情况】',
      ...mastery.map(
        (memory) =>
          `- ${memory.knowledgePoint ?? memory.content}：${label[memory.level ?? 'unknown']}${
            memory.content && memory.knowledgePoint ? `（${memory.content}）` : ''
          }`,
      ),
    )
  }

  if (episodes.length > 0) {
    blocks.push('【最近聊过的】', ...episodes.map((memory) => `- ${memory.content}`))
  }

  return blocks.join('\n')
}

// ---------------------------------------------------------------------------
// 记忆抽取
// ---------------------------------------------------------------------------

export const MEMORY_EXTRACTION_SYSTEM_PROMPT = `你是一个记忆抽取器。你的任务是从一段学习对话中，抽取值得长期记住的**新**信息。

只输出 JSON，不要任何解释文字。格式：
{
  "facts": ["关于这个学生的稳定事实，如专业、年级、目标、学习习惯偏好"],
  "mastery": [{"knowledgePoint": "知识点名称", "level": "learning|weak|mastered", "reason": "判断依据，一句话"}],
  "episodes": ["这次聊了什么、卡在哪里、有没有讲通，一句话"]
}

严格规则：
- 只记录**新的、稳定的、未来还有用**的信息。寒暄、一次性提问、情绪波动都不要记。
- 已经在「已知记忆」里的内容不要重复输出。
- facts 用第三人称陈述句，如「他是计算机专业大三学生，目标是转前端」。
- 每条都要简短。宁可少记，也不要记废话。
- 没有任何值得记的内容时，三个字段都返回空数组。`

export function buildMemoryExtractionMessages(
  conversation: ChatMessage[],
  existing: MemoryEntry[],
): LlmMessage[] {
  const transcript = conversation
    .map((message) => `${message.role === 'user' ? '学生' : '学伴'}：${message.content}`)
    .join('\n')

  const known =
    existing.length > 0 ? existing.map((memory) => `- ${memory.content}`).join('\n') : '（暂无）'

  return [
    { role: 'system', content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `## 已知记忆（不要重复）\n${known}\n\n## 本次对话\n${transcript}\n\n请抽取新记忆。`,
    },
  ]
}

// ---------------------------------------------------------------------------
// 会话摘要（记忆第 1 层）
// ---------------------------------------------------------------------------

export function buildSummaryMessages(
  previousSummary: string | undefined,
  messages: ChatMessage[],
): LlmMessage[] {
  const transcript = messages
    .map((message) => `${message.role === 'user' ? '学生' : '学伴'}：${message.content}`)
    .join('\n')

  return [
    {
      role: 'system',
      content:
        '把这段学习对话压缩成摘要，供后续对话当上下文使用。保留：学生问了什么、卡在哪里、' +
        '已经讲通了什么、用了什么有效的例子。去掉寒暄和重复。用中文，200 字以内，直接给摘要正文。',
    },
    {
      role: 'user',
      content: `${previousSummary ? `已有摘要：\n${previousSummary}\n\n` : ''}新增对话：\n${transcript}`,
    },
  ]
}

// ---------------------------------------------------------------------------
// 由自然语言生成教学方案
// ---------------------------------------------------------------------------

export const COURSE_PLAN_SYSTEM_PROMPT = `你是一个课程设计师。用户会告诉你他想学什么、有多少时间，你要设计一份可执行的学习方案。

只输出 JSON，不要任何解释文字。格式：
{
  "title": "课程标题",
  "description": "一两句话说明这份方案的设计思路",
  "goal": "学完之后他能做到什么，要具体可验证",
  "stages": [
    {
      "title": "阶段名",
      "objective": "这一阶段结束时应具备的能力",
      "units": [
        { "title": "单元名", "knowledgePoints": ["知识点1", "知识点2"], "estimatedMinutes": 90 }
      ]
    }
  ]
}

设计要求：
- 3~5 个阶段，每个阶段 2~4 个单元，单元总数控制在 10~16 个。
- estimatedMinutes 要符合真实投入，单个单元 30~180 分钟之间，不要虚高也不要虚低。
- 知识点写具体，「理解 React」这种不算知识点，「useState 的更新批处理」才算。
- 阶段之间要有递进关系，后一阶段依赖前一阶段。
- 如果用户提到时间限制，单元总量必须匹配得上；宁少勿多，排不下的计划没有意义。`

export function buildCoursePlanMessages(request: string): LlmMessage[] {
  return [
    { role: 'system', content: COURSE_PLAN_SYSTEM_PROMPT },
    { role: 'user', content: request },
  ]
}

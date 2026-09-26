import { dayjs } from '@/lib/date'
import { clampText } from '@/lib/llm/context'
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
  /** 省流模式：课程只给当前阶段、记忆条目更少更短 */
  efficient?: boolean
}

/**
 * 稳定前缀：**只有人设与准则**。
 *
 * 为什么把它单独拆出来：厂商的上下文缓存按**前缀**匹配，命中部分只收 1/10 的价格。
 * 人设和准则是整场对话里唯一不变的两段，把它们放在最前面、且不掺任何会变的字，
 * 同一段文字就能在几十轮里反复命中缓存。反过来（把课程进度、记忆夹在人设后面）
 * 等于每轮都为同一段人设付全价 —— 这是最容易被忽略、也最容易省下的一笔钱。
 *
 * ⚠️ 这个函数的输出必须是**字节稳定**的：不要在这里加时间、进度、随机内容。
 */
export function buildStablePrompt(persona: Persona): string {
  return [
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
    [
      '## 回答准则',
      '- 用中文回答，除非他明确要求其他语言。',
      '- 不确定的事就说「我不确定」，不要编造事实、论文、版本号或 API。',
      '- 回答长度跟着问题走：简单问题就短答，别把「这是什么」答成一篇文章。',
      '- 讲到他薄弱的知识点时，可以顺着提一句，但不要每次都硬拉回学习话题。',
      '- 如果他只是在吐槽、焦虑或闲聊，先正常回应他这个人，再谈学习。',
    ].join('\n'),
  ].join('\n\n')
}

/**
 * 易变部分：课程进度、今天的安排、相关记忆。
 *
 * 它们每轮都会变，所以只能放在稳定前缀**之后**，让缓存尽量多地覆盖前面那段。
 * 顺带一提，「今天几号」也属于易变信息，一并放在这里。
 */
export function buildVolatilePrompt(context: PromptContext): string {
  const { course, plan, todayTodos = [], memories = [], efficient = false } = context
  const sections: string[] = []

  sections.push(`## 现在\n今天是 ${dayjs().format('YYYY年M月D日 dddd')}。`)

  if (course) {
    sections.push(buildCourseSection(course, plan, efficient))
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

  return sections.join('\n\n')
}

/**
 * 完整 system prompt = 稳定前缀 + 易变部分。
 *
 * 现在实际发送时是拆成两条 system 消息的（见 lib/llm/context.ts 的 assembleMessages），
 * 这个合并版留给单测与需要"一整块 prompt"的调用方。
 */
export function buildSystemPrompt(context: PromptContext): string {
  return `${buildStablePrompt(context.persona)}\n\n${buildVolatilePrompt(context)}`
}

/**
 * 课程段。
 *
 * 省流模式下**不再列出整棵大纲** —— 那是课程页该展示的东西，而每轮对话都带上
 * 「16 个单元的名字」是纯粹的浪费：模型真要讲某个单元时，用户会说出来。
 * 留下的是回答「我现在该学什么」真正需要的那几项：目标、期限、进度、当前阶段、下一个未完成单元。
 */
function buildCourseSection(course: Course, plan: Plan | undefined, efficient: boolean): string {
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

  if (units.length === 0) return lines.join('\n')

  lines.push(`内容结构：${course.stages.length} 个阶段、${units.length} 个单元`)

  if (!efficient) {
    const outline = course.stages
      .map((stage) => `- ${stage.title}：${stage.units.map((unit) => unit.title).join('、')}`)
      .join('\n')
    lines.push(outline)
    return lines.join('\n')
  }

  // 省流：只给"当前阶段"和"下一个没完成的单元"，够回答"我该学什么"，又不烧大纲的钱
  const current = findCurrentPosition(course, plan)
  if (current) {
    lines.push(`当前阶段：${current.stageTitle}`)
    if (current.unitTitle) lines.push(`下一个要学的单元：${current.unitTitle}`)
  }

  return lines.join('\n')
}

/** 从计划里找出第一个未完成的排期项，映射回它所属的阶段与单元 */
function findCurrentPosition(
  course: Course,
  plan: Plan | undefined,
): { stageTitle: string; unitTitle?: string } | null {
  if (!plan || plan.items.length === 0) return null

  const pending = plan.items
    .filter((item) => item.status === 'todo')
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  if (pending) {
    for (const stage of course.stages) {
      const unit = stage.units.find((candidate) => candidate.id === pending.unitId)
      if (unit) return { stageTitle: stage.title, unitTitle: unit.title }
    }
  }

  // 计划全部完成：至少告诉模型它已经走到哪一阶段了
  const lastStage = course.stages[course.stages.length - 1]
  return lastStage ? { stageTitle: `${lastStage.title}（已完成）` } : null
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

/**
 * 记忆抽取的输入。
 *
 * 两处封顶都是必须的，否则这个请求会随对话增长而无限变贵：
 * - `conversation` 只该是**自上次抽取以来的增量**（调用方负责切），这里再对单条与整体做截断；
 * - `existing` 是"不要重复"的参照，但记忆越攒越多，全列出来等于每 8 条消息就重发一遍全部记忆。
 *   只带最近的若干条就够了 —— 更早的记忆要么已经重复过，要么本来就不相关。
 */
export function buildMemoryExtractionMessages(
  conversation: ChatMessage[],
  existing: MemoryEntry[],
): LlmMessage[] {
  const transcript = conversation
    .map(
      (message) =>
        `${message.role === 'user' ? '学生' : '学伴'}：${clampText(message.content, 600)}`,
    )
    .join('\n')

  const recent = existing.slice(-EXTRACTION_KNOWN_LIMIT)
  const known =
    recent.length > 0
      ? recent.map((memory) => `- ${clampText(memory.content, 80)}`).join('\n')
      : '（暂无）'

  return [
    { role: 'system', content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `## 已知记忆（不要重复，只列了最近 ${recent.length} 条）\n${known}\n\n## 新增对话\n${transcript}\n\n请抽取新记忆。`,
    },
  ]
}

/** 「不要重复」参照里最多列多少条已有记忆 */
export const EXTRACTION_KNOWN_LIMIT = 40

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

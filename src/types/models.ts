/**
 * L-partner 核心数据模型
 *
 * 设计原则：
 * 1. 两条课程导入路径（自然语言生成 / 文件导入）最终收敛到同一个 `Course` 结构，
 *    避免下游的计划、待办、提醒写两套逻辑。
 * 2. 排期与内容是分离的：`Course` 描述「要学什么」，`PlanItem` 描述「哪天学」。
 *    这样重新排期不会破坏课程内容，也是「计划自适应」的前提。
 * 3. 所有实体都带 id 与时间戳，便于放进 IndexedDB 并能做增量同步。
 */

/** 主键：使用 crypto.randomUUID() 生成 */
export type Id = string

/** ISO 8601 时间戳 */
export type IsoDateTime = string

/** 本地日期，格式 YYYY-MM-DD（不存时区，避免跨时区排期错位） */
export type DateKey = string

/** 一天中的时刻，格式 HH:mm */
export type TimeKey = string

// ---------------------------------------------------------------------------
// 1. 课程 / 学习方案
// ---------------------------------------------------------------------------

/** 课程的来源，三种导入路径 */
export type CourseSource =
  /** 手动填写 */
  | 'manual'
  /** 用户口述目标，由 AI 生成教学方案 */
  | 'prompt'
  /** 导入电子书 / 资料文件 */
  | 'file'

/** 阶段：教学方案的顶层切分，如「基础语法」「组件与状态」 */
export interface Stage {
  id: Id
  title: string
  /** 这一阶段结束时应达到的能力 */
  objective?: string
  /** 展示顺序，从 0 开始 */
  order: number
  units: Unit[]
}

/** 学习单元：可排期的**最小单位**，通常对应教材的一章或一个主题 */
export interface Unit {
  id: Id
  title: string
  /** 这个单元覆盖的知识点名称，掌握状态就是按它挂载的 */
  knowledgePoints: string[]
  /** 预计学习时长（分钟），排期算法依赖它 */
  estimatedMinutes: number
  order: number
  /**
   * 教学正文（Markdown）。
   *
   * 没有它，课程就只是一个"目录"：点进书架上的课，看到的只有阶段与单元名，
   * 真正要学的东西一个字都没有 —— 用户的原话是"仅仅只有个空壳"。
   * 有它，打开课程就能直接读这一节讲了什么。
   *
   * 按需生成（点一下才写），而不是建课时一次写完：
   * 一次写完整门课要几千 token 输出、还容易被截断，而且多数单元用户暂时不会看。
   */
  content?: string
  /** 正文是什么时候生成的，UI 上用来提示"可能已过时" */
  contentGeneratedAt?: IsoDateTime
  /**
   * 这一节对应的外部教学资源（通常是视频合集中的**那一讲**）。
   *
   * ⚠️ 地址由模型给出，**没有经过校验**：模型可能记错、视频可能被删。
   * 所以界面上必须让用户看得出"这是 AI 给的"，并且能自己改 ——
   * 一个打不开的链接比没有链接更让人烦躁。
   */
  resourceUrl?: string
  /** 链接的显示名，如「翁恺 C 语言 · 第 3 讲」；没有就用域名兜底 */
  resourceLabel?: string
}

/** 一门课程 / 一份学习方案 */
export interface Course {
  id: Id
  title: string
  description?: string
  source: CourseSource
  /** 学习目标：学完之后能做什么 */
  goal?: string
  /** 期望完成日期，用于倒排 */
  deadline?: DateKey
  /** 每周可投入分钟数，AI 生成计划时会参考 */
  weeklyMinutes?: number
  stages: Stage[]
  /** 原始文件导入的来源信息 */
  importedFrom?: {
    fileName: string
    fileType: 'epub' | 'txt' | 'md'
    importedAt: IsoDateTime
  }
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// 2. 计划与排期
// ---------------------------------------------------------------------------

export type PlanItemStatus =
  /** 待完成 */
  | 'todo'
  /** 已完成 */
  | 'done'
  /** 已跳过（用户主动放弃，不算完成，但也不再提醒） */
  | 'skipped'

/**
 * 一条排期项：把某个 Unit 安排到某一天。
 * 一个 Unit 可以被拆成多条（内容多、一天学不完），也可以多条合并到一天。
 */
export interface PlanItem {
  id: Id
  courseId: Id
  unitId: Id
  /** 安排在哪一天 */
  date: DateKey
  /** 本次安排的时长（分钟） */
  minutes: number
  status: PlanItemStatus
  completedAt?: IsoDateTime
}

/** 一次排期生成的产物。保留 generatedBy 是为了在 UI 上区分「AI 排的」和「规则排的」 */
export interface Plan {
  id: Id
  courseId: Id
  items: PlanItem[]
  generatedBy: 'rule' | 'ai'
  /** 生成这份计划时参考的每周可投入时长 */
  weeklyMinutes?: number
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// 3. 每日待办
// ---------------------------------------------------------------------------

/**
 * 待办有两种来源：
 * - 由 PlanItem 派生（planItemId 有值）—— 完成它会回流更新掌握状态
 * - 用户手写或对话里抽出来的（planItemId 为空）—— 独立任务，如「交作业」
 */
export interface Todo {
  id: Id
  courseId?: Id
  planItemId?: Id
  /**
   * 关联到的课程单元。
   *
   * 与 planItemId 的分工：计划项是"某个单元被排到了某一天"，
   * 而关联说的是"这件事就是那个单元的内容"。手输的待办没有计划项，
   * 但同样应该让课程结构里对应单元变成灰态 —— 所以这里要能直接指向单元。
   */
  unitId?: Id
  /**
   * 关联到的**整个阶段**（"我要学完阶段一"这类）。
   *
   * 与 unitId 的分工：unitId 是"这件事就是那一节"，
   * stageId 是"这件事覆盖这一整段" —— 勾掉它，这一段里每一节都算完成。
   * 少了这个字段，一句"学完阶段一"就只能挂到某一个单元上，
   * 于是勾完之后被划掉的是别的某一节（用户报的正是这个）。
   */
  stageId?: Id
  title: string
  /** 归属日期，今日待办按它过滤 */
  date: DateKey
  minutes?: number
  /**
   * 周标记：这一条不是"某天的事"，而是"这一周想做到的事"。
   *
   * 存的是那一周的周一（DateKey），于是它天然可排序、可跨天比较，
   * 也就能在左侧待办区置顶显示而不必再建一种数据类型。
   */
  weekStart?: DateKey
  done: boolean
  completedAt?: IsoDateTime
  createdAt: IsoDateTime
  /** 来源：手动添加，或从对话里由 AI 抽取 —— UI 上据此给出不同提示 */
  source?: 'manual' | 'ai-extract'
}

// ---------------------------------------------------------------------------
// 4. 角色（Persona）
// ---------------------------------------------------------------------------

/**
 * AI 学伴的人格设定。
 * 注意职责划分：**角色属于「当前是谁在教」，记忆属于「用户」**（跨角色共享）。
 * 所以切换角色不会清空记忆 —— 换个老师，他依然知道你哪块薄弱。
 */
export interface Persona {
  id: Id
  name: string
  /** emoji 头像，避免引入图片资源 */
  avatar: string
  /** 身份背景，如「带过三届考研的计算机讲师」 */
  identity: string
  /** 性格，如「耐心、不打击人、但会指出问题」 */
  personality: string
  /** 说话风格，如「口语化、多用类比、少用术语」 */
  speakingStyle: string
  /** 教学策略：先讲原理还是先给例子、是否反问引导 */
  teachingStrategy: string
  /** 禁忌：不希望它做的事 */
  taboos: string
  /** 内置模板不可删除，但可以「复制后修改」 */
  builtin: boolean
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// 5. 对话
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: Id
  role: 'user' | 'assistant'
  content: string
  createdAt: IsoDateTime
  /**
   * 这条回答是**哪个角色**说的。
   *
   * 必须逐条记住，不能只记在会话上：用户可以中途换角色接着聊，
   * 之后回看这段历史时，每条回答都该是当时那个角色的头像与名字 ——
   * 否则一换角色，整段历史看起来都变成了新角色说的，等于篡改了对话记录。
   */
  personaId?: Id
  /** 该条消息的生成是否失败，用于 UI 显示重试 */
  failed?: boolean
}

export interface Conversation {
  id: Id
  personaId: Id
  /** 绑定的课程，用于把课程上下文注入提示词 */
  courseId?: Id
  title: string
  messages: ChatMessage[]
  /** 记忆第 1 层：会话过长时的摘要压缩结果 */
  summary?: string
  /**
   * 摘要已经覆盖到第几条消息（messages 的下标数量）。
   *
   * 没有它就没法知道"摘要之外还有哪些没被压缩过" ——
   * 结果要么重复摘要、要么把中间一段对话永久丢掉。
   * 会话越长这个字段越关键：它是"超长记忆"能成立的唯一依据。
   */
  summaryUpTo?: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// 6. 记忆系统（四层）
// ---------------------------------------------------------------------------

/**
 * 记忆分层：
 * - `fact`    事实记忆：专业、年级、目标、学习偏好等稳定事实
 * - `mastery` 掌握状态：某个知识点学到什么程度，「进步」的唯一量化载体
 * - `episode` 情景记忆：什么时候问过什么、当时懂没懂
 *
 * 注：第 1 层「会话记忆」不是独立实体，它由 `Conversation.messages` +
 * `Conversation.summary` 承载，因此不出现在这里。
 */
export type MemoryLayer = 'fact' | 'mastery' | 'episode'

/** 掌握程度，从低到高 */
export type MasteryLevel = 'unknown' | 'learning' | 'weak' | 'mastered'

/** 记忆的来源，决定了我们对它的信任度和能否被规则自动更新 */
export type MemorySource =
  /** 由 LLM 从对话中抽取 */
  | 'ai-extract'
  /** 用户手动添加或编辑 */
  | 'user'
  /** 由待办完成情况等规则直接推导，不消耗 LLM 调用 */
  | 'rule'

export interface MemoryEntry {
  id: Id
  layer: MemoryLayer
  /** 归属课程；全局记忆（如「我是计算机专业大三」）为空 */
  courseId?: Id
  /** 仅 mastery 层使用：对应 Unit.knowledgePoints 中的某个知识点 */
  knowledgePoint?: string
  /** 记忆正文，一句话表述 */
  content: string
  /** 仅 mastery 层使用 */
  level?: MasteryLevel
  /** 置信度 0~1：AI 抽取的低于用户手填的；长期不用会被降权 */
  confidence: number
  source: MemorySource
  /** 追溯到哪次对话，便于用户核对「它为什么记得这个」 */
  sourceConversationId?: Id
  createdAt: IsoDateTime
  /** 最近一次被检索注入提示词的时间，用于计算遗忘降权 */
  lastUsedAt?: IsoDateTime
  /** 被使用次数，常用的记忆更可靠 */
  useCount: number
  /** 已归档（软删除），保留数据但不再注入提示词 */
  archived?: boolean
}

// ---------------------------------------------------------------------------
// 7. 设置
// ---------------------------------------------------------------------------

/**
 * 大模型接入配置。刻意只实现「OpenAI 兼容协议」一种形态 ——
 * DeepSeek / Moonshot / 通义 / Ollama / 官方 OpenAI 都兼容它，覆盖面足够。
 */
export interface LlmSettings {
  /** 如 https://api.deepseek.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export interface AppSettings {
  llm: LlmSettings
  /** 当前使用的角色 */
  activePersonaId: Id
  /** 每日固定时刻的页面内提醒（只在应用打开时可见） */
  reminderEnabled: boolean
  dailyReminderTime: TimeKey
  /**
   * 桌面提醒：一天中在**随机时间**于屏幕右下角弹一条小窗，3 秒后自动消失。
   *
   * 与 reminderEnabled 是两件事，刻意分开：
   * - 那个是「固定时刻 + 页面内横幅」，只在应用开着时看得到
   * - 这个是「随机时刻 + 系统级小窗」，应用收进托盘后照样会弹 ——
   *   它才是真正能把人叫回来的那条通道
   */
  desktopReminderEnabled: boolean
  /** 只在活跃时段内弹，之外不打扰 */
  desktopReminderFrom: TimeKey
  desktopReminderTo: TimeKey
  /** 一天最多弹几条。没有上限的提醒会变成骚扰 */
  desktopReminderMaxPerDay: number
  /** 是否在生成记忆前征求确认（控制 token 消耗） */
  autoExtractMemory: boolean
  /**
   * 省流模式：在**不降低回答质量**的前提下压掉冗余上下文。
   *
   * 关掉它不是"更好"，而是"更贵"：同一轮对话会多带上整棵课程大纲、
   * 更长的历史尾巴和更多记忆条目。默认开启，因为 API 费用是用户自己付的。
   */
  efficientMode: boolean
}

// ---------------------------------------------------------------------------
// 8. 提醒
// ---------------------------------------------------------------------------

export type ReminderKind = 'study' | 'daily'

/** 已触发的提醒记录，避免同一天重复弹窗 */
export interface ReminderLog {
  id: Id
  kind: ReminderKind
  /** 关联的待办，daily 类型为空 */
  todoId?: Id
  firedAt: IsoDateTime
}

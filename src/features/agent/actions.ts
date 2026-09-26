/**
 * 全局 AI 的**动作注册表**。
 *
 * 「在规则内帮我干事」这句话里的"规则"，如果不落到一张表上，就只是散在各处的 if ——
 * 那样既看不出它一共能干什么，也没法回答"这个动作危不危险、要不要先问一句"。
 * 所以每个动作在这里声明三件事：叫什么（回执里给用户看的人话）、要什么参数、
 * 以及**边界**（是否需要用户确认）。
 *
 * 边界只有一条判据：**能不能撤销**。
 * - 删除课程 / 删除计划 —— 内容一起没了，撤销不回来 → 不直接执行，先问一句。
 * - 删除待办 → 也不可撤销，但它是一条轻量任务，且用户常常就是刚说完"这个不做了"，
 *   再拦一道只会让人觉得啰嗦 → 直接执行，但回执里点名删掉了哪一条。
 * - 其余（勾掉、改期、重排、改 deadline、改提醒）都可逆 —— 直接执行并如实回报。
 *
 * ⚠️ 新增动作时必须在这里登记：不在表里的动作类型一律被拒绝执行，
 * 而不是"先跑了再说"。模型是会编的，而这张表是它编不出东西来的地方。
 */

export type AgentActionType =
  /** 改一条已有待办的日期和/或标题 */
  | 'update_todo'
  /** 删掉一条待办 */
  | 'delete_todo'
  /** 清空待办：全部未完成的，或某一门课的那一批 */
  | 'clear_todos'
  /** 把一条待办标记为完成（会回流到计划与掌握状态） */
  | 'complete_todo'
  /** 重新排期；可同时改「每周可投入」 */
  | 'reschedule_course'
  /** 改课程的期望完成日期 */
  | 'set_deadline'
  /** 删掉一门课的学习计划（课程内容保留） */
  | 'delete_plan'
  /** 删掉整门课 */
  | 'delete_course'
  /** 新建一门课：不直接建，而是把目标带进「新建课程」流程让用户核对 */
  | 'create_course'
  /** 改每日固定提醒的时刻 / 开关 */
  | 'set_reminder'

export interface AgentActionSpec {
  type: AgentActionType
  /** 回执与确认框里用的人话名字 */
  label: string
  /** 需要用户点一下确认才执行（用于不可撤销的动作） */
  needsConfirm: boolean
  /** 参数名 → 人话说明。模型照这个填，界面照这个解释 */
  params: Record<string, string>
}

export const AGENT_ACTIONS: Record<AgentActionType, AgentActionSpec> = {
  update_todo: {
    type: 'update_todo',
    label: '改待办',
    needsConfirm: false,
    params: { todo: '待办标题（原样照抄）', when: '新的时间说法', title: '新的标题（可选）' },
  },
  delete_todo: {
    type: 'delete_todo',
    label: '删待办',
    needsConfirm: false,
    params: { todo: '待办标题（原样照抄）' },
  },
  clear_todos: {
    type: 'clear_todos',
    label: '清空待办',
    needsConfirm: true,
    params: {
      course: '只清某一门课的待办时填课程标题；清空全部就留空',
    },
  },
  complete_todo: {
    type: 'complete_todo',
    label: '完成待办',
    needsConfirm: false,
    params: { todo: '待办标题（原样照抄）' },
  },
  reschedule_course: {
    type: 'reschedule_course',
    label: '重新排期',
    needsConfirm: false,
    params: { course: '课程标题（可选）', weekly_hours: '每周可投入小时数（可选）' },
  },
  set_deadline: {
    type: 'set_deadline',
    label: '改期望完成日期',
    needsConfirm: false,
    params: { course: '课程标题（可选）', deadline: '新的时间说法' },
  },
  delete_plan: {
    type: 'delete_plan',
    label: '删除学习计划',
    needsConfirm: true,
    params: { course: '课程标题（可选）' },
  },
  delete_course: {
    type: 'delete_course',
    label: '删除课程',
    needsConfirm: true,
    params: { course: '课程标题' },
  },
  create_course: {
    type: 'create_course',
    label: '新建课程',
    needsConfirm: false,
    params: { goal: '想学什么，一句话' },
  },
  set_reminder: {
    type: 'set_reminder',
    label: '改提醒时刻',
    needsConfirm: false,
    params: { time: 'HH:MM', enabled: 'true/false（可选，默认打开）' },
  },
}

/** 动作类型的合法集合 —— 用来挡掉模型编出来的类型 */
const KNOWN_TYPES = new Set<string>(Object.keys(AGENT_ACTIONS))

export function isKnownActionType(value: unknown): value is AgentActionType {
  return typeof value === 'string' && KNOWN_TYPES.has(value)
}

// ---------------------------------------------------------------------------
// 提示词里给模型看的那段说明
// ---------------------------------------------------------------------------

/**
 * 动作清单的提示词。
 *
 * 从注册表**生成**而不是手写一份：手写的那份一定会和代码漂，
 * 而漂的表现是模型老老实实按提示词发动作、代码却认不出来（或反过来，
 * 代码支持的动作模型永远不知道）。这类"两边各写一份"的地方，
 * 少一份就少一个坑。
 */
/** 清单里最多列多少条未完成待办（与 features/memory/extract.ts 的取值保持一致） */
const LISTED_TODOS = 40

export function buildActionPrompt(): string {
  const lines = Object.values(AGENT_ACTIONS).map((spec) => {
    const params = Object.entries(spec.params)
      .map(([name, note]) => `"${name}": ${note}`)
      .join('，')
    return `- ${spec.type}（${spec.label}）：${params}`
  })

  return [
    '## 你可以替他做的事（actions）',
    '',
    '除"新增待办"之外的动作都写进 actions 数组。**只有他明确要求时才写**，',
    '不要因为"顺手"就替他改数据；他只是在聊学习、问问题、发感慨时，actions 一律留空数组。',
    '',
    ...lines,
    '',
    '### 怎么选对动作（选错了他会以为你没听懂）',
    '- **一条待办** → `delete_todo` / `update_todo` / `complete_todo`。',
    '  这是最常见的一类：「把取快递那条删了」「周三那个挪到周五」「第一章我看完了」。',
    '  ⚠️ **不要**因为清单里没找到就用 delete_plan 或 delete_course 代替 —— 那删掉的东西完全不同。',
    '- **整门课的计划**（"计划不要了""重新排一下"）→ `delete_plan` / `reschedule_course`。',
    '- **整门课**（"这门课不学了""删掉这门课"）→ `delete_course`。',
    '- 数量词是判据："那条""这个"是一条待办；"这门课""整门课"才涉及课程。',
    '',
    '### 字段怎么写',
    `- \`todo\`：优先从上面「他的未完成待办」里**原样照抄**（那里最多列了最近 ${LISTED_TODOS} 条）。`,
    '  **清单里没有的那条也要照他的原话写下来**，不要因为没找到就放弃这个动作 ——',
    '  系统会自己按标题去找，找到了就执行、找不到会如实告诉他。放弃才是真正的问题：',
    '  他会看到"我说了它毫无反应"。',
    '- `course`：优先用课程标题原文；省略时按"当前这门课"理解。',
    '- 时间词（when / deadline）用**他的原话**，系统自己解析，不要换算成日期。',
    '- `create_course` 只要他说想学什么新东西就写，系统会带他去核对课程方案，不会直接建课。',
    '- 删除课程与删除计划由系统先问一句再执行；**删除一条待办是直接执行的**，写进去即可。',
  ].join('\n')
}

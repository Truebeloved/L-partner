import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import { todayKey } from '@/lib/date'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { mergeSettings, useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { AppSettings, Conversation, Course, Id, MemoryEntry, Persona, Plan, Todo } from '@/types/models'

/**
 * 备份的导出与导入。
 *
 * 为什么导出和导入必须写在一起：这两件事是**同一个数据形状的两个方向**。
 * 分开各写一份，字段迟早会漂 —— 导出加了新 store，导入忘了带上，
 * 于是"备份"看起来成功、恢复回来却缺一块，而这种缺失在界面上完全看不出来。
 *
 * 导入的语义是**整份替换**，不是合并：合并要回答一堆没有正确答案的问题
 * （同 id 的课程听谁的？待办的去重键是什么？记忆重复了算不算同一条？），
 * 而用户说"导入备份"时心里想的就是"恢复成那个样子"。
 */

/** 目前只认这一版。将来存储结构变了就往上加，并在 parseBackup 里给出可读的提示 */
export const BACKUP_VERSION = 1

export interface BackupPayload {
  version: number
  exportedAt: string
  settings: AppSettings
  personas: Persona[]
  courses: Course[]
  plans: Record<Id, Plan>
  todos: Todo[]
  memories: MemoryEntry[]
  conversations: Conversation[]
}

export interface BackupSummary {
  courses: number
  plans: number
  todos: number
  memories: number
  conversations: number
  personas: number
  hasSettings: boolean
  /** 备份是什么时候导出的，让用户在确认框里能核对"是不是我要的那一份" */
  exportedAt?: string
}

export type ParseBackupResult =
  | { ok: true; payload: BackupPayload; summary: BackupSummary }
  | { ok: false; error: string }

/** 从各个 store 里收集一份完整备份 */
export function collectBackup(): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: useSettingsStore.getState().settings,
    personas: usePersonaStore.getState().personas,
    courses: useCourseStore.getState().courses,
    plans: usePlanStore.getState().plans,
    todos: useTodoStore.getState().todos,
    memories: useMemoryStore.getState().entries,
    conversations: useChatStore.getState().conversations,
  }
}

/** 备份文件名。带上日期，多次导出不会互相覆盖 */
export function backupFileName(): string {
  return `l-partner-backup-${todayKey()}.json`
}

/**
 * 解析并校验一份备份。
 *
 * 校验不是形式主义：导入是**覆盖全部数据**的动作，选错文件就等于把用户的
 * 课程、待办、记忆一次清空。所以宁可在这里拒绝，也不要"尽力而为地导入一部分"。
 */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '这个文件不是 JSON，可能选错了文件。' }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '文件的顶层不是一个对象，不像是备份。' }
  }

  const data = raw as Partial<BackupPayload>
  if (typeof data.version !== 'number') {
    return { ok: false, error: '看起来不是 L-partner 的备份文件（缺少版本号）。' }
  }
  if (data.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `这份备份来自更新的版本（v${data.version}），当前应用只认到 v${BACKUP_VERSION}。`,
    }
  }

  const courses = asArray<Course>(data.courses)
  const personas = asArray<Persona>(data.personas)
  const todos = asArray<Todo>(data.todos)
  const memories = asArray<MemoryEntry>(data.memories)
  const conversations = asArray<Conversation>(data.conversations)
  const plans = asRecord<Plan>(data.plans)
  const settings =
    data.settings && typeof data.settings === 'object' ? (data.settings as AppSettings) : undefined

  /*
   * 一份"什么都没带"的备份多半是选错了文件（或文件被截断），
   * 而导入它是把用户现有的数据全部清空 —— 这是最坏的一种"成功"。
   */
  const emptiness =
    courses.length + todos.length + memories.length + conversations.length + Object.keys(plans).length
  if (emptiness === 0 && !settings) {
    return { ok: false, error: '这份备份里没有任何课程、计划、待办、记忆或对话，导入它只会清空现有数据。' }
  }

  const payload: BackupPayload = {
    version: data.version,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    settings: settings ?? mergeSettings(undefined),
    personas,
    courses,
    plans,
    todos,
    memories,
    conversations,
  }

  return {
    ok: true,
    payload,
    summary: {
      courses: courses.length,
      plans: Object.keys(plans).length,
      todos: todos.length,
      memories: memories.length,
      conversations: conversations.length,
      personas: personas.length,
      hasSettings: Boolean(settings),
      exportedAt: payload.exportedAt || undefined,
    },
  }
}

/**
 * 把一份备份写进各个 store（整份替换）。
 *
 * 两处必须显式处理的细节：
 * 1. 内置角色为空时补回来。备份可能来自更早的版本、也可能被人工精简过，
 *    角色列表为空会让"当前角色"找不到对象，整页对话直接崩。
 * 2. **落一次 seededAt**。导入之后书架上就是备份里的课程了，
 *    不该再被"首次启动自动载入示例课程"补上三门。
 *
 * 导入后 activeId 置空：一段对话"正被选中"是会话级状态、不属于备份内容，
 * 对话页会自己接到最近聊过的那一场（见 ChatPage 的说明）。
 *
 * ⚠️ 这里**再校验一次字段形状**（而不是信任 BackupPayload 的类型）。
 * 类型只存在于编译期，而这是覆盖全部数据的最后一道口子：一份缺字段的备份
 * （旧版本导出、手工改过、被截断）会以 `undefined` 落到 store 里，
 * 之后在某个完全不相干的地方炸掉，且已经来不及回滚。
 */
export function applyBackup(payload: BackupPayload): void {
  const courses = asArray<Course>(payload?.courses)
  const personas = asArray<Persona>(payload?.personas)
  const todos = asArray<Todo>(payload?.todos)
  const memories = asArray<MemoryEntry>(payload?.memories)
  const conversations = asArray<Conversation>(payload?.conversations)
  const plans = asRecord<Plan>(payload?.plans)

  useCourseStore.setState({
    courses,
    seededAt: new Date().toISOString(),
  })
  usePlanStore.setState({ plans })
  useTodoStore.setState({ todos })
  useMemoryStore.setState({ entries: memories })
  useChatStore.setState({ conversations, activeId: null })
  usePersonaStore.setState({
    personas: personas.length > 0 ? personas : BUILTIN_PERSONAS,
  })
  // 逐字段补齐：导入的备份可能来自没有某个设置项的旧版本
  useSettingsStore.setState({ settings: mergeSettings(payload?.settings) })
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, T>
}

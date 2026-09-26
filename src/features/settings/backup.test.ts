import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 与其它 store 测试同一套处理：jsdom 没有 IndexedDB，
 * 真实的 idb 存储会让 persist 的写入变成未处理的 promise rejection。
 */
vi.mock('@/lib/storage/idbStorage', () => {
  const store = new Map<string, string>()
  return {
    STORAGE_PREFIX: 'lpartner-test',
    createIdbJSONStorage: () => ({
      getItem: async (name: string) => {
        const raw = store.get(name)
        return raw === undefined ? null : JSON.parse(raw)
      },
      setItem: async (name: string, value: unknown) => {
        store.set(name, JSON.stringify(value))
      },
      removeItem: async (name: string) => {
        store.delete(name)
      },
    }),
  }
})

import {
  applyBackup,
  BACKUP_VERSION,
  backupFileName,
  collectBackup,
  parseBackup,
} from '@/features/settings/backup'
import type { BackupPayload } from '@/features/settings/backup'
import { BUILTIN_PERSONAS } from '@/lib/seed/personas'
import { useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Conversation, Course, MemoryEntry, Persona, Plan, Todo } from '@/types/models'

/**
 * 导入是**覆盖全部数据**的动作，所以这一组守的是"宁可拒绝，也不要导入一半"：
 * 选错文件、版本更新、备份是空的，都必须被挡在落库之前。
 */

const AT = '2026-09-26T10:00:00.000Z'

const course: Course = {
  id: 'c1',
  title: '两个月上手 React',
  source: 'manual',
  stages: [],
  createdAt: AT,
  updatedAt: AT,
}

const plan: Plan = {
  id: 'p1',
  courseId: 'c1',
  generatedBy: 'rule',
  createdAt: AT,
  items: [
    { id: 'i1', courseId: 'c1', unitId: 'u1', date: '2026-09-27', minutes: 60, status: 'todo' },
  ],
}

const todo: Todo = {
  id: 't1',
  title: '取快递',
  date: '2026-09-27',
  done: false,
  createdAt: AT,
  source: 'ai-extract',
}

const memory: MemoryEntry = {
  id: 'm1',
  layer: 'fact',
  content: '他是计算机专业大三学生',
  confidence: 0.9,
  source: 'ai-extract',
  createdAt: AT,
  useCount: 0,
}

const persona: Persona = {
  id: 'custom-1',
  name: '我的督学',
  avatar: 'sprout',
  identity: '带过三届考研的计算机讲师',
  personality: '耐心但会指出问题',
  speakingStyle: '口语化',
  teachingStrategy: '先给例子',
  taboos: '不打击人',
  builtin: false,
  createdAt: AT,
}

const conversation: Conversation = {
  id: 'main',
  personaId: 'custom-1',
  title: '主对话',
  messages: [{ id: 'msg1', role: 'user', content: '在吗', createdAt: AT }],
  createdAt: AT,
  updatedAt: AT,
}

function seedEverything() {
  useCourseStore.setState({ courses: [course], seededAt: AT })
  usePlanStore.setState({ plans: { c1: plan } })
  useTodoStore.setState({ todos: [todo] })
  useMemoryStore.setState({ entries: [memory] })
  useChatStore.setState({ conversations: [conversation], activeId: 'main' })
  usePersonaStore.setState({ personas: [persona] })
}

function wipeEverything() {
  useCourseStore.setState({ courses: [], seededAt: null })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
  useMemoryStore.setState({ entries: [] })
  useChatStore.setState({ conversations: [], activeId: null })
  usePersonaStore.setState({ personas: BUILTIN_PERSONAS })
}

beforeEach(() => {
  wipeEverything()
})

describe('parseBackup 的拒绝条件', () => {
  it('不是 JSON', () => {
    const result = parseBackup('这不是 json')
    expect(result.ok).toBe(false)
  })

  it('顶层不是对象（例如直接选了一个数组文件）', () => {
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('"hello"').ok).toBe(false)
  })

  it('缺少版本号 —— 不是这个应用的备份', () => {
    const result = parseBackup(JSON.stringify({ courses: [course] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('版本号')
  })

  it('来自更新的版本', () => {
    const result = parseBackup(JSON.stringify({ version: BACKUP_VERSION + 1, courses: [course] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('更新的版本')
  })

  it('空备份 —— 导入它等于清空用户的数据', () => {
    const result = parseBackup(JSON.stringify({ version: 1, courses: [], todos: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('清空')
  })
})

describe('parseBackup 的接受条件', () => {
  it('列出这份备份里到底有什么，供用户核对', () => {
    seedEverything()
    const result = parseBackup(JSON.stringify(collectBackup()))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary).toMatchObject({
      courses: 1,
      plans: 1,
      todos: 1,
      memories: 1,
      conversations: 1,
      personas: 1,
      hasSettings: true,
    })
    expect(result.summary.exportedAt).toBeTruthy()
  })

  it('缺字段的旧备份用空值补齐，不崩', () => {
    const result = parseBackup(JSON.stringify({ version: 1, courses: [course] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.todos).toEqual([])
    expect(result.payload.plans).toEqual({})
    expect(result.payload.conversations).toEqual([])
  })
})

describe('导出再导入', () => {
  it('原样恢复课程、计划、待办、记忆、对话与角色', () => {
    seedEverything()
    // 过一遍 JSON：备份文件本来就是文本，不能指望内存里的对象引用
    const text = JSON.stringify(collectBackup())
    wipeEverything()

    const result = parseBackup(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    applyBackup(result.payload)

    expect(useCourseStore.getState().courses).toEqual([course])
    expect(usePlanStore.getState().plans).toEqual({ c1: plan })
    expect(useTodoStore.getState().todos).toEqual([todo])
    expect(useMemoryStore.getState().entries).toEqual([memory])
    expect(useChatStore.getState().conversations).toEqual([conversation])
    expect(usePersonaStore.getState().personas).toEqual([persona])
  })

  it('导入后不再补示例课程 —— 书架上就是备份里的那些', () => {
    seedEverything()
    const text = JSON.stringify(collectBackup())
    wipeEverything()

    const result = parseBackup(text)
    if (!result.ok) throw new Error('应当解析成功')
    applyBackup(result.payload)

    expect(useCourseStore.getState().seededAt).not.toBeNull()
  })

  it('对话"正被选中"不属于备份内容，导入后置空由对话页自己接上', () => {
    seedEverything()
    const text = JSON.stringify(collectBackup())
    wipeEverything()

    const result = parseBackup(text)
    if (!result.ok) throw new Error('应当解析成功')
    applyBackup(result.payload)

    expect(useChatStore.getState().activeId).toBeNull()
  })

  it('备份里角色为空时补回内置角色 —— 否则"当前角色"找不到对象，整页对话会崩', () => {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: AT,
      settings: useSettingsStore.getState().settings,
      personas: [],
      courses: [course],
      plans: {},
      todos: [],
      memories: [],
      conversations: [],
    }

    applyBackup(payload)

    expect(usePersonaStore.getState().personas.length).toBe(BUILTIN_PERSONAS.length)
  })

  it('旧备份里缺的设置项用默认值补齐', () => {
    const payload = {
      version: 1,
      courses: [course],
      // 故意只给一半字段，模拟老版本导出的备份
      settings: { llm: { baseUrl: 'https://api.deepseek.com/v1' } },
    } as unknown as BackupPayload

    applyBackup(payload)

    const settings = useSettingsStore.getState().settings
    expect(settings.llm.baseUrl).toBe('https://api.deepseek.com/v1')
    // 缺的字段必须是默认值，而不是 undefined（undefined 会在别处炸掉）
    expect(settings.llm.model).toBe('deepseek-chat')
    expect(typeof settings.efficientMode).toBe('boolean')
  })
})

describe('backupFileName', () => {
  it('带日期，多次导出不会互相覆盖', () => {
    expect(backupFileName()).toMatch(/^l-partner-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

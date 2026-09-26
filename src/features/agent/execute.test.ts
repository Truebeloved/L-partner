import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 与其它 store 测试同一套处理：jsdom 没有 IndexedDB */
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

import { AGENT_ACTIONS, buildActionPrompt } from '@/features/agent/actions'
import { applyAgentActions } from '@/features/agent/execute'
import type { PendingAction } from '@/features/agent/execute'
import { resolveCourse, resolveTodo } from '@/features/agent/resolve'
import { dayjs, toDateKey, todayKey } from '@/lib/date'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'
import type { Course, Plan, Todo } from '@/types/models'

/**
 * 全局 AI 的动作层。
 *
 * 这一组守的是"在规则内"这四个字：
 * - 不认识的动作必须被**拒绝**（模型会编），而不是静默忽略；
 * - 认不出对象时必须**说不知道**（"删掉那门课"里"那门"是哪门？），而不是挑一个最像的；
 * - 不可撤销的动作必须**停在确认那一步**，绝不能顺手执行。
 */

const AT = '2026-09-20T08:00:00.000Z'

function makeCourse(id: string, title: string): Course {
  return {
    id,
    title,
    source: 'manual',
    goal: '能自己做出东西',
    weeklyMinutes: 600,
    deadline: '2026-12-31',
    stages: [
      {
        id: `${id}-s1`,
        title: '第一阶段',
        objective: '',
        order: 0,
        units: [
          {
            id: `${id}-u1`,
            title: '第一讲',
            knowledgePoints: ['知识点 A'],
            estimatedMinutes: 60,
            order: 0,
          },
          {
            id: `${id}-u2`,
            title: '第二讲',
            knowledgePoints: ['知识点 B'],
            estimatedMinutes: 60,
            order: 1,
          },
        ],
      },
    ],
    createdAt: AT,
    updatedAt: AT,
  }
}

function makePlan(courseId: string): Plan {
  return {
    id: `${courseId}-plan`,
    courseId,
    generatedBy: 'rule',
    createdAt: AT,
    items: [
      {
        id: `${courseId}-i1`,
        courseId,
        unitId: `${courseId}-u1`,
        date: todayKey(),
        minutes: 60,
        status: 'todo',
      },
    ],
  }
}

function makeTodo(overrides: Partial<Todo> & { id: string; title: string }): Todo {
  return {
    date: todayKey(),
    done: false,
    createdAt: AT,
    source: 'manual',
    ...overrides,
  }
}

const REACT = makeCourse('c-react', '两个月上手 React')
const CLANG = makeCourse('c-clang', 'C语言基础入门')

function reset(courses: Course[] = [REACT, CLANG]) {
  useCourseStore.setState({ courses, seededAt: AT })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
  useMemoryStore.setState({ entries: [] })
  useSettingsStore.getState().reset()
}

beforeEach(() => {
  reset()
})

describe('动作注册表', () => {
  it('提示词里列出了全部动作类型 —— 注册表与提示词是同一份', () => {
    const guide = buildActionPrompt()
    for (const type of Object.keys(AGENT_ACTIONS)) {
      expect(guide, type).toContain(type)
    }
  })

  it('只有删除类动作需要确认', () => {
    const needConfirm = Object.values(AGENT_ACTIONS)
      .filter((spec) => spec.needsConfirm)
      .map((spec) => spec.type)
      .sort()
    expect(needConfirm).toEqual(['delete_course', 'delete_plan'])
  })
})

describe('模糊解析', () => {
  it('课程名支持部分提及（"C语言"认得出《C语言基础入门》）', () => {
    const result = resolveCourse('C语言', { courses: [REACT, CLANG] })
    expect(result.ok && result.item.id).toBe('c-clang')
  })

  it('两门课一样像时拒绝，而不是挑一个', () => {
    // 两门课都叫「第一阶段」这种重名场景由标题决定；这里直接给一个歧义引用
    const twins = [makeCourse('a', '学习方法'), makeCourse('b', '学习规划')]
    const result = resolveCourse('学习', { courses: twins })
    expect(result.ok).toBe(false)
  })

  it('没给课程名时用当前对话绑的课程兜底', () => {
    const result = resolveCourse('', { courses: [REACT, CLANG], conversationCourseId: 'c-clang' })
    expect(result.ok && result.item.id).toBe('c-clang')
  })

  it('没给课程名、也没绑课程时：只有一门课才敢兜底', () => {
    expect(resolveCourse('', { courses: [REACT] }).ok).toBe(true)
    // 主对话里说"把计划删了"，书架上有两门课 —— 绝不能随机挑一门
    expect(resolveCourse('', { courses: [REACT, CLANG] }).ok).toBe(false)
  })

  it('待办按标题解析，未完成的优先', () => {
    const todos = [
      makeTodo({ id: 't-done', title: '取快递', done: true }),
      makeTodo({ id: 't-open', title: '取快递', done: false }),
    ]
    const result = resolveTodo('取快递', { todos })
    expect(result.ok && result.item.id).toBe('t-open')
  })

  it('同名待办并列时拒绝', () => {
    const todos = [
      makeTodo({ id: 't1', title: '交作业' }),
      makeTodo({ id: 't2', title: '交作业' }),
    ]
    expect(resolveTodo('交作业', { todos }).ok).toBe(false)
  })
})

describe('待办类动作', () => {
  it('改期：把待办挪到明天', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '写实验报告' })] })

    const result = applyAgentActions([{ type: 'update_todo', todo: '写实验报告', when: '明天' }])

    expect(result.applied).toHaveLength(1)
    const expected = toDateKey(dayjs().add(1, 'day'))
    expect(useTodoStore.getState().todos[0]?.date).toBe(expected)
    expect(result.applied[0]?.receipt).toContain('写实验报告')
  })

  it('改期：认不出时间说法就拒绝，并说明原因', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '写实验报告' })] })

    const result = applyAgentActions([{ type: 'update_todo', todo: '写实验报告', when: '有空的时候' }])

    expect(result.applied).toHaveLength(0)
    expect(result.rejected[0]).toContain('没看懂时间')
    // 原文没动
    expect(useTodoStore.getState().todos[0]?.date).toBe(todayKey())
  })

  it('删待办：直接执行（轻量且常常就是用户刚说的话），但回执点名删了哪条', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '取快递' })] })

    const result = applyAgentActions([{ type: 'delete_todo', todo: '取快递' }])

    expect(useTodoStore.getState().todos).toHaveLength(0)
    expect(result.applied[0]?.receipt).toContain('取快递')
  })

  it('完成待办：走与界面勾选同一条链路（排期项 + 掌握状态都跟上）', () => {
    useCourseStore.setState({ courses: [REACT, CLANG] })
    usePlanStore.setState({ plans: { 'c-react': makePlan('c-react') } })
    useTodoStore.setState({
      todos: [
        makeTodo({
          id: 't1',
          title: '第一讲',
          courseId: 'c-react',
          unitId: 'c-react-u1',
          planItemId: 'c-react-i1',
        }),
      ],
    })

    const result = applyAgentActions([{ type: 'complete_todo', todo: '第一讲' }])

    expect(result.applied[0]?.receipt).toContain('完成')
    expect(useTodoStore.getState().todos[0]?.done).toBe(true)
    // 排期项状态回流了
    expect(usePlanStore.getState().plans['c-react']?.items[0]?.status).toBe('done')
    // 掌握状态也回流了（知识点 A 落在 learning）
    const mastery = useMemoryStore.getState().entries.filter((entry) => entry.layer === 'mastery')
    expect(mastery).toHaveLength(1)
    expect(mastery[0]?.knowledgePoint).toBe('知识点 A')
  })

  it('完成待办：已经完成过就说清楚，不假装刚做完', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '取快递', done: true })] })
    const result = applyAgentActions([{ type: 'complete_todo', todo: '取快递' }])
    expect(result.applied[0]?.receipt).toContain('之前就已经完成')
  })

  it('认不出待办时如实说，不做任何改动', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '取快递' })] })
    const result = applyAgentActions([{ type: 'delete_todo', todo: '写完毕业论文' }])
    expect(result.applied).toHaveLength(0)
    expect(result.rejected[0]).toContain('没找到')
    expect(useTodoStore.getState().todos).toHaveLength(1)
  })
})

describe('课程类动作', () => {
  it('重新排期：同时改每周可投入', () => {
    const result = applyAgentActions([
      { type: 'reschedule_course', course: 'React', weekly_hours: 3 },
    ])

    expect(useCourseStore.getState().getById('c-react')?.weeklyMinutes).toBe(180)
    expect(usePlanStore.getState().getByCourse('c-react')).toBeDefined()
    expect(result.applied[0]?.receipt).toContain('每周 3 小时')
    // 回执要如实说新增了多少条待办 —— 拿物化函数的返回值会永远是 0（它幂等）
    expect(useTodoStore.getState().todos.length).toBeGreaterThan(0)
    expect(result.applied[0]?.receipt).toContain('新增')
  })

  it('已经排过期的课程再重排：待办条数仍然如实', () => {
    applyAgentActions([{ type: 'reschedule_course', course: 'React' }])
    const first = useTodoStore.getState().todos.length

    const result = applyAgentActions([{ type: 'reschedule_course', course: 'React' }])

    expect(first).toBeGreaterThan(0)
    expect(result.applied[0]?.receipt).toContain('重排')
  })

  it('改 deadline：顺手重排，避免"新截止日期 + 旧排期"自相矛盾', () => {
    usePlanStore.setState({ plans: { 'c-react': makePlan('c-react') } })

    const result = applyAgentActions([
      { type: 'set_deadline', course: '两个月上手 React', deadline: '月底' },
    ])

    const expected = toDateKey(dayjs().endOf('month'))
    expect(useCourseStore.getState().getById('c-react')?.deadline).toBe(expected)
    expect(result.applied[0]?.receipt).toContain('重排')
  })

  it('改 deadline：给了一周而不是某一天时拒绝（截止日期不该落在一周上）', () => {
    const result = applyAgentActions([{ type: 'set_deadline', course: 'React', deadline: '这周' }])
    expect(result.applied).toHaveLength(0)
    expect(result.rejected[0]).toContain('一周')
  })

  it('删课程：**不执行**，只产出一条待确认', () => {
    const result = applyAgentActions([{ type: 'delete_course', course: 'React' }])

    expect(result.applied).toHaveLength(0)
    expect(result.pending).toHaveLength(1)
    // 还没点确认，课程必须还在
    expect(useCourseStore.getState().getById('c-react')).toBeDefined()
    expect(pendingOf(result.pending, 0).prompt).toContain('两个月上手 React')
  })

  it('删计划：待确认 → 确认后才真的删', () => {
    usePlanStore.setState({ plans: { 'c-react': makePlan('c-react') } })

    const result = applyAgentActions([{ type: 'delete_plan', course: 'React' }])
    expect(result.pending).toHaveLength(1)
    expect(usePlanStore.getState().getByCourse('c-react')).toBeDefined()

    const pending = pendingOf(result.pending, 0)
    if (pending.kind !== 'destructive') throw new Error('应当是待确认的破坏性动作')
    const receipt = pending.run()

    expect(usePlanStore.getState().getByCourse('c-react')).toBeUndefined()
    expect(receipt).toContain('删除')
  })

  it('建课程：不落库，把目标带进新建流程让用户核对', () => {
    const result = applyAgentActions([{ type: 'create_course', goal: '两个月上手 Rust' }])

    expect(result.pending).toHaveLength(1)
    const pending = pendingOf(result.pending, 0)
    expect(pending.kind).toBe('create_course')
    if (pending.kind !== 'create_course') return
    expect(pending.goal).toBe('两个月上手 Rust')
    // 书架上没有被直接塞进一门课
    expect(useCourseStore.getState().courses).toHaveLength(2)
  })

  it('只说"那门课"而书架上有好几门时拒绝', () => {
    const result = applyAgentActions([{ type: 'delete_plan', course: '' }])
    expect(result.pending).toHaveLength(0)
    expect(result.rejected[0]).toContain('没说是哪门课')
  })
})

describe('提醒与非法输入', () => {
  it('改提醒时刻并打开开关', () => {
    const result = applyAgentActions([{ type: 'set_reminder', time: '21:00' }])
    const settings = useSettingsStore.getState().settings
    expect(settings.dailyReminderTime).toBe('21:00')
    expect(settings.reminderEnabled).toBe(true)
    expect(result.applied[0]?.receipt).toContain('21:00')
  })

  it('时刻格式不对就拒绝', () => {
    const result = applyAgentActions([{ type: 'set_reminder', time: '晚上九点' }])
    expect(result.applied).toHaveLength(0)
    expect(result.rejected[0]).toContain('HH:MM')
  })

  it('不认识的动作类型一律拒绝 —— 模型会编，这里是最后一道', () => {
    const result = applyAgentActions([{ type: 'delete_everything' }, { type: 42 }])
    expect(result.applied).toHaveLength(0)
    expect(result.pending).toHaveLength(0)
    expect(result.rejected).toHaveLength(2)
    expect(result.rejected[0]).toContain('不认识的动作')
  })

  it('actions 不是数组时当作没有动作', () => {
    expect(applyAgentActions(undefined).applied).toHaveLength(0)
    expect(applyAgentActions('delete_course').applied).toHaveLength(0)
    expect(applyAgentActions([null, 'x', 3]).applied).toHaveLength(0)
  })

  it('单个动作写成对象（少了方括号）也要执行 —— 否则它静默消失', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '取快递' })] })

    const result = applyAgentActions({ type: 'delete_todo', todo: '取快递' })

    expect(useTodoStore.getState().todos).toHaveLength(0)
    expect(result.applied).toHaveLength(1)
  })
})

describe('同一轮里的执行顺序', () => {
  it('先改动、后删除 —— 删除永远作用在动作发出时的那一条上', () => {
    useTodoStore.setState({ todos: [makeTodo({ id: 't1', title: '取快递' })] })

    const result = applyAgentActions([
      { type: 'delete_todo', todo: '取快递' },
      { type: 'update_todo', todo: '取快递', when: '明天' },
    ])

    // 更新先发生（没有报"找不到"），随后删除把它带走
    expect(result.rejected).toHaveLength(0)
    expect(useTodoStore.getState().todos).toHaveLength(0)
  })
})

function pendingOf(list: PendingAction[], index: number): PendingAction {
  const item = list[index]
  if (!item) throw new Error(`第 ${index} 条待确认动作不存在`)
  return item
}

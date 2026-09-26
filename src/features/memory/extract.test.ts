import { beforeEach, describe, expect, it } from 'vitest'

import { applyExtractedTodos, applyTodoLinks, extractMemories } from '@/features/memory/extract'
import { dayjs, toDateKey } from '@/lib/date'
import type { LlmProvider } from '@/lib/llm/types'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { ChatMessage, Course, Plan } from '@/types/models'

/**
 * 「全局 AI」最重要的一条链路：对话里说的话 → 待办栏。
 *
 * 它跨了三个 store（课程 / 计划 / 待办），而真正容易出错的地方全在细节上：
 * 日期解析、兜底、去重、课程关联。所以这里直接喂一份"模型返回的 JSON"，
 * 断言落库后的结果 —— 与线上走的是同一条代码路径。
 */

const NOW = new Date('2026-09-23T10:00:00') // 周三

const course: Course = {
  id: 'c1',
  title: '两个月上手 React',
  source: 'manual',
  goal: '',
  weeklyMinutes: 600,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  stages: [
    {
      id: 's1',
      title: '起步',
      objective: '',
      order: 0,
      units: [
        {
          id: 'u1',
          title: '环境与第一个组件',
          knowledgePoints: [],
          estimatedMinutes: 60,
          order: 0,
        },
      ],
    },
  ],
}

const plan: Plan = {
  id: 'p1',
  courseId: 'c1',
  generatedBy: 'rule',
  createdAt: '2026-09-01T00:00:00.000Z',
  items: [
    { id: 'i1', courseId: 'c1', unitId: 'u1', date: '2026-09-24', minutes: 60, status: 'todo' },
  ],
}

beforeEach(() => {
  useTodoStore.setState({ todos: [] })
  usePlanStore.setState({ plans: { c1: plan } })
  useCourseStore.setState({ courses: [course] })
})

describe('applyExtractedTodos', () => {
  it('今天的事落到今天，「下周三」落到下周三', () => {
    const created = applyExtractedTodos(
      { todos: [{ title: '复习闭包', when: '今天' }, { title: '交作业', when: '下周三' }] },
      { now: NOW },
    )

    expect(created).toBe(2)
    const dates = useTodoStore
      .getState()
      .todos.map((todo) => `${todo.title}@${todo.date}`)
      .sort()
    expect(dates).toEqual(['交作业@2026-09-30', '复习闭包@2026-09-23'])
  })

  it('时间认不出来时兜底成今天，而不是丢进一个没人看的日期', () => {
    applyExtractedTodos({ todos: [{ title: '整理笔记', when: '有空的时候' }] }, { now: NOW })
    expect(useTodoStore.getState().todos[0]?.date).toBe('2026-09-23')
  })

  it('「这周想做到」变成周目标：日期落在本周一，并带周标记', () => {
    const created = applyExtractedTodos(
      { todos: [{ title: '把第一章过一遍', when: '这周' }], weekly: ['这周背完 500 个单词'] },
      { now: NOW },
    )

    expect(created).toBe(2)
    for (const todo of useTodoStore.getState().todos) {
      expect(todo.weekStart).toBe('2026-09-21')
      expect(todo.date).toBe('2026-09-21')
    }
  })

  it('同一天同名的不重复落库 —— 同一件事在对话里常被提起好几次', () => {
    const payload = { todos: [{ title: '交作业', when: '明天' }] }
    expect(applyExtractedTodos(payload, { now: NOW })).toBe(1)
    expect(applyExtractedTodos(payload, { now: NOW })).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(1)
  })

  it('能对上课程内容时，自动挂上课程与单元（勾掉它课程结构就会划掉）', () => {
    applyExtractedTodos(
      { todos: [{ title: '今天把「环境与第一个组件」看完', when: '今天' }] },
      { now: NOW },
    )

    const todo = useTodoStore.getState().todos[0]
    expect(todo?.courseId).toBe('c1')
    expect(todo?.unitId).toBe('u1')
    expect(todo?.planItemId).toBe('i1')
  })

  it('对不上课程也不影响它成为一条待办', () => {
    applyExtractedTodos({ todos: [{ title: '去拿快递', when: '今天' }] }, { now: NOW })
    const todo = useTodoStore.getState().todos[0]
    expect(todo?.title).toBe('去拿快递')
    expect(todo?.courseId).toBeUndefined()
    expect(todo?.unitId).toBeUndefined()
  })

  it('模型把多件事合成一条时，本地也会切开', () => {
    // 提示词里要求模型自己拆，但合并成一条的概率不低 —— 这里兜住
    applyExtractedTodos(
      { todos: [{ title: '今天看完第一章，然后写作业，还有复习单词', when: '今天' }] },
      { now: NOW },
    )

    const titles = useTodoStore
      .getState()
      .todos.map((todo) => todo.title)
      .sort()
    expect(titles).toHaveLength(3)
    expect(titles.join('|')).toContain('第一章')
    expect(titles.join('|')).toContain('单词')
  })

  it('空标题、空数组都不会造出垃圾数据', () => {
    expect(applyExtractedTodos({}, { now: NOW })).toBe(0)
    expect(applyExtractedTodos({ todos: [{ title: '   ' }], weekly: [''] }, { now: NOW })).toBe(0)
    expect(useTodoStore.getState().todos).toHaveLength(0)
  })
})

describe('applyTodoLinks：待办标题说了算，模型的猜测只能兜底', () => {
  /** 两段、每段两节，够验证"阶段 vs 段内第一节"的区别 */
  const multiStage: Course = {
    ...course,
    stages: [
      {
        id: 's1',
        title: '第 1 章',
        objective: '',
        order: 0,
        units: [
          { id: 'u1', title: 'C语言简史', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
          { id: 'u2', title: '第一个程序', knowledgePoints: [], estimatedMinutes: 60, order: 1 },
        ],
      },
      {
        id: 's2',
        title: '第 2 章',
        objective: '',
        order: 1,
        units: [
          { id: 'u3', title: '变量', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
        ],
      },
    ],
  }

  beforeEach(() => {
    useCourseStore.setState({ courses: [multiStage] })
    usePlanStore.setState({ plans: {} })
    useTodoStore.setState({
      todos: [
        {
          id: 't1',
          title: '学完 C语言 阶段一',
          date: '2026-09-23',
          done: false,
          createdAt: '2026-09-23T00:00:00.000Z',
          source: 'ai-extract',
        },
      ],
    })
  })

  it('模型把"阶段一"细化成第一节课时，仍然按标题里的阶段整段关联', () => {
    // 用户报的正是这个：模型好心细化成"C语言简史"，结果只勾掉了第一课
    const applied = applyTodoLinks({
      todoLinks: [{ todo: '学完 C语言 阶段一', unit: 'C语言简史' }],
    })

    expect(applied).toBe(1)
    const todo = useTodoStore.getState().todos[0]!
    expect(todo.stageId).toBe('s1')
    expect(todo.unitId).toBeUndefined()
  })

  it('标题里认不出课程时，才用模型给的提示兜底', () => {
    useTodoStore.setState({
      todos: [
        {
          id: 't2',
          title: '把那节课补上',
          date: '2026-09-23',
          done: false,
          createdAt: '2026-09-23T00:00:00.000Z',
        },
      ],
    })

    const applied = applyTodoLinks({ todoLinks: [{ todo: '把那节课补上', unit: 'C语言简史' }] })

    expect(applied).toBe(1)
    expect(useTodoStore.getState().todos[0]?.unitId).toBe('u1')
  })
})

describe('applyExtractedTodos：不用"当前对话的课程"兜底串课', () => {
  const singleStage: Course = {
    ...course,
    id: 'c-c',
    title: 'C语言基础入门',
    stages: [
      {
        id: 's1',
        title: '第 其他 章',
        objective: '',
        order: 0,
        units: [
          { id: 'u1', title: 'C语言简史', knowledgePoints: [], estimatedMinutes: 60, order: 0 },
        ],
      },
    ],
  }

  beforeEach(() => {
    useCourseStore.setState({ courses: [singleStage] })
    usePlanStore.setState({ plans: {} })
    useTodoStore.setState({ todos: [] })
  })

  it('标题写着 C 语言时，不该因为"正在《文言文》对话里"就挂到文言文上', () => {
    // 序号超出范围（这门课只有一段）→ 规则匹配不到，此时最容易串到会话绑的那门课上
    applyExtractedTodos(
      { todos: [{ title: '学完C语言第九阶段', when: '今天' }] },
      { courseId: '文言文课程 id', now: NOW },
    )

    expect(useTodoStore.getState().todos[0]?.courseId).toBeUndefined()
  })

  it('标题没点名课程时，"当前对话的课程"仍然是合理兜底', () => {
    applyExtractedTodos(
      { todos: [{ title: '把那节课补上', when: '今天' }] },
      { courseId: 'c-c', now: NOW },
    )

    expect(useTodoStore.getState().todos[0]?.courseId).toBe('c-c')
  })
})

/**
 * 端到端：一句模糊的话 → 待办栏里真的多出一条。
 *
 * 上面那些用例喂的是"模型返回的 JSON"，这一组把 provider 也换成桩，
 * 于是从**用户那句话**到**待办落库**整条路都被走了一遍 ——
 * 用户报的"AI 不会给我添加待办"，坏的就是这一段里的任何一环。
 */
describe('extractMemories：模糊指令也要落成待办', () => {
  /** 只回答一次抽取结果的桩 provider —— 这里测的是解析与落库，不是模型 */
  function stubProvider(payload: unknown): LlmProvider {
    return {
      endpoint: 'stub://',
      chat: async () => JSON.stringify(payload),
      testConnection: async () => ({ ok: true }),
    }
  }

  function message(content: string): ChatMessage {
    return { id: 'm1', role: 'user', content, createdAt: '2026-09-23T10:00:00.000Z' }
  }

  it('把抽取结果里的待办交给调用方，界面才有东西可以回执', async () => {
    const outcome = await extractMemories({
      provider: stubProvider({ todos: [{ title: '写实验报告', when: '明天' }] }),
      messages: [message('帮我记一下，明天之前把实验报告写完')],
    })

    expect(outcome.todos).toHaveLength(1)
    expect(outcome.todos[0]?.title).toBe('写实验报告')
    // extractMemories 内部用的是**真实今天**（线上没人会传 now），所以期望值也跟着算
    expect(outcome.todos[0]?.date).toBe(toDateKey(dayjs().add(1, 'day')))
  })

  it('日常待办（不挂课程）同样落库 —— 待办栏不是"只装学习任务"', async () => {
    await extractMemories({
      provider: stubProvider({ todos: [{ title: '取快递', when: '今天' }] }),
      messages: [message('明天记得取快递')],
    })

    const todo = useTodoStore.getState().todos[0]
    expect(todo?.title).toBe('取快递')
    expect(todo?.source).toBe('ai-extract')
    // 生活琐事匹配不到课程，这是正常的：它照样存在于今日清单里
    expect(todo?.courseId).toBeUndefined()
  })

  it('模型给不出待办时，回执是空的（不会谎报"已加入"）', async () => {
    const outcome = await extractMemories({
      provider: stubProvider({ facts: ['他是计算机专业大三学生'] }),
      messages: [message('我是计算机专业大三的')],
    })

    expect(outcome.todos).toEqual([])
    expect(outcome.memories).toBe(1)
  })
})

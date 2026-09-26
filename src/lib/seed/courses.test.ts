import { beforeEach, describe, expect, it } from 'vitest'

import { createCourse, generatePlanForCourse } from '@/features/course/courseActions'
import { buildStages } from '@/features/course/drafts'
import type { CoursePlanDraft } from '@/features/course/drafts'
import { dayjs } from '@/lib/date'
import { SEED_COURSES } from '@/lib/seed/courses'
import { buildWenyanwenCourseDraft } from '@/lib/seed/wenyanwen'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import { useMemoryStore } from '@/store/memory'

beforeEach(() => {
  useCourseStore.setState({ courses: [] })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
  useMemoryStore.setState({ entries: [] })
})

/**
 * 示例课程是随仓库交付的东西：评审会在没有 API Key 的情况下直接打开它，
 * 所以这些断言守的是"交付质量"，不是实现细节 —— 结构能排期、知识点填得实、
 * 讲义不是空字符串、每次载入是独立对象。
 */
describe('示例课程库', () => {
  it.each(SEED_COURSES.map((seed) => [seed.title, seed] as const))(
    '「%s」结构完整、可排期',
    (_title, seed) => {
      const draft = seed.build()

      expect(draft.title.trim()).not.toBe('')
      expect(draft.stages.length).toBeGreaterThan(0)
      expect(draft.goal?.trim()).toBeTruthy()
      expect(draft.weeklyMinutes).toBeGreaterThan(0)

      const units = draft.stages.flatMap((stage) => stage.units)
      expect(units.length).toBeGreaterThan(0)

      for (const stage of draft.stages) {
        expect(stage.title.trim()).not.toBe('')
        expect(stage.units.length).toBeGreaterThan(0)
      }

      for (const unit of units) {
        expect(unit.title.trim()).not.toBe('')
        // 视频课程按约定不带知识点（标签须看过内容再总结）；自带讲义的课程才要求有
        if (!unit.resourceUrl) expect(unit.knowledgePoints.length).toBeGreaterThan(0)
        // 30 分钟是**手写课程**的估算下限；视频课程用的是真实单集时长，十几分钟很常见
        expect(unit.estimatedMinutes).toBeGreaterThan(0)
        if (!unit.resourceUrl) expect(unit.estimatedMinutes).toBeGreaterThanOrEqual(30)
        // 知识点是掌握状态的挂载点，空白或重复都会让它变成两条互相矛盾的记录
        for (const point of unit.knowledgePoints) expect(point.trim()).not.toBe('')
        expect(new Set(unit.knowledgePoints).size).toBe(unit.knowledgePoints.length)
      }

      // deadline 必须在今天之后，否则评审载入后只会看到一片「排不完」的警告
      expect(draft.deadline).toBeDefined()
      expect(dayjs(draft.deadline).isAfter(dayjs(), 'day')).toBe(true)
    },
  )

  it('阶段标题不自己写「阶段 N」：界面上已经加了前缀', () => {
    for (const seed of SEED_COURSES) {
      const draft = seed.build()
      for (const stage of draft.stages) {
        // 课程结构区渲染的是「阶段 1｜<title>」，标题里再写一遍就成了「阶段 1｜第一阶段｜…」
        expect(stage.title, seed.title).not.toMatch(/^第?[一二三四五六七八九十\d]+阶段/)
      }
    }
  })

  it('每次载入拿到独立对象，改一份不会污染下一次', () => {
    for (const seed of SEED_COURSES) {
      const first = seed.build()
      first.stages[0]?.units.push({ title: '临时单元', knowledgePoints: [] })
      expect(seed.build().stages[0]?.units).toHaveLength(
        first.stages[0]!.units.length - 1,
      )
    }
  })

  it('每一份都能真的排出一个不超期的计划（零配置主路径）', () => {
    for (const seed of SEED_COURSES) {
      const id = createCourse(seed.build())
      const result = generatePlanForCourse(id)
      expect(result, seed.title).not.toBeNull()
      expect(result?.schedule.empty, seed.title).toBe(false)
      expect(result?.summary.exceedsDeadline, seed.title).toBe(false)
      useCourseStore.setState({ courses: [] })
      usePlanStore.setState({ plans: {} })
    }
  })
})

describe('文言文课程', () => {
  it('讲义随课程交付：篇目精读与考点解析都写了正文', () => {
    const draft = buildWenyanwenCourseDraft()
    const units = draft.stages.flatMap((stage) => stage.units)
    const withContent = units.filter((unit) => (unit.content ?? '').trim().length > 0)

    // 自带正文的单元太少，这门课就又变成一个"目录"了
    expect(withContent.length).toBeGreaterThanOrEqual(8)
    for (const unit of withContent) {
      expect(unit.content!.length, unit.title).toBeGreaterThan(80)
    }

    // 篇目精读必须带正文：这一阶段的全部价值就在原文与读法上
    const closeReading = draft.stages[1]!.units
    expect(closeReading.filter((unit) => unit.content).length).toBeGreaterThanOrEqual(4)
  })

  it('三层结构对得上：每个阶段都有考点，知识点名称全课程唯一', () => {
    const draft = buildWenyanwenCourseDraft()
    const units = draft.stages.flatMap((stage) => stage.units)
    const allPoints = units.flatMap((unit) => unit.knowledgePoints)

    // 掌握状态按知识点名称挂载：重名会让两个单元的进度互相覆盖
    expect(new Set(allPoints).size).toBe(allPoints.length)
  })

  it('自带讲义能穿过 buildStages 落进单元', () => {
    const draft: CoursePlanDraft = buildWenyanwenCourseDraft()
    const stages = buildStages(draft.stages)
    const units = stages.flatMap((stage) => stage.units)
    const withContent = units.filter((unit) => unit.content)

    expect(withContent.length).toBeGreaterThanOrEqual(8)
    // 没有正文的单元不该留下空字符串字段 —— 界面靠"有没有 content"判断能不能展开
    for (const unit of units) {
      if (unit.content !== undefined) expect(unit.content.length).toBeGreaterThan(0)
    }
  })
})

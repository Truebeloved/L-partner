import { describe, expect, it } from 'vitest'

import { generateCoursePlan } from '@/features/course/aiPlan'
import { draftFromCatalog, findCatalogCourse, GREAT_COURSES } from '@/lib/seed/great-courses'
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settings'

describe('没有 API Key 也能按公认好课建课', () => {
  /*
   * 这条很重要：目录命中必须发生在"检查有没有配模型"**之前**。
   * 否则用户没填 Key 时点「让 AI 帮我生成方案」，得到的还是一句"请先配置"，
   * 而我们已经有了现成的、更好的答案。
   */
  it('未配置模型时，命中目录照样能拿到完整方案', async () => {
    useSettingsStore.setState({ ...useSettingsStore.getState(), settings: DEFAULT_SETTINGS })
    expect(DEFAULT_SETTINGS.llm.apiKey).toBe('')

    const draft = await generateCoursePlan({ goal: '我想学 C 语言' })

    expect(draft.title).toBe('C 语言程序设计')
    expect(draft.stages.flatMap((stage) => stage.units)).toHaveLength(11)
  })
})

/**
 * 这一组守的是用户的一条成本要求：
 * "有公认好课时不需要让学伴再写一遍，那很浪费 token"。
 * 所以「命中目录 → 零模型调用建课」这条路必须是可靠的。
 */
describe('findCatalogCourse', () => {
  it('用户怎么说都能认出 C 语言这门课', () => {
    for (const goal of [
      '我想学 C 语言',
      '两个月上手 C程序设计',
      '学c语言基础',
      'C 语言，从零开始',
    ]) {
      expect(findCatalogCourse(goal)?.title, goal).toBe('C 语言程序设计')
    }
  })

  it('别的学科先返回 null，交给模型设计', () => {
    expect(findCatalogCourse('我想学做饭')).toBeNull()
    expect(findCatalogCourse('两个月上手 React')).toBeNull()
  })

  it('太短的目标不匹配，避免误命中', () => {
    expect(findCatalogCourse('c')).toBeNull()
    expect(findCatalogCourse('')).toBeNull()
  })
})

describe('draftFromCatalog', () => {
  const course = GREAT_COURSES[0]!

  it('按讲次建课，不产生任何正文 —— 正文交给视频', () => {
    const draft = draftFromCatalog(course)

    expect(draft.stages.length).toBeGreaterThan(1)
    const units = draft.stages.flatMap((stage) => stage.units)
    expect(units).toHaveLength(course.chapters.length)
    for (const unit of units) {
      // 关键：不写 content（这里的 UnitDraft 里根本没有这个字段），
      // 但每一节都要有链接
      expect(unit.resourceUrl).toBeTruthy()
      expect(unit.resourceLabel).toContain(course.provider)
    }
  })

  it('每一讲的链接是**这一讲**的搜索，而不是合集首页', () => {
    const draft = draftFromCatalog(course)
    const units = draft.stages.flatMap((stage) => stage.units)
    const urls = units.map((unit) => unit.resourceUrl)

    expect(new Set(urls).size).toBe(urls.length)
    for (const url of urls) {
      expect(url).toContain('search.bilibili.com')
      expect(url).toContain('keyword=')
    }
    // 章节名进了搜索词，点开就是对应那一讲
    expect(units[0]?.resourceUrl).toContain(encodeURIComponent('程序设计与 C 语言'))
  })

  it('说明里写清参考的是哪一套体系（用户要能看出出处）', () => {
    const draft = draftFromCatalog(course)
    expect(draft.description).toContain(course.provider)
    expect(draft.description).toContain(course.platform)
  })

  it('每周投入会换算成分钟', () => {
    expect(draftFromCatalog(course, { weeklyHours: 8 }).weeklyMinutes).toBe(480)
    expect(draftFromCatalog(course).weeklyMinutes).toBeUndefined()
  })

  it('目录里的课自身要合格：有链接、有讲次、时长合理', () => {
    for (const entry of GREAT_COURSES) {
      expect(entry.homeUrl).toMatch(/^https:\/\//)
      expect(entry.chapters.length).toBeGreaterThan(5)
      for (const chapter of entry.chapters) {
        expect(chapter.knowledgePoints.length).toBeGreaterThan(0)
        expect(chapter.estimatedMinutes).toBeGreaterThanOrEqual(30)
        expect(chapter.estimatedMinutes).toBeLessThanOrEqual(180)
      }
    }
  })
})

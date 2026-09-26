import type { CoursePlanDraft } from '@/features/course/drafts'

import { buildCLanguageCourseDraft } from './cLanguage'
import { buildDemoCourseDraft } from './demoCourse'
import { buildWenyanwenCourseDraft } from './wenyanwen'

/**
 * 随仓库一起交付的示例课程。
 *
 * 存在的理由：应用不内置 API Key，评审（或第一次打开的用户）很可能没有配置大模型。
 * 示例课程是他们在零配置下走通「课程 → 计划 → 待办」主循环的唯一入口，
 * 所以每一份都要是**真实可用的教学方案**，而不是占位数据。
 */
export interface SeedCourse {
  /** 稳定标识，只用来做列表 key，不落库 */
  id: string
  title: string
  /** 一句话说明这份课程的特点，帮助用户在两份之间做选择 */
  summary: string
  /** 返回新对象：载入后用户会编辑它，共享同一个对象会让下次载入带着上次的修改 */
  build: () => CoursePlanDraft
}

export const SEED_COURSES: SeedCourse[] = [
  {
    id: 'react-60d',
    title: '两个月上手 React',
    summary: '技术类示例：按真实学习顺序从零到能独立做出一个多页面应用，每周 10 小时。',
    build: buildDemoCourseDraft,
  },
  {
    id: 'wenyanwen-zhongkao',
    title: '文言文阅读 · 中高考贯通',
    summary:
      '文科类示例：按「篇目—考点—解析」三层组织，自带篇目原文、考点解析与「追问—质疑—再论证」设问链，打开就能读。',
    build: buildWenyanwenCourseDraft,
  },
  {
    id: 'c-language-100',
    title: 'C语言基础入门（100 讲）',
    summary:
      '工科类示例：按 B 站公开课的真实分集整理成 12 章 100 讲，每一讲的标题都能点开原视频；讲义交给学伴按需生成。',
    build: buildCLanguageCourseDraft,
  },
]

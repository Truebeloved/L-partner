/**
 * 公认好课目录。
 *
 * 存在的理由很直接：C 语言学翁恺、线代看 MIT 18.06 —— 这些课已经被无数人验证过，
 * 让模型从零写一份"自己的"章节体系，既不如它好，还要烧掉几千 token 的输出。
 *
 * ⚠️ 现在的用法是「**推荐一个链接**」，不是「按手写的章节建课」：
 * 手写十几个章节正好是用户抱怨过的"内容太少"（B 站上那门课有 100 讲）。
 * 所以这里只提供**已验证过能打开、且有真实分集目录**的合集地址，
 * 由「让 AI 帮我生成方案」里那个输入栏交给抓取流程去读整份目录 ——
 * 一讲一个单元，一节都不少。
 */
export interface RecommendedCollection {
  /** 命中关键词（任一出现即命中，大小写不敏感） */
  match: string[]
  title: string
  /** 讲这门课的人 / 机构 */
  provider: string
  platform: string
  /**
   * 合集地址。
   * ⚠️ 这个地址是**实际抓取验证过的**（100 集、标题带教材编号），
   * 不是凭记忆写的 —— 见 scripts/probe-bilibili.mjs 的验证方式。
   */
  url: string
}

export const RECOMMENDED_COLLECTIONS: RecommendedCollection[] = [
  {
    match: ['c语言', 'c 语言', 'c程序设计', 'c语言程序设计', 'clanguage', '学c'],
    title: 'C 语言程序设计',
    provider: '浙江大学 翁恺',
    platform: 'bilibili',
    url: 'https://www.bilibili.com/video/BV1eAnJzyEuE/',
  },
]

/** 归一化后做包含匹配：用户写「我想学 C 语言」也能命中 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/** 找出与学习目标匹配的推荐合集；没有就返回 null */
export function findRecommendedCollection(goal: string): RecommendedCollection | null {
  const target = normalize(goal)
  if (target.length < 2) return null

  return (
    RECOMMENDED_COLLECTIONS.find((course) =>
      course.match.some((keyword) => target.includes(normalize(keyword))),
    ) ?? null
  )
}

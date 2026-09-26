import type { CoursePlanDraft } from '@/features/course/drafts'

/**
 * 公认好课目录。
 *
 * 存在的理由很直接：C 语言学翁恺、线代看 MIT 18.06 —— 这些课已经被无数人验证过，
 * 让模型从零写一份"自己的"章节体系，既不如它好，还要烧掉几千 token 的输出。
 * 所以命中目录时**直接按这门课的讲次建课**，一个 token 都不花。
 *
 * ⚠️ 关于链接：这里给的是**搜索链接**，不是视频号。
 * 原因是我实测过 B 站接口：未鉴权的 `api.bilibili.com/x/web-interface/view` 直接返回
 * `62012`（拒绝访问），拿不到合集的分集列表；而凭记忆写一个 BV 号，
 * 很可能指向被删的视频或别人的搬运 —— 一个打不开的链接比"打开搜索页"糟糕得多。
 * 搜索链接永远有效：点开就是这门课，用户自己挑那一讲。
 *
 * 想升级成"精确到第 N 讲"的话，需要在主进程用带 cookie 的请求抓合集分集，
 * 那是另一个量级的复杂度（要处理登录态、风控），等确认要做再加。
 */
export interface CatalogChapter {
  title: string
  knowledgePoints: string[]
  estimatedMinutes: number
}

export interface CatalogCourse {
  /** 命中关键词（任一出现即命中，大小写不敏感） */
  match: string[]
  title: string
  /** 讲这门课的人 / 机构，显示在方案说明里 */
  provider: string
  platform: string
  /** 课程主页（搜索链接，永远可用） */
  homeUrl: string
  chapters: CatalogChapter[]
}

/** 浙大翁恺《C 语言程序设计》的讲次顺序（国家级精品课，公认可入门首选） */
const C_LANGUAGE: CatalogCourse = {
  match: ['c语言', 'c 语言', 'c程序设计', 'clanguage', '学c'],
  title: 'C 语言程序设计',
  provider: '浙江大学 翁恺',
  platform: 'bilibili',
  homeUrl: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent('翁恺 C语言程序设计'),
  chapters: [
    { title: '程序设计与 C 语言', knowledgePoints: ['程序的执行流程', '编译与运行', '第一个 C 程序'], estimatedMinutes: 90 },
    { title: '变量与数据类型', knowledgePoints: ['int / double / char', '变量的定义与赋值', '类型转换'], estimatedMinutes: 90 },
    { title: '表达式与运算符', knowledgePoints: ['算术运算符', '运算符优先级', '复合赋值'], estimatedMinutes: 90 },
    { title: '判断与分支', knowledgePoints: ['if / else', '关系与逻辑运算', 'switch'], estimatedMinutes: 90 },
    { title: '循环', knowledgePoints: ['while 与 for', '循环的调试', 'break 与 continue'], estimatedMinutes: 120 },
    { title: '函数', knowledgePoints: ['函数的定义与调用', '参数传递', '局部变量与作用域'], estimatedMinutes: 120 },
    { title: '数组', knowledgePoints: ['一维数组', '数组遍历', '数组作为参数'], estimatedMinutes: 120 },
    { title: '指针', knowledgePoints: ['取地址与解引用', '指针与数组', '指针作为参数'], estimatedMinutes: 150 },
    { title: '字符串', knowledgePoints: ['字符数组', '字符串函数', '字符串与指针'], estimatedMinutes: 120 },
    { title: '结构类型', knowledgePoints: ['struct 定义', '结构与指针', '枚举'], estimatedMinutes: 120 },
    { title: '文件与综合练习', knowledgePoints: ['文件读写', '错误处理', '一个小型综合程序'], estimatedMinutes: 150 },
  ],
}

export const GREAT_COURSES: CatalogCourse[] = [C_LANGUAGE]

/** 归一化后做包含匹配：用户写「我想学 C 语言」也能命中 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 找出与学习目标匹配的公认好课；没有就返回 null（调用方退回让模型设计）。
 */
export function findCatalogCourse(goal: string): CatalogCourse | null {
  const target = normalize(goal)
  if (target.length < 2) return null

  return (
    GREAT_COURSES.find((course) =>
      course.match.some((keyword) => target.includes(normalize(keyword))),
    ) ?? null
  )
}

/**
 * 把目录里的课变成一份课程草稿。
 *
 * 每个单元都挂上"这一讲的搜索链接"——点开就是这门课里对应那一讲，
 * 而不是整个合集首页；同时**不生成任何正文**，正文交给视频，省下的正是 token。
 */
export function draftFromCatalog(
  course: CatalogCourse,
  options: { weeklyHours?: number; deadline?: string } = {},
): CoursePlanDraft {
  // 11 讲按 3 个阶段分组，和「基础语法 / 数据组织 / 进阶与实战」的常见教学节奏一致
  const groups: { title: string; objective: string; from: number; to: number }[] = [
    { title: '基础：语法与流程控制', objective: '能独立写出带分支与循环的小程序', from: 0, to: 5 },
    { title: '数据组织：数组与指针', objective: '会用数组和指针处理一批数据', from: 5, to: 9 },
    { title: '进阶：字符串、结构与文件', objective: '能读写文件、组织结构化的数据', from: 9, to: course.chapters.length },
  ]

  return {
    title: course.title,
    description: `按${course.provider}的《${course.title}》讲次顺序组织（${course.platform} 上公认的入门首选），每一讲都附了直达链接。`,
    goal: `跟着${course.provider}的课学完 ${course.title}，能独立写出用到数组、指针与文件的小程序`,
    deadline: options.deadline,
    weeklyMinutes: options.weeklyHours ? options.weeklyHours * 60 : undefined,
    stages: groups
      .filter((group) => group.from < group.to)
      .map((group) => ({
        title: group.title,
        objective: group.objective,
        units: course.chapters.slice(group.from, group.to).map((chapter) => ({
          title: chapter.title,
          knowledgePoints: chapter.knowledgePoints,
          estimatedMinutes: chapter.estimatedMinutes,
          resourceUrl: `${course.homeUrl.split('&')[0]}&keyword=${encodeURIComponent(
            `${course.provider.split(' ').pop() ?? ''} C语言 ${chapter.title}`,
          )}`,
          resourceLabel: `${course.provider} · ${chapter.title}`,
        })),
      })),
  }
}

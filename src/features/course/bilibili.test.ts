import { describe, expect, it } from 'vitest'

import { draftFromCollection, episodeUrl, titleNumber } from '@/features/course/bilibili'
import type { BilibiliEpisode } from '@/features/course/bilibili'

/**
 * 这一组守的是用户抱怨过的那件事：
 * "C 语言 B 站上有 100 讲，它却只生成 3 个阶段一点点内容"。
 *
 * 抓取本身没法在单测里跑（要真实浏览器），但**目录 → 方案**这一步是纯函数，
 * 而"一讲不少、按教材编号分章、每讲有链接"全在这一步，必须钉死。
 */

function episode(patch: Partial<BilibiliEpisode> & { title: string }): BilibiliEpisode {
  return { bvid: 'BV1test', page: 1, seconds: 600, section: '', ...patch }
}

describe('episodeUrl', () => {
  it('多 P 视频带 ?p=N，合集里每集是自己的视频', () => {
    expect(episodeUrl(episode({ title: 'x', page: 3 }))).toBe(
      'https://www.bilibili.com/video/BV1test?p=3',
    )
    expect(episodeUrl(episode({ title: 'x', bvid: 'BV2abc', page: 1 }))).toBe(
      'https://www.bilibili.com/video/BV2abc',
    )
  })
})

describe('titleNumber', () => {
  it('取出教材自己的编号路径（只用来分章）', () => {
    expect(titleNumber('1.2.3 编程软件：C语言的编程软件选择太多')).toEqual(['1', '2', '3'])
    expect(titleNumber('第 3 讲 数组')).toBeNull()
  })
})

describe('draftFromCollection', () => {
  /** 造一份像翁恺那门课一样的目录：100 讲、标题带 1.1.1 这种编号 */
  function hundredEpisodes(): BilibiliEpisode[] {
    const episodes: BilibiliEpisode[] = []
    for (let chapter = 1; chapter <= 10; chapter += 1) {
      for (let section = 1; section <= 2; section += 1) {
        for (let part = 1; part <= 5; part += 1) {
          episodes.push(
            episode({
              title: `${chapter}.${section}.${part} 第 ${chapter} 章第 ${section} 节的第 ${part} 段`,
              page: episodes.length + 1,
              seconds: 300 + part * 60,
            }),
          )
        }
      }
    }
    return episodes
  }

  it('一百讲就是一节不多、一节不少 —— 这才是"内容够多"', () => {
    const draft = draftFromCollection({ title: 'C 语言程序设计', episodes: hundredEpisodes() })

    const units = draft.stages.flatMap((stage) => stage.units)
    expect(units).toHaveLength(100)
    // 每一讲都有自己的链接，且互不相同
    expect(new Set(units.map((unit) => unit.resourceUrl)).size).toBe(100)
  })

  it('按教材自己的编号分章，而不是每 10 讲硬切一刀', () => {
    const draft = draftFromCollection({ title: 'C 语言程序设计', episodes: hundredEpisodes() })

    expect(draft.stages).toHaveLength(10)
    expect(draft.stages[0]?.title).toBe('第 1 章')
    expect(draft.stages[0]?.units).toHaveLength(10)
  })

  it('作者分过区时优先用作者的分区', () => {
    const episodes = [
      episode({ title: 'a', section: '第一章 入门' }),
      episode({ title: 'b', section: '第一章 入门' }),
      episode({ title: 'c', section: '第二章 进阶' }),
    ]
    const draft = draftFromCollection({ title: 'x', episodes })

    expect(draft.stages.map((stage) => stage.title)).toEqual(['第一章 入门', '第二章 进阶'])
  })

  it('标题没有编号时按每 10 讲兜底分组，不会铺成一百行的平表', () => {
    const episodes = Array.from({ length: 25 }, (_, index) =>
      episode({ title: `随便起的一讲 ${index + 1}` }),
    )
    const draft = draftFromCollection({ title: 'x', episodes })

    expect(draft.stages).toHaveLength(3)
    expect(draft.stages[0]?.title).toBe('第 1~10 讲')
    expect(draft.stages[2]?.units).toHaveLength(5)
  })

  it('视频导入的章节**不带知识点标签** —— 从标题猜出来的标签内容是错的', () => {
    const draft = draftFromCollection({ title: 'C 语言程序设计', episodes: hundredEpisodes() })
    const units = draft.stages.flatMap((stage) => stage.units)
    for (const unit of units) {
      expect(unit.knowledgePoints).toEqual([])
    }
  })

  it('时长来自视频本身，并夹在合理区间里', () => {
    const draft = draftFromCollection({
      title: 'x',
      episodes: [
        episode({ title: '1.1 很短', seconds: 120 }),
        episode({ title: '1.2 正常', seconds: 900 }),
        episode({ title: '1.3 很长', seconds: 60 * 60 * 4 }),
      ],
    })
    const units = draft.stages.flatMap((stage) => stage.units)
    expect(units[0]?.estimatedMinutes).toBe(10)
    expect(units[1]?.estimatedMinutes).toBe(15)
    expect(units[2]?.estimatedMinutes).toBe(180)
  })

  it('说明里写清有多少讲，用户一眼能核对', () => {
    const draft = draftFromCollection({ title: 'C 语言程序设计', episodes: hundredEpisodes() })
    expect(draft.description).toContain('100 讲')
  })
})

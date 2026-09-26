import { describe, expect, it } from 'vitest'

import { detectIntent, extractIntentPhrases, isExplicitTodoCommand, splitIntent } from '@/features/today/intent'

/**
 * 这一组守的是用户直接报上来的那个问题：
 * "我告诉 AI 我今天想干什么，它只会分析出待办任务但不会添加到待办区域"。
 *
 * 根因不是模型不抽，而是**抽取压根没跑** —— 原来只有"每 8 条消息"这一个触发条件，
 * 用户说一句就等在那里了。所以判定"这句话里有没有要做的事"必须准：
 * 漏判 → 用户说什么都没反应；误判 → 多花一次抽取的钱（还能接受）。
 */
describe('detectIntent', () => {
  it('明确要做某件事的话会被认出', () => {
    for (const text of [
      '我今天想把第一章看完',
      '明天要交作业',
      '我打算晚上复习一下闭包',
      '这周想把单词背完',
      '下周三之前得写完实验报告',
      '我要开始学 React 了',
      '一会儿整理下笔记',
    ]) {
      expect(detectIntent(text), text).toBe(true)
    }
  })

  it('纯提问不会被当成任务', () => {
    for (const text of [
      '闭包是什么',
      '为什么子组件也会重渲染',
      '这段代码是什么意思',
      'React 和 Vue 的区别',
    ]) {
      expect(detectIntent(text), text).toBe(false)
    }
  })

  it('陈述兴趣不算任务 —— 它属于"记忆"而不是"待办"', () => {
    expect(detectIntent('我对机器学习挺感兴趣的')).toBe(false)
  })

  it('太短的话不判定，避免噪音', () => {
    expect(detectIntent('做')).toBe(false)
    expect(detectIntent('')).toBe(false)
  })

  it('有时间没动作、或有动作没时间，都不算', () => {
    expect(detectIntent('今天几号')).toBe(false)
    expect(detectIntent('看')).toBe(false)
  })

  /*
   * 用户报的第二个问题：「软件里配置的 AI 是可以帮我添加待办的……需要识别模糊指令」。
   * 模糊指令有两种：一种是**没说得那么规整**（"月底前把论文写完""记得买牛奶"），
   * 另一种是**直接开口让你记**（"帮我记一下…"）。两种都必须命中。
   */
  it('口语化的说法也算 —— 时间词和动作词都不必标准', () => {
    for (const text of [
      '月底前把论文写完',
      '3号交实验报告',
      '下个月初要去体检',
      '记得买牛奶',
      '周五之前把实验报告交了',
      '把借的书还了',
      '明天取快递',
      '帮我报名四级',
    ]) {
      expect(detectIntent(text), text).toBe(true)
    }
  })

  it('纯提问里出现"要/得/该"不算任务 —— 否则每次提问都要多花一次抽取', () => {
    for (const text of ['这段代码要怎么写', '这个函数该怎么改', '为什么要用 useMemo']) {
      expect(detectIntent(text), text).toBe(false)
    }
  })
})

describe('isExplicitTodoCommand', () => {
  it('开口让你记的说法一律认', () => {
    for (const text of [
      '帮我记一下，周五之前把实验报告写完',
      '提醒我明天买书',
      '别忘了把借的书还了',
      '加个待办：月底前复习完第三章',
      '记下来：下周三开会',
    ]) {
      expect(isExplicitTodoCommand(text), text).toBe(true)
    }
  })

  it('普通的请教与聊天不算指令', () => {
    for (const text of ['这道题怎么做', '帮我讲讲闭包', '我今天有点累']) {
      expect(isExplicitTodoCommand(text), text).toBe(false)
    }
  })
})

describe('splitIntent', () => {
  it('一句话里的多件事会被切开', () => {
    expect(splitIntent('今天想把第一章看完，再把作业交了')).toEqual([
      '今天想把第一章看完',
      '再把作业交了',
    ])
    expect(splitIntent('复习闭包；整理笔记')).toEqual(['复习闭包', '整理笔记'])
  })

  it('「还有 / 然后 / 另外」这类口语连接词也算分隔', () => {
    expect(splitIntent('我要背单词然后做两道题')).toEqual(['我要背单词', '做两道题'])
    expect(splitIntent('复习一下还有预习下一节')).toEqual(['复习一下', '预习下一节'])
  })

  it('只有一件事时原样返回', () => {
    expect(splitIntent('今天看完第一章')).toEqual(['今天看完第一章'])
  })
})

describe('extractIntentPhrases', () => {
  it('多件事时每条都得带上，一件都不能漏', () => {
    const phrases = extractIntentPhrases('我今天想看完第一章，然后写作业，还有复习单词')
    expect(phrases).toHaveLength(3)
    expect(phrases[0]).toContain('第一章')
    expect(phrases[2]).toContain('单词')
  })

  it('没有要做的事时返回空数组', () => {
    expect(extractIntentPhrases('闭包是什么意思')).toEqual([])
  })

  it('切出来的残句（不带动作）会被丢掉', () => {
    // "我今天" 这一段没有动作，不该被当成一条待办
    const phrases = extractIntentPhrases('我今天，想把第一章看完')
    expect(phrases).toEqual(['想把第一章看完'])
  })
})

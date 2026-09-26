import { describe, expect, it } from 'vitest'

import { DEFAULT_LLM_SETTINGS, DEFAULT_SETTINGS, mergeSettings } from '@/store/settings'

describe('mergeSettings', () => {
  it('完全空的数据也要补齐成完整设置', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  /*
   * 这条是真实事故的回归测试。
   *
   * 用户在旧版本里存下的 settings 没有 desktopReminderFrom / desktopReminderTo。
   * persist 默认是**浅合并**，settings 整个对象会被旧值替换 ——
   * 于是这两个字段是 undefined，用户打开「桌面提醒」开关的瞬间，
   * planNextToast 里 `undefined.split(':')` 抛错，整棵 React 树被掀掉，
   * 界面变成一片空白，而且开关已经落盘，之后每次启动都是空白。
   */
  it('旧版本存下来的残缺数据不会留下 undefined 字段', () => {
    const legacy = {
      activePersonaId: 'builtin-senior',
      reminderEnabled: true,
      dailyReminderTime: '08:00',
      autoExtractMemory: true,
      desktopReminderEnabled: true,
    }

    const merged = mergeSettings(legacy)

    // 用户显式设过的值必须原样保留
    expect(merged.dailyReminderTime).toBe('08:00')
    expect(merged.desktopReminderEnabled).toBe(true)
    // 旧数据里没有的字段由默认值兜住，绝不能是 undefined
    expect(merged.desktopReminderFrom).toBe(DEFAULT_SETTINGS.desktopReminderFrom)
    expect(merged.desktopReminderTo).toBe(DEFAULT_SETTINGS.desktopReminderTo)
    expect(merged.desktopReminderMaxPerDay).toBe(DEFAULT_SETTINGS.desktopReminderMaxPerDay)

    for (const [key, value] of Object.entries(merged)) {
      expect(value, `字段 ${key} 不该是 undefined`).not.toBeUndefined()
    }
  })

  it('嵌套的 llm 也要逐字段补齐', () => {
    // 老版本只有 baseUrl，没有 temperature / maxTokens
    const merged = mergeSettings({ llm: { baseUrl: 'https://example.com/v1' } as never })

    expect(merged.llm.baseUrl).toBe('https://example.com/v1')
    expect(merged.llm.temperature).toBe(DEFAULT_LLM_SETTINGS.temperature)
    expect(merged.llm.maxTokens).toBe(DEFAULT_LLM_SETTINGS.maxTokens)
    expect(merged.llm.apiKey).toBe('')
  })

  it('持久化的值优先于默认值', () => {
    const merged = mergeSettings({ desktopReminderMaxPerDay: 6, dailyReminderTime: '07:30' })
    expect(merged.desktopReminderMaxPerDay).toBe(6)
    expect(merged.dailyReminderTime).toBe('07:30')
  })
})

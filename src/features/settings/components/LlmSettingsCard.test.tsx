import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { LlmSettingsCard } from '@/features/settings/components/LlmSettingsCard'
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settings'

afterEach(() => {
  cleanup()
  useSettingsStore.setState({ settings: structuredClone(DEFAULT_SETTINGS) })
})

const SECRET = 'sk-live-9f3a2b7c1d'

function setKey(apiKey: string) {
  const base = structuredClone(DEFAULT_SETTINGS)
  useSettingsStore.setState({ settings: { ...base, llm: { ...base.llm, apiKey } } })
}

/**
 * 这几条守的是一个真实的安全问题：密钥配好之后不该还能在界面上看到。
 * 原来的实现把密钥一直绑在 input 的 value 上，等于打开设置页就能读出明文。
 */
describe('大模型接入卡片', () => {
  it('密钥保存后不再出现在页面里', () => {
    setKey(SECRET)
    render(<LlmSettingsCard />)

    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(screen.getByText('已配置')).toBeInTheDocument()
    expect(screen.getByText('密钥已保存，不再显示')).toBeInTheDocument()
    // 「显示」这类入口必须彻底消失，否则安全边界只是个摆设
    expect(screen.queryByRole('button', { name: '显示' })).not.toBeInTheDocument()
  })

  it('没配置密钥时显示输入框，保存后写进设置', async () => {
    render(<LlmSettingsCard />)

    const input = screen.getByLabelText('API Key')
    await userEvent.type(input, SECRET)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(useSettingsStore.getState().settings.llm.apiKey).toBe(SECRET)
    // 保存后立刻回到"已配置"态，明文不再留在页面上
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('更换密钥会给出空输入框，而不是把旧密钥填回去', async () => {
    setKey(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '更换密钥' }))

    const input = screen.getByLabelText('API Key') as HTMLInputElement
    expect(input.value).toBe('')
    // 取消就什么都不改
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(useSettingsStore.getState().settings.llm.apiKey).toBe(SECRET)
  })

  it('清除密钥后回到未配置状态', async () => {
    setKey(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '清除' }))

    expect(useSettingsStore.getState().settings.llm.apiKey).toBe('')
    expect(screen.getByLabelText('API Key')).toBeInTheDocument()
  })
})

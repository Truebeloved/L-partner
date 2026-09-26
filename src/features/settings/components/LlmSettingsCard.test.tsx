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

function setConfig(apiKey: string, model = 'deepseek-chat') {
  const base = structuredClone(DEFAULT_SETTINGS)
  useSettingsStore.setState({
    settings: { ...base, llm: { ...base.llm, apiKey, model } },
  })
}

/**
 * 这一组用例守两件事：
 * 1. **安全**：密钥配好之后不该还能在界面上看到（原来的实现把它一直绑在 input 的 value 上）。
 * 2. **使用逻辑**：编辑的是草稿、点「保存并使用」才生效，且「测试连接」测的是屏幕上的值
 *    —— 上一版是先保存才能测、而测的往往是上一次保存的旧配置。
 */
describe('大模型接入卡片', () => {
  it('密钥保存后不再出现在页面里，只显示"使用中"状态', () => {
    setConfig(SECRET)
    render(<LlmSettingsCard />)

    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(screen.getByText('使用中')).toBeInTheDocument()
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument()
    // 「显示」这类入口必须彻底消失，否则安全边界只是个摆设
    expect(screen.queryByRole('button', { name: '显示' })).not.toBeInTheDocument()
  })

  it('未配置时是表单：地址、模型、密钥都填齐才能保存', async () => {
    render(<LlmSettingsCard />)

    const save = screen.getByRole('button', { name: '保存并使用' })
    // 地址与模型有默认值，只差密钥
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('API Key'), SECRET)
    expect(save).toBeEnabled()
    await userEvent.click(save)

    expect(useSettingsStore.getState().settings.llm.apiKey).toBe(SECRET)
    // 保存后立刻回到状态卡，明文不再留在页面上
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(screen.getByText('使用中')).toBeInTheDocument()
  })

  it('改动只进草稿，点保存才写进设置', async () => {
    setConfig(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '修改配置' }))
    const model = screen.getByLabelText('模型名称')
    await userEvent.clear(model)
    await userEvent.type(model, 'deepseek-reasoner')

    // 还没保存：store 里仍是旧模型
    expect(useSettingsStore.getState().settings.llm.model).toBe('deepseek-chat')

    await userEvent.click(screen.getByRole('button', { name: '保存并使用' }))
    expect(useSettingsStore.getState().settings.llm.model).toBe('deepseek-reasoner')
    // 改配置时没有重新输入密钥，那把密钥必须原样保留
    expect(useSettingsStore.getState().settings.llm.apiKey).toBe(SECRET)
  })

  it('取消编辑不写入任何改动', async () => {
    setConfig(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '修改配置' }))
    const model = screen.getByLabelText('模型名称')
    await userEvent.clear(model)
    await userEvent.type(model, 'gpt-4o-mini')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(useSettingsStore.getState().settings.llm.model).toBe('deepseek-chat')
    expect(screen.getByText('使用中')).toBeInTheDocument()
  })

  it('编辑态里的密钥输入框是空的，且不会被旧密钥填回去', async () => {
    setConfig(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '修改配置' }))

    const input = screen.getByLabelText('API Key') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toContain('留空')
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('清除密钥后回到未配置状态', async () => {
    setConfig(SECRET)
    render(<LlmSettingsCard />)

    await userEvent.click(screen.getByRole('button', { name: '清除密钥' }))

    expect(useSettingsStore.getState().settings.llm.apiKey).toBe('')
    expect(screen.getByLabelText('API Key')).toBeInTheDocument()
    expect(screen.queryByText('使用中')).not.toBeInTheDocument()
  })
})

import { useState } from 'react'

import { createProvider } from '@/lib/llm'
import { LlmError } from '@/lib/llm/types'
import { useSettingsStore } from '@/store/settings'

interface Preset {
  label: string
  baseUrl: string
  model: string
  note?: string
}

/**
 * 常见厂商预填。
 * 都是「OpenAI 兼容」端点 —— 这正是只实现一种协议的好处：换厂商只是换三行配置。
 * OpenAI 官方浏览器直连会被 CORS 拦，所以单独标注出来，免得用户以为是自己的 Key 有问题。
 */
const PRESETS: Preset[] = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    note: '官方接口不允许浏览器直连，会报跨域错误',
  },
]

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'error'; message: string; hint?: string }

export function LlmSettingsCard() {
  const settings = useSettingsStore((state) => state.settings)
  const updateLlm = useSettingsStore((state) => state.updateLlm)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [showKey, setShowKey] = useState(false)

  const { llm } = settings

  async function handleTest() {
    setTest({ status: 'testing' })
    try {
      const result = await createProvider(llm).testConnection()
      setTest(
        result.ok
          ? { status: 'ok' }
          : { status: 'error', message: result.message, hint: result.hint },
      )
    } catch (error) {
      setTest({
        status: 'error',
        message: error instanceof LlmError ? error.message : String(error),
      })
    }
  }

  return (
    <section className="card">
      <div className="mb-4">
        <h2 className="section-title">大模型接入</h2>
        <p className="muted mt-2">
          L-partner 不内置任何密钥。你填自己的
          API，配置只保存在这台设备的浏览器里，不会上传到任何服务器。
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.note}
            className="btn btn-secondary btn-sm"
            onClick={() => {
              updateLlm({ baseUrl: preset.baseUrl, model: preset.model })
              setTest({ status: 'idle' })
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="llm-base-url">
            API 地址
          </label>
          <input
            id="llm-base-url"
            className="input"
            value={llm.baseUrl}
            placeholder="https://api.deepseek.com/v1"
            onChange={(event) => updateLlm({ baseUrl: event.target.value })}
          />
          <p className="hint mt-1">
            多数厂商需要以 <code className="rounded-sm bg-ink/5 px-1 font-mono">/v1</code>{' '}
            结尾。填错会返回 404。
          </p>
        </div>

        <div>
          <label className="label" htmlFor="llm-model">
            模型名称
          </label>
          <input
            id="llm-model"
            className="input"
            value={llm.model}
            placeholder="deepseek-chat"
            onChange={(event) => updateLlm({ model: event.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="llm-api-key">
            API Key
          </label>
          <div className="flex gap-2">
            <input
              id="llm-api-key"
              className="input"
              type={showKey ? 'text' : 'password'}
              value={llm.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(event) => updateLlm({ apiKey: event.target.value })}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="hint mt-1">
            以 <code className="rounded-sm bg-ink/5 px-1 font-mono">sk-</code> 开头的密钥只存在本地
            IndexedDB 里。共用电脑时请记得清除。
          </p>
        </div>

        <details className="rounded-sm bg-ink/5 px-4 py-3">
          <summary className="cursor-pointer text-body font-bold text-ink">
            高级参数（一般不用改）
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="llm-temperature">
                温度 {llm.temperature.toFixed(1)}
              </label>
              <input
                id="llm-temperature"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={llm.temperature}
                /* accent-ink：滑块的默认主题色是浏览器蓝，不改成黑会在单色界面里格外扎眼 */
                className="w-full accent-ink"
                onChange={(event) => updateLlm({ temperature: Number(event.target.value) })}
              />
              <p className="hint mt-1">越低越稳定，越高越发散。答疑建议 0.3~0.8。</p>
            </div>
            <div>
              <label className="label" htmlFor="llm-max-tokens">
                单次最大输出 token
              </label>
              <input
                id="llm-max-tokens"
                type="number"
                min={256}
                max={32768}
                step={256}
                className="input tabular"
                value={llm.maxTokens}
                onChange={(event) => updateLlm({ maxTokens: Number(event.target.value) || 2048 })}
              />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft pt-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTest}
            disabled={test.status === 'testing' || !llm.baseUrl || !llm.apiKey || !llm.model}
          >
            {test.status === 'testing' ? '正在测试…' : '测试连接'}
          </button>

          {/* 成功态：单色系统里没有绿色。连接成功是一个"事实陈述"，
              不是需要警觉的事，所以用中性徽章而不是 alert 红 */}
          {test.status === 'ok' && <span className="badge">✅ 连接成功</span>}
        </div>

        {/* 错误态：这是 alert 红的正当使用场景 */}
        {test.status === 'error' && (
          <div className="rounded-card border border-alert bg-alert-soft px-4 py-3 text-body">
            <p className="font-bold text-alert">{test.message}</p>
            {test.hint && <p className="mt-1 leading-relaxed text-alert">{test.hint}</p>}
          </div>
        )}
      </div>
    </section>
  )
}

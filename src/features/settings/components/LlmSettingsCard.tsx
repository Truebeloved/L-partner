import { useState } from 'react'

import { Icon } from '@/components/Icon'
import { createProvider } from '@/lib/llm'
import { LlmError } from '@/lib/llm/types'
import { useSettingsStore } from '@/store/settings'
import type { LlmSettings } from '@/types/models'

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

/**
 * 大模型接入卡片。
 *
 * 这一版重做了**使用逻辑**，修的是上一版三处互相打架的地方：
 *
 * 1. **草稿与已保存分开**。上一版每敲一个字就直接写进设置（自动保存），
 *    唯独密钥要单独点一次「保存」—— 同一张卡片两套模型，用户不知道
 *    "现在到底算配置好了没有"。现在统一成：编辑的是草稿，点「保存并使用」才生效。
 * 2. **测试连接测的是屏幕上的值**。上一版测的是已保存的配置，
 *    改了密钥必须先保存才能测，而那一刻测的其实还是旧的 —— 这是真正的逻辑错误。
 *    现在测试直接用草稿（密钥留空时用已保存的那把）。
 * 3. **配好之后有一个"当前状态"**。上一版永远停在一排输入框上，
 *    看不出"已经在用了"。现在未配置是表单、已配置是状态卡，改配置才进编辑态。
 *
 * 密钥保存后不再回显（输入框绑的是草稿，已保存的密钥根本不进 DOM），
 * 编辑态里留空即"不修改"，要换只能重新输入一遍。
 */
export function LlmSettingsCard() {
  const settings = useSettingsStore((state) => state.settings)
  const updateLlm = useSettingsStore((state) => state.updateLlm)

  const saved = settings.llm
  const hasKey = saved.apiKey.trim().length > 0

  /*
   * 编辑态的草稿：`null` 表示"没在编辑"，此时草稿**就是**已保存的配置。
   *
   * 不用 useEffect 去同步草稿（保存完还要把它拉回来）：
   * 那样每次 store 变化都会触发一次额外渲染，而且中间会有一帧显示旧值。
   * 把"没在编辑"表达成 null，读取时兜底到 saved，就不存在需要同步的两份状态。
   */
  const [editState, setEditState] = useState<LlmSettings | null>(null)
  const editing = editState !== null
  const draft = editState ?? saved
  const [keyDraft, setKeyDraft] = useState('')
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  /** 改草稿；第一次改动会自动进入编辑态 */
  function patchDraft(patch: Partial<LlmSettings>) {
    setEditState((current) => ({ ...(current ?? saved), ...patch }))
  }

  function leaveEditing() {
    setEditState(null)
    setKeyDraft('')
    setTest({ status: 'idle' })
  }

  /** 这一轮真正要用的配置：草稿 + 新密钥（留空则沿用已保存的那把） */
  function effectiveConfig(): LlmSettings {
    return { ...draft, apiKey: keyDraft.trim() || saved.apiKey }
  }

  function canSave(): boolean {
    return Boolean(draft.baseUrl.trim() && draft.model.trim() && effectiveConfig().apiKey.trim())
  }

  async function handleTest() {
    setTest({ status: 'testing' })
    try {
      const result = await createProvider(effectiveConfig()).testConnection()
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

  function handleSave() {
    const next = effectiveConfig()
    updateLlm({
      baseUrl: next.baseUrl.trim(),
      model: next.model.trim(),
      temperature: next.temperature,
      maxTokens: next.maxTokens,
      ...(keyDraft.trim() ? { apiKey: keyDraft.trim() } : {}),
    })
    leaveEditing()
  }

  // ---- 已配置且不在编辑：状态卡 ----
  if (hasKey && !editing) {
    return (
      <section className="card">
        <div className="mb-4 flex min-w-0 items-baseline gap-3">
          <h2 className="shrink-0 text-h3 font-bold text-ink">大模型接入</h2>
          <span className="truncate text-small text-ink-faint">密钥只存本地，不上传</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="badge">
            <Icon name="check" size={12} /> 使用中
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-bold text-ink">{saved.model}</p>
            <p className="truncate text-small text-ink-faint">{saved.baseUrl}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={test.status === 'testing'}
          >
            {test.status === 'testing' ? '正在测试…' : '测试连接'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditState(saved)
              setKeyDraft('')
              setTest({ status: 'idle' })
            }}
          >
            修改配置
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm ml-auto"
            onClick={() => {
              updateLlm({ apiKey: '' })
              setTest({ status: 'idle' })
            }}
          >
            清除密钥
          </button>
        </div>

        <TestResult test={test} />
      </section>
    )
  }

  // ---- 未配置 / 编辑中：表单 ----
  return (
    <section className="card">
      <div className="mb-4 flex min-w-0 items-baseline gap-3">
        <h2 className="shrink-0 text-h3 font-bold text-ink">大模型接入</h2>
        <span className="truncate text-small text-ink-faint">密钥只存本地，不上传</span>
      </div>

      {hasKey && (
        <p className="mb-4 rounded-sm bg-ink/5 px-3 py-2 text-small leading-relaxed text-ink">
          正在修改配置。密钥留空表示不改动已保存的那把。
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.note}
            className="btn btn-secondary btn-sm"
            onClick={() => {
              patchDraft({ baseUrl: preset.baseUrl, model: preset.model })
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
            value={draft.baseUrl}
            placeholder="https://api.deepseek.com/v1"
            onChange={(event) => {
              const baseUrl = event.target.value
              patchDraft({ baseUrl })
            }}
          />
          <p className="hint mt-1">
            多数厂商需要以 <code className="rounded-sm bg-ink/5 px-1 font-mono">/v1</code> 结尾
          </p>
        </div>

        <div>
          <label className="label" htmlFor="llm-model">
            模型名称
          </label>
          <input
            id="llm-model"
            className="input"
            value={draft.model}
            placeholder="deepseek-chat"
            onChange={(event) => {
              const model = event.target.value
              patchDraft({ model })
            }}
          />
        </div>

        <div>
          <label className="label" htmlFor="llm-api-key">
            API Key
          </label>
          <input
            id="llm-api-key"
            className="input"
            type="password"
            value={keyDraft}
            placeholder={hasKey ? '已保存，留空表示不修改' : 'sk-...'}
            autoComplete="off"
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <p className="hint mt-1">保存后不再显示；要更换只能重新输入一遍。</p>
        </div>

        <details className="rounded-sm bg-ink/5 px-4 py-3">
          <summary className="cursor-pointer text-body font-bold text-ink">
            高级参数（一般不用改）
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="llm-temperature">
                温度 {draft.temperature.toFixed(1)}
              </label>
              <input
                id="llm-temperature"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                /* accent-ink：滑块的默认主题色是浏览器蓝，不改成黑会在单色界面里格外扎眼 */
                className="w-full accent-ink"
                onChange={(event) => {
                  const temperature = Number(event.target.value)
                  patchDraft({ temperature })
                }}
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
                value={draft.maxTokens}
                onChange={(event) => {
                  const maxTokens = Number(event.target.value) || 2048
                  patchDraft({ maxTokens })
                }}
              />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave()}
            title={canSave() ? undefined : 'API 地址、模型名称与密钥都要填齐才能保存'}
          >
            保存并使用
          </button>
          {/* 测试用的是**屏幕上的值**，不必先保存 —— 上一版必须先保存才能测，测的还往往是旧配置 */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={test.status === 'testing' || !effectiveConfig().apiKey.trim()}
          >
            {test.status === 'testing' ? '正在测试…' : '测试连接'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={leaveEditing}
            >
              取消
            </button>
          )}
        </div>

        <TestResult test={test} />
      </div>
    </section>
  )
}

function TestResult({ test }: { test: TestState }) {
  if (test.status === 'ok') {
    // 单色系统里没有绿色。连接成功是一个"事实陈述"，用中性徽章而不是 alert 红
    return (
      <p className="mt-1 flex items-center gap-2 text-small text-ink">
        <span className="badge">
          <Icon name="check" size={12} /> 连接成功
        </span>
      </p>
    )
  }

  // 错误态：这是 alert 红的正当使用场景
  if (test.status === 'error') {
    return (
      <div className="rounded-card border border-alert bg-alert-soft px-4 py-3 text-body">
        <p className="font-bold text-alert">{test.message}</p>
        {test.hint && <p className="mt-1 leading-relaxed text-alert">{test.hint}</p>}
      </div>
    )
  }

  return null
}

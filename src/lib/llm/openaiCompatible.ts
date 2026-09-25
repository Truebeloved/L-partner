import { LlmError } from '@/lib/llm/types'
import type { ChatOptions, ConnectionCheck, LlmMessage, LlmProvider } from '@/lib/llm/types'
import type { LlmSettings } from '@/types/models'

/**
 * OpenAI 兼容协议的提供方实现。
 *
 * 只做这一种协议是刻意的选择：DeepSeek、Moonshot、通义、智谱、OpenAI 官方、
 * 以及本地 Ollama 都兼容 `/chat/completions`，覆盖面已经足够，
 * 而多实现一套协议就要多一套流式解析与错误处理。
 */
export function createOpenAiCompatibleProvider(settings: LlmSettings): LlmProvider {
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  const endpoint = `${base}/chat/completions`

  async function chat(messages: LlmMessage[], options: ChatOptions = {}): Promise<string> {
    const streaming = typeof options.onDelta === 'function'

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        signal: options.signal,
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: options.temperature ?? settings.temperature,
          max_tokens: options.maxTokens ?? settings.maxTokens,
          stream: streaming,
        }),
      })
    } catch (error) {
      if (options.signal?.aborted) {
        throw new LlmError('aborted', '已取消生成')
      }
      throw new LlmError(
        'network',
        `无法连接到模型服务：${error instanceof Error ? error.message : String(error)}`,
        '常见原因有两个：网络不通，或浏览器跨域（CORS）被拦截。' +
          '国内厂商（DeepSeek / Moonshot / 通义）通常允许浏览器直连，' +
          'OpenAI 官方默认不允许 —— 这种情况需要改用兼容网关或本地 Ollama。',
      )
    }

    if (!response.ok) {
      throw await toHttpError(response)
    }

    if (!streaming) {
      const data = await safeJson(response)
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new LlmError('bad-response', '模型返回的内容为空或格式不符合预期')
      }
      return content
    }

    return readStream(response, options.onDelta)
  }

  async function testConnection(): Promise<ConnectionCheck> {
    try {
      const content = await chat([{ role: 'user', content: '请只回复两个字：连接成功' }], {
        maxTokens: 16,
        temperature: 0,
      })
      return content.trim() === ''
        ? { ok: false, message: '服务有响应，但返回内容为空' }
        : { ok: true }
    } catch (error) {
      if (error instanceof LlmError) {
        return { ok: false, message: error.message, hint: error.hint }
      }
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  return { endpoint, chat, testConnection }
}

/** 把 HTTP 状态码翻译成用户能理解、且能据此行动的错误 */
async function toHttpError(response: Response): Promise<LlmError> {
  const body = await response.text().catch(() => '')
  const detail = extractErrorMessage(body) ?? body.slice(0, 300)

  if (response.status === 401 || response.status === 403) {
    return new LlmError(
      'auth',
      `鉴权失败（${response.status}）${detail ? `：${detail}` : ''}`,
      '请检查 API Key 是否正确、是否已过期，以及该 Key 是否有调用此模型的权限。',
    )
  }
  if (response.status === 404) {
    return new LlmError(
      'not-found',
      `接口不存在（404）${detail ? `：${detail}` : ''}`,
      '多半是「API 地址」填得不对。多数厂商需要以 /v1 结尾，例如 https://api.deepseek.com/v1',
    )
  }
  if (response.status === 429) {
    return new LlmError(
      'rate-limit',
      `请求过于频繁或余额不足（429）${detail ? `：${detail}` : ''}`,
      '稍后再试，或到厂商控制台确认配额与余额。',
    )
  }
  if (response.status >= 500) {
    return new LlmError(
      'server',
      `模型服务出错（${response.status}）${detail ? `：${detail}` : ''}`,
      '这是服务端问题，稍后重试；如果持续出现，换一个模型试试。',
    )
  }
  return new LlmError(
    'bad-response',
    `请求失败（${response.status}）${detail ? `：${detail}` : ''}`,
  )
}

/** 只声明我们真正会读的字段，避免用 any 把整个响应体放行 */
interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

async function safeJson(response: Response): Promise<ChatCompletionResponse | null> {
  try {
    return (await response.json()) as ChatCompletionResponse
  } catch {
    return null
  }
}

/** 从各家五花八门的错误体里尽量捞出一句人话 */
function extractErrorMessage(body: string): string | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error
    return typeof message === 'string' ? message : null
  } catch {
    return null
  }
}

/**
 * 解析 SSE 流。
 *
 * 注意几个实际会遇到的坑：
 * - 一个网络分片可能在 JSON 中间断开，所以必须保留 buffer，只处理完整的行；
 * - 服务端会插入注释行和空行做心跳，直接跳过；
 * - 结束标记是 `data: [DONE]`，不是流的关闭。
 */
async function readStream(response: Response, onDelta?: (delta: string) => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new LlmError('bad-response', '响应没有可读取的流')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 最后一段可能是不完整的行，留到下一轮
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue

        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return full

        try {
          const parsed = JSON.parse(payload)
          const delta = parsed?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            full += delta
            onDelta?.(delta)
          }
        } catch {
          // 无法解析的行（心跳、非标准扩展）直接忽略，不要因为一行坏数据中断整个回答
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return full
}

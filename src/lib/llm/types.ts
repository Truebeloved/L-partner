/** 发给模型的单条消息，遵循 OpenAI 的 role 约定 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  /** 传入即可中断请求（例如用户点了「停止生成」） */
  signal?: AbortSignal
  /** 传入即启用流式输出，每收到一段增量就回调一次 */
  onDelta?: (delta: string) => void
}

export type ConnectionCheck = { ok: true } | { ok: false; message: string; hint?: string }

/**
 * 模型提供方抽象。
 *
 * 目前只有 OpenAI 兼容协议一种实现，但保留这层接口是为了：
 * 用户想接入非兼容协议（如 Anthropic 原生 API）时，只需新增一个实现，
 * 上层对话、记忆抽取、计划生成都不用改。
 */
export interface LlmProvider {
  readonly endpoint: string
  chat: (messages: LlmMessage[], options?: ChatOptions) => Promise<string>
  testConnection: () => Promise<ConnectionCheck>
}

export type LlmErrorCode =
  /** 网络不可达，或浏览器跨域被拦截 */
  | 'network'
  /** Key 无效或没有权限 */
  | 'auth'
  /** 接口地址不对（常见于 baseUrl 多写/少写了 /v1） */
  | 'not-found'
  /** 触发限流或余额不足 */
  | 'rate-limit'
  /** 服务端错误 */
  | 'server'
  /** 返回内容不符合预期 */
  | 'bad-response'
  /** 用户主动取消 */
  | 'aborted'

export class LlmError extends Error {
  readonly code: LlmErrorCode
  /** 给用户看的下一步建议。错误信息本身只说明发生了什么，hint 说明该怎么办 */
  readonly hint?: string

  constructor(code: LlmErrorCode, message: string, hint?: string) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.hint = hint
  }
}

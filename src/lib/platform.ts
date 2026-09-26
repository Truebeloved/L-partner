/**
 * 运行环境探测。
 *
 * 应用同时跑在两种环境下：
 * - **桌面端**（Electron）：preload 通过 contextBridge 挂了 `window.lpartner`
 * - **浏览器**（`npm run dev` 时调试用）：没有这个对象
 *
 * 所有「桌面专属能力」都要经过这里做存在性判断，而不是直接读 window.lpartner ——
 * 否则在浏览器里开发时整页会崩，而这类崩溃往往发生在启动第一帧，非常难排查。
 */

export interface AppInfo {
  /** 计算机名，例如 dev 机器上的「休伯利安」 */
  hostname: string
  username: string
  platform: string
}

export interface ToastPayload {
  title: string
  body: string
}

/** 主进程读回来的 B 站目录（字段与 features/course/bilibili.ts 的 BilibiliEpisode 对齐） */
export interface BilibiliCollectionResult {
  ok: boolean
  title?: string
  episodes?: {
    title: string
    bvid: string
    page: number
    seconds: number
    section: string
  }[]
  error?: string
}

interface LpartnerBridge {
  isDesktop?: boolean
  getAppInfo: () => Promise<AppInfo>
  showToast: (payload: ToastPayload) => Promise<boolean>
  onToastDismiss: (callback: () => void) => () => void
  fetchBilibiliCollection: (url: string) => Promise<BilibiliCollectionResult>
}

declare global {
  interface Window {
    lpartner?: LpartnerBridge
  }
}

/** 是否运行在桌面壳里 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.lpartner?.isDesktop)
}

/**
 * 取本机信息。浏览器环境下返回 null。
 * 失败时也返回 null 而不是抛错 —— 开屏问候拿不到名字只是少点温度，
 * 不该因此把应用挡在启动画面外。
 */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (typeof window === 'undefined' || !window.lpartner) return null
  try {
    return await window.lpartner.getAppInfo()
  } catch (error) {
    console.warn('[L-partner] 读取本机信息失败：', error)
    return null
  }
}

/**
 * 请求主进程弹一条桌面提醒小窗。
 *
 * 返回是否真的弹了：主窗口在前台时主进程会拒绝（用户正看着应用，不必再弹窗）。
 * 浏览器里没有这个能力，返回 false 而不是抛错 —— 网页版少一个桌面提醒而已，
 * 不该让整条提醒链路崩掉。
 */
export async function showDesktopToast(payload: ToastPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !window.lpartner?.showToast) return false
  try {
    return await window.lpartner.showToast(payload)
  } catch (error) {
    console.warn('[L-partner] 弹出桌面提醒失败：', error)
    return false
  }
}

/**
 * 订阅"开始退场"。只在提醒小窗里用得上：总时长由主进程掌握，
 * 它会在销毁窗口前提前通知，让这里有机会把消失动画放完。
 * 浏览器环境下返回一个空的取消订阅函数，调用方不必做额外判断。
 */
export function onToastDismiss(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.lpartner?.onToastDismiss) return () => {}
  try {
    return window.lpartner.onToastDismiss(callback)
  } catch (error) {
    console.warn('[L-partner] 订阅提醒退场失败：', error)
    return () => {}
  }
}

/**
 * 读取一个 B 站视频/合集的目录。
 *
 * 只有桌面端能做（要用主进程里的隐藏浏览器窗口去绕开 B 站对脚本请求的拦截）。
 * 浏览器里返回一句明确的失败原因，而不是抛错 —— 调用方照常显示提示即可。
 */
export async function fetchBilibiliCollection(url: string): Promise<BilibiliCollectionResult> {
  if (typeof window === 'undefined' || !window.lpartner?.fetchBilibiliCollection) {
    return { ok: false, error: '读取 B 站目录需要桌面版应用（浏览器里做不到）。' }
  }
  try {
    return await window.lpartner.fetchBilibiliCollection(url)
  } catch (error) {
    return { ok: false, error: `读取失败：${String(error)}` }
  }
}

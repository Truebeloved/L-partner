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

interface LpartnerBridge {
  isDesktop?: boolean
  getAppInfo: () => Promise<AppInfo>
  showToast: (payload: ToastPayload) => Promise<boolean>
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

// 读取 B 站视频/合集的目录。
//
// 单独成文件而不是塞在 main.cjs 里：这段逻辑需要被**单独验证**（见 scripts/probe-bilibili.mjs），
// 而 main.cjs 一被 require 就会启动整个应用 —— 那样根本没法只测这一段。
const { BrowserWindow } = require('electron')

/** 只认 bilibili 系域名：这个能力是"读课程目录"，不该变成任意网址的抓取器 */
const BILIBILI_HOSTS = ['bilibili.com', 'b23.tv', 'bilibili.tv']

function isBilibiliUrl(value) {
  try {
    const url = new URL(value)
    return BILIBILI_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

/**
 * 在页面里把课程目录抠出来。
 *
 * B 站首屏会把整页数据塞进 `window.__INITIAL_STATE__`：
 * - 多 P 视频在 `videoData.pages`
 * - 合集在 `videoData.ugc_season.sections[].episodes`
 * 两种都读，返回统一的目录数组。用"读页面变量"而不是扒 DOM：
 * DOM 是给渲染用的，改版就变；这份数据是首屏渲染的输入，稳得多。
 */
const BILIBILI_EXTRACT = `(() => {
  const state = window.__INITIAL_STATE__ ?? {}
  const video = state.videoData ?? {}
  const episodes = []

  for (const page of video.pages ?? []) {
    episodes.push({
      title: String(page.part ?? '').trim(),
      bvid: video.bvid,
      page: Number(page.page ?? 1),
      seconds: Number(page.duration ?? 0),
      section: '',
    })
  }

  const season = video.ugc_season ?? state.ugc_season
  if (season?.sections) {
    for (const section of season.sections) {
      for (const episode of section.episodes ?? []) {
        const title = String(episode.title ?? episode.arc?.title ?? '').trim()
        if (!title || !episode.bvid) continue
        episodes.push({
          title,
          bvid: episode.bvid,
          page: 1,
          seconds: Number(episode.arc?.duration ?? episode.duration ?? 0),
          section: String(section.title ?? '').trim(),
        })
      }
    }
  }

  return {
    title: String(season?.title ?? video.title ?? document.title ?? '').trim(),
    episodes,
    captcha: /验证码/.test(document.title ?? ''),
  }
})()`

const LOAD_TIMEOUT_MS = 25_000
/** 首屏数据是异步填的，加载完成后留一点时间 */
const SETTLE_MS = 1500

/**
 * 抓一个 B 站视频/合集的目录。
 *
 * ⚠️ 为什么不用 fetch：B 站对非浏览器客户端直接返回验证码页
 * （实测 `api.bilibili.com/x/web-interface/view` 返回 62012，
 * 直接抓视频页 HTML 得到的是"验证码_哔哩哔哩"）。所以这里用一个
 * **隐藏的真实浏览器窗口**加载页面 —— 它就是浏览器，拿得到完整首屏数据。
 *
 * 只允许 bilibili 系域名；有硬超时；无论成败都销毁窗口。
 */
async function fetchBilibiliCollection(rawUrl) {
  const input = String(rawUrl ?? '').trim()
  if (!input) return { ok: false, error: '还没有填链接' }
  if (!isBilibiliUrl(input)) {
    return { ok: false, error: '这看起来不是 B 站的链接。请把视频或合集的网址整条复制进来。' }
  }

  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 独立分区：不和主窗口共用 cookie，抓取行为与用户自己的浏览互不干扰
      partition: 'persist:bilibili-crawl',
      // 抓取窗口只用来读数据，绝不该出声。B 站视频页会自动起播，
      // 用户因此会听到零点几秒的视频开头 —— 让它连自动播放都不允许。
      autoplayPolicy: 'document-user-activation-required',
    },
  })

  // 双保险：即使页面已经在播放，也强制静音这一整个 WebContents（只影响这个抓取窗口，
  // 与用户自己浏览器里的播放无关）。
  window.webContents.setAudioMuted(true)

  try {
    await Promise.race([
      window.loadURL(input),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)),
    ])

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

    const data = await window.webContents.executeJavaScript(BILIBILI_EXTRACT, true)
    const episodes = Array.isArray(data?.episodes) ? data.episodes : []
    if (episodes.length === 0) {
      return {
        ok: false,
        error: data?.captcha
          ? 'B 站这次要求人机验证，没读到目录。稍后再试，或换一个合集链接。'
          : '这个页面里没有读到分集目录。可能它不是合集/多 P 视频，换一个链接试试。',
      }
    }

    return { ok: true, title: data.title, episodes }
  } catch (error) {
    const message = error instanceof Error && error.message === 'timeout' ? '加载超时' : String(error)
    return { ok: false, error: `读取失败：${message}。可以换一个合集链接再试。` }
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}

module.exports = { fetchBilibiliCollection, isBilibiliUrl, BILIBILI_EXTRACT }

/**
 * 一次性验证工具：在真实 Electron 里跑一遍 B 站目录抓取。
 *
 * 存在的理由：这条路子（用隐藏浏览器窗口读 `__INITIAL_STATE__`）能不能成，
 * 只有真跑一次才知道 —— 脚本直连早被 B 站用验证码挡掉了，
 * 而单测只能覆盖"目录 → 方案"的转换，覆盖不了网络这一步。
 *
 * 用法：node scripts/probe-bilibili.mjs [合集链接]
 */
const fs = require('node:fs')
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

// 直接 require 主进程里那份实现：验证的必须是真的那条路径，不能是复制品
const { fetchBilibiliCollection } = require(path.join(__dirname, '..', 'electron', 'bilibili.cjs'))

const url = process.argv[2] || 'https://www.bilibili.com/video/BV1tXh7zfEmr/'
const dump = process.argv.includes('--dump')

/** 抓取失败时看一眼页面里到底有什么：是验证码、还是数据结构换了 */
async function diagnose(target) {
  const window = new BrowserWindow({ show: false, width: 1280, height: 800 })
  try {
    await window.loadURL(target)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    return await window.webContents.executeJavaScript(
      `(() => {
        const state = window.__INITIAL_STATE__ ?? null
        const video = state?.videoData ?? {}
        return {
          href: location.href,
          docTitle: document.title,
          hasState: Boolean(state),
          stateKeys: state ? Object.keys(state).slice(0, 40) : [],
          videoKeys: Object.keys(video).slice(0, 40),
          pages: Array.isArray(video.pages) ? video.pages.length : null,
          seasonTitle: video.ugc_season?.title ?? null,
          seasonSections: video.ugc_season?.sections?.length ?? null,
        }
      })()`,
      true,
    )
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}

app.whenReady().then(async () => {
  console.log(`\n抓取：${url}\n`)

  if (dump) {
    console.log('诊断：', JSON.stringify(await diagnose(url), null, 2))
    app.exit(0)
    return
  }

  const result = await fetchBilibiliCollection(url)

  if (!result.ok) {
    console.log(`❌ ${result.error}`)
    app.exit(1)
    return
  }

  const { episodes } = result
  console.log(`✅ 《${result.title}》共 ${episodes.length} 集`)
  console.log('\n前 5 集：')
  for (const episode of episodes.slice(0, 5)) {
    const minutes = episode.seconds ? Math.round(episode.seconds / 60) : '?'
    console.log(`  ${episode.title}  [${minutes} 分钟]  ${episode.bvid} p${episode.page}`)
  }

  const sections = new Set(episodes.map((episode) => episode.section).filter(Boolean))
  if (sections.size > 0) console.log(`\n合集分区：${[...sections].join(' / ')}`)

  fs.writeFileSync(
    path.join(__dirname, '..', '.ui-shots', 'bilibili-probe.json'),
    JSON.stringify(result, null, 2),
  )
  console.log('\n已写出 .ui-shots/bilibili-probe.json')
  app.exit(0)
})

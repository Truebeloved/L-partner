/**
 * 验证「贴 B 站合集链接 → 抓目录 → 建课」这条完整链路（走应用自己的界面与 IPC）。
 *
 * 用法：node scripts/probe-collection-flow.mjs   （需要先跑着 npm run dev:desktop）
 * 产物：.ui-shots/i1-collection-crawled.png
 */
const fs = require('node:fs')
const path = require('node:path')

const { app, BrowserWindow, ipcMain } = require('electron')

/*
 * 这个探针自己是主进程，所以要**替应用注册一次同样的 handler** ——
 * 否则测的就不是"渲染进程 → IPC → 抓取"这条缝，而是"没有 handler"这个事实。
 * 注册的是 electron/bilibili.cjs 里的同一个实现，与 electron/main.cjs 那行等价。
 */
const { fetchBilibiliCollection } = require(path.join(__dirname, '..', 'electron', 'bilibili.cjs'))
ipcMain.handle('bilibili:collection', (_event, url) => fetchBilibiliCollection(url))

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = path.join(__dirname, '..', '.ui-shots')
const COLLECTION = process.env.COLLECTION_URL || 'https://www.bilibili.com/video/BV1eAnJzyEuE/'

// 用真实 profile：这样抓到的候选会在用户自己的数据里生成，截图就是他看到的画面
app.setName('L-partner')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log(`  RENDERER ERROR ${event.message}`)
  })

  await window.loadURL(`${BASE_URL}/?probe=${Date.now()}#/courses`)
  await sleep(7000)

  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        node.textContent.includes('让 AI 帮我生成方案'),
      )
      if (!button) return 'not-found'
      button.click()
      return 'clicked'
    })()
  `)
  console.log(`  打开生成弹窗：${opened}`)
  await sleep(800)

  const filled = await window.webContents.executeJavaScript(`
    (() => {
      const setValue = (selector, value) => {
        const input = document.querySelector(selector)
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      const goal = setValue('#ai-goal', '我想学 C 语言')
      const link = setValue('#ai-collection', ${JSON.stringify(COLLECTION)})
      return goal && link ? 'filled' : 'not-found'
    })()
  `)
  console.log(`  填入目标与合集链接：${filled}`)
  await sleep(500)

  await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((node) =>
        /生成|读取|开始/.test(node.textContent),
      )
      if (button) button.click()
      return 'submitted'
    })()
  `)
  console.log('  已提交，等抓取…')

  // 抓取要加载整页并等首屏数据，实测约 8~12 秒
  await sleep(18000)

  const summary = await window.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText
      const matches = text.match(/共\\s*\\d+\\s*讲/g) ?? []
      const unitRows = document.querySelectorAll('[data-unit-row]').length
      return { matches, unitRows, head: text.slice(0, 200) }
    })()
  `)
  console.log(`  页面上的讲数标注：${JSON.stringify(summary.matches)}`)

  /*
   * 关键的一条：直接调 preload 暴露的桥，验证"渲染进程 → IPC → 主进程 → 抓取"
   * 这一整条缝真的通。前面两条只分别证明了抓取本身和"目录→方案"的转换。
   */
  const bridge = await window.webContents.executeJavaScript(`
    (async () => {
      if (!window.lpartner?.fetchBilibiliCollection) return { ok: false, error: 'bridge 不存在' }
      const result = await window.lpartner.fetchBilibiliCollection(${JSON.stringify(COLLECTION)})
      return {
        ok: result.ok,
        error: result.error,
        title: result.title,
        count: result.episodes?.length ?? 0,
        first: result.episodes?.[0]?.title,
      }
    })()
  `)
  console.log(`  桥接调用：${JSON.stringify(bridge, null, 2)}`)

  const image = await window.webContents.capturePage()
  fs.writeFileSync(path.join(OUT_DIR, 'i1-collection-crawled.png'), image.toPNG())
  console.log('  已输出 .ui-shots/i1-collection-crawled.png')

  app.exit(0)
})

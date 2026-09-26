/**
 * 录一段演示视频：真的把应用窗口录下来（MediaRecorder），并自动走一遍主要功能。
 *
 * 为什么这么做而不是截图拼视频：这条机器上没有 ffmpeg，拼帧需要外部编码器；
 * 而 Chromium 自带 MediaRecorder，能直接把画面录成 .webm —— 不需要任何额外依赖。
 * 录制发生在渲染层，存盘由主进程拦截下载完成（页面里点一下 <a download> 即可）。
 *
 * 用法：npm run dev 跑着 → node scripts/record-demo.mjs
 * 产物：DIR 里的 .webm（默认 D:\05）
 */
const { app, BrowserWindow, desktopCapturer, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.setName('L-partner')
app.on('window-all-closed', () => {})

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = process.env.DEMO_OUT || 'D:\\05'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 在页面里点一下某个按钮（按文字找），找不到就返回 false */
const clickByText = (text) => `(() => {
  const node = [...document.querySelectorAll('button, a')].find(
    (item) => item.textContent.trim() === ${JSON.stringify(text)},
  )
  if (!node) return false
  node.click()
  return true
})()`

/** 输入框里打字并回车（用 React 认的方式触发 input 事件） */
const typeAndSend = (selector, text) => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)})
  if (!input) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(text)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return true
})()`

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const target = path.join(OUT_DIR, `L-partner-演示-${new Date().toISOString().slice(0, 10)}.webm`)

  // 页面里触发下载时，直接落到目标路径（不弹保存对话框）
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSavePath(target)
    item.once('done', (_e, state) => console.log(`[demo] 下载 ${state} → ${target}`))
  })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
    },
  })

  await window.loadURL(`${BASE_URL}/#/`)
  // 等开屏播完
  for (let index = 0; index < 40; index += 1) {
    const gone = await window.webContents.executeJavaScript(
      `!document.querySelector('[data-testid="splash"]')`,
    )
    if (gone) break
    await sleep(400)
  }
  await sleep(1200)

  /*
   * 录制要拿一个"桌面源"的 id —— 浏览器层拿不到，只能主进程通过 desktopCapturer 取，
   * 再把 id 注入页面里的 getUserMedia（Chromium 的桌面捕获协议就是这样）。
   * 优先挑应用自己的窗口，实在找不到就用整个屏幕。
   */
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 },
  })
  const source =
    sources.find((item) => item.name.includes('L-partner')) ??
    sources.find((item) => item.id.startsWith('screen')) ??
    sources[0]

  if (!source) {
    console.error('[demo] 没有可用的捕获源，退出')
    app.exit(1)
    return
  }
  console.log(`[demo] 捕获源：${source.name}`)
  window.focus()

  console.log('[demo] 开始录制')
  await window.webContents.executeJavaScript(`
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: ${JSON.stringify(source.id)},
          },
        },
      })
      const chunks = []
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
      window.__dshStopRecording = () => new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'demo.webm'
          document.body.appendChild(link)
          link.click()
          link.remove()
          resolve(blob.size)
        }
        recorder.stop()
        stream.getTracks().forEach((track) => track.stop())
      })
      recorder.start(1000)
      return true
    })()
  `)

  // ---- 演示脚本：走一遍主要功能 ----
  const steps = [
    ['#/', 2500], // 书架
    ['#/companion', 2600], // 学伴设定（四个角色）
    ['#/chat', 2200], // 学伴对话
  ]
  for (const [hash, wait] of steps) {
    await window.webContents.executeJavaScript(`location.hash = '${hash}'`)
    await sleep(wait)
  }

  // 在对话页问一句真问题（用用户自己配置的模型）
  await window.webContents.executeJavaScript(
    typeAndSend('[aria-label="问学伴"]', '用一句话说说，学一门新课最该先做的是什么？'),
  )
  await sleep(9000)

  // 角色弹层
  await window.webContents.executeJavaScript(clickByText('耐心学姐'))
  await sleep(1800)

  // 课程页：文言文（自带讲义）
  await window.webContents.executeJavaScript(`location.hash = '#/'`)
  await sleep(1500)
  await window.webContents.executeJavaScript(clickByText('新建课程'))
  await sleep(1600)
  await window.webContents.executeJavaScript(clickByText('取消'))
  await sleep(800)

  await window.webContents.executeJavaScript(`location.hash = '#/today'`)
  await sleep(2000)
  // 右键一条待办 → 小窗
  await window.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('ul.card li')
      if (!row) return false
      const rect = row.getBoundingClientRect()
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 120, clientY: rect.top + 20 }))
      return true
    })()
  `)
  await sleep(2200)

  await window.webContents.executeJavaScript(`location.hash = '#/settings'`)
  await sleep(2600)

  const size = await window.webContents.executeJavaScript(`window.__dshStopRecording()`)
  await sleep(1500)
  console.log(`[demo] 录制结束，约 ${Math.round(size / 1024)} KB`)
  console.log(`[demo] 文件：${target}`)
  app.exit(0)
})

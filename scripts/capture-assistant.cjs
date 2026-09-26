/**
 * 学伴输入条的截图工具：把四种状态、滚轮翻历史、二级界面的样子都留档。
 *
 * 用法：npm run shots:assistant   （需要先跑着 npm run dev）
 * 产物：.ui-shots/a-*.png
 *
 * 两个关键手法：
 * 1. **stub 掉 fetch**，用一个假的 SSE 流当作模型回答 —— 否则要真的花用户的钱、
 *    还得有 key 才能看到"正在生成"和"展开的长回答"这些状态；
 * 2. 在**本工具自己的 profile** 里写一份带假 key 的设置。注意这里的 profile 与
 *    真实应用不同（真实应用在启动时 setName('L-partner')，见 scripts/inspect-storage.cjs），
 *    所以这些假数据不会碰到用户的真实配置。
 */
const fs = require('node:fs')
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = path.join(__dirname, '..', '.ui-shots')
const WIDTH = Number(process.env.CAPTURE_W || 1440)
const HEIGHT = Number(process.env.CAPTURE_H || 900)

app.commandLine.appendSwitch('force-device-scale-factor', '1')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 回答故意写长：要验证的正是"顶到提问之后向下生长、覆盖页面内容" */
const FAKE_ANSWER = `闭包就是「函数 + 它出生时的那个作用域」。

举个最短的例子：外层函数里定义一个变量 count，内层函数每次调用都把它加一。内层函数被返回出去之后，外层函数早就执行完了，可 count 还在、还能被读写——因为内层函数一直攥着它出生时的那份作用域。

所以判断是不是闭包，只看一件事：这个函数用到的变量，是不是在它**定义**的地方就已经存在，而不是调用时传进来的。

三个常见误解：
1. 以为闭包是一种语法糖。它不是语法，是作用域规则的必然结果。
2. 以为必须返回函数。只要内层函数活过了外层的生命周期，就是闭包。
3. 以为它一定造成内存泄漏。它只是让变量生命周期变长，该释放还是能释放。

要不要我用你正在学的 React 举个例子？useState 之所以能"记住"上一次的值，靠的正是闭包。`

/**
 * 把假回答包成一个 SSE 流，逐字吐出来，才有"正在生成"的中间态。
 *
 * 注意整段必须是一个**返回字符串**的表达式：executeJavaScript 的返回值要走 IPC 序列化，
 * 直接赋值 `window.fetch = ...` 的完成值是一个函数，会报 "An object could not be cloned"。
 */
const FAKE_FETCH = `
  (() => {
    window.fetch = () => {
      const text = ${JSON.stringify(FAKE_ANSWER)}
      const encoder = new TextEncoder()
      let cursor = 0
      const stream = new ReadableStream({
        start(controller) {
          const timer = setInterval(() => {
            if (cursor >= text.length) {
              controller.enqueue(encoder.encode('data: [DONE]\\n\\n'))
              controller.close()
              clearInterval(timer)
              return
            }
            const chunk = text.slice(cursor, cursor + 4)
            cursor += 4
            const payload = { choices: [{ delta: { content: chunk } }] }
            controller.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + '\\n\\n'))
          }, 35)
        },
      })
      return Promise.resolve(new Response(stream, { status: 200 }))
    }
    return 'stubbed'
  })()
`

/** 写一份带假 key 的设置，让"发送"这条路径能走通 */
const SEED_SETTINGS = `
  (async () => {
    const key = 'lpartner.settings'
    const value = JSON.stringify({
      state: {
        settings: {
          llm: { baseUrl: 'https://example.invalid/v1', apiKey: 'sk-capture', model: 'demo', temperature: 0.7, maxTokens: 1024 },
          activePersonaId: 'builtin-senior',
          reminderEnabled: false,
          dailyReminderTime: '20:00',
          desktopReminderEnabled: false,
          desktopReminderFrom: '09:00',
          desktopReminderTo: '21:30',
          desktopReminderMaxPerDay: 4,
          autoExtractMemory: false,
          efficientMode: true,
        },
      },
      version: 2,
    })
    return new Promise((resolve) => {
      const open = indexedDB.open('keyval-store')
      open.onupgradeneeded = () => open.result.createObjectStore('keyval')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('keyval', 'readwrite')
        tx.objectStore('keyval').put(value, key)
        tx.oncomplete = () => { db.close(); resolve(true) }
      }
    })
  })()
`

/** 模拟用户输入：React 受控组件必须走原生 setter，直接改 value 不会触发 onChange */
function typeInto(selector, text) {
  return `
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      if (!input) return 'not-found'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(text)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return 'typed'
    })()
  `
}

function click(selector) {
  return `
    (() => {
      const node = document.querySelector(${JSON.stringify(selector)})
      if (!node) return 'not-found'
      node.click()
      return 'clicked'
    })()
  `
}

async function capture(window, name) {
  const image = await window.webContents.capturePage()
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())
  const { width, height } = image.getSize()
  console.log(`  ${name.padEnd(26)} ${width}x${height}`)
}

/**
 * 只拍输入条那一块。
 *
 * 整屏截图里输入条只占右上角一小块，动效细节（气泡圆角、省略号、挤压比例）根本看不清。
 * 按元素的实际矩形裁剪之后，同一张图就能看清设计。
 */
async function captureBar(window, name) {
  const rect = await window.webContents.executeJavaScript(`
    (() => {
      const bar = document.querySelector('[data-assistant-bar]')
      if (!bar) return null
      const box = bar.getBoundingClientRect()
      const pad = 10
      return {
        x: Math.max(0, Math.round(box.left - pad)),
        y: Math.max(0, Math.round(box.top - pad)),
        width: Math.round(box.width + pad * 2),
        height: Math.round(box.height + pad * 2),
      }
    })()
  `)
  if (!rect) {
    console.warn(`  ⚠ 找不到输入条，跳过 ${name}`)
    return
  }
  const image = await window.webContents.capturePage(rect)
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())
  const { width, height } = image.getSize()
  console.log(`  ${name.padEnd(26)} ${width}x${height}`)
}

async function sendQuestion(window, text) {
  await window.webContents.executeJavaScript(typeInto('[aria-label="问学伴"]', text))
  await sleep(120)
  await window.webContents.executeJavaScript(click('[aria-label="发送"]'))
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log(`  RENDERER ERROR ${event.message}`)
  })

  await window.loadURL(`${BASE_URL}/#/`)
  // 先等开屏走完，再写设置并重载 —— 保证 store 读到的是假 key
  await sleep(6000)
  await window.webContents.executeJavaScript(SEED_SETTINGS)
  await window.loadURL(`${BASE_URL}/#/`)
  await sleep(6000)
  await window.webContents.executeJavaScript(FAKE_FETCH)

  await capture(window, 'a1-bar-idle')
  await captureBar(window, 'b1-bar-idle')

  // ---- 提问 → 流式回答（向下生长、覆盖页面）----
  await sendQuestion(window, '帮我讲讲闭包，我总觉得没真的懂')
  await sleep(1400)
  await capture(window, 'a2-bar-answering')
  await captureBar(window, 'b2-bar-answering')

  // 等回答吐完（约 500 字 ÷ 4 字 × 35ms ≈ 4.4s），此时处在"答完停留"的窗口里
  await sleep(4500)
  await capture(window, 'a3-bar-settled')
  await captureBar(window, 'b3-bar-settled')

  // ---- 停留 3.2 秒之后自动收成长条 ----
  await sleep(3800)
  await capture(window, 'a4-bar-collapsed')
  await captureBar(window, 'b4-bar-collapsed')

  // ---- 点回答 → 再次展开 ----
  await window.webContents.executeJavaScript(click('[data-assistant-answer]'))
  await sleep(900)
  await capture(window, 'a5-bar-detail')
  await captureBar(window, 'b5-bar-detail')

  // 收起回答，再点提问 → 提问横向展开、回答被挤成缩略
  await window.webContents.executeJavaScript(click('[data-assistant-answer]'))
  await sleep(600)
  const questionClicked = await window.webContents.executeJavaScript(
    click('[data-assistant-question]'),
  )
  console.log(`  点提问：${questionClicked}`)
  await sleep(900)
  await capture(window, 'a6-bar-question-open')
  await captureBar(window, 'b6-bar-question-open')

  // ---- 再问一条，然后用滚轮翻回上一条 ----
  await window.webContents.executeJavaScript(click('[aria-label="问新问题"]'))
  await sleep(500)
  await sendQuestion(window, '那我该怎么练？')
  await sleep(6500)

  const wheeled = await window.webContents.executeJavaScript(`
    (() => {
      const bar = document.querySelector('[data-assistant-bar]')
      if (!bar) return 'no-bar'
      bar.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
      return 'wheeled'
    })()
  `)
  console.log(`  滚轮：${wheeled}`)
  await sleep(900)
  await capture(window, 'a7-bar-browse-history')

  // ---- 二级界面（课程页）的输入条 ----
  const courseId = await window.webContents.executeJavaScript(`
    (() => {
      const raw = window.location.hash
      return raw
    })()
  `)
  await window.webContents.executeJavaScript(`location.hash = '#/courses'`)
  await sleep(1200)
  const opened = await window.webContents.executeJavaScript(
    `(() => {
      const cards = [...document.querySelectorAll('a, button')]
      const target = cards.find((node) => /两个月上手 React/.test(node.textContent))
      if (!target) return 'not-found'
      target.click()
      return 'clicked'
    })()`,
  )
  console.log(`  打开课程：${opened}（hash=${courseId}）`)
  await sleep(1500)
  await capture(window, 'a8-bar-secondary-route')

  console.log(`\n已输出到 ${OUT_DIR}`)
  app.quit()
})

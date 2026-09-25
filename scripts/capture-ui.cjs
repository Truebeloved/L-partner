/**
 * UI 截图工具（Electron 版）。
 *
 * 为什么不从操作系统层面截屏：Windows 下会撞上三件事 ——
 * 显示缩放导致窗口物理尺寸与 CSS 尺寸不一致、后台进程不允许抢前台导致截到别的窗口、
 * 以及窗口大于屏幕时被裁掉。让应用自己渲染自己则完全没有这些问题，
 * 而且拿到的就是 1:1 的真实像素。
 *
 * 用法：npm run shots        （需要先跑着 npm run dev）
 * 产物：.ui-shots/*.png
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = process.env.CAPTURE_OUT || path.join(__dirname, '..', '.ui-shots')
const WIDTH = Number(process.env.CAPTURE_W || 1440)
const HEIGHT = Number(process.env.CAPTURE_H || 900)

/** [文件名, 路由]。开屏只播一次，后续靠改 hash 做客户端跳转，不重载页面 */
const ROUTES = [
  ['1-shelf', '/'],
  ['2-courses', '/courses'],
  ['3-today', '/today'],
  ['4-chat', '/chat'],
  ['5-memory', '/memory'],
  ['6-personas', '/personas'],
  ['7-settings', '/settings'],
]

/** 单次路由切换后的等待：状态是同步的，留 700ms 给动效收尾 */
const ROUTE_WAIT = 700
/** 等开屏出现 / 消失的最长时间 */
const APPEAR_TIMEOUT = 25000
const SPLASH_TIMEOUT = 25000

/**
 * 开屏两屏各自的取样时刻（毫秒，从开屏挂载算起）。
 * 开屏是全应用唯一讲究排版的地方，必须留档 —— 否则每次改版都没法比对。
 * 时刻参照 SplashScreen 里的节奏：第一屏 0–1800ms，第二屏 1800–3500ms。
 */
const SPLASH_SHOTS = [
  ['0-splash-1-greeting', 900],
  ['0-splash-2-question', 2600],
]

// 必须在 app ready 之前设置：强制 1:1 像素，否则高分屏上会拿到 2 倍图
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 轮询直到表达式为真。
 *
 * 「先等开屏出现、再等它消失」这两步都不能省 —— 只等消失是不够的：
 * 开屏要等 HydrationGate 把 IndexedDB 读完才会挂载，在那之前查询
 * 「开屏在不在」会立刻得到「不在」，于是截到的是加载态而不是应用界面。
 * 这个坑很隐蔽：图能出、不报错，只是内容不对。
 */
async function poll(window, expression, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const done = await window.webContents.executeJavaScript(`Boolean(${expression})`)
    if (done) return true
    await sleep(200)
  }
  return false
}

async function capture(window, name) {
  const image = await window.webContents.capturePage()
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())
  const { width, height } = image.getSize()
  console.log(`  ${name.padEnd(20)} ${width}x${height}`)
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    // 必须真的显示出来：隐藏窗口的 capturePage 会一直返回上一次合成的陈旧帧，
    // 表现为「明明 DOM 已经变了，截出来还是几秒前的画面」，而且每次截到的都一样，
    // 极易误判成选择器或时序问题。窗口会短暂出现在屏幕上，这是这个工具的代价。
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  try {
    await window.loadURL(`${BASE_URL}/#/`)
  } catch (error) {
    console.error(`\n无法加载 ${BASE_URL} —— 请先在另一个终端运行 npm run dev\n${String(error)}\n`)
    app.quit()
    return
  }

  // 开屏：等它出现后按时间点取样，再等它消失
  const appeared = await poll(
    window,
    `Boolean(document.querySelector('[data-testid="splash"]'))`,
    APPEAR_TIMEOUT,
  )

  if (appeared) {
    let elapsed = 0
    for (const [name, at] of SPLASH_SHOTS) {
      await sleep(Math.max(0, at - elapsed))
      elapsed = at
      await capture(window, name)
    }
    const gone = await poll(
      window,
      `!document.querySelector('[data-testid="splash"]')`,
      SPLASH_TIMEOUT,
    )
    if (!gone) console.warn('  ⚠ 开屏未在预期时间内消失，后续截图可能不准')
  } else {
    console.warn('  ⚠ 开屏没有出现，跳过开屏取样')
  }

  for (const [name, route] of ROUTES) {
    // 用 hash 做客户端跳转：不会重载页面，也就不必每次重等开屏
    await window.webContents.executeJavaScript(`location.hash = '#${route}'`)
    await sleep(ROUTE_WAIT)
    await capture(window, name)
  }

  console.log(`\n已输出到 ${OUT_DIR}`)
  app.quit()
})

// Electron 主进程。
//
// 用 .cjs 后缀是刻意的：package.json 里是 "type": "module"，
// 而 Electron 的 preload 脚本在沙箱下仍需 CommonJS，统一用 .cjs 最省心。
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron')
const os = require('node:os')
const path = require('node:path')

// B 站目录抓取单独成文件：它需要被单独验证（见 scripts/probe-bilibili.mjs），
// 而 require 这个文件会启动整个应用，那样没法只测抓取那一段
const { fetchBilibiliCollection } = require('./bilibili.cjs')

/**
 * 开发时由 npm run dev:desktop 传入 Vite 的地址（有 HMR，改代码立即生效）；
 * 打包后没有这个变量，直接读构建产物 dist/index.html。
 *
 * 注意 dist 用相对路径引资源、路由用 HashRouter —— 这两点正是 file:// 协议需要的，
 * 所以同一份构建产物既能被 Electron 加载，也不需要为桌面端另做一套配置。
 */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || ''
const ROOT = path.join(__dirname, '..')

app.setName('L-partner')

/* ---------------------------------------------------------------------------
   单实例锁
   没有它的话，用户双击桌面图标会再开一个完整实例：两份进程、两个托盘图标、
   两套提醒定时器，而且第二次打开还会重播一遍开屏。
   拿到锁的实例负责把已有窗口唤到前台。
--------------------------------------------------------------------------- */

if (!app.requestSingleInstanceLock()) {
  // 已经有实例在跑：这次启动直接退出，由那个实例把窗口唤出来
  app.quit()
} else {
  start()
}

/* ---------------------------------------------------------------------------
   窗口
--------------------------------------------------------------------------- */

let mainWindow = null
let tray = null
let toastWindow = null
let toastTimer = null
/** 退场通知的定时器，与 toastTimer 一起清理，避免关掉之后还发消息 */
let exitTimer = null
/** 记下弹出时刻，用来在日志里核对"是否真的只存活了 3 秒" */
let toastShownAt = null
/** 区分「关窗收进托盘」与「真的退出」——只有后者才允许窗口关闭 */
let isQuitting = false

/** 期望的窗口尺寸；实际取值会被工作区尺寸夹住，见 resolveWindowSize */
const PREFERRED_WIDTH = 1280
const PREFERRED_HEIGHT = 820
/**
 * 最小尺寸刻意放得比"理想布局"小很多。
 * 常见的小笔记本是 1366×768，扣掉任务栏后工作区只有约 1366×728 ——
 * 原来写 1024×680 看似宽松，实际上在 768 高的屏上几乎顶到底，
 * 用户会觉得"缩到最小还是这么大"。现在允许缩到 720×540：
 * 此时侧栏会自动收起、换成底部导航（Tailwind 的 md 断点），布局仍然成立。
 */
const MIN_WIDTH = 720
const MIN_HEIGHT = 540
/** 四周留出的空隙，避免窗口紧贴屏幕边缘 */
const SCREEN_MARGIN = 80

function resolveWindowSize() {
  const { workAreaSize } = screen.getPrimaryDisplay()
  return {
    width: Math.max(MIN_WIDTH, Math.min(PREFERRED_WIDTH, workAreaSize.width - SCREEN_MARGIN)),
    height: Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, workAreaSize.height - SCREEN_MARGIN)),
    minWidth: Math.min(MIN_WIDTH, workAreaSize.width),
    minHeight: Math.min(MIN_HEIGHT, workAreaSize.height),
  }
}

function preloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

/**
 * 把渲染进程的报错转发到终端。
 *
 * 起因是一个真实故障：打开提醒开关后整个界面变白。
 * 渲染进程抛错时 React 会把整棵树卸掉，主进程这边只看到"窗口还在、内容是空的"，
 * 终端里一个字都没有 —— 现场和原因之间隔着一整个进程边界，只能靠猜。
 * 开发模式下把 console 与崩溃事件接过来，这类故障才第一次有了现场。
 */
function forwardRendererLogs(window) {
  if (!DEV_SERVER_URL) return

  window.webContents.on('console-message', (event) => {
    /*
     * 只转发 warning / error，避免把开发期的噪声刷满终端。
     * 注意 level 的形态在版本之间变过：老版本是 0~3 的数字，新版本是
     * 'debug' | 'info' | 'warning' | 'error' 字符串 —— 两种都要认，
     * 否则过滤条件会把 error 一起挡掉（这个坑真的踩过一次）。
     */
    const level = event?.level
    const isError = level === 3 || level === 'error'
    const isWarning = level === 2 || level === 'warning'
    if (!isError && !isWarning) return

    const where = event?.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : ''
    console.log(`[renderer:${isError ? 'error' : 'warn'}] ${event?.message ?? ''}${where}`)
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.log(`[renderer] 进程结束：${JSON.stringify(details)}`)
  })

  window.webContents.on('preload-error', (_event, preload, error) => {
    console.log(`[renderer] preload 出错：${preload} ${String(error)}`)
  })
}

function createMainWindow() {
  const { width, height, minWidth, minHeight } = resolveWindowSize()

  const window = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    /*
     * 应用图标。开发模式下 Electron 用的是 node_modules 里 electron.exe 的图标，
     * 只有显式设置窗口图标，任务栏与 Alt+Tab 才会显示我们自己的 L。
     * 打包后 exe 的图标由 electron-builder 按 package.json 的 build.win.icon 写入。
     */
    icon: path.join(ROOT, 'assets', 'icon.ico'),
    // 先不显示，等页面渲染好再显示，避免出现「先白屏再出内容」的闪烁
    show: false,
    // 与开屏底色一致，首帧才不会闪一下别的颜色。
    backgroundColor: '#141414',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      // 安全基线：渲染进程拿不到 Node，所有系统能力都经 IPC 显式暴露
      contextIsolation: true,
      nodeIntegration: false,
      /*
       * 关掉后台节流。
       * 窗口收进托盘之后，Chromium 默认会把隐藏窗口的定时器压到最低频率 ——
       * 而「一天内随机时间弹提醒」恰恰要在隐藏状态下准时触发。
       * 不关掉它，提醒会迟到甚至直接不响。
       */
      backgroundThrottling: false,
    },
  })

  // 居中：小屏上如果还用系统默认位置，窗口可能一半在屏幕外
  window.center()
  window.once('ready-to-show', () => window.show())
  forwardRendererLogs(window)

  window.on('close', (event) => {
    // 关窗 = 收进托盘，应用继续跑（提醒需要它活着）。
    // 只有从托盘菜单退出时才真正关闭。
    if (isQuitting) return
    event.preventDefault()
    window.hide()
    showTrayHintOnce()
  })

  if (DEV_SERVER_URL) {
    window.loadURL(DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(ROOT, 'dist', 'index.html'))
  }

  // 外部链接交给系统浏览器，不要在应用窗口里跳走 —— 那样用户会「回不来」
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

/** 把主窗口唤到前台：切到后台过就先还原，再显示、聚焦 */
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/* ---------------------------------------------------------------------------
   托盘
   关窗之后应用还活着，就必须给用户一个看得见、能退出的入口 ——
   否则它就成了一个藏在后台、只能靠任务管理器结束的幽灵进程。
--------------------------------------------------------------------------- */

let trayHintShown = false

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png'))
  tray = new Tray(icon)
  tray.setToolTip('L-partner · 在后台继续提醒')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 L-partner', click: showMainWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  // Windows 上左键单击托盘图标的常规交互就是唤出主界面
  tray.on('click', showMainWindow)
}

/**
 * 第一次收进托盘时说明一次，否则用户会以为"关不掉"，只能去任务管理器结束。
 *
 * 这里刻意**不用** `tray.displayBalloon`（系统托盘气泡）：它的显示时长完全由
 * Windows 决定（通常 5~15 秒，且不给程序任何控制接口），而 Windows 11 起
 * 气泡已被系统 toast 取代，行为更不可控。改用应用自己的小窗之后，
 * 时长精确到 3 秒，外观也和随机提醒完全一致。
 *
 * force 是必须的：用户刚点了关闭按钮，主窗口此刻正是聚焦状态，
 * 而 showToast 默认会因为"应用在前台"而拒绝弹出 —— 这条提示恰好必须弹。
 */
function showTrayHintOnce() {
  if (trayHintShown) return
  trayHintShown = true
  showToast({ title: '已收进托盘，仍在后台运行', body: '右键托盘图标可以退出' }, { force: true })
}

/* ---------------------------------------------------------------------------
   桌面小窗提醒
--------------------------------------------------------------------------- */

/** 窗口比卡片略大一圈，多出来的边距是留给 CSS 阴影的（透明窗口里阴影不会被裁掉） */
const TOAST_WIDTH = 340
const TOAST_HEIGHT = 104
/**
 * 小窗的**总**存活时长：从显示出来的那一刻算起，到彻底消失为止。
 * 这 3 秒里包含了出现动画、停留、消失动画三部分 ——
 * 也就是说用户感知到的"存在感"恰好是 3 秒，而不是"停 3 秒后突然消失"。
 */
const TOAST_TOTAL_MS = 3000
/**
 * 消失动画时长。主进程提前这么久通知渲染层开始退场，剩下的时间刚好放完动画。
 *
 * ⚠️ 必须与 ToastView.tsx 里退场过渡的 duration 一致 ——
 * 不一致的话，要么动画被切断（提前销毁），要么黑屏干等（销毁太晚）。
 */
const TOAST_EXIT_MS = 180
const TOAST_MARGIN = 18

function closeToast() {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  if (exitTimer) {
    clearTimeout(exitTimer)
    exitTimer = null
  }
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.destroy()
  }
  if (toastShownAt !== null) {
    // 打出实际存活时长，方便核对"是不是真的 3 秒"
    console.log(`[toast] 已消失，总存活 ${Date.now() - toastShownAt}ms`)
    toastShownAt = null
  }
  toastWindow = null
}

/**
 * 在右下角弹一条小窗，3 秒后自动关闭。
 *
 * 返回是否真的弹了 —— 主窗口在前台时不弹：
 * 用户正看着应用，再弹一个系统小窗只是打扰。
 * `force` 只为开发期的演示开关准备，正常调用永远不该传。
 */
function showToast(payload, { force = false } = {}) {
  if (!force && mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
    // 拒绝也要留痕：静默跳过会让"提醒没弹"变成一个查不出原因的现象
    console.log('[toast] 跳过：主窗口正在前台')
    return false
  }

  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + workArea.width - TOAST_WIDTH - TOAST_MARGIN
  const y = workArea.y + workArea.height - TOAST_HEIGHT - TOAST_MARGIN

  // 上一条还没消失就来了新的：直接换掉，避免两条叠在一起
  closeToast()

  const window = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x,
    y,
    // 无边框 + 透明：圆角和阴影都要靠页面自己画，窗口本身必须能透出去
    frame: false,
    transparent: true,
    hasShadow: false,
    // 显式给一个全透明底色：Windows 上透明窗口不给它时，会先铺一层默认白/灰
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // 不进任务栏、不进 Alt+Tab —— 它是一条提示，不是一个窗口
    skipTaskbar: true,
    alwaysOnTop: true,
    /*
     * 不可获得焦点：用户可能正在别处打字，一条提醒弹出来把焦点抢走是灾难性的。
     * 配合 showInactive() 一起用，才能做到"看得见但不打扰"。
     */
    focusable: false,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const query = new URLSearchParams({
    title: String(payload?.title ?? ''),
    body: String(payload?.body ?? ''),
  }).toString()

  if (DEV_SERVER_URL) {
    window.loadURL(`${DEV_SERVER_URL}/#/toast?${query}`)
  } else {
    window.loadFile(path.join(ROOT, 'dist', 'index.html'), { hash: `/toast?${query}` })
  }

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return
    // showInactive：显示但不抢焦点
    window.showInactive()
    toastShownAt = Date.now()
    console.log(
      `[toast] 弹出于 ${x},${y}（${TOAST_WIDTH}×${TOAST_HEIGHT}）· ${payload?.title ?? ''}`,
    )

    /*
     * 计时从"真正显示出来"才开始，否则加载耗时会把 3 秒吃掉。
     * 时序：显示 → （出现动画）→ 提前 220ms 通知退场 → 3 秒整销毁。
     * 退场由主进程发起、渲染层执行动画，这样"总时长"只有一个权威来源。
     */
    toastTimer = setTimeout(closeToast, TOAST_TOTAL_MS)
    exitTimer = setTimeout(() => {
      if (!window.isDestroyed()) window.webContents.send('toast:dismiss')
    }, TOAST_TOTAL_MS - TOAST_EXIT_MS)
  })

  // 保险：万一 ready-to-show 没触发（透明窗口偶发），也不能让它永远不显示或永远不关
  setTimeout(() => {
    if (window.isDestroyed() || toastTimer) return
    window.showInactive()
    toastShownAt = Date.now()
    toastTimer = setTimeout(closeToast, TOAST_TOTAL_MS)
    exitTimer = setTimeout(() => {
      if (!window.isDestroyed()) window.webContents.send('toast:dismiss')
    }, TOAST_TOTAL_MS - TOAST_EXIT_MS)
  }, 2000)

  toastWindow = window
  window.on('closed', () => {
    if (toastWindow === window) toastWindow = null
  })

  return true
}

/* ---------------------------------------------------------------------------
   IPC
--------------------------------------------------------------------------- */

/**
 * 开屏要用的本机信息。
 * 渲染进程在沙箱里拿不到 os 模块，所以必须由主进程取好再经 IPC 送过去。
 */
ipcMain.handle('app:info', () => ({
  hostname: os.hostname(),
  username: os.userInfo().username,
  platform: process.platform,
}))

ipcMain.handle('reminder:toast', (_event, payload) => showToast(payload))

/*
 * 读取一个 B 站视频/合集的目录。
 * 具体实现在 electron/bilibili.cjs —— 那里用隐藏的真实浏览器窗口加载页面，
 * 因为 B 站对非浏览器客户端直接返回验证码（详见该文件的注释）。
 */
ipcMain.handle('bilibili:collection', (_event, url) => fetchBilibiliCollection(url))

/* ---------------------------------------------------------------------------
   启动
--------------------------------------------------------------------------- */

function start() {
  // 第二个实例被启动时，把已有窗口唤到前台 —— 而不是开一个新的
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('before-quit', () => {
    // 标记之后，窗口的 close 处理器才会放行
    isQuitting = true
  })

  app.whenReady().then(() => {
    mainWindow = createMainWindow()
    createTray()

    /*
     * 开发期的演示开关：LPARTNER_DEMO_TOAST=1 时，启动 6 秒后自动弹一条。
     *
     * 存在的理由是"提醒"这件事没法靠单测证明 —— 窗口位置、是否真的不抢焦点、
     * 3 秒后是否真的关掉，都只有在真实运行时才看得出来。
     * 没有这个开关，就只能靠手动点设置页的按钮，而那无法自动化验证。
     */
    if (DEV_SERVER_URL && process.env.LPARTNER_DEMO_TOAST === '1') {
      setTimeout(() => {
        // force：演示的目的就是看这个窗口长什么样，所以绕过前台检查。
        // 正常路径永远不会走到这里（提醒由渲染层按"不在前台才弹"的规则触发）
        showToast(
          {
            title: '休伯利安，今天学点什么？',
            body: '演示提醒：3 秒后自动消失',
          },
          { force: true },
        )
      }, 6000)
    }

    app.on('activate', () => {
      // macOS 上点 Dock 图标时把窗口唤回来
      showMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    /*
     * 刻意什么都不做：关掉窗口只是收进托盘。
     * 应用必须继续活着，否则「一天内随机时间弹提醒」根本无从谈起 ——
     * 提醒依赖进程在跑，这也正是"关窗 ≠ 退出"的原因。
     * 真正的退出入口在托盘右键菜单。
     */
  })
}

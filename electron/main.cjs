// Electron 主进程。
//
// 用 .cjs 后缀是刻意的：package.json 里是 "type": "module"，
// 而 Electron 的 preload 脚本在沙箱下仍需 CommonJS，统一用 .cjs 最省心。
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const os = require('node:os')
const path = require('node:path')

/**
 * 开发时由 npm run electron:dev 传入 Vite 的地址（有 HMR，改代码立即生效）；
 * 打包后没有这个变量，直接读构建产物 dist/index.html。
 *
 * 注意 dist 用相对路径引资源、路由用 HashRouter —— 这两点正是 file:// 协议需要的，
 * 所以同一份构建产物既能被 Electron 加载，也不需要为桌面端另做一套配置。
 */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || ''

app.setName('L-partner')

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

/**
 * 按当前显示器的工作区算窗口尺寸。
 * 不做这一步的话，在一台 1366×768 的机器上会创建 1280×820 的窗口 ——
 * 比工作区还高，底部被任务栏压住，而 Windows 不会替你把它缩回来。
 */
function resolveWindowSize() {
  const { workAreaSize } = screen.getPrimaryDisplay()
  return {
    width: Math.max(MIN_WIDTH, Math.min(PREFERRED_WIDTH, workAreaSize.width - SCREEN_MARGIN)),
    height: Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, workAreaSize.height - SCREEN_MARGIN)),
    minWidth: Math.min(MIN_WIDTH, workAreaSize.width),
    minHeight: Math.min(MIN_HEIGHT, workAreaSize.height),
  }
}

function createWindow() {
  const { width, height, minWidth, minHeight } = resolveWindowSize()

  const window = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    // 先不显示，等页面渲染好再显示，避免出现「先白屏再出内容」的闪烁
    show: false,
    // 与开屏底色一致，这样即使是首次启动也不会闪白
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // 安全基线：渲染进程拿不到 Node，所有系统能力都经 IPC 显式暴露
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 居中：小屏上如果还用系统默认位置，窗口可能一半在屏幕外
  window.center()
  window.once('ready-to-show', () => window.show())

  if (DEV_SERVER_URL) {
    window.loadURL(DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // 外部链接交给系统浏览器，不要在应用窗口里跳走 —— 那样用户会「回不来」
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

/**
 * 开屏要用的本机信息。
 * 渲染进程在沙箱里拿不到 os 模块，所以必须由主进程取好再经 IPC 送过去。
 */
ipcMain.handle('app:info', () => ({
  hostname: os.hostname(),
  username: os.userInfo().username,
  platform: process.platform,
}))

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // macOS 上点 Dock 图标且没有窗口时重新开一个
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // macOS 的惯例是关掉窗口后应用仍留在 Dock 里
  if (process.platform !== 'darwin') app.quit()
})

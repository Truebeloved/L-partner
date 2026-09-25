// Electron 主进程。
//
// 用 .cjs 后缀是刻意的：package.json 里是 "type": "module"，
// 而 Electron 的 preload 脚本在沙箱下仍需 CommonJS，统一用 .cjs 最省心。
const { app, BrowserWindow, ipcMain, shell } = require('electron')
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

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
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

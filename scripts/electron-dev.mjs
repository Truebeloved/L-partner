/**
 * 桌面端开发启动器：起 Vite → 拿到它实际监听的地址 → 拉起 Electron。
 *
 * 为什么不用 concurrently + wait-on 那套：
 * 它们靠「猜端口 + 轮询等待」来协调两个进程，端口被占用时 wait-on 会一直干等，
 * 而且需要额外两个依赖。这里直接用 Vite 的 JS API 拿到真实地址，没有竞态，
 * 也不需要约定端口。任一侧退出时会把另一侧一起收掉，不留孤儿进程。
 */
import { spawn } from 'node:child_process'

import electronPath from 'electron'
import { createServer } from 'vite'

const server = await createServer()
await server.listen()

const url = server.resolvedUrls?.local?.[0]
if (!url) {
  console.error('无法确定 Vite 的访问地址，已退出')
  await server.close()
  process.exit(1)
}

console.log(`\n  L-partner 桌面开发模式\n  Vite 地址: ${url}\n`)

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: buildChildEnv(url),
})

/**
 * 构造 Electron 子进程的环境变量。
 *
 * 这里必须显式清掉 `ELECTRON_RUN_AS_NODE`：一旦它被继承，electron.exe 会退化成
 * 纯 Node 来执行主进程脚本 —— 表现是 `require('electron')` 返回包路径字符串而不是 API，
 * 于是 `app` 为 undefined，报错信息还长得像普通 Node 崩溃，非常难定位。
 *
 * 触发场景很常见：在 Electron 应用内置的终端里执行（终端本身就带着这个变量），
 * 或者在 IDE 的 Electron 集成终端里跑。所以这不是一次性补丁，而是启动器该有的防御。
 */
function buildChildEnv(devServerUrl) {
  const env = { ...process.env, VITE_DEV_SERVER_URL: devServerUrl }

  const inherited = env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RUN_AS_NODE

  if (inherited !== undefined) {
    console.warn(
      `[L-partner] 检测到继承来的 ELECTRON_RUN_AS_NODE=${JSON.stringify(inherited)}，` +
        '已从 Electron 子进程环境中清除（否则它会退化成纯 Node 运行）',
    )
  }

  return env
}

let closing = false

async function shutdown(code = 0) {
  if (closing) return
  closing = true
  await server.close().catch(() => {})
  process.exit(code)
}

// Electron 窗口关掉 = 这次开发结束，把 Vite 也关掉
electron.on('close', (code) => {
  void shutdown(code ?? 0)
})

// Ctrl+C 时先收 Electron 再收 Vite，避免留下后台进程占着端口
process.on('SIGINT', () => {
  electron.kill()
  void shutdown(0)
})

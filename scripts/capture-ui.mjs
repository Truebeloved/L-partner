/**
 * 跑截图工具的启动器。
 *
 * 存在的唯一理由是环境变量：某些 Electron 应用（包括 DSH 桌面端）会给终端注入
 * ELECTRON_RUN_AS_NODE=1。一旦它被继承，electron.exe 会退化成纯 Node，
 * 截图脚本里的 require('electron') 就变成包路径字符串，直接崩。
 * 所以这里显式清掉它 —— 和 scripts/electron-dev.mjs 是同一处防御。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [path.join(here, 'capture-ui.cjs')], {
  stdio: 'inherit',
  env,
})

child.on('close', (code) => process.exit(code ?? 0))

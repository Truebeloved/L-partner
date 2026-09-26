/**
 * 跑本地数据查看工具的启动器。理由同 capture-ui.mjs：
 * 必须显式清掉继承来的 ELECTRON_RUN_AS_NODE，否则 electron.exe 退化成纯 Node。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [path.join(here, 'inspect-storage.cjs')], {
  stdio: 'inherit',
  env,
})

child.on('close', (code) => process.exit(code ?? 0))

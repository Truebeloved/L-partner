/** 跑演示录制脚本的启动器（理由同 capture-ui.mjs：必须清掉继承来的 ELECTRON_RUN_AS_NODE） */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [path.join(here, 'record-demo.cjs')], {
  stdio: 'inherit',
  env,
})

child.on('close', (code) => process.exit(code ?? 0))

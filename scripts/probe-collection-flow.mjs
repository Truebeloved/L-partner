/** 璺?B 绔欐姄鍙栭獙璇佸伐鍏风殑鍚姩鍣紙鐞嗙敱鍚?capture-ui.mjs锛?*/
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [path.join(here, 'probe-collection-flow.cjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
})

child.on('close', (code) => process.exit(code ?? 0))


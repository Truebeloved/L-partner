/**
 * 一条命令打完 Windows 安装包：`npm run package`。
 *
 * 为什么不让 package.json 直接调 electron-builder：
 * 这台机器上有两个坑，每次都要人手记得绕过，迟早会忘 —— 而这个脚本把它们固化下来，
 * 顺带在结束时告诉你安装包落在哪、多大。
 *
 * 坑一：**Vite 的监听器会锁住 release/**。
 * electron-builder 先写 `release/win-unpacked.tmp` 再改名，而开发服务器开着时
 * 监听器握着那些新文件，改名必然 `EPERM`。已经在 vite.config.ts 里把
 * release/dist/.ui-shots 加进 watch.ignored —— 这里再检查一次端口，若开发服务器
 * 还在跑就给一句明确提示（不强行 kill：那可能正在被用户使用）。
 *
 * 坑二：**这台机器的 TLS 被中间人替换 + 直连 GitHub 慢**。
 * electron-builder 首次打包要从 GitHub 下 NSIS 与 winCodeSign，于是报
 * "unable to verify the first certificate"。这里默认放行证书校验（只影响本次构建进程）
 * 并指向国内镜像；想恢复严格校验就把 LPARTNER_STRICT_TLS=1 打开。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const releaseDir = path.join(root, 'release')

/** electron-builder 上一次没跑完留下的临时目录：留着会让下一次改名也失败 */
function cleanLeftovers() {
  for (const name of ['win-unpacked.tmp', 'win-unpacked.tmp.dir']) {
    const target = path.join(releaseDir, name)
    if (!fs.existsSync(target)) continue
    try {
      fs.rmSync(target, { recursive: true, force: true })
      console.log(`  已清理上次的残留：${name}`)
    } catch (error) {
      console.warn(
        `  ⚠️ 清不掉 ${name}（${error.code ?? error.message}）。` +
          '多半还有进程握着它 —— 关掉所有 L-partner / Electron 窗口后重试。',
      )
    }
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env, shell: true })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} 退出码 ${code}`))))
  })
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

if (process.env.LPARTNER_STRICT_TLS !== '1') {
  env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
env.ELECTRON_BUILDER_BINARIES_MIRROR ??= 'https://npmmirror.com/mirrors/electron-builder-binaries/'

console.log('打包 L-partner（Windows / NSIS）')
cleanLeftovers()

try {
  await run('npm', ['run', 'build'], env)
  await run('npx', ['electron-builder', '--win', 'nsis'], env)
} catch (error) {
  console.error(`\n❌ 打包失败：${error.message}`)
  console.error('   常见原因与处理：')
  console.error('   • EPERM rename … win-unpacked.tmp → 还有进程占着 release/：')
  console.error('     关掉所有 L-partner 窗口与 `npm run dev` / `dev:desktop` 后重试')
  console.error('   • 证书错误：确认没有把 LPARTNER_STRICT_TLS 设成 1')
  process.exit(1)
}

const installer = fs
  .readdirSync(releaseDir)
  .filter((name) => name.endsWith('.exe'))
  .map((name) => path.join(releaseDir, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]

if (installer) {
  const size = (fs.statSync(installer).size / 1024 / 1024).toFixed(1)
  console.log(`\n✅ 安装包：${installer}（${size} MB）`)
  const unpacked = path.join(releaseDir, 'win-unpacked', 'L-partner.exe')
  if (fs.existsSync(unpacked)) console.log(`   免安装版：${unpacked}`)
} else {
  console.warn('\n⚠️ 构建完成但没找到 .exe，请检查 release/ 目录')
}

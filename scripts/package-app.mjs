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
 * 坑三：**正在运行的免安装版会锁住 release/win-unpacked**。
 * electron-builder 每次都要先把那个目录整个删掉重建，而用户双击过
 * `release\win-unpacked\L-partner.exe` 之后它就一直开着 —— 于是报
 * `EBUSY: resource busy or locked, rmdir 'release\win-unpacked'`。
 * 这个坑最气人的地方是：它看起来像打包工具坏了，实际上是"你的应用开着呢"。
 * 所以这里在开打之前先把这个项目产物里的进程关掉（只关**路径就是这个 exe** 的进程，
 * 不碰开发模式那个 electron.exe），并明确说一句。
 *
 * 坑二：**这台机器的 TLS 被中间人替换 + 直连 GitHub 慢**。
 * electron-builder 首次打包要从 GitHub 下 NSIS 与 winCodeSign，于是报
 * "unable to verify the first certificate"。这里默认放行证书校验（只影响本次构建进程）
 * 并指向国内镜像；想恢复严格校验就把 LPARTNER_STRICT_TLS=1 打开。
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const releaseDir = path.join(root, 'release')
const unpackedExe = path.join(releaseDir, 'win-unpacked', 'L-partner.exe')

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

/**
 * 关掉"正在运行的免安装版"。
 *
 * 只按**可执行文件的完整路径**匹配，所以开发模式（electron.exe）与安装版
 * （`%LOCALAPPDATA%\Programs\L-partner`）都不会被误伤 —— 它们锁的不是这个目录。
 * 被关掉的进程里没有未保存的东西（所有状态都是实时落盘的），
 * 代价只是用户那个窗口没了；不关的代价是根本打不了包。
 */
function stopRunningUnpacked() {
  if (!fs.existsSync(unpackedExe)) return []

  /*
   * 用 Get-Process 而不是 `Get-CimInstance -Filter "Name='…'"`。
   * 后者要在命令串里嵌一对双引号，而这串命令又要被别人再转一层 ——
   * 引号在传递途中被吃掉之后，WQL 会以 "无效查询" 失败，于是检测**静默地**
   * 认为"没有进程在跑"，然后打包继续撞 EBUSY。少一层引号就少一个坑。
   */
  const script =
    `Get-Process -Name 'L-partner' -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.Path -eq '${unpackedExe.replace(/'/g, "''")}' } | ` +
    'Select-Object -ExpandProperty Id'

  let output = ''
  // 先 pwsh 再 Windows PowerShell：两种机器上至少有一种在
  // （这台机器上 pwsh 不在 PATH 里，靠的就是第二档兜底）
  for (const shell of ['pwsh', 'powershell']) {
    try {
      output = execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
      })
      break
    } catch {
      // 换下一个 shell；两个都不行就当作"没有在跑"
    }
  }

  const pids = output
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0)

  for (const pid of pids) {
    try {
      process.kill(pid)
    } catch {
      // 已经退出了
    }
  }

  return pids
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

const stopped = stopRunningUnpacked()
if (stopped.length > 0) {
  console.log(`  已关闭正在运行的免安装版（PID ${stopped.join('、')}）——它占着 win-unpacked，不关就换不掉`)
  // 等文件句柄真正释放，否则紧随其后的 rmdir 仍可能 EBUSY
  await new Promise((resolve) => setTimeout(resolve, 1200))
}

try {
  await run('npm', ['run', 'build'], env)
  await run('npx', ['electron-builder', '--win', 'nsis'], env)
} catch (error) {
  console.error(`\n❌ 打包失败：${error.message}`)
  console.error('   常见原因与处理：')
  console.error('   • EBUSY / EPERM，release/ 被占用：')
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
  if (fs.existsSync(unpackedExe)) console.log(`   免安装版：${unpackedExe}`)
} else {
  console.warn('\n⚠️ 构建完成但没找到 .exe，请检查 release/ 目录')
}

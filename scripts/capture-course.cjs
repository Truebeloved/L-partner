/**
 * 截「真实课程页」的截图，并顺手统计页面上的可点击视频链接。
 *
 * 与 capture-ui.cjs 的区别：capture-ui 用的是默认 profile（干净数据，靠塞假课程排版），
 * 这个脚本用**你本机真实的 profile**（app.setName 必须和主程序一致），
 * 目的是验收"导入真实课程之后界面长什么样"——比如视频课程的标题能不能点开。
 *
 * 用法：npm run shots:course            （需要先跑着 npm run dev，且应用已退出）
 *      COURSE=翁恺 npm run shots:course  指定课程标题包含的关键字
 * 产物：.ui-shots/course-<序号>.png
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// 必须和主程序一致，否则读到的是另一个（空的）profile
app.setName('L-partner')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = process.env.CAPTURE_OUT || path.join(__dirname, '..', '.ui-shots')
const COURSE_KEYWORD = process.env.COURSE || ''

app.on('window-all-closed', () => {})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function poll(window, expression, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const done = await window.webContents.executeJavaScript(`Boolean(${expression})`)
    if (done) return true
    await sleep(200)
  }
  return false
}

/** 从 IndexedDB 里读课程列表（和主程序同一份持久化数据） */
const READ_COURSES = `(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('打不开数据库'))
  })
  if (!db.objectStoreNames.contains('keyval')) return null
  const raw = await new Promise((resolve) => {
    const tx = db.transaction('keyval', 'readonly')
    const req = tx.objectStore('keyval').get('lpartner.courses')
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => resolve(null)
  })
  db.close()
  if (!raw) return null
  return (JSON.parse(raw)?.state?.courses ?? []).map((course) => {
    const units = (course.stages ?? []).flatMap((stage) => stage.units ?? [])
    return {
      id: course.id,
      title: course.title,
      units,
      withLink: units.filter((unit) => unit.resourceUrl).length,
      sample: units[0]?.resourceUrl ?? null,
    }
  })
})()`

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  try {
    await window.loadURL(`${BASE_URL}/#/`)
  } catch (error) {
    console.error(`\n无法加载 ${BASE_URL} —— 请先在另一个终端运行 npm run dev\n${String(error)}\n`)
    app.exit(1)
    return
  }

  // 先等开屏结束（HydrationGate 读完 IndexedDB 才会挂载，不能只等"开屏不在"）
  await sleep(1200)
  await poll(window, `!document.querySelector('[data-testid="splash"]')`, 20000)
  await sleep(600)

  const courses = await window.webContents.executeJavaScript(READ_COURSES)
  if (!courses?.length) {
    console.error('这个 profile 里没有课程')
    app.exit(1)
    return
  }

  const targets = COURSE_KEYWORD
    ? courses.filter((course) => course.title.includes(COURSE_KEYWORD))
    : courses
  if (targets.length === 0) {
    console.error(`没有标题包含「${COURSE_KEYWORD}」的课程。现有：${courses.map((c) => c.title).join(' / ')}`)
    app.exit(1)
    return
  }

  for (const [index, course] of targets.entries()) {
    await window.webContents.executeJavaScript(`location.hash = '#/courses/${course.id}'`)
    await sleep(1400)

    const stats = await window.webContents.executeJavaScript(`(() => {
      const links = [...document.querySelectorAll('a[href*="bilibili.com"]')]
      return {
        units: document.querySelectorAll('[data-unit-id]').length || null,
        linkCount: links.length,
        first: links[0] ? { text: links[0].textContent.trim().slice(0, 40), href: links[0].href } : null,
        clickable: links.filter((a) => a.target === '_blank').length,
      }
    })()`)

    const name = `course-${index + 1}`
    const image = await window.webContents.capturePage()
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())

    console.log(`\n${course.title}`)
    console.log(`  这一讲总数：${course.units.length}`)
    console.log(`  数据里带链接的：${course.withLink} 个`)
    console.log(`  页面上带链接的标题：${stats.linkCount} 个（其中新窗口打开 ${stats.clickable} 个）`)
    if (stats.first) console.log(`  第一条：${stats.first.text} → ${stats.first.href}`)
    console.log(`  截图：${path.join(OUT_DIR, `${name}.png`)}`)
  }

  app.exit(0)
})

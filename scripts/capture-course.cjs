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
/**
 * 可选：只截一个路由（`ROUTE=chat`），不做课程相关的那些统计。
 *
 * 用途是**在真实 profile 上验证数据迁移**：比如"历史对话合并成主对话"这件事，
 * 只有拿用户自己那份数据跑一遍才算数，塞假数据是看不出来的。
 */
const ROUTE = process.env.ROUTE || ''

app.on('window-all-closed', () => {})

// 任何一步出意外都要有结论：没有这两个兜底，一次未捕获的异常会让脚本
// 挂在那里等到超时，而日志里只剩一句看不出所以然的 warning。
process.on('unhandledRejection', (error) => {
  console.error(`❌ 出错了：${error?.message ?? error}`)
  app.exit(1)
})
setTimeout(() => {
  console.error('❌ 超时没跑完，强制结束（检查 dev server 是否在跑）')
  app.exit(1)
}, 120_000)

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

/** 可选：先把标题里含这个关键字的示例课程载入 profile（走真实界面点击），再截图 */
const SEED_KEYWORD = process.env.SEED || ''

/**
 * 点开「示例课程」选择器，找到标题匹配的那一份并载入。
 *
 * 故意走真实点击而不是直接写 IndexedDB：这个脚本要验证的正是"这条路径能不能用"，
 * 绕过界面就等于什么都没验证。
 */
async function loadSeedCourse(window, keyword) {
  const clickByText = (text) => `(() => {
    const target = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === ${JSON.stringify(text)},
    )
    if (!target) return false
    target.click()
    return true
  })()`

  if (!(await window.webContents.executeJavaScript(clickByText('示例课程')))) {
    return { ok: false, error: '页面上没有「示例课程」按钮（当前可能不在课程列表页）' }
  }
  await sleep(500)

  const pick = await window.webContents.executeJavaScript(`(() => {
    const item = [...document.querySelectorAll('li')].find((row) =>
      (row.querySelector('h3')?.textContent ?? '').includes(${JSON.stringify(keyword)}),
    )
    if (!item) return { ok: false, error: '选择器里没有标题包含该关键字的课程' }
    const title = item.querySelector('h3').textContent.trim()
    const button = [...item.querySelectorAll('button')].find(
      (candidate) => candidate.textContent.trim() === '载入这份',
    )
    if (!button) return { ok: false, error: '卡片上没有「载入这份」按钮' }
    button.click()
    return { ok: true, title }
  })()`)

  return pick
}

/**
 * 删掉标题里含关键字的课程（直接改持久化数据）。
 *
 * 这一步走 IndexedDB 而不是点界面：删除在界面上要经过卡片菜单 + 二次确认，
 * 自动化那两步只为清理旧副本，一旦界面改版这个工具就坏；而"清理"本身
 * 并不是这个工具要验证的东西。
 */
async function removeCoursesByTitle(window, keyword) {
  return window.webContents.executeJavaScript(`(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('keyval-store')
      request.onsuccess = () => resolve(request.result)
    })
    const store = 'keyval'
    const key = 'lpartner.courses'
    const raw = await new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
    })
    if (!raw) { db.close(); return 0 }
    const parsed = JSON.parse(raw)
    const before = parsed?.state?.courses?.length ?? 0
    parsed.state.courses = (parsed.state.courses ?? []).filter(
      (course) => !String(course.title).includes(${JSON.stringify(keyword)}),
    )
    const removed = before - parsed.state.courses.length
    if (removed > 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(JSON.stringify(parsed), key)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(new Error('写入失败'))
      })
    }
    db.close()
    return removed
  })()`)
}

/**
 * 截图并写盘。
 *
 * capturePage 在窗口刚重载、合成器还在忙的时候会偶发 `UnknownVizError`
 * （Chromium 的合成层还没准备好那一帧）。它是暂时的，重试一次就好；
 * 不重试的话整个脚本会挂在那里等一个永远不会有的帧。
 */
async function capture(window, filePath) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const image = await window.webContents.capturePage()
      fs.writeFileSync(filePath, image.toPNG())
      return true
    } catch (error) {
      if (attempt === 3) {
        console.error(`  ⚠️ 截图失败（试了 3 次）：${error?.message ?? error}`)
        return false
      }
      await sleep(600)
    }
  }
  return false
}

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

  // 可选：先真的点一遍「示例课程」把某份课程载进这个 profile，再截图。
  // 这样做的好处是这一趟同时验证了三件事：选择器能打开、载入能落库、课程页长什么样。
  if (SEED_KEYWORD) {
    // 应用默认开在书架上，先切到课程列表页 —— 「示例课程」按钮在那里
    await window.webContents.executeJavaScript(`location.hash = '#/courses'`)
    await sleep(900)
    // 同一份示例课程可能上次已经载过：先删掉同名副本，让这个工具可以反复跑
    // （否则验证三次就在 profile 里留下三份一模一样的课程）
    const removed = await removeCoursesByTitle(window, SEED_KEYWORD)
    if (removed > 0) {
      // 只改 IndexedDB 是不够的：页面里的 store 还留着旧课程，下一次状态变更
      // 会把它又写回去（表现为"删了又回来了"）。必须整页重载，让 store 重新水合。
      console.log(`\n先清掉 ${removed} 份同名旧副本`)
      window.webContents.reload()
      await sleep(1500)
      await poll(window, `!document.querySelector('[data-testid="splash"]')`, 20000)
      await sleep(800)
      await window.webContents.executeJavaScript(`location.hash = '#/courses'`)
      await sleep(600)
    }
    const loaded = await loadSeedCourse(window, SEED_KEYWORD)
    if (!loaded.ok) {
      console.error(`❌ 载入示例课程失败：${loaded.error}`)
      app.exit(1)
      return
    }
    console.log(`\n已载入示例课程：${loaded.title}`)
    await sleep(1200)
  }

  // 只截一个路由：用来在真实 profile 上验证数据迁移（比如对话合并）之后界面长什么样
  if (ROUTE) {
    await window.webContents.executeJavaScript(`location.hash = '#/${ROUTE}'`)
    await sleep(1400)
    const name = `route-${ROUTE.replace(/\W+/g, '-')}`
    await capture(window, path.join(OUT_DIR, `${name}.png`))
    console.log(`\n${ROUTE} 截图：${path.join(OUT_DIR, `${name}.png`)}`)
    app.exit(0)
    return
  }

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

    // 可选：把第一个有讲义的单元展开再截图 —— "课程不是空壳"这句话得看得见才算证据
    if (process.env.EXPAND === '1') {
      const opened = await window.webContents.executeJavaScript(`(() => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent.trim() === '展开这一节',
        )
        if (!button) return false
        button.click()
        // 展开后的正文在屏幕外，截出来只有标题 —— 滚到它身上再拍
        button.closest('li')?.scrollIntoView({ block: 'center' })
        return true
      })()`)
      console.log(opened ? '  已展开第一节讲义' : '  ⚠️ 没找到可展开的单元')
      await sleep(900)
    }

    await capture(window, path.join(OUT_DIR, `${name}.png`))

    console.log(`\n${course.title}`)
    console.log(`  这一讲总数：${course.units.length}`)
    console.log(`  数据里带链接的：${course.withLink} 个`)
    console.log(`  页面上带链接的标题：${stats.linkCount} 个（其中新窗口打开 ${stats.clickable} 个）`)
    if (stats.first) console.log(`  第一条：${stats.first.text} → ${stats.first.href}`)
    console.log(`  截图：${path.join(OUT_DIR, `${name}.png`)}`)
  }

  app.exit(0)
})

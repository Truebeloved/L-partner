/**
 * 一次性修复：给**已建好的**视频课程补回每一讲的链接，并清掉猜出来的知识点标签。
 *
 * 背景：表单那一层原先不认 resourceUrl，用户点一次「保存」就把一百个链接全丢了，
 * 于是视频标题变成点不动的纯文本（用户报的就是这个）。
 * 代码侧已修（resourceUrl 现在会穿过表单），这个脚本把**旧数据**也补回来。
 *
 * 做法：重新抓一遍合集拿到「标题 → 那一集的地址」，再按**标题**匹配回单元。
 * 用标题而不是顺序号匹配：用户可能在表单里删过几讲，按下标对齐会整体错位。
 *
 * 用法：npm run repair:video-links   （需要先跑着 npm run dev，且应用已退出）
 */
const { app, BrowserWindow } = require('electron')

const path = require('node:path')

const { fetchBilibiliCollection } = require(path.join(__dirname, '..', 'electron', 'bilibili.cjs'))
const { episodeUrl } = require('./bilibili-url.cjs')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const COLLECTION = process.env.COLLECTION_URL || 'https://www.bilibili.com/video/BV1eAnJzyEuE/'

app.setName('L-partner')

/**
 * 这个脚本全靠"开关隐藏窗口"干活，而 Electron 的默认行为是**最后一个窗口一关就退出应用**。
 * 抓取用的窗口一销毁，应用就开始退出，之后新建的窗口会直接 `ERR_FAILED` —— 报错长得像
 * 本地开发服务器挂了，其实是自己把自己关了。注册一个空监听即可接管这个行为。
 */
app.on('window-all-closed', () => {})

/** 卡住时不要让脚本永远挂着：任何一步没回来都要有结果 */
const WATCHDOG_MS = 60_000
setTimeout(() => {
  console.error('❌ 超时没跑完，强制结束（多半是本地开发服务器没起）')
  app.exit(1)
}, WATCHDOG_MS)

process.on('unhandledRejection', (error) => {
  console.error(`❌ 出错了：${error?.message ?? error}`)
  app.exit(1)
})

app.whenReady().then(async () => {
  /**
   * 顺序很关键：**先**把本地页面打开，**再**去抓 B 站。
   *
   * 反过来（先抓再开本地页）实测会挂住：抓取窗口销毁后本地页的 loadURL 既不成功也不失败。
   * 先开页面则一切正常 —— 页面已就位，抓完直接往里写数据。
   */
  const window = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    webPreferences: {
      // 隐藏窗口会被当成后台页面，Chromium 会把它"冻结"，于是后面的
      // executeJavaScript 永远等不到回应（实测卡满 60 秒）。这里必须关掉节流。
      backgroundThrottling: false,
    },
  })
  console.log(`\n打开本地页面：${BASE_URL}`)
  await window.loadURL(`${BASE_URL}/#/`)
  await new Promise((resolve) => setTimeout(resolve, 2500))
  console.log('  页面已就位')

  console.log(`重新抓取合集以取得每一讲的地址：${COLLECTION}`)
  const crawled = await fetchBilibiliCollection(COLLECTION)
  if (!crawled.ok) {
    console.error(`❌ 抓取失败：${crawled.error}`)
    app.exit(1)
    return
  }

  const byTitle = new Map()
  for (const episode of crawled.episodes) {
    byTitle.set(episode.title.trim(), {
      resourceUrl: episodeUrl(episode),
      resourceLabel: `B 站原视频 · ${episode.title}`.slice(0, 60),
    })
  }
  console.log(`  拿到 ${byTitle.size} 讲的地址`)

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const key = 'lpartner.courses'
      // 标题匹配要宽容，两边的标题本来就是"同一集的两个版本"：
      // 课程里那份来自更早的一次抓取，带着 "_高清 720P" 画质后缀、也可能保留着
      // "11.1" 这样的编号前缀；今天抓下来的是干净的标题。所以原样匹配之外，
      // 再按"去掉开头编号 + 去掉结尾画质后缀 + 去掉空白与常见标点"归一化后匹配。
      const normalize = (value) =>
        String(value ?? '')
          .replace(/^\\s*\\d+(?:[.\\-]\\d+)*\\s*/, '')
          .replace(/[_\\s](?:高清|超清|蓝光|标清|\\d{3,4}[pP])(?:[_\\s].*)?$/, '')
          .replace(/[\\s\\u3000]+/g, '')
          .replace(/[：:，,。.、·\\-—_()（）【】\\[\\]「」《》]/g, '')
          .toLowerCase()
      // IndexedDB 是按"源"隔离的：localhost:5173 和 127.0.0.1:5173 是两个不同的库。
      // 地址写错时 open 会成功、建出一个空库，然后在 objectStore 那一步抛异常 ——
      // 异常发生在事件回调里，promise 永远不会 settle，表现是"卡死"而不是报错。
      // 所以这里两层都包上：回调里 try/catch，把失败变成可读的结果。
      const openDb = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error(String(request.error?.name ?? 'open failed')))
        request.onblocked = () => reject(new Error('数据库被占用（先退出正在运行的 L-partner）'))
      })
      const read = async () => {
        const db = await openDb()
        try {
          if (!db.objectStoreNames.contains('keyval')) return null
          return await new Promise((resolve) => {
            const tx = db.transaction('keyval', 'readonly')
            const req = tx.objectStore('keyval').get(key)
            req.onsuccess = () => resolve(req.result ?? null)
            req.onerror = () => resolve(null)
          })
        } finally {
          db.close()
        }
      }
      const write = async (value) => {
        const db = await openDb()
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('keyval', 'readwrite')
            tx.objectStore('keyval').put(value, key)
            tx.oncomplete = () => resolve(true)
            tx.onerror = () => reject(new Error(String(tx.error?.name ?? 'write failed')))
          })
        } finally {
          db.close()
        }
      }

      const raw = await read()
      if (!raw) {
        const names = (await indexedDB.databases()).map((entry) => entry.name).join(', ')
        return {
          error:
            '这个地址下没有课程数据。IndexedDB 按源隔离，请确认打开的是应用平时用的同一个地址' +
            '（localhost 与 127.0.0.1 不互通）。当前源已有的库：' + (names || '（空）'),
        }
      }
      const parsed = JSON.parse(raw)
      const courses = parsed?.state?.courses ?? []
      const byExact = ${JSON.stringify(Object.fromEntries(byTitle))}
      const byLoose = {}
      for (const [title, value] of Object.entries(byExact)) byLoose[normalize(title)] = value
      const report = []
      const samples = []
      const dumps = []

      for (const course of courses) {
        let linked = 0
        let cleared = 0
        let tidied = 0
        const unitTitles = []
        course.stages = (course.stages ?? []).map((stage) => ({
          ...stage,
          units: (stage.units ?? []).map((unit) => {
            const title = String(unit.title ?? '')
            unitTitles.push(title)
            const found = byExact[title.trim()] ?? byLoose[normalize(title)]
            if (!found) return unit
            linked += 1
            if ((unit.knowledgePoints ?? []).length > 0) cleared += 1
            // 顺带给标题"洗脸"：这只去掉结尾的画质后缀（"_高清 720P"），
            // 编号和用户自己改过的字都不动 —— 早先那次抓取把它一起写进了标题里。
            const cleanTitle = title.replace(/[_\\s](?:高清|超清|蓝光|标清|\\d{3,4}[pP])(?:[_\\s].*)?$/, '').trim()
            if (cleanTitle && cleanTitle !== title) tidied += 1
            return {
              ...unit,
              title: cleanTitle || title,
              resourceUrl: found.resourceUrl,
              resourceLabel: found.resourceLabel,
              knowledgePoints: [],
            }
          }),
        }))
        if (linked > 0) {
          course.updatedAt = new Date().toISOString()
          report.push(
            course.title.slice(0, 30) +
              '：补回 ' +
              linked +
              ' 个链接、清掉 ' +
              cleared +
              ' 处标签、整理 ' +
              tidied +
              ' 个标题',
          )
        } else {
          samples.push(course.title.slice(0, 30) + ' 里的标题样例：' + unitTitles.slice(0, 3).join(' / '))
        }
        dumps.push({ title: course.title, units: unitTitles })
      }

      await write(JSON.stringify(parsed))
      return { report, samples, dumps, courses: courses.length }
    })().catch((error) => ({ error: String(error?.message ?? error) }))
  `)

  if (result?.error) {
    console.error(`❌ ${result.error}`)
    app.exit(1)
    return
  }

  console.log(`\n扫描 ${result.courses} 门课程：`)
  for (const line of result.report ?? []) console.log(`  ✅ ${line}`)
  if ((result.report ?? []).length === 0) {
    console.log('  （没有任何一讲匹配上）')
    console.log(`  抓下来的标题样例：${[...byTitle.keys()].slice(0, 3).join(' / ')}`)
    for (const line of result.samples ?? []) console.log(`  ${line}`)
  }
  if (process.env.REPAIR_DUMP === '1') {
    for (const dump of result.dumps ?? []) {
      console.log(`\n=== ${dump.title}（${dump.units.length} 讲）`)
      dump.units.forEach((title, index) => console.log(`  ${index + 1}. ${title}`))
    }
    console.log('\n=== 抓取结果（100 讲）')
    ;[...byTitle.keys()].forEach((title, index) => console.log(`  ${index + 1}. ${title}`))
  }
  app.exit(0)
})

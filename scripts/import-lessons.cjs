/**
 * 一次性工具：把 `.lessons/*.json` 里的教材正文写进**真实 profile** 的课程里。
 *
 * 用法：npm run import:lessons   （需要先跑着 npm run dev，且应用已退出）
 *
 * 为什么要写真实 profile：用户明确要求"更新我现在的 L-partner 中数据"——
 * 他那门《两个月上手 React》只有第一节有正文，其余十节都是空的。
 *
 * 匹配方式是**单元标题**而不是 id：正文是按章节标题写的，
 * 而单元 id 是落库时生成的随机值，跨 profile 对不上。
 * 标题对不上就跳过并打印出来 —— 宁可少写一节，也不要把正文塞错章节。
 */
const fs = require('node:fs')
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const LESSON_DIR = path.join(__dirname, '..', '.lessons')
const COURSE_TITLE = process.env.LESSON_COURSE || '两个月上手 React'

// 与 electron/main.cjs 一致，否则读写的会是另一个 profile
app.setName('L-partner')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function loadLessons() {
  const files = fs.existsSync(LESSON_DIR)
    ? fs.readdirSync(LESSON_DIR).filter((name) => name.endsWith('.json'))
    : []
  if (files.length === 0) {
    throw new Error(`没有找到任何讲义文件：${LESSON_DIR}`)
  }

  const byTitle = new Map()
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(LESSON_DIR, file), 'utf8'))
    if (!Array.isArray(parsed)) throw new Error(`${file} 不是数组`)
    for (const item of parsed) {
      if (typeof item?.unitTitle !== 'string' || typeof item?.content !== 'string') continue
      byTitle.set(item.unitTitle.trim(), item.content)
    }
    console.log(`  ${file}：${parsed.length} 节`)
  }
  return byTitle
}

app.whenReady().then(async () => {
  console.log(`\nuserData = ${app.getPath('userData')}\n`)

  let lessons
  try {
    lessons = loadLessons()
  } catch (error) {
    console.error(`❌ ${String(error)}`)
    app.exit(1)
    return
  }

  const window = new BrowserWindow({ width: 1100, height: 700, show: false })
  try {
    await window.loadURL(`${BASE_URL}/#/`)
  } catch (error) {
    console.error(`无法加载 ${BASE_URL} —— 请先在另一个终端运行 npm run dev\n${String(error)}`)
    app.exit(1)
    return
  }
  await sleep(2500)

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const key = 'lpartner.courses'
      const read = () => new Promise((resolve) => {
        const open = indexedDB.open('keyval-store')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('keyval', 'readonly')
          const req = tx.objectStore('keyval').get(key)
          req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
        }
      })
      const write = (value) => new Promise((resolve) => {
        const open = indexedDB.open('keyval-store')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('keyval', 'readwrite')
          tx.objectStore('keyval').put(value, key)
          tx.oncomplete = () => { db.close(); resolve(true) }
        }
      })

      const raw = await read()
      if (!raw) return { error: '这个 profile 里还没有课程数据' }
      const parsed = JSON.parse(raw)
      const courses = parsed?.state?.courses ?? []

      const target = courses.find((course) => course.title === ${JSON.stringify(COURSE_TITLE)})
      if (!target) {
        return { error: '找不到课程：' + ${JSON.stringify(COURSE_TITLE)}, titles: courses.map((c) => c.title) }
      }

      const lessons = ${JSON.stringify(Object.fromEntries(lessons))}
      const written = []
      const missing = []
      const now = new Date().toISOString()

      target.stages = target.stages.map((stage) => ({
        ...stage,
        units: stage.units.map((unit) => {
          const content = lessons[unit.title.trim()]
          if (content) {
            written.push(unit.title)
            return { ...unit, content, contentGeneratedAt: now }
          }
          if (!unit.content) missing.push(unit.title)
          return unit
        }),
      }))
      target.updatedAt = now

      await write(JSON.stringify(parsed))
      return {
        written,
        missing,
        stages: target.stages.length,
        units: target.stages.reduce((sum, stage) => sum + stage.units.length, 0),
      }
    })()
  `)

  if (result?.error) {
    console.error(`❌ ${result.error}`)
    if (result.titles) console.error(`   现有课程：${result.titles.join('、')}`)
    app.exit(1)
    return
  }

  console.log(`  课程《${COURSE_TITLE}》：${result.stages} 个阶段 / ${result.units} 节`)
  console.log(`  ✅ 写入正文 ${result.written.length} 节：${result.written.join('、') || '（无）'}`)
  if (result.missing.length > 0) {
    console.log(`  ⚠️ 仍没有正文 ${result.missing.length} 节：${result.missing.join('、')}`)
  }

  app.exit(0)
})

/**
 * 「全局 AI」的截图工具：把三处可见结果留档 ——
 *   1. 侧栏的「本周」置顶块（周目标）
 *   2. 今日页的「接下来」预览（未来的待办）
 *   3. 课程结构里被划掉的单元（待办完成 → 课程内容变灰 + 删除线）
 *
 * 用法：npm run shots:global-ai   （需要先跑着 npm run dev）
 * 产物：.ui-shots/g-*.png
 *
 * 数据直接写进本工具自己的 profile（与真实应用不同，见 scripts/inspect-storage.cjs 的说明），
 * 所以不会碰到用户自己的课程与待办。
 */
const fs = require('node:fs')
const path = require('node:path')

const { app, BrowserWindow } = require('electron')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = path.join(__dirname, '..', '.ui-shots')

app.commandLine.appendSwitch('force-device-scale-factor', '1')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 相对今天算日期，脚本哪天跑都成立 */
function dayOffset(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

/** 本周一 */
function weekStart() {
  const date = new Date()
  const weekday = (date.getDay() + 6) % 7 // 周一 = 0
  date.setDate(date.getDate() - weekday)
  return date.toISOString().slice(0, 10)
}

const NOW = new Date().toISOString()
const TODAY = dayOffset(0)
const WEEK = weekStart()

const COURSE = {
  id: 'g-course',
  title: '两个月上手 React',
  source: 'manual',
  goal: '能独立搭一个多页面应用',
  deadline: dayOffset(40),
  weeklyMinutes: 600,
  createdAt: NOW,
  updatedAt: NOW,
  stages: [
    {
      id: 'g-s1',
      title: '起步',
      objective: '把开发环境跑通',
      order: 0,
      units: [
        {
          id: 'g-u1',
          title: '环境与第一个组件',
          knowledgePoints: ['Vite 项目脚手架', 'React 应用的入口文件'],
          estimatedMinutes: 60,
          order: 0,
          // 这一节已经写过正文：用来验证"打开课程真的有东西可读"
          content: [
            '## 为什么需要脚手架',
            '',
            'React 本身只是一个库，但一个能跑的项目还需要打包器、开发服务器、类型检查。',
            '每次从零搭这些，你会把时间花在配置上，而不是写组件。Vite 把这些收进一条命令。',
            '',
            '```bash',
            'npm create vite@latest my-app -- --template react-ts',
            '```',
            '',
            '## 入口文件到底做了什么',
            '',
            '`main.tsx` 只做三件事：找到 `#root` 这个挂载点、创建 React 根、把 `<App />` 渲染进去。',
            '理解这一点之后，「改了组件页面没变」这类问题就有了排查方向 ——',
            '要么是组件没被渲染进这棵树，要么是热更新没生效。',
          ].join('\n'),
          contentGeneratedAt: NOW,
        },
        {
          id: 'g-u2',
          title: '状态与事件',
          knowledgePoints: ['useState 的更新批处理'],
          estimatedMinutes: 90,
          order: 1,
        },
      ],
    },
  ],
}

const PLAN = {
  id: 'g-plan',
  courseId: 'g-course',
  generatedBy: 'rule',
  createdAt: NOW,
  items: [
    { id: 'g-i1', courseId: 'g-course', unitId: 'g-u1', date: TODAY, minutes: 60, status: 'todo' },
    {
      id: 'g-i2',
      courseId: 'g-course',
      unitId: 'g-u2',
      date: dayOffset(2),
      minutes: 90,
      status: 'todo',
    },
  ],
}

/**
 * 待办清单刻意覆盖四种情况：
 * - 今天、已关联课程、已完成 → 课程结构里对应单元应被划掉
 * - 本周目标 → 置顶在侧栏「本周」
 * - 未来的事 → 只出现在今日页的「接下来」
 * - 对话里抽出来的（source: ai-extract）→ 侧栏里带一个小标记
 */
const TODOS = [
  {
    id: 'g-t1',
    courseId: 'g-course',
    unitId: 'g-u1',
    planItemId: 'g-i1',
    title: '看完「环境与第一个组件」',
    date: TODAY,
    done: true,
    completedAt: NOW,
    createdAt: NOW,
    source: 'ai-extract',
  },
  {
    id: 'g-t2',
    title: '整理本周的笔记',
    date: TODAY,
    done: false,
    createdAt: NOW,
    source: 'manual',
  },
  {
    id: 'g-t3',
    title: '这周背完 500 个单词',
    date: WEEK,
    weekStart: WEEK,
    done: false,
    createdAt: NOW,
    source: 'ai-extract',
  },
  {
    id: 'g-t4',
    title: '交课程作业',
    date: dayOffset(5),
    done: false,
    createdAt: NOW,
    source: 'ai-extract',
  },
]

const SEED = `
  (async () => {
    const entries = ${JSON.stringify([
      ['lpartner.courses', { state: { courses: [COURSE] }, version: 1 }],
      ['lpartner.plans', { state: { plans: { 'g-course': PLAN } }, version: 1 }],
      ['lpartner.todos', { state: { todos: TODOS }, version: 1 }],
    ])}
    return new Promise((resolve) => {
      const open = indexedDB.open('keyval-store')
      open.onupgradeneeded = () => open.result.createObjectStore('keyval')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('keyval', 'readwrite')
        const store = tx.objectStore('keyval')
        for (const [key, value] of entries) store.put(JSON.stringify(value), key)
        tx.oncomplete = () => { db.close(); resolve('seeded') }
      }
    })
  })()
`

async function shoot(window, name) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const image = await window.webContents.capturePage()
      fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())
      const { width, height } = image.getSize()
      console.log(`  ${name.padEnd(24)} ${width}x${height}`)
      return
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }
  throw lastError
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#d0d0d0',
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log(`  RENDERER ERROR ${event.message}`)
  })

  try {
    await window.loadURL(`${BASE_URL}/#/`)
    await sleep(6000)
    console.log(`  写入示例数据：${await window.webContents.executeJavaScript(SEED)}`)
    // 只改 hash 是同文档导航，store 不会重新读 IndexedDB —— 必须真正导航一次
    await window.loadURL(`${BASE_URL}/?seed=${Date.now()}#/`)
    await sleep(6500)

    await shoot(window, 'g1-sidebar-weekly')

    await window.webContents.executeJavaScript(`location.hash = '#/today'`)
    await sleep(1200)
    await shoot(window, 'g2-today-upcoming')

    await window.webContents.executeJavaScript(`location.hash = '#/courses/g-course'`)
    await sleep(1400)
    // 课程结构在页面下方，滚到底才看得到"被划掉的单元"
    await window.webContents.executeJavaScript(
      `window.scrollTo(0, document.body.scrollHeight); 'scrolled'`,
    )
    await sleep(700)
    await shoot(window, 'g3-course-done-unit')

    // 展开已写好的那一节正文 —— "打开课程真的有东西可读"
    const opened = await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((node) =>
          node.textContent.includes('读这一节'),
        )
        if (!button) return 'not-found'
        button.click()
        return 'clicked'
      })()
    `)
    console.log(`  展开讲义：${opened}`)
    await sleep(900)
    await shoot(window, 'g4-course-lesson')
  } catch (error) {
    console.error(`\n截图过程出错：${String(error)}`)
    app.exit(1)
    return
  }

  console.log(`\n已输出到 ${OUT_DIR}`)
  app.exit(0)
})

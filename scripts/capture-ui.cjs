/**
 * UI 截图工具（Electron 版）。
 *
 * 为什么不从操作系统层面截屏：Windows 下会撞上三件事 ——
 * 显示缩放导致窗口物理尺寸与 CSS 尺寸不一致、后台进程不允许抢前台导致截到别的窗口、
 * 以及窗口大于屏幕时被裁掉。让应用自己渲染自己则完全没有这些问题，
 * 而且拿到的就是 1:1 的真实像素。
 *
 * 用法：npm run shots        （需要先跑着 npm run dev）
 * 产物：.ui-shots/*.png
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'
const OUT_DIR = process.env.CAPTURE_OUT || path.join(__dirname, '..', '.ui-shots')
const WIDTH = Number(process.env.CAPTURE_W || 1440)
const HEIGHT = Number(process.env.CAPTURE_H || 900)

/** [文件名, 路由]。开屏只播一次，后续靠改 hash 做客户端跳转，不重载页面 */
const ROUTES = [
  ['1-shelf', '/'],
  ['2-courses', '/courses'],
  ['3-today', '/today'],
  ['4-chat', '/chat'],
  ['5-companion-persona', '/companion'],
  ['6-settings', '/settings'],
]

/** 单次路由切换后的等待：状态是同步的，留 700ms 给动效收尾 */
const ROUTE_WAIT = 700
/** 等开屏出现 / 消失的最长时间 */
const APPEAR_TIMEOUT = 25000
const SPLASH_TIMEOUT = 25000

/**
 * 开屏两屏各自的取样时刻（毫秒，从开屏挂载算起）。
 * 开屏是全应用唯一讲究排版的地方，必须留档 —— 否则每次改版都没法比对。
 * 时刻参照 SplashScreen 里的节奏：第一屏 0–1800ms，第二屏 1800–3500ms。
 */
const SPLASH_SHOTS = [
  ['0-splash-1-greeting', 900],
  ['0-splash-2-question', 2600],
]

/** 可选：CAPTURE_SEED_COURSES=8 会先塞入 8 门课程再截图，用于验证书架排版规则 */
const SEED_COURSES = Number(process.env.CAPTURE_SEED_COURSES || 0)
/**
 * 可选：CAPTURE_SEED_CHAT=1 / CAPTURE_SEED_LLM=1
 *
 * 为什么需要：对话页与设置页的"配置好之后"长什么样，空数据截不出来 ——
 * 对话页没有会话就只剩一张接入引导，设置页没有密钥就永远停在输入态。
 * 这里塞的是**假的**密钥（一眼看得出是示例），只写进截图专用的 profile。
 */
const SEED_CHAT = process.env.CAPTURE_SEED_CHAT === '1'
const SEED_LLM = process.env.CAPTURE_SEED_LLM === '1'
/** 截图用的假密钥：故意写成明显的假值，避免被误当成真 key */
const DEMO_KEY = 'sk-demo-not-a-real-key'

// 必须在 app ready 之前设置：强制 1:1 像素，否则高分屏上会拿到 2 倍图
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 轮询直到表达式为真。
 *
 * 「先等开屏出现、再等它消失」这两步都不能省 —— 只等消失是不够的：
 * 开屏要等 HydrationGate 把 IndexedDB 读完才会挂载，在那之前查询
 * 「开屏在不在」会立刻得到「不在」，于是截到的是加载态而不是应用界面。
 * 这个坑很隐蔽：图能出、不报错，只是内容不对。
 */
async function poll(window, expression, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const done = await window.webContents.executeJavaScript(`Boolean(${expression})`)
    if (done) return true
    await sleep(200)
  }
  return false
}

/**
 * 可选：往 IndexedDB 里塞 N 门课程。
 *
 * 存在的理由：书架「一排 8 本 + 空书脊补齐」这类规则，没有真实数据根本验证不了 ——
 * 空书架只能看到 8 个空位，看不出规则对不对。直接写 store 的持久化数据比
 * 在界面上点 N 次「载入示例课程」可靠得多，也快得多。
 */
const SEED_TITLES = [
  '两个月上手 React',
  '线性代数',
  '概率论与数理统计',
  '大学物理',
  '数据结构与算法',
  '英语六级词汇',
  '微观经济学',
  '中国近代史纲要',
  '离散数学',
  '操作系统原理',
]

async function seedCourses(window, count) {
  const now = new Date().toISOString()
  const courses = Array.from({ length: count }, (_, index) => {
    const serial = index + 1
    return {
      id: `seed-course-${serial}`,
      title: SEED_TITLES[index % SEED_TITLES.length],
      source: 'manual',
      goal: '示例目标：走通课程到待办的完整链路',
      stages: [
        {
          id: `seed-${serial}-stage-1`,
          title: '第一阶段',
          order: 0,
          units: [
            {
              id: `seed-${serial}-unit-1`,
              title: '单元一',
              knowledgePoints: ['知识点 A', '知识点 B'],
              estimatedMinutes: 90,
              order: 0,
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
  })

  const payload = JSON.stringify({ state: { courses }, version: 1 })

  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store')
      request.onupgradeneeded = () => { request.result.createObjectStore('keyval') }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('keyval', 'readwrite')
        tx.objectStore('keyval').put(${JSON.stringify(payload)}, 'lpartner.courses')
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
  `)
}

/** 往 store 的持久化 key 里写一份数据（结构与 zustand persist 一致） */
async function seedKey(window, key, state, version = 1) {
  const payload = JSON.stringify({ state, version })
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store')
      request.onupgradeneeded = () => { request.result.createObjectStore('keyval') }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('keyval', 'readwrite')
        tx.objectStore('keyval').put(${JSON.stringify(payload)}, ${JSON.stringify(key)})
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
  `)
}

/** 几场有内容的对话：对话列表要显示标题、最后一句和时间，空数据看不出排版 */
async function seedConversations(window) {
  const now = Date.now()
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString()
  const message = (id, role, content, minutesAgo) => ({
    id,
    role,
    content,
    createdAt: at(minutesAgo),
  })

  const conversations = [
    {
      id: 'seed-conv-1',
      personaId: 'builtin-senior',
      title: '今天该学什么',
      messages: [
        message('m1', 'user', '帮我看看今天该学什么', 14),
        {
          ...message(
            'm2',
            'assistant',
            '按你现在的进度，今天适合先复习「状态与事件」，再做两道变式题。',
            13,
          ),
          personaId: 'builtin-senior',
        },
        message('m3', 'user', '换个人来盯我，别这么温柔', 12),
        // 中途换过角色：这条是「严格督学」说的，历史里必须仍显示它
        {
          ...message('m4', 'assistant', '那就定死：今天 20:00 前把这一章做完，我只看结果。', 11),
          personaId: 'builtin-strict',
        },
      ],
      createdAt: at(14),
      updatedAt: at(11),
    },
    {
      id: 'seed-conv-2',
      personaId: 'builtin-senior',
      title: '为什么我总是学了就忘',
      messages: [
        message('m5', 'user', '为什么我总是学了就忘', 300),
        {
          ...message('m6', 'assistant', '因为你只在输入。回忆一次比再读一遍有用得多。', 298),
          personaId: 'builtin-senior',
        },
      ],
      createdAt: at(300),
      updatedAt: at(298),
    },
    {
      id: 'seed-conv-3',
      personaId: 'builtin-socratic',
      title: '《劝学》里的比喻论证',
      messages: [message('m7', 'user', '《劝学》为什么要连用六个比喻？', 2900)],
      createdAt: at(2900),
      updatedAt: at(2900),
    },
  ]

  // 版本号必须和 store 里声明的一致：persist 发现版本对不上会尝试 migrate，
  // 而 chat store 没有 migrate —— 数据会被整份丢弃（表现为"塞了却还是空的"）
  await seedKey(window, 'lpartner.chat', { conversations }, 1)
}

/** 假的模型配置：让对话页与设置页进入"已配置"状态 */
async function seedLlmSettings(window) {
  await seedKey(
    window,
    'lpartner.settings',
    {
      settings: {
        llm: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: DEMO_KEY,
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 2048,
        },
      },
    },
    2,
  )
}

/**
 * 把鼠标真的移到某个元素上再截图。
 *
 * 为什么不用 JS 触发事件：悬浮效果是 CSS 的 `:hover` 伪类，合成事件不会真的
 * 进入 hover 状态。`sendInputEvent` 走的是 Chromium 的输入管线，`:hover` 会真实生效 ——
 * 「悬浮动画到底做没做」这种问题只有这样才验得出来。
 */
async function captureHover(window, name, selector) {
  const point = await window.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height * 0.45) }
    })()
  `)

  if (!point) {
    console.warn(`  ⚠ 找不到用于悬浮的元素：${selector}`)
    return
  }

  window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
  // 过渡是 200ms，留足时间让动画停稳，否则截到中间帧
  await sleep(700)
  await capture(window, name)
}

async function capture(window, name) {
  const image = await window.webContents.capturePage()
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), image.toPNG())
  const { width, height } = image.getSize()
  console.log(`  ${name.padEnd(20)} ${width}x${height}`)
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    // 必须真的显示出来：隐藏窗口的 capturePage 会一直返回上一次合成的陈旧帧，
    // 表现为「明明 DOM 已经变了，截出来还是几秒前的画面」，而且每次截到的都一样，
    // 极易误判成选择器或时序问题。窗口会短暂出现在屏幕上，这是这个工具的代价。
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
    app.quit()
    return
  }

  // 开屏：等它出现后按时间点取样，再等它消失
  const appeared = await poll(
    window,
    `Boolean(document.querySelector('[data-testid="splash"]'))`,
    APPEAR_TIMEOUT,
  )

  if (appeared) {
    let elapsed = 0
    for (const [name, at] of SPLASH_SHOTS) {
      await sleep(Math.max(0, at - elapsed))
      elapsed = at
      await capture(window, name)
    }
    const gone = await poll(
      window,
      `!document.querySelector('[data-testid="splash"]')`,
      SPLASH_TIMEOUT,
    )
    if (!gone) console.warn('  ⚠ 开屏未在预期时间内消失，后续截图可能不准')
  } else {
    console.warn('  ⚠ 开屏没有出现，跳过开屏取样')
  }

  // 需要真实课程数据时：先塞数据、重载、再等一轮开屏 —— 之后才开始逐页截图
  if (SEED_COURSES > 0 || SEED_CHAT || SEED_LLM) {
    if (SEED_COURSES > 0) await seedCourses(window, SEED_COURSES)
    if (SEED_CHAT) await seedConversations(window)
    if (SEED_LLM) await seedLlmSettings(window)
    await window.webContents.reload()
    const seededSplash = await poll(
      window,
      `Boolean(document.querySelector('[data-testid="splash"]'))`,
      APPEAR_TIMEOUT,
    )
    if (seededSplash) {
      await poll(window, `!document.querySelector('[data-testid="splash"]')`, SPLASH_TIMEOUT)
    }
    await sleep(400)

    console.log(
      `  （已塞入 ${SEED_COURSES} 门课程${SEED_CHAT ? '、3 场对话' : ''}${SEED_LLM ? '、假模型配置' : ''}）`,
    )
    if (SEED_COURSES > 0) {
      await capture(window, `1-shelf-${SEED_COURSES}books`)
      // 把鼠标真的移到第一本书上，验证「抽出」动效
      await captureHover(window, '1-shelf-hover', '[data-shelf-interactive] button')
      // 移开鼠标，免得影响后面的页面截图
      window.webContents.sendInputEvent({ type: 'mouseMove', x: 4, y: 4 })
      await sleep(300)

      // 右键唤出详情小窗（这一版交互改成了右键）
      await window.webContents.executeJavaScript(`
        (() => {
          const book = document.querySelector('[data-shelf-interactive] button')
          if (!book) return false
          const rect = book.getBoundingClientRect()
          book.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: Math.round(rect.left + rect.width / 2),
              clientY: Math.round(rect.top + rect.height / 2),
            }),
          )
          return true
        })()
      `)
      await sleep(500)
      await capture(window, '1-shelf-contextmenu')
    }
  }

  for (const [name, route] of ROUTES) {
    // 用 hash 做客户端跳转：不会重载页面，也就不必每次重等开屏
    await window.webContents.executeJavaScript(`location.hash = '#${route}'`)
    await sleep(ROUTE_WAIT)
    await capture(window, name)
  }

  // 待办的右键小窗也是弹层，点开再拍
  await window.webContents.executeJavaScript(`location.hash = '#/today'`)
  await sleep(ROUTE_WAIT)
  const todoMenuOpened = await window.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('ul.card li')
      if (!row) return false
      const rect = row.getBoundingClientRect()
      row.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(rect.left + 120),
          clientY: Math.round(rect.top + 20),
        }),
      )
      return true
    })()
  `)
  if (todoMenuOpened) {
    await sleep(400)
    await capture(window, '3-today-todo-menu')
  } else {
    console.warn('  ⚠ 没找到待办行，跳过该截图')
  }

  // 输入框里的「切换性格」是弹层，hash 切不过去，点一下再拍
  await window.webContents.executeJavaScript(`location.hash = '#/chat'`)
  await sleep(ROUTE_WAIT)
  const personaOpened = await window.webContents.executeJavaScript(`
    (() => {
      const trigger = document.querySelector('[data-persona-switch] button')
      if (!trigger) return false
      trigger.click()
      return true
    })()
  `)
  if (personaOpened) {
    await sleep(400)
    await capture(window, '4-chat-persona')
  } else {
    console.warn('  ⚠ 没找到「切换性格」入口，跳过该截图')
  }

  // 学伴设定的两个标签是组件内部状态，hash 切不过去，只能真的点一下
  await window.webContents.executeJavaScript(`location.hash = '#/companion'`)
  await sleep(ROUTE_WAIT)
  const switched = await window.webContents.executeJavaScript(`
    (() => {
      const tab = [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === '记忆',
      )
      if (!tab) return false
      tab.click()
      return true
    })()
  `)
  if (switched) {
    await sleep(ROUTE_WAIT)
    await capture(window, '8-companion-memory')
  } else {
    console.warn('  ⚠ 没找到「记忆」标签，跳过该截图')
  }

  /*
   * 提醒小窗：必须用一个与真实窗口同尺寸的小窗口来拍。
   * 主窗口是 1440×900，拿它渲染 /toast 只会得到一张铺满屏幕的卡片，
   * 完全看不出小窗实际长什么样。尺寸与 electron/main.cjs 的
   * TOAST_WIDTH / TOAST_HEIGHT 保持一致。
   */
  const toast = new BrowserWindow({
    width: 320,
    height: 92,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  const toastQuery = new URLSearchParams({
    title: '休伯利安，今天学点什么？',
    body: '书架上的课还在等你翻',
  }).toString()
  await toast.loadURL(`${BASE_URL}/#/toast?${toastQuery}`)
  // 进场动画 180ms，留足时间让它停稳
  await sleep(600)
  await capture(toast, '9-toast')
  toast.destroy()

  console.log(`\n已输出到 ${OUT_DIR}`)
  app.quit()
})

/**
 * 读应用**真实 profile** 里的本地数据（IndexedDB）。
 *
 * 用法：npm run inspect:storage        （需要先跑着 npm run dev）
 *
 * 为什么需要这个工具：应用的数据全在本机 IndexedDB 里，而 zustand persist 存下来的是
 * 「当时那一版」的数据形状。一旦新版本给 settings 加了字段，老数据里就没有它们 ——
 * 这种问题在界面上表现为"某个开关一打开就白屏"，在代码里却怎么读都正常，
 * 因为差的是**磁盘上的旧数据**，不是代码。这个工具就是把那份数据原样打出来。
 *
 * 两个必须注意的点：
 * 1. **必须在 app ready 之前 setName**。Electron 默认用 %APPDATA%\Electron 作为 userData，
 *    不设名字读到的会是另一个 profile —— 第一次排查"白屏"就是被这一点带偏的，
 *    诊断脚本里看到的是干净的新数据，于是怎么都复现不出来。
 * 2. **应用必须先退出**。同一个 profile 的 IndexedDB 同一时间只允许一个进程打开，
 *    应用还在跑的时候这里会直接报 OPEN_ERROR。
 */
const { app, BrowserWindow } = require('electron')

const BASE_URL = process.env.CAPTURE_URL || 'http://localhost:5173'

// 与 electron/main.cjs 保持一致，否则读的是默认 profile
app.setName('L-partner')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 在页面里把所有 key 和值读出来（idb-keyval 用的是 keyval-store / keyval 两个名字） */
const READ_ALL = `
  new Promise((resolve) => {
    const open = indexedDB.open('keyval-store')
    open.onerror = () => resolve({ error: 'OPEN_ERROR（应用可能还在运行，先退出再试）' })
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('keyval')) {
        db.close()
        resolve({ error: 'NO_STORE（这个 profile 里还没有任何本地数据）' })
        return
      }
      const tx = db.transaction('keyval', 'readonly')
      const store = tx.objectStore('keyval')
      const keysReq = store.getAllKeys()
      const valuesReq = store.getAll()
      tx.oncomplete = () => {
        db.close()
        const out = {}
        keysReq.result.forEach((key, index) => {
          out[String(key)] = valuesReq.result[index]
        })
        resolve({ keys: keysReq.result.map(String), data: out })
      }
    }
  })
`

app.whenReady().then(async () => {
  console.log(`\nuserData = ${app.getPath('userData')}\n`)

  const window = new BrowserWindow({ width: 1100, height: 700, show: false })
  try {
    await window.loadURL(`${BASE_URL}/#/`)
  } catch (error) {
    console.error(`无法加载 ${BASE_URL} —— 请先在另一个终端运行 npm run dev\n${String(error)}`)
    app.exit(1)
    return
  }
  await sleep(2500)

  const result = await window.webContents.executeJavaScript(READ_ALL)

  if (result?.error) {
    console.log(`❌ ${result.error}`)
    app.exit(1)
    return
  }

  console.log(`共 ${result.keys.length} 个 key：`)
  for (const [key, value] of Object.entries(result.data)) {
    console.log(`\n────────── ${key} ──────────`)
    try {
      console.log(JSON.stringify(JSON.parse(value), null, 2))
    } catch {
      console.log(value)
    }
  }

  app.exit(0)
})

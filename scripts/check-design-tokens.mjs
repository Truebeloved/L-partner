/**
 * 设计令牌门禁。
 *
 * 设计约束写在文档里是没用的 —— 三个月后没人记得「不许用 font-medium」。
 * 所以把它变成构建期检查：任何绕过设计系统的 Tailwind 类名都会让这个脚本失败。
 *
 * 用法：npm run check:design
 *
 * 有意为之的例外可以在**同一行**加注释 `design-token-ignore`，
 * 但每一次例外都会留在代码里被人看见，而不是消失在习惯里。
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['src']
const EXTENSIONS = ['.tsx', '.ts']
/** 设计令牌的定义处本身要写原始值，不参与检查 */
const SKIP_FILES = ['src/styles/index.css']

const RULES = [
  {
    id: 'font-weight',
    pattern: /\bfont-(thin|extralight|light|medium|semibold|extrabold|black)\b/g,
    reason: '设计系统只允许两档字重：400（font-normal）与 700（font-bold）',
  },
  {
    id: 'old-brand-palette',
    pattern: /\bbrand-\d{2,3}\b/g,
    reason: '旧主题色已废弃，改用 surface / raised / sunken / ink / line 令牌',
  },
  {
    id: 'tailwind-gray-palette',
    pattern:
      /\b(?:bg|text|border|ring|outline|divide|from|to|via|decoration|placeholder|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|indigo|blue|violet|purple|sky|cyan|teal|emerald|green|lime|yellow|orange|amber|rose|pink|fuchsia|red|white|black)(?:-\d{2,3})?\b/g,
    reason:
      '单色系不允许 Tailwind 内置彩色/灰阶。用 ink / ink-soft / ink-faint / surface / raised / sunken / line / line-soft；警示用 alert',
  },
  {
    id: 'tailwind-shadow-scale',
    pattern: /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/g,
    reason: '阴影只用 shadow-lift（卡片/浮层）与 shadow-pop（弹窗）',
  },
  {
    id: 'tailwind-radius-scale',
    pattern: /\brounded-(?:lg|xl|2xl|3xl)\b/g,
    reason: '圆角只用 rounded-sm(4px) / rounded-card(15px) / rounded-pill(胶囊)',
  },
  {
    id: 'font-size-scale',
    pattern: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g,
    reason: '字号只用 display / h1 / h2 / h3 / body / caption / small / label / micro 档位',
  },
  {
    id: 'arbitrary-font-size',
    pattern: /\btext-\[[\d.]+(?:px|rem)\]/g,
    reason: '不要用任意值字号绕过档位，改用 text-small / text-micro 等令牌',
  },
  {
    // 补盲区：旧的 .btn-outline 被删掉后，残留用法不会被上面任何规则命中 ——
    // 它是组件类而非 Tailwind 调色板类。后果很隐蔽：按钮会静默退化成
    // 「只有 .btn 基础样式」，既没边框也没底色，看起来像坏了，却依然通过检查。
    id: 'unknown-btn-variant',
    pattern: /\bbtn-(?!(?:primary|secondary|ghost|danger|sm)\b)[a-z][a-z-]*/g,
    reason:
      '未知的按钮变体。可用变体只有 btn-primary / btn-secondary / btn-ghost / btn-danger / btn-sm',
  },
]

const IGNORE_MARKER = 'design-token-ignore'

/** 纯注释行不参与检查：在注释里写「这里原来用的是 shadow-lg」不该让门禁变红 */
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*|\{\/\*)/

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)))
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

const violations = []

for (const dir of SCAN_DIRS) {
  const files = await collectFiles(path.join(ROOT, dir))

  for (const file of files) {
    const relative = path.relative(ROOT, file).replace(/\\/g, '/')
    if (SKIP_FILES.includes(relative)) continue

    const lines = (await readFile(file, 'utf8')).split('\n')

    lines.forEach((line, index) => {
      if (line.includes(IGNORE_MARKER)) return
      if (COMMENT_LINE.test(line)) return

      for (const rule of RULES) {
        // 每次都要重置 lastIndex：正则带 g 标志，复用时会从上次位置继续
        rule.pattern.lastIndex = 0
        const matches = line.match(rule.pattern)
        if (!matches) continue

        violations.push({
          file: relative,
          line: index + 1,
          rule: rule.id,
          found: [...new Set(matches)].join(', '),
          reason: rule.reason,
        })
      }
    })
  }
}

if (violations.length === 0) {
  console.log('✅ 设计令牌检查通过')
  process.exit(0)
}

const byFile = new Map()
for (const violation of violations) {
  const bucket = byFile.get(violation.file) ?? []
  bucket.push(violation)
  byFile.set(violation.file, bucket)
}

console.error(`❌ 发现 ${violations.length} 处绕过设计系统的写法：\n`)

for (const [file, items] of byFile) {
  console.error(`  ${file}`)
  for (const item of items) {
    console.error(`    L${item.line}  [${item.rule}] ${item.found}`)
    console.error(`          → ${item.reason}`)
  }
  console.error('')
}

console.error(`共 ${byFile.size} 个文件需要修正。`)
process.exit(1)

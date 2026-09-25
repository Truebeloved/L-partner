/**
 * 应用图标生成器。
 *
 * 为什么用代码画而不是放一张现成的图：
 * - 几何形状有**唯一来源**。标记的形状在下面 GEOMETRY 里定义一次，
 *   ICO / PNG / SVG 三个产物都从它推导，不会出现"网页上的图标和安装包里的不一样"。
 * - 改一个数字就能重新出全套尺寸，不需要美术工具。
 * - 4×4 超采样做抗锯齿：Windows 任务栏会用到 16px，不抗锯齿的斜角/圆角会毛。
 *
 * 用法：npm run icon
 *
 * 产物：
 *   assets/icon.ico   多尺寸（16/24/32/48/64/128/256），给 Windows 与 electron-builder
 *   assets/icon.png   512px，给非 Windows 平台与一般用途
 *   public/icon.svg   矢量版，给网页 favicon（任意缩放下都锐利）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ---------------------------------------------------------------------------
   几何定义（基准画布 256×256，所有产物都从这里缩放）
--------------------------------------------------------------------------- */

const CANVAS = 256

/** 圆角方底色。深到接近纯黑，任务栏在浅色和深色主题下都能立住 */
const TILE_COLOR = [0x11, 0x11, 0x11]
const TILE_RADIUS = 56

/**
 * 字母 L：竖笔与横笔**等宽**（48），这样才是几何字，而不是随便拼的两条杠。
 *
 * 尺寸刻意取得比较大（占方底宽 47% / 高 65%）：图标在 16px 的
 * 任务栏里会被缩到极小，字母留白太多就糊成一团黑方块了。
 * 整体在 256 基准坐标系里居中（包围盒中心 = 128,128）。
 */
const STROKE = 48
const LETTER_WIDTH = 120
const LETTER_HEIGHT = 166
const LETTER_LEFT = (CANVAS - LETTER_WIDTH) / 2
const LETTER_TOP = (CANVAS - LETTER_HEIGHT) / 2

const STEM = {
  x0: LETTER_LEFT,
  x1: LETTER_LEFT + STROKE,
  y0: LETTER_TOP,
  y1: LETTER_TOP + LETTER_HEIGHT,
}
const FOOT = {
  x0: LETTER_LEFT,
  x1: LETTER_LEFT + LETTER_WIDTH,
  y0: LETTER_TOP + LETTER_HEIGHT - STROKE,
  y1: LETTER_TOP + LETTER_HEIGHT,
}
/** 字母自己的圆角。取值很小 —— 「极其简约」不该有花哨的圆头 */
const LETTER_RADIUS = 7
const LETTER_COLOR = [0xff, 0xff, 0xff]

/* ---------------------------------------------------------------------------
   栅格化
--------------------------------------------------------------------------- */

/** 点是否落在圆角矩形内 */
function insideRoundedRect(px, py, rect, radius) {
  const { x0, y0, x1, y1 } = rect
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2)
  // 把点夹到"内矩形"，再判断到内矩形的距离是否在圆角半径内
  const cx = Math.min(Math.max(px, x0 + r), x1 - r)
  const cy = Math.min(Math.max(py, y0 + r), y1 - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * 渲染一张 RGBA 位图。
 * 每个像素取 SS×SS 个样本求覆盖率 —— 这就是抗锯齿，无需任何图形库。
 */
function render(size, samples = 4) {
  const scale = size / CANVAS
  const pixels = Buffer.alloc(size * size * 4)
  const tile = { x0: 0, y0: 0, x1: CANVAS, y1: CANVAS }
  const total = samples * samples

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tileHits = 0
      let letterHits = 0

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          // 采样点落在像素中心偏移处，再换算回 256 的基准坐标系
          const px = (x + (sx + 0.5) / samples) / scale
          const py = (y + (sy + 0.5) / samples) / scale

          if (insideRoundedRect(px, py, tile, TILE_RADIUS)) tileHits += 1
          if (
            insideRoundedRect(px, py, STEM, LETTER_RADIUS) ||
            insideRoundedRect(px, py, FOOT, LETTER_RADIUS)
          ) {
            letterHits += 1
          }
        }
      }

      const tileCover = tileHits / total
      const letterCover = letterHits / total
      const index = (y * size + x) * 4

      if (tileCover <= 0) {
        pixels[index + 3] = 0
        continue
      }

      // 字母一定在底色之内，所以用 letterCover / tileCover 作为混合比例，
      // 边缘像素才不会被底色稀释成灰边
      const mix = Math.min(1, letterCover / tileCover)
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[index + channel] = Math.round(
          TILE_COLOR[channel] * (1 - mix) + LETTER_COLOR[channel] * mix,
        )
      }
      pixels[index + 3] = Math.round(tileCover * 255)
    }
  }

  return pixels
}

/* ---------------------------------------------------------------------------
   PNG 编码（只用 node:zlib，不引任何依赖）
--------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型：RGBA
  // 10–12 保持 0：压缩方式 / 滤波方式 / 隔行扫描都用默认值

  // 每行前面加一个滤波器字节（0 = None）。行宽刚好等于原始数据长度，
  // 用 filter None 的代价是文件稍大，但图标只有几 KB，不值得为它做行间预测
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------------------------------------------------------------------
   ICO 容器
--------------------------------------------------------------------------- */

/**
 * 组装 ICO。
 * Vista 之后 ICO 允许直接内嵌 PNG，所以不必再手写 BMP 与 AND 掩码 ——
 * 这也是多尺寸图标最常见的做法。
 */
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // 保留
  header.writeUInt16LE(1, 2) // 类型：1 = 图标
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + 16 * images.length

  images.forEach((image, index) => {
    const at = index * 16
    // 256 在这个字段里用 0 表示（一个字节放不下 256）
    entries[at] = image.size >= 256 ? 0 : image.size
    entries[at + 1] = image.size >= 256 ? 0 : image.size
    entries[at + 2] = 0 // 调色板数量
    entries[at + 3] = 0 // 保留
    entries.writeUInt16LE(1, at + 4) // 色彩平面
    entries.writeUInt16LE(32, at + 6) // 位深
    entries.writeUInt32LE(image.png.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += image.png.length
  })

  return Buffer.concat([header, entries, ...images.map((image) => image.png)])
}

/* ---------------------------------------------------------------------------
   SVG（与位图共用同一份几何定义）
--------------------------------------------------------------------------- */

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="L-partner">
  <rect width="${CANVAS}" height="${CANVAS}" rx="${TILE_RADIUS}" fill="#${TILE_COLOR.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>
  <rect x="${STEM.x0}" y="${STEM.y0}" width="${STEM.x1 - STEM.x0}" height="${STEM.y1 - STEM.y0}" rx="${LETTER_RADIUS}" fill="#ffffff"/>
  <rect x="${FOOT.x0}" y="${FOOT.y0}" width="${FOOT.x1 - FOOT.x0}" height="${FOOT.y1 - FOOT.y0}" rx="${LETTER_RADIUS}" fill="#ffffff"/>
</svg>
`
}

/* ---------------------------------------------------------------------------
   输出
--------------------------------------------------------------------------- */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

mkdirSync(path.join(ROOT, 'assets'), { recursive: true })
mkdirSync(path.join(ROOT, 'public'), { recursive: true })

const images = ICO_SIZES.map((size) => ({ size, png: encodePng(size, render(size)) }))
const ico = encodeIco(images)
writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico)

const large = encodePng(512, render(512))
writeFileSync(path.join(ROOT, 'assets', 'icon.png'), large)

const svg = buildSvg()
writeFileSync(path.join(ROOT, 'public', 'icon.svg'), svg)

console.log('图标已生成：')
console.log(
  `  assets/icon.ico   ${(ico.length / 1024).toFixed(1)} KB   尺寸 ${ICO_SIZES.join(' / ')}`,
)
console.log(`  assets/icon.png   ${(large.length / 1024).toFixed(1)} KB   512×512`)
console.log(`  public/icon.svg   ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB   矢量`)

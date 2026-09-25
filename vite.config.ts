import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * 去掉字体 CSS 里的 woff 回退，只保留 woff2。
 *
 * 为什么值得单独写个插件：中文字体一个 @fontsource 包就引用 100+ 个切块，
 * 而每个切块都写了 `url(x.woff2) format('woff2'), url(x.woff) format('woff')`。
 * Vite 无法判断运行时用哪个，于是**两种格式全部打进产物** ——
 * 实测 dist 从 0.5MB 涨到 18.3MB，其中一半是永远不会被加载的 woff。
 *
 * 这个应用只跑在 Electron（Chromium 154）与本机浏览器里，
 * woff2 自 Chrome 36 起就全面支持，woff 回退没有任何存在意义。
 *
 * 必须在 generateBundle 阶段做，不能用 transform 钩子：字体 CSS 是通过入口文件里的
 * `@import` 引入的，而 Vite 的 CSS 内联发生在用户 transform 之后 ——
 * 在 transform 里看不到任何 @font-face，正则匹配不到东西（第一次就是这么失败的）。
 * 这个阶段 CSS 已经拼装完毕，改完再把已经没被引用的 woff 资源从产物里删掉。
 */
function dropLegacyFontFormat(): Plugin {
  return {
    name: 'lpartner:drop-legacy-font-format',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const WOFF_FALLBACK = /,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g
      let stripped = 0

      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || !item.fileName.endsWith('.css')) continue
        const source = typeof item.source === 'string' ? item.source : item.source.toString()
        const next = source.replace(WOFF_FALLBACK, '')
        if (next !== source) {
          item.source = next
          stripped += 1
        }
      }

      // 引用没了，资源也就成了孤儿。留着只会让安装包白白大一圈
      let removed = 0
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'asset' && /\.woff$/.test(fileName)) {
          delete bundle[fileName]
          removed += 1
        }
      }

      if (stripped > 0 || removed > 0) {
        this.info(`已移除 ${removed} 个 woff 回退资源，改写 ${stripped} 个 CSS`)
      }
    },
  }
}

export default defineConfig({
  // 相对 base：Electron 从 file:// 加载，相对路径才不会丢资源
  base: './',
  plugins: [dropLegacyFontFormat(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})

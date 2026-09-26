import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import App from '@/App'

/**
 * vitest 没开 globals，Testing Library 的自动清理不生效 ——
 * 不手动清理的话，每个用例渲染的 DOM 都会留在 document 上，
 * 下一个用例就会「找到多个同名元素」而失败，而且失败信息会指向无辜的选择器。
 */
afterEach(cleanup)

/**
 * 路由冒烟测试。
 *
 * 只验证一件事：每个路由**能渲染出来而不抛异常**。
 * 这类问题（引用不存在的导出、store 取值时机不对、浏览器 API 没做存在性判断）
 * 类型检查抓不到，但会让整页白屏 —— 对要交付给别人打开的项目来说，
 * 这是代价最高的一类 bug，而遍历一遍所有路由的成本极低。
 */

function renderAt(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

describe('路由冒烟', () => {
  it('首页渲染出应用外壳', async () => {
    renderAt('#/')
    // 侧边栏品牌名 + 移动端标题都会出现，用 findAllByText 避免多匹配报错
    expect((await screen.findAllByText('L-partner')).length).toBeGreaterThan(0)
  })

  it('旧的 /courses 路径重定向到书架 —— 课程总览页已经删掉', async () => {
    renderAt('#/courses')
    expect(await screen.findByRole('heading', { name: '我的书架' })).toBeInTheDocument()
  })

  it('课程详情页在课程不存在时给出提示，而不是白屏', async () => {
    renderAt('#/courses/not-a-real-id')
    expect(await screen.findByRole('heading', { name: '课程不存在' })).toBeInTheDocument()
  })

  it('学伴页可渲染（未配置 API 时展示引导而不是报错）', async () => {
    renderAt('#/chat')
    expect(await screen.findByText('先接入你的大模型 API')).toBeInTheDocument()
  })

  it('学伴设定可渲染，默认落在角色标签，且内置角色存在', async () => {
    renderAt('#/companion')
    expect(await screen.findByRole('heading', { name: '学伴设定' })).toBeInTheDocument()
    expect(await screen.findByText('耐心学姐')).toBeInTheDocument()
  })

  it('切到记忆标签后能看到四层说明', async () => {
    const user = userEvent.setup()
    renderAt('#/companion')
    await user.click(await screen.findByRole('button', { name: '记忆' }))
    expect(await screen.findByText('记忆分四层')).toBeInTheDocument()
  })

  it('旧的 /memory 与 /personas 路径会重定向到学伴设定', async () => {
    renderAt('#/memory')
    expect(await screen.findByRole('heading', { name: '学伴设定' })).toBeInTheDocument()
  })

  it('设置页可渲染', async () => {
    renderAt('#/settings')
    expect(await screen.findByText('大模型接入')).toBeInTheDocument()
  })

  it('未知路由回退到首页而不是白屏', async () => {
    renderAt('#/this-route-does-not-exist')
    expect((await screen.findAllByText('L-partner')).length).toBeGreaterThan(0)
  })
})

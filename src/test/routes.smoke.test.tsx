import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '@/App'

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

  it('课程页可渲染', async () => {
    renderAt('#/courses')
    // 用 heading 角色而不是文本匹配：「课程」在侧边栏和底部导航里也会出现
    expect(await screen.findByRole('heading', { name: '课程' })).toBeInTheDocument()
  })

  it('课程详情页在课程不存在时给出提示，而不是白屏', async () => {
    renderAt('#/courses/not-a-real-id')
    expect(await screen.findByRole('heading', { name: '课程不存在' })).toBeInTheDocument()
  })

  it('学伴页可渲染（未配置 API 时展示引导而不是报错）', async () => {
    renderAt('#/chat')
    expect(await screen.findByText('先接入你的大模型 API')).toBeInTheDocument()
  })

  it('记忆页可渲染', async () => {
    renderAt('#/memory')
    expect(await screen.findByText('记忆分四层')).toBeInTheDocument()
  })

  it('角色页可渲染，且内置角色存在', async () => {
    renderAt('#/personas')
    expect(await screen.findByText('耐心学长')).toBeInTheDocument()
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

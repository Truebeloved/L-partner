import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ReminderProvider } from '@/features/reminder/ReminderProvider'
import { TodayPage } from '@/features/today/TodayPage'
import { useTodoStore } from '@/store/todos'
import type { Todo } from '@/types/models'

// vitest 没开 globals，Testing Library 的自动清理不生效，手动清一下
afterEach(() => {
  cleanup()
  useTodoStore.setState({ todos: [] })
})

/**
 * 页面级冒烟测试。
 * 这里主要钉两件事：组件能真的渲染出来（zustand 的派生选择器写错会直接无限重渲染），
 * 以及「回车添加 → 勾选完成 → 进度条走满」这条主路径没断。
 *
 * 必须套 ReminderProvider：今日页展示的提醒状态来自应用外壳提供的调度器
 * （提醒要在所有页面生效，所以调度器不在页面内部）。少这层包裹会直接抛错 ——
 * 这正是我们希望测试能立刻发现的接线问题。
 */
function renderTodayPage() {
  return render(
    <MemoryRouter>
      <ReminderProvider>
        <TodayPage />
      </ReminderProvider>
    </MemoryRouter>,
  )
}

describe('TodayPage', () => {
  it('没有待办时引导去课程页，并如实说明提醒的运行限制', () => {
    renderTodayPage()

    expect(screen.getByText('今天还没有安排')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /去课程页生成学习计划/ })).toBeInTheDocument()
    // 「彻底退出后不会提醒」这件事必须写在界面上，不能只写在文档里。
    // 注意措辞：收进托盘不等于退出，应用还在后台跑，提醒照常
    expect(screen.getByText(/收进托盘仍会提醒/)).toBeInTheDocument()
  })

  it('回车即可添加待办，勾选后进度条走满并给出完成反馈', async () => {
    const user = userEvent.setup()
    renderTodayPage()

    await user.type(screen.getByLabelText('添加今日待办'), '复习第 3 章{Enter}')
    expect(await screen.findByText('复习第 3 章')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    await user.click(screen.getByRole('checkbox', { name: /完成「复习第 3 章」/ }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/都打勾了/)).toBeInTheDocument()
  })

  it('逾期未完成单独成区，不和今日待办混在一起', () => {
    const overdue: Todo = {
      id: 'overdue-1',
      title: '上周落下的作业',
      date: '2000-01-01',
      done: false,
      createdAt: new Date().toISOString(),
    }
    useTodoStore.setState({ todos: [overdue] })

    renderTodayPage()

    expect(screen.getByText('逾期未完成')).toBeInTheDocument()
    expect(screen.getByText('上周落下的作业')).toBeInTheDocument()
    // 今天的列表里不该出现它
    expect(screen.getByText('今天还没有安排')).toBeInTheDocument()
  })
})

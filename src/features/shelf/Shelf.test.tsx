import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { Shelf } from '@/features/shelf/Shelf'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useTodoStore } from '@/store/todos'
import type { Course } from '@/types/models'

function makeCourse(id: string, title: string): Course {
  return {
    id,
    title,
    source: 'manual',
    goal: '能用它做出东西',
    stages: [],
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  }
}

afterEach(() => {
  cleanup()
  useCourseStore.setState({ courses: [] })
  usePlanStore.setState({ plans: {} })
  useTodoStore.setState({ todos: [] })
})

/** 用真实路由渲染，这样「进入二级界面」可以被断言成"目标页面出现了" */
function renderShelf() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Shelf />} />
        <Route path="/courses/:courseId" element={<div>课程学习页（二级界面）</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const POPUP_HINT = 'Esc 或点击空白处关闭 · 左键单击书脊直接进入课程'

describe('Shelf 交互', () => {
  it('左键单击一本书直接进入课程', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', '两个月上手 React')] })
    renderShelf()

    await user.click(screen.getByRole('button', { name: '两个月上手 React' }))

    expect(await screen.findByText('课程学习页（二级界面）')).toBeInTheDocument()
  })

  it('右键一本书弹出详情小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', '两个月上手 React')] })
    renderShelf()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.pointer({
      target: screen.getByRole('button', { name: '两个月上手 React' }),
      keys: '[MouseRight]',
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(POPUP_HINT)).toBeInTheDocument()
    // 右键是"看信息"，不该顺带把用户送进课程
    expect(screen.queryByText('课程学习页（二级界面）')).not.toBeInTheDocument()
  })

  it('小窗里能进入课程', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', '两个月上手 React')] })
    renderShelf()

    await user.pointer({
      target: screen.getByRole('button', { name: '两个月上手 React' }),
      keys: '[MouseRight]',
    })
    await user.click(await screen.findByRole('button', { name: '进入课程' }))

    expect(await screen.findByText('课程学习页（二级界面）')).toBeInTheDocument()
  })

  it('小窗里能删除课程，且要先确认', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React'), makeCourse('c2', '线性代数')] })
    renderShelf()

    await user.pointer({
      target: screen.getByRole('button', { name: 'React' }),
      keys: '[MouseRight]',
    })
    await user.click(await screen.findByRole('button', { name: '删除这门课' }))

    // 二次确认：删除不可撤销，不该点一下就没了
    expect(await screen.findByText('删除「React」？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除课程' }))

    expect(screen.queryByRole('button', { name: 'React' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '线性代数' })).toBeInTheDocument()
  })

  it('右键另一本书只是换小窗内容，不会改动任何课程', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({
      courses: [makeCourse('c1', 'React'), makeCourse('c2', '线性代数')],
    })
    renderShelf()

    await user.pointer({
      target: screen.getByRole('button', { name: 'React' }),
      keys: '[MouseRight]',
    })
    await user.pointer({
      target: screen.getByRole('button', { name: '线性代数' }),
      keys: '[MouseRight]',
    })

    expect(screen.queryByText('课程学习页（二级界面）')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('线性代数 详情')
  })

  it('按 Esc 关闭小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    await user.pointer({
      target: screen.getByRole('button', { name: 'React' }),
      keys: '[MouseRight]',
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('点空白处关闭小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    await user.pointer({
      target: screen.getByRole('button', { name: 'React' }),
      keys: '[MouseRight]',
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    // 点书架容器本身（非任何书籍、非小窗）。
    // 用 testid 而不是 CSS 类选择器：类名会随样式调整而变，测试不该被样式改动牵连
    await user.click(screen.getByTestId('shelf-surface'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('空白书脊不是按钮 —— 键盘不会停在一个点不动的元素上', () => {
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    // 一排 8 本，只有 1 本真书，所以应当只有 1 个 button；其余 7 个是装饰
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('React')
  })

  it('一本课程都没有时也撑出一排空白书脊，并给出真正的添加入口', () => {
    renderShelf()

    expect(screen.getByText('书架还是空的')).toBeInTheDocument()
    /*
     * 入口必须是「新建课程」本身，不能是一个跳去课程列表的链接 ——
     * 课程总览页早就删掉了，那个链接点下去只会回到书架自己（等于没反应）。
     */
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('新建课程')
  })
})

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

const CLICK_HINT = '再次单击这本书，进入课程开始学习'

describe('Shelf 交互状态机', () => {
  it('单击一本书弹出详情小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', '两个月上手 React')] })
    renderShelf()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '两个月上手 React' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(CLICK_HINT)).toBeInTheDocument()
  })

  it('再点同一本书进入二级界面', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', '两个月上手 React')] })
    renderShelf()

    const book = screen.getByRole('button', { name: '两个月上手 React' })
    await user.click(book)
    await user.click(book)

    expect(await screen.findByText('课程学习页（二级界面）')).toBeInTheDocument()
  })

  it('双击等价于「选中 → 再点」，同样进入二级界面', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    // 这条正是「双击也能进二级」的保证：不需要任何双击判定逻辑，
    // 两次 click 自然走完选中与进入两步
    await user.dblClick(screen.getByRole('button', { name: 'React' }))

    expect(await screen.findByText('课程学习页（二级界面）')).toBeInTheDocument()
  })

  it('点另一本书只是换选中对象，不会误进二级界面', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({
      courses: [makeCourse('c1', 'React'), makeCourse('c2', '线性代数')],
    })
    renderShelf()

    await user.click(screen.getByRole('button', { name: 'React' }))
    await user.click(screen.getByRole('button', { name: '线性代数' }))

    expect(screen.queryByText('课程学习页（二级界面）')).not.toBeInTheDocument()
    // 小窗内容换成第二本书
    expect(screen.getByRole('dialog')).toHaveAccessibleName('线性代数 详情')
  })

  it('小窗本身不响应点击（按约定进入课程只能靠再点那本书）', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    await user.click(screen.getByRole('button', { name: 'React' }))
    await user.click(screen.getByRole('dialog'))

    expect(screen.queryByText('课程学习页（二级界面）')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('按 Esc 关闭小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    await user.click(screen.getByRole('button', { name: 'React' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('点空白处关闭小窗', async () => {
    const user = userEvent.setup()
    useCourseStore.setState({ courses: [makeCourse('c1', 'React')] })
    renderShelf()

    await user.click(screen.getByRole('button', { name: 'React' }))
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

  it('一本课程都没有时也撑出一排空白书脊，并给出添加入口', () => {
    renderShelf()

    expect(screen.getByText('书架还是空的')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '添加课程' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

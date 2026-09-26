import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TodoMenuPopup } from '@/features/today/TodoMenuPopup'
import type { Todo } from '@/types/models'

afterEach(cleanup)

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    title: '学完 C 语言程序设计阶段一',
    date: '2026-09-25',
    done: false,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('待办右键小窗', () => {
  it('显示标题与归属，并提供删除', async () => {
    const onDelete = vi.fn()
    render(
      <TodoMenuPopup
        todo={makeTodo({ stageId: 's1', courseId: 'c1' })}
        anchor={{ x: 100, y: 100 }}
        courseTitle="C语言程序设计 · 第 1 章"
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('menu')).toHaveAccessibleName('「学完 C 语言程序设计阶段一」的操作')
    // 元信息是一整行拼出来的（日期 · 课程 · 来源），所以用正则匹配其中一段
    expect(screen.getByText(/C语言程序设计 · 第 1 章/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: '删除这条待办' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('删除后自己关掉，不用调用方再点一次', async () => {
    const onClose = vi.fn()
    render(
      <TodoMenuPopup
        todo={makeTodo()}
        anchor={{ x: 100, y: 100 }}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    )

    await userEvent.click(screen.getByRole('menuitem', { name: '删除这条待办' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('按 Esc 关闭', async () => {
    const onClose = vi.fn()
    render(
      <TodoMenuPopup
        todo={makeTodo()}
        anchor={{ x: 100, y: 100 }}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    )

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('点面板以外的地方关闭，点面板里面不关', async () => {
    const onClose = vi.fn()
    render(
      <TodoMenuPopup
        todo={makeTodo()}
        anchor={{ x: 100, y: 100 }}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    )

    // 面板内部：不该关
    await userEvent.click(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()

    // 面板之外：关
    await userEvent.click(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('本周目标不说"今天"，改说"本周目标"', () => {
    render(
      <TodoMenuPopup
        todo={makeTodo({ weekStart: '2026-09-21', title: '把第一章过一遍' })}
        anchor={{ x: 10, y: 10 }}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/本周目标/)).toBeInTheDocument()
  })

  it('计划派生的待办会提醒"删除不会撤销课程进度"', () => {
    render(
      <TodoMenuPopup
        todo={makeTodo({ planItemId: 'p1' })}
        anchor={{ x: 10, y: 10 }}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/删除不会撤销课程进度/)).toBeInTheDocument()
  })
})

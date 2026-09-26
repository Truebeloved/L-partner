import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentNotice } from '@/features/agent/components/AgentNotice'
import type { PendingAction } from '@/features/agent/execute'
import { useCreateCourseIntent } from '@/features/course/createIntent'

/**
 * 「学伴替你做了什么」这块浮层。
 *
 * 它存在的理由就是"让用户看见后台发生的事"，所以这两条必须成立：
 * 回执要真的显示出来；不可撤销的动作要**停在问句上**、点确认才执行。
 */

afterEach(() => {
  cleanup()
  useCreateCourseIntent.getState().clear()
})

function renderNotice(props: Partial<Parameters<typeof AgentNotice>[0]> = {}) {
  const onConfirm = vi.fn()
  const onDismissPending = vi.fn()

  render(
    <MemoryRouter initialEntries={['/notice']}>
      <Routes>
        <Route
          path="/notice"
          element={
            <AgentNotice
              receipts={[]}
              pending={[]}
              onDismissReceipts={vi.fn()}
              onConfirm={onConfirm}
              onDismissPending={onDismissPending}
              {...props}
            />
          }
        />
        <Route path="/" element={<div>书架</div>} />
      </Routes>
    </MemoryRouter>,
  )

  return { onConfirm, onDismissPending }
}

describe('AgentNotice', () => {
  it('什么也没有时什么都不渲染', () => {
    renderNotice()
    expect(screen.queryByText(/已/)).not.toBeInTheDocument()
  })

  it('把替用户办的事一条条列出来', () => {
    renderNotice({ receipts: ['已加入待办：写实验报告', '已把「取快递」改到 9月27日'] })

    expect(screen.getByText('已加入待办：写实验报告')).toBeInTheDocument()
    expect(screen.getByText('已把「取快递」改到 9月27日')).toBeInTheDocument()
  })

  it('点「知道了」把回执收掉', async () => {
    const user = userEvent.setup()
    const onDismissReceipts = vi.fn()
    renderNotice({ receipts: ['已加入待办：写实验报告'], onDismissReceipts })

    await user.click(screen.getByRole('button', { name: '关闭提示' }))

    expect(onDismissReceipts).toHaveBeenCalled()
  })

  it('不可撤销的动作只显示一句问话，点确认才交给外面执行', async () => {
    const user = userEvent.setup()
    const pending: PendingAction[] = [
      {
        id: 'p1',
        kind: 'destructive',
        prompt: '要删掉《两个月上手 React》这门课吗？',
        confirmText: '删除课程',
        run: () => '已删除',
      },
    ]
    const { onConfirm } = renderNotice({ pending })

    expect(screen.getByText('要删掉《两个月上手 React》这门课吗？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除课程' }))

    expect(onConfirm).toHaveBeenCalledWith('p1')
  })

  it('点「算了」只是丢掉这条，不执行任何动作', async () => {
    const user = userEvent.setup()
    const pending: PendingAction[] = [
      {
        id: 'p1',
        kind: 'destructive',
        prompt: '要删掉这门课吗？',
        confirmText: '删除课程',
        run: vi.fn(() => '已删除'),
      },
    ]
    const { onDismissPending, onConfirm } = renderNotice({ pending })

    await user.click(screen.getByRole('button', { name: '算了' }))

    expect(onDismissPending).toHaveBeenCalledWith('p1')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('建课程：把目标带过去并跳到书架，而不是直接落库一门课', async () => {
    const user = userEvent.setup()
    const pending: PendingAction[] = [
      { id: 'p2', kind: 'create_course', prompt: '要按「两个月上手 Rust」新建一门课吗？', goal: '两个月上手 Rust' },
    ]
    const { onDismissPending } = renderNotice({ pending })

    await user.click(screen.getByRole('button', { name: '去核对课程方案' }))

    // 意图交给书架上的「新建课程」流程，由它预填目标再让用户核对
    expect(useCreateCourseIntent.getState().goal).toBe('两个月上手 Rust')
    expect(onDismissPending).toHaveBeenCalledWith('p2')
    expect(await screen.findByText('书架')).toBeInTheDocument()
  })
})

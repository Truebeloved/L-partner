import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useEscapeKey } from '@/lib/useEscapeKey'

afterEach(cleanup)

/** 内层（弹窗）用捕获阶段；外层（页面）用冒泡阶段 */
function Layers({ onOuter, onInner }: { onOuter: () => void; onInner: () => void }) {
  useEscapeKey(onOuter)
  return <Inner onInner={onInner} />
}

function Inner({ onInner }: { onInner: () => void }) {
  useEscapeKey(onInner, { capture: true })
  return <p>内层</p>
}

describe('useEscapeKey', () => {
  it('叠加两层时只触发内层 —— 关掉弹窗不会顺手把页面也退了', async () => {
    const onOuter = vi.fn()
    const onInner = vi.fn()
    render(<Layers onOuter={onOuter} onInner={onInner} />)

    await userEvent.keyboard('{Escape}')

    expect(onInner).toHaveBeenCalledTimes(1)
    expect(onOuter).not.toHaveBeenCalled()
  })

  it('只有一层时正常触发', async () => {
    const onEscape = vi.fn()
    render(<Inner onInner={onEscape} />)

    await userEvent.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('enabled 为 false 时不响应', async () => {
    const onEscape = vi.fn()
    function Disabled() {
      useEscapeKey(onEscape, { enabled: false })
      return null
    }
    render(<Disabled />)

    await userEvent.keyboard('{Escape}')
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('其他按键不触发', async () => {
    const onEscape = vi.fn()
    render(<Inner onInner={onEscape} />)

    await userEvent.keyboard('{Enter}')
    expect(onEscape).not.toHaveBeenCalled()
  })
})

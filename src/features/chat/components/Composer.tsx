import { useEffect, useRef, useState } from 'react'

interface ComposerProps {
  onSend: (text: string) => void
  onStop: () => void
  streaming: boolean
  disabled?: boolean
  placeholder?: string
}

export function Composer({ onSend, onStop, streaming, disabled, placeholder }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 输入框随内容长高，但不超过 160px —— 再多就内部滚动，避免把对话框挤没
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [value])

  function submit() {
    const text = value.trim()
    if (!text || streaming || disabled) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="border-t border-line-soft bg-raised px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          className="input resize-none py-2.5"
          placeholder={placeholder ?? '问点什么…（Enter 发送，Shift + Enter 换行）'}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <button type="button" className="btn btn-secondary shrink-0" onClick={onStop}>
            停止
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={submit}
            disabled={disabled || value.trim() === ''}
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}

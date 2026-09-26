interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** 无障碍名称。功能栏里的可见标题是兄弟节点，所以这里必须显式给一个 */
  label: string
  disabled?: boolean
}

/**
 * 开关。
 *
 * 用胶囊形滑块而不是原生 checkbox：设计系统里「胶囊」就是按钮与徽章的形状语言，
 * 一行功能栏右侧放一个原生方框会显得像是没做完。
 * 但无障碍语义仍按原生开关来（role="switch" + aria-checked），
 * 视觉换了、语义不能换。
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-pill border transition-all duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'border-ink bg-ink' : 'border-line-soft bg-sunken',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] size-4 rounded-full transition-all duration-200 ease-out',
          // 滑块用比两种底色都浅的 raised，在深色与浅色轨道上都看得见
          checked ? 'left-[23px] bg-raised' : 'left-[3px] bg-raised',
        ].join(' ')}
      />
    </button>
  )
}

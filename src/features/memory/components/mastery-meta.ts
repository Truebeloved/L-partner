import type { MasteryLevel } from '@/types/models'

export interface MasteryMeta {
  label: string
  /** 单元格的填充与描边 */
  className: string
  /** 配套前景色。浅底配深字、深底配浅字 —— 少了这一项，浅色格上的白字会直接看不见 */
  textClassName: string
  hint: string
}

/**
 * 掌握状态的展示元数据。
 *
 * 单独成文件而不是放在 MasteryHeatmap 里导出：组件文件只导出组件，
 * 才能让 React Fast Refresh 正常工作（导出常量会破坏组件的热替换边界）。
 *
 * ---------------------------------------------------------------------------
 * 单色系统下如何区分四种状态
 * ---------------------------------------------------------------------------
 * 原方案靠色相区分（蓝 / 琥珀 / 翠绿 / 灰）。设计约束取消彩色之后，
 * 换成**明度阶梯 + 一个额外的非明度通道**：
 *
 *   状态     填充            额外通道            前景
 *   ─────── ─────────────── ─────────────────── ────────────
 *   未接触   5% 黑（近白）    无                  深灰字
 *   学习中   20% 黑（浅灰）   无                  黑字
 *   薄弱     60% 黑（深灰）   **2px 纯黑描边**    白字
 *   已掌握   100% 黑（纯黑）  无                  白字
 *
 * 三点理由：
 *
 * 1. **明度阶梯是单色系统里的标准编码**（灰度分级图就是这么做的），
 *    而且它在灰度打印、色觉障碍、以及任何劣质屏幕上都不会失效 ——
 *    这一点反而比原来的彩色方案更稳。
 *
 * 2. **「薄弱」额外加一圈描边**，因为它和其他三种不是一类东西：
 *    未接触 / 学习中 / 已掌握 描述的是**进度**，而薄弱描述的是**问题**，
 *    是唯一需要用户去做点什么的状态。只靠明度的话它夹在「学习中」和
 *    「已掌握」之间，很容易被当成又一个进度档位划过去。描边是一个与明度
 *    正交的信号，任何明度下都成立。
 *
 * 3. **没有用斜纹填充**：单元格只有 96×64，里面要塞三行知识点文字。
 *    在 10px 的文字背后铺斜纹会直接吃掉可读性，代价大于收益。
 *    描边能达到同样的「被标记」效果，却不侵占文字区域。
 *
 * 另外每个状态都带 `border-2 border-transparent`：让四类单元格的外框尺寸完全一致。
 * 否则只有「薄弱」有边框，带边框的格子会比其他格子窄 4px，整片热力图会参差不齐。
 */
export const MASTERY_META: Record<MasteryLevel, MasteryMeta> = {
  unknown: {
    label: '未接触',
    className: 'border-2 border-transparent bg-ink/5',
    textClassName: 'text-ink-soft',
    hint: '还没有学过这个知识点',
  },
  learning: {
    label: '学习中',
    className: 'border-2 border-transparent bg-ink/20',
    textClassName: 'text-ink',
    hint: '学过任务，但还没有验证是否真的掌握',
  },
  weak: {
    label: '薄弱',
    className: 'border-2 border-ink bg-ink/60',
    textClassName: 'text-ink-inverse',
    hint: '问过、但明显还没弄明白',
  },
  mastered: {
    label: '已掌握',
    className: 'border-2 border-transparent bg-ink',
    textClassName: 'text-ink-inverse',
    hint: '能用自己的话讲清楚，或答对了检验题',
  },
}

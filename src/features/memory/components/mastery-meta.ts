import type { MasteryLevel } from '@/types/models'

/**
 * 掌握状态的展示元数据。
 *
 * 单独成文件而不是放在 MasteryHeatmap 里导出：组件文件只导出组件，
 * 才能让 React Fast Refresh 正常工作（导出常量会破坏组件的热替换边界）。
 */
export const MASTERY_META: Record<
  MasteryLevel,
  { label: string; className: string; hint: string }
> = {
  unknown: {
    label: '未接触',
    className: 'bg-slate-200',
    hint: '还没有学过这个知识点',
  },
  learning: {
    label: '学习中',
    className: 'bg-blue-400',
    hint: '学过任务，但还没有验证是否真的掌握',
  },
  weak: {
    label: '薄弱',
    className: 'bg-amber-400',
    hint: '问过、但明显还没弄明白',
  },
  mastered: {
    label: '已掌握',
    className: 'bg-emerald-400',
    hint: '能用自己的话讲清楚，或答对了检验题',
  },
}

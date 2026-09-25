import { planItemState } from '@/features/course/courseActions'
import { groupByDate } from '@/features/plan/schedule'
import { formatDateHuman, formatMinutes, formatRelativeDay, todayKey } from '@/lib/date'
import type { DateKey, Id, PlanItem, Todo } from '@/types/models'

interface PlanTimelineProps {
  items: PlanItem[]
  /** unitId → 单元标题。排期项只存 unitId，展示时必须翻译回人话 */
  unitTitleById: Map<Id, string>
  /** 完成状态由「排期项 status + 待办勾选」共同决定，与概览统计保持同一判定 */
  todos?: Todo[]
}

/**
 * 排期结果按天展开。
 * 复用排期算法自带的 groupByDate，保证「算法怎么分组」和「界面怎么分组」永远是同一套逻辑 ——
 * 之前踩过的坑是 UI 自己 reduce 一遍，结果跨天拆分的单元在日历上被合并成一行。
 */
export function PlanTimeline({ items, unitTitleById, todos = [] }: PlanTimelineProps) {
  /**
   * groupByDate 的签名只承诺排期算法的字段（unitId / date / minutes），
   * 而这里渲染的是已经落库的 PlanItem（多了 id 与 status）。
   * 分组逻辑完全复用算法那一套，只是把元素的静态类型收回来 ——
   * 自己再 reduce 一遍分组，就会出现「算法按天分组、界面按别的方式分组」的分叉。
   */
  const grouped = groupByDate(items) as Map<DateKey, PlanItem[]>
  const dates = [...grouped.keys()].sort()

  if (dates.length === 0) {
    return <p className="muted">计划里还没有排期项，点「生成学习计划」试试。</p>
  }

  const today = todayKey()

  return (
    <ol className="space-y-3">
      {dates.map((date) => {
        const dayItems = grouped.get(date) ?? []
        const minutes = dayItems.reduce((sum, item) => sum + item.minutes, 0)
        return (
          <li key={date} className="rounded-card border border-line-soft px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="tabular text-body font-bold text-ink">
                  {formatDateHuman(date)}
                </span>
                <span className="text-small text-ink-soft">{formatRelativeDay(date)}</span>
                {/* 「今天」是当前定位标记，属于选中/激活语义 —— 用实心标签，
                    而不是红色（红色在这套系统里专供警示） */}
                {date === today && <span className="badge-solid">今天</span>}
              </div>
              <span className="tabular text-small text-ink-soft">共 {formatMinutes(minutes)}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {dayItems.map((item) => {
                const state = planItemState(item, todos)
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-body">
                    <span className={state === 'done' ? 'text-ink-faint line-through' : 'text-ink'}>
                      {unitTitleById.get(item.unitId) ?? '未知单元'}
                    </span>
                    <span className="tabular shrink-0 text-small text-ink-soft">
                      {state === 'done' && '已完成 · '}
                      {state === 'dropped' && '已跳过 · '}
                      {formatMinutes(item.minutes)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

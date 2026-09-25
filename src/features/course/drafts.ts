import { newId } from '@/lib/id'
import type { SchedulableUnit } from '@/features/plan/schedule'
import type { Course, DateKey, Id, Stage } from '@/types/models'

/**
 * 学习方案的「草稿」形态。
 *
 * 草稿刻意不含 id 与 order：手写表单、AI 生成（设计决策 D3 路径 A）、文件导入（路径 B）
 * 产出的都是这个结构。id 与顺序统一由 buildStages 在落库那一刻补齐 ——
 * 这样 AI 层不需要知道主键怎么生成，也不会因为用户拖动排序而把 id 弄丢
 * （掌握状态是挂在 Unit.id 上的，换 id 等于把学习记录清零）。
 */

export interface UnitDraft {
  title: string
  /** 知识点名称，掌握状态按它挂载 */
  knowledgePoints: string[]
  /** 用户没填（undefined 或 0）时由 estimateUnitMinutes 估算 */
  estimatedMinutes?: number
}

export interface StageDraft {
  title: string
  /** 这一阶段结束时应达到的能力 */
  objective?: string
  units: UnitDraft[]
}

/** 一份完整方案的草稿；来源（source）由调用方决定，因为同一份内容可能来自手写、AI 或文件 */
export interface CoursePlanDraft {
  title: string
  description?: string
  goal?: string
  deadline?: DateKey
  /** 每周可投入分钟数；表单按小时收集，转换只发生在表单边界 */
  weeklyMinutes?: number
  stages: StageDraft[]
}

/**
 * 【AI 集成点·输入】「让 AI 帮我生成方案」向 AI 层提出的请求。
 * 用户只说目标，阶段划分与知识点交给 AI；AI 层返回 CoursePlanDraft。
 */
export interface AiPlanRequest {
  /** 用户的学习目标，如「两个月上手 React」 */
  goal: string
  /** 每周可投入小时数（界面单位，落库时乘 60 换成分钟） */
  weeklyHours?: number
  deadline?: DateKey
}

/** 每个知识点的经验耗时：一次 20 分钟刚好能讲透一个概念并留出练习 */
export const MINUTES_PER_KNOWLEDGE_POINT = 20
/** 单元时长下限：低于半小时的内容不值得单独占一个学习日 */
export const MIN_UNIT_MINUTES = 30

/**
 * 估算单元时长。
 * 为什么要估：排期算法依赖 estimatedMinutes，而用户填表时常常只写得出一串知识点，
 * 硬性要求填时长会直接劝退（D1 的「无 Key 也要能用」同样要求表单足够轻）。
 */
export function estimateUnitMinutes(
  draft: Pick<UnitDraft, 'knowledgePoints' | 'estimatedMinutes'>,
): number {
  const filled = draft.estimatedMinutes
  if (typeof filled === 'number' && filled > 0) return Math.round(filled)
  return Math.max(MIN_UNIT_MINUTES, draft.knowledgePoints.length * MINUTES_PER_KNOWLEDGE_POINT)
}

/** 把草稿落成可持久化的 Stage[]，补齐 id 与 order */
export function buildStages(drafts: StageDraft[]): Stage[] {
  return drafts.map((draft, stageIndex) => ({
    id: newId(),
    title: draft.title.trim(),
    objective: normalize(draft.objective),
    order: stageIndex,
    units: draft.units.map((unit, unitIndex) => {
      // 去重：同一个知识点出现两次会让掌握状态出现两条互相矛盾的记录
      const knowledgePoints = [
        ...new Set(unit.knowledgePoints.map((point) => point.trim())),
      ].filter(Boolean)
      return {
        id: newId(),
        title: unit.title.trim(),
        knowledgePoints,
        // 用去重后的知识点估算：重复写一遍不该把时长撑大
        estimatedMinutes: estimateUnitMinutes({
          knowledgePoints,
          estimatedMinutes: unit.estimatedMinutes,
        }),
        order: unitIndex,
      }
    }),
  }))
}

/**
 * 展平成排期算法的输入。
 *
 * 为什么要排序而不是直接遍历：阶段与单元的顺序是用户（或 AI）后编辑出来的，
 * order 字段才是唯一权威，数组下标未必跟它一致。排期一旦顺序错乱，先学后练的前置关系就断了。
 */
export function flattenUnits(course: Course): SchedulableUnit[] {
  return sortByOrder(course.stages).flatMap((stage) =>
    sortByOrder(stage.units).map((unit) => ({
      unitId: unit.id,
      title: unit.title,
      estimatedMinutes: unit.estimatedMinutes,
    })),
  )
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

/** 课程规模概览：卡片上「3 阶段 · 11 单元 · 17 小时」那行字 */
export interface CourseTotals {
  stageCount: number
  unitCount: number
  knowledgePointCount: number
  totalMinutes: number
}

export function courseTotals(course: Course): CourseTotals {
  const units = course.stages.flatMap((stage) => stage.units)
  return {
    stageCount: course.stages.length,
    unitCount: units.length,
    knowledgePointCount: units.reduce((sum, unit) => sum + unit.knowledgePoints.length, 0),
    totalMinutes: units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0),
  }
}

/** unitId → 单元标题。排期项只存 unitId，展示时必须能翻译回人话 */
export function unitTitleMap(course: Course): Map<Id, string> {
  return new Map(course.stages.flatMap((stage) => stage.units.map((unit) => [unit.id, unit.title])))
}

/** 表单里一个空单元 */
export function emptyUnitDraft(): UnitDraft {
  return { title: '', knowledgePoints: [], estimatedMinutes: undefined }
}

/** 表单里一个空阶段，默认带一个空单元，省掉「先点新增单元」这一步 */
export function emptyStageDraft(): StageDraft {
  return { title: '', objective: '', units: [emptyUnitDraft()] }
}

/** 知识点在表单里用「一行一个」的文本域编辑：批量粘贴讲义目录比逐条点加号顺手得多 */
export function splitKnowledgePoints(text: string): string[] {
  return text
    .split(/[\n,，、;；]/)
    .map((point) => point.trim())
    .filter(Boolean)
}

export function joinKnowledgePoints(points: string[]): string {
  return points.join('\n')
}

function normalize(value?: string): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

/** 表单与 AI 层都用得到的判断：标题为空、没有单元，都不该允许保存 */
export function isDraftEmpty(draft: CoursePlanDraft): boolean {
  return (
    draft.title.trim().length === 0 ||
    draft.stages.length === 0 ||
    draft.stages.every((stage) => stage.units.length === 0)
  )
}

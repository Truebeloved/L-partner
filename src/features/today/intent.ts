/**
 * 「他这句话里是不是有要做的事」——规则判定。
 *
 * 为什么需要它：记忆/待办抽取原来是**每 8 条消息**才跑一次。
 * 于是用户说一句「我今天想把第一章看完」，那一轮什么都不会发生 ——
 * 他得再说三四个来回，待办才可能冒出来。用户的原话是
 * "它只会分析出待办任务但不会给我添加到待办区域"：其实连分析都没跑。
 *
 * 所以这里做一个**极便宜的本地判定**：只有像"打算做某件事"的话才立刻触发一次抽取。
 * 规则不花一分钱、瞬时完成，而且判定错了代价很小（多一次抽取，
 * 或者这次没抽到、等下一轮周期抽取兜底）。
 *
 * 纯函数，方便单测 —— 它的误判会直接影响用户会不会看到待办，值得钉死。
 */

/** 意图动词：出现这些词说明他打算"做"点什么 */
const ACTION_VERBS = [
  '做',
  '学',
  '看',
  '读',
  '写',
  '背',
  '练',
  '复习',
  '预习',
  '整理',
  '总结',
  '完成',
  '刷',
  '过一遍',
  '搞定',
  '搞定',
  '交',
  '准备',
  '开始',
  '继续',
  '改',
  '订正',
  '查',
  '搜',
  '问',
]

/** 第一人称的意愿表达 */
const INTENT_MARKERS = [
  '我要',
  '我想',
  '我得',
  '我要去',
  '我打算',
  '我准备',
  '计划',
  '打算',
  '需要',
  '得去',
  '待会',
  '一会儿',
  '等下',
  '回头看',
  '回头',
  '明天',
  '后天',
  '今天',
  '今晚',
  '这周',
  '本周',
  '下周',
  '周[一二三四五六日天]',
]

/**
 * 判定这句话值不值得立刻跑一次抽取。
 *
 * 条件是"有意愿 + 有动作"或"有明确时间 + 有动作"——
 * 只看动词会把"我在学 React"这种陈述也当成任务，只看时间会把"今天几号"也算进来。
 */
export function detectIntent(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 3) return false

  const hasVerb = ACTION_VERBS.some((verb) => trimmed.includes(verb))
  if (!hasVerb) return false

  return INTENT_MARKERS.some((marker) =>
    marker.startsWith('周[') ? new RegExp(marker).test(trimmed) : trimmed.includes(marker),
  )
}

/**
 * 一句话里有多件事时切开。
 *
 * 模型那边也会拆（提示词里明确要求了），但那是"最好情况"；
 * 用户一口气说三件事时，本地再切一刀能显著提高不漏的概率 ——
 * 切多了最多是多一条可删的待办，切少了就是"我说了它没记住"。
 *
 * 只在**分隔符**处切，不做语义分析：逗号、分号、顿号、以及"还有/另外/然后/顺便"。
 */
export function splitIntent(text: string): string[] {
  return text
    .split(/[，,；;、]|(?:然后|还有|另外|顺便|再者|接着)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
}

/**
 * 从一条用户消息里挑出"可能成为待办"的片段。
 *
 * 返回空数组表示这句话里没有要做的事 —— 调用方据此决定要不要触发抽取。
 */
export function extractIntentPhrases(text: string): string[] {
  if (!detectIntent(text)) return []
  return splitIntent(text).filter((phrase) => {
    // 每个片段自己也要像一件"要做的事"，否则"我打算"这种残句会被当成任务
    return ACTION_VERBS.some((verb) => phrase.includes(verb))
  })
}

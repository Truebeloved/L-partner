/**
 * 动态回复策略。
 *
 * 为什么需要它：只在 system prompt 里写一句「回答要简短」是不够的 ——
 * 模型对这种静态规则的理解是"整体调低音量"，结果要么仍然长篇大论，
 * 要么反过来把每个问题都答成五个字，两种都不像人。
 *
 * 真人的长度不是固定档位，而是**跟着对方那句话走**：一句「在吗」就回一句，
 * 一个小问题就一两句答完，只有对方明确要展开、或者讨论已经热起来时才写长。
 * 所以这里做的是：每轮**先看他这句话是什么性质**，再把对应的那条策略
 * 追加到本轮上下文的易变部分（不放进稳定前缀，否则缓存会失效），
 * 同时给这一轮的输出定一个合理的上限。
 *
 * 纯函数、可注入，方便单测 —— 它决定的是"这一轮该多长"，值得钉死。
 */

export type ReplyKind =
  /** 打招呼、应一声、倒情绪：短回一句就够，别顺势开讲 */
  | 'chat'
  /** 小问题：一两句直接答完 */
  | 'quick'
  /** 需要解释的问题：给结论 + 最具体的那一点，四五句以内 */
  | 'explain'
  /** 明确要求展开、或讨论正热：可以写长，但要有来有回 */
  | 'deep'

export interface ReplyPolicy {
  kind: ReplyKind
  /** 这一轮输出的 token 上限。只是安全网，主要靠上面的策略文字控制长度 */
  maxTokens: number
  /** 追加到本轮上下文的话 */
  instruction: string
}

/** 明确想听长篇的说法。命中就放宽，不再按长度猜 */
const DEEP_PATTERNS = [
  /详细/,
  /展开/,
  /一步(步|来)/,
  /逐步/,
  /举例/,
  /举个例/,
  /深入/,
  /完整/,
  /系统地/,
  /原理/,
  /区别/,
  /对比/,
  /教我/,
  /怎么实现/,
  /如何实现/,
  /讲讲/,
  /解释一下/,
  /说道说道/,
  /从头/,
]

/**
 * 短促的追问：他的话很短，但意图是"接着说"。
 *
 * 「为什么」刻意只在这一档里算深挖 —— 它出现在长句里时（如"我写了两个组件，
 * 为什么子组件也跟着重渲染"）是一个需要解释的问题，但不该被当成"请写一篇"。
 * 一刀切地把「为什么」判成深挖，会让每个为什么都换来一篇文章。
 */
const FOLLOW_UP_PATTERN =
  /^(为什么|为啥|然后呢|继续|还有呢|接着|怎么说|展开|详细说说|再多讲点|再来点|嗯？)[啊呀呢吗？?！!。.~]*$/

/** 寒暄、应声、情绪。这些恰恰是最容易被答成一篇的地方 */
const CHAT_PATTERNS = [
  /^(在吗|在么|在不在|你好|您好|hi|hello|哈喽|嗨|早|早上好|晚安|晚上好)[啊呀呢吗？?!。.~]*$/i,
  /^(谢谢|谢啦|多谢|感谢|好的|好嘞|好滴|嗯|嗯嗯|哦|哦哦|懂了|明白了|收到|行|可以|ok|okay)[啊呀呢吗？?!。.~]*$/i,
  /(累了|好累|学不进去|不想学|好烦|烦死|焦虑|难受|崩溃|emo|摆烂|坚持不下去)/,
  /^(哈哈+|嘿嘿+|呵呵+|呜呜+|啊啊+)[哈嘿呜啊？?!。.~]*$/,
]

/**
 * 判断这一轮该按哪种长度回。
 *
 * 顺序即优先级：先看"说了什么"（明确要展开），再看"是不是寒暄情绪"，最后按长短兜底。
 * 只看长度的做法会把「这个函数为什么要写成这样」误判成小问题。
 */
export function classifyMessage(text: string): ReplyKind {
  const trimmed = text.trim()
  if (trimmed === '') return 'quick'

  if (DEEP_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'deep'
  if (CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'chat'
  if (FOLLOW_UP_PATTERN.test(trimmed)) return 'deep'
  // 很短、又不带深挖意图的，基本就是随手一问
  if (trimmed.length <= 12) return 'quick'
  return 'explain'
}

const INSTRUCTIONS: Record<ReplyKind, string> = {
  chat: '他这句是寒暄、应声或情绪，不是提问。像真人一样短回一句就好 —— 不要顺势开讲，不要借机问学习进度，不要给建议清单。',
  quick:
    '这是一个小问题。一到两句直接答完，不要铺垫、不要举例、不要延伸，也不要反问他别的。',
  explain:
    '他问的是一个需要解释的问题。先用一句话给结论，再给最具体的那一个点或例子，总共四五句以内；剩下的等他要。',
  deep: '他明确要你展开。可以写长，但要像人讲题：先接住他的问题，再一层层说清楚，讲完停在最后一个实点上 —— 不要加总结、不要客套、不要「希望这对你有帮助」。',
}

/**
 * 按这一轮的输入给出策略。
 *
 * `ceiling` 是用户在设置里的输出上限：展开类不应该被这里卡住，
 * 只把短答那几档往下压 —— 省的是"把寒暄答成一篇"的钱。
 */
export function replyPolicyFor(text: string, ceiling: number): ReplyPolicy {
  const kind = classifyMessage(text)

  const cap: Record<ReplyKind, number> = {
    chat: 200,
    quick: 500,
    explain: 1200,
    deep: ceiling,
  }

  return {
    kind,
    maxTokens: Math.max(120, Math.min(cap[kind], ceiling)),
    instruction: INSTRUCTIONS[kind],
  }
}

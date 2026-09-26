import { matchCourseForMessage, matchesPhrase } from '@/features/chat/routing'
import { useChatStore, MAIN_CONVERSATION_TITLE } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { usePersonaStore } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'
import type { ChatMessage, Course, Id } from '@/types/models'

/**
 * 新建课程时，把**主对话里与该课程相关的往来**复制一份过去。
 *
 * 为什么需要它：分类只作用于"以后说的话"。用户往往是先在主对话里聊了一路
 * （"编曲怎么入门""我想学编曲"），聊着聊着才决定把它建成一门课 ——
 * 这时那门课的对话是空的，而他关于这门课的全部讨论都还留在主对话里。
 * 他点进那门课，看到的是"我们没聊过"，可明明刚聊完。
 *
 * 用户的要求是这个过程**无感**：不弹窗、不提问、不需要他整理。所以它挂在
 * createCourse 里，课程一落库就跑，界面上只在"那门课的对话里多了几段往来"处体现。
 *
 * 三条边界：
 * 1. **只复制，不移除**。主对话必须保持连续（它与课程无关的那些上下文还在里面），
 *    而且用户随时可能回到主对话接着聊。
 * 2. **以"用户那句话"为准判断相关性**。助手的回答里常常一个字都不提课程名，
 *    拿它去匹配必然全都匹配不上；所以命中的是用户消息，连同**紧随其后的那一条回答**
 *    一起复制 —— 只有问没有答的记录没有阅读价值。
 * 3. **已经复制过就不再复制**。目标对话里已经有消息时直接返回：
 *    这个函数只在建课那一刻调用一次，出现第二次就说明有人在重复调用它。
 */
export function backfillCourseConversation(courseId: Id, originPhrase?: string): number {
  const course = useCourseStore.getState().getById(courseId)
  if (!course) return 0

  const chat = useChatStore.getState()
  const main = chat.conversations.find((conversation) => !conversation.courseId)
  if (!main || main.messages.length === 0) return 0

  const existing = chat.conversations.find((conversation) => conversation.courseId === courseId)
  if (existing && existing.messages.length > 0) return 0

  const picked = pickRelated(main.messages, course, originPhrase)
  if (picked.length === 0) return 0

  /*
   * 记住"用户原来在哪一场"，复制完放回去 ——
   * ensureConversation 在目标对话不存在时会顺带把它设为当前会话（create 的行为），
   * 那会把用户从正在看的对话里拽走。这与"无感"是冲突的。
   */
  const previousActiveId = useChatStore.getState().activeId

  const personaId =
    main.personaId || useSettingsStore.getState().settings.activePersonaId ||
    usePersonaStore.getState().personas[0]?.id
  if (!personaId) return 0

  const targetId = useChatStore.getState().ensureConversation({
    personaId,
    courseId,
    title: course.title,
  })

  useChatStore.getState().appendExisting(targetId, picked)

  if (previousActiveId && previousActiveId !== targetId) {
    useChatStore.getState().setActive(previousActiveId)
  }

  return picked.length
}

/**
 * 从主对话里挑出与这门课相关的往来。
 *
 * 逐条看**用户消息**：命中这门课的，把它和紧随其后的那一条助手回答一起带上。
 * 连续几轮同话题时，每轮都会被各自命中，于是整段讨论完整地过去 ——
 * 不需要额外做"话题区间"的推断。
 *
 * `originPhrase` 是**这门课是怎么来的**那句话（用户输入的学习目标）。
 * 没有它就会漏掉最该带上的那一条：课程叫「编曲入门」，而用户当时说的是
 * 「我想学编曲，从哪开始」—— 两者只共享两个字，靠课程词表一个都匹配不上。
 */
function pickRelated(messages: ChatMessage[], course: Course, originPhrase?: string): ChatMessage[] {
  const picked: ChatMessage[] = []
  const phrase = originPhrase?.trim() ?? ''

  messages.forEach((message, index) => {
    if (message.role !== 'user') return

    const related =
      matchCourseForMessage(message.content, [course]) !== null ||
      (phrase !== '' && matchesPhrase(message.content, phrase))
    if (!related) return

    picked.push(message)

    const next = messages[index + 1]
    if (next && next.role === 'assistant') picked.push(next)
  })

  return picked
}

/** 主对话的标题，仅用于导出给测试与界面文案复用 */
export { MAIN_CONVERSATION_TITLE }

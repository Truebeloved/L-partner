import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { ChatMessage, Conversation, Id } from '@/types/models'

/**
 * 主对话的固定 id。
 *
 * 与课程无关的对话**全部**汇到这一场 —— 用户要的是"统一上下文"，
 * 而不是每次开一句就多一场对话。固定 id 让"取或建"是一个幂等动作：
 * 无论调用多少次、无论从哪个入口进来，拿到的都是同一场。
 */
export const MAIN_CONVERSATION_ID = 'main'
/** 主对话的标题。课程对话的标题用课程名，由调用方传入 */
export const MAIN_CONVERSATION_TITLE = '主对话'

/** 合并后的摘要上限：几场对话的摘要拼起来也不该把上下文吃掉 */
const MERGED_SUMMARY_LIMIT = 2000

/**
 * 把散落的对话收敛成"一场主对话 + 每门课一场"。
 *
 * 为什么需要它：在自动分类之前，用户每问一句就可能多出一场对话，
 * 而这些对话里的内容其实是连续的 —— 拆开之后模型看不到彼此的上下文，
 * 用户也得逐个点开才知道自己问过什么。这里做的是**收拢历史数据**，
 * 让它们回到"统一上下文"的形态。
 *
 * 幂等：已经收敛过的数据再跑一次不会有任何变化（前端每次水合都会跑）。
 * 合并后 `summaryUpTo` 归零：几个不同会话的下标无法相加，
 * 与其猜一个错的，不如让下一轮摘要重新覆盖（多花一次调用，不会丢内容）。
 */
export function consolidateConversations(conversations: Conversation[]): Conversation[] {
  const groups = new Map<string, Conversation[]>()

  for (const conversation of conversations) {
    const key = conversation.courseId ?? MAIN_CONVERSATION_ID
    const bucket = groups.get(key)
    if (bucket) bucket.push(conversation)
    else groups.set(key, [conversation])
  }

  return [...groups.entries()].map(([key, bucket]) =>
    bucket.length === 1 ? normalizeSingle(bucket[0]!) : mergeGroup(key, bucket),
  )
}

/** 只有一场时不必合并，但主对话的 id 与标题要归一 */
function normalizeSingle(conversation: Conversation): Conversation {
  if (conversation.courseId) return conversation
  return { ...conversation, id: MAIN_CONVERSATION_ID, title: MAIN_CONVERSATION_TITLE }
}

function mergeGroup(key: string, bucket: Conversation[]): Conversation {
  // 以"消息最多"的那场为主体：它的 id 与标题是用户最认得的
  const ordered = [...bucket].sort((a, b) => b.messages.length - a.messages.length)
  const main = ordered[0]!

  const messages = bucket
    .flatMap((conversation) => conversation.messages)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    // 极端情况下同一条消息可能被复制到两场里，按 id 去重
    .filter((message, index, all) => all.findIndex((item) => item.id === message.id) === index)

  const summaries = [...new Set(bucket.map((c) => c.summary).filter(Boolean) as string[])]
  const summary = summaries.join('\n\n').slice(0, MERGED_SUMMARY_LIMIT)

  const createdAt = bucket.reduce(
    (earliest, c) => (c.createdAt < earliest ? c.createdAt : earliest),
    main.createdAt,
  )
  const updatedAt = bucket.reduce(
    (latest, c) => (c.updatedAt > latest ? c.updatedAt : latest),
    main.updatedAt,
  )

  return {
    ...main,
    id: key === MAIN_CONVERSATION_ID ? MAIN_CONVERSATION_ID : main.id,
    title: key === MAIN_CONVERSATION_ID ? MAIN_CONVERSATION_TITLE : main.title,
    messages,
    createdAt,
    updatedAt,
    ...(summary ? { summary, summaryUpTo: 0 } : {}),
    /*
     * 合并之后原来的下标没有意义了，这里**推到最新**而不是归零。
     *
     * 归零会让下一轮把整场合并对话重新抽一遍 —— 而抽取里现在带着"动作"，
     * 于是很久以前说过的一句"我想学编曲"会被翻出来再弹一次新建课程。
     * 宁可漏抽这段历史（它本来就是老数据、多数已经抽过），也不要重放旧决定。
     */
    extractUpTo: messages.length,
  }
}

interface ChatState {
  conversations: Conversation[]
  activeId: Id | null
  getById: (id: Id) => Conversation | undefined
  create: (personaId: Id, courseId?: Id) => Id
  /**
   * 取或建一场对话。
   *
   * - 给了 courseId：这门课的那一场（没有就建）
   * - 没给：主对话（全局唯一）
   *
   * 这是自动分类的落点：分类只负责"是哪门课"，
   * "那门课的对话在哪"由这个方法保证 —— 因此永远不会有第二场主对话。
   */
  ensureConversation: (options: { personaId: Id; courseId?: Id; title?: string }) => Id
  setActive: (id: Id | null) => void
  /** 切换当前会话绑定的课程 —— 决定回答时注入哪门课的情境 */
  setCourse: (conversationId: Id, courseId: Id | undefined) => void
  /** 切换角色。记忆是跨角色共享的，所以这里只换「谁在教」 */
  setPersona: (conversationId: Id, personaId: Id) => void
  appendMessage: (
    conversationId: Id,
    message: Pick<ChatMessage, 'role' | 'content'> & { personaId?: Id },
  ) => Id
  updateMessage: (conversationId: Id, messageId: Id, patch: Partial<ChatMessage>) => void
  /** 记忆第 1 层：会话过长时写入的摘要压缩结果 */
  setSummary: (conversationId: Id, summary: string, summaryUpTo: number) => void
  /**
   * 记账：抽取已经处理到第几条消息。
   *
   * 只由抽取成功后调用 —— 抽取失败时不推进，下一次才会重试那一批消息。
   */
  setExtractUpTo: (conversationId: Id, extractUpTo: number) => void
  rename: (conversationId: Id, title: string) => void
  remove: (id: Id) => void
  listByCourse: (courseId: Id) => Conversation[]
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,

      getById: (id) => get().conversations.find((c) => c.id === id),

      create: (personaId, courseId) => {
        const now = new Date().toISOString()
        const conversation: Conversation = {
          id: newId(),
          personaId,
          courseId,
          title: '新的对话',
          messages: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeId: conversation.id,
        }))
        return conversation.id
      },

      ensureConversation: ({ personaId, courseId, title }) => {
        const state = get()

        if (!courseId) {
          const main = state.conversations.find((conversation) => !conversation.courseId)
          if (main) return main.id
          return get().create(personaId)
        }

        const existing = state.conversations.find(
          (conversation) => conversation.courseId === courseId,
        )
        if (existing) return existing.id

        const id = get().create(personaId, courseId)
        // 课程对话用课程名当标题：列表里一眼就知道那场聊的是哪门课
        if (title) get().rename(id, title)
        return id
      },

      setActive: (id) => set({ activeId: id }),

      setCourse: (conversationId, courseId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, courseId } : c,
          ),
        })),

      /*
       * 切换角色时，先把"还没有署名"的历史回答补上**旧角色**。
       *
       * 这是给老数据做的迁移，也是这个字段的意义所在：一条回答一旦产生，
       * 它属于谁说定了。如果不在这里补，那些回答之后会被界面用新角色渲染，
       * 用户看到的就是"我一换性格，它以前说的话全变成新性格说的了"。
       */
      setPersona: (conversationId, personaId) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c
            /*
             * 用"最近一条已署名的回答"作为旧角色，而不是会话上记的那个：
             * 角色可能在别处（比如学伴设定页）被改过，会话字段未必跟得上，
             * 而最后一条回答的署名才是**真正在说话的那个人**。
             */
            const lastSpoken = [...c.messages]
              .reverse()
              .find((message) => message.role === 'assistant' && message.personaId)?.personaId
            const outgoing = lastSpoken ?? c.personaId

            return {
              ...c,
              personaId,
              messages: c.messages.map((message) =>
                message.role === 'assistant' && !message.personaId
                  ? { ...message, personaId: outgoing }
                  : message,
              ),
            }
          }),
        })),

      appendMessage: (conversationId, message) => {
        const full: ChatMessage = {
          ...message,
          id: newId(),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, full],
                  updatedAt: full.createdAt,
                  // 首条用户消息作为会话标题，便于在列表里辨认
                  title:
                    c.messages.length === 0 && message.role === 'user'
                      ? message.content.slice(0, 20)
                      : c.title,
                }
              : c,
          ),
        }))
        return full.id
      },

      updateMessage: (conversationId, messageId, patch) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                }
              : c,
          ),
        })),

      setSummary: (conversationId, summary, summaryUpTo) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, summary, summaryUpTo } : c,
          ),
        })),

      setExtractUpTo: (conversationId, extractUpTo) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, extractUpTo } : c,
          ),
        })),

      rename: (conversationId, title) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, title } : c,
          ),
        })),

      remove: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          activeId: state.activeId === id ? null : state.activeId,
        })),

      listByCourse: (courseId) => get().conversations.filter((c) => c.courseId === courseId),
    }),
    {
      name: `${STORAGE_PREFIX}.chat`,
      storage: createIdbJSONStorage(),
      version: 1,
      partialize: (state) => ({ conversations: state.conversations }),
      /*
       * 水合时顺手收敛一次历史数据：老数据里"每问一句就多一场"的对话
       * 会在这里合并成主对话 + 每门课一场。纯函数、幂等，见 consolidateConversations。
       */
      merge: (persisted, current) => {
        const stored = (persisted as { conversations?: Conversation[] } | undefined)?.conversations
        return { ...current, conversations: consolidateConversations(stored ?? []) }
      },
    },
  ),
)

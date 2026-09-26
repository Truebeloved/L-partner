import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '@/lib/id'
import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { ChatMessage, Conversation, Id } from '@/types/models'

interface ChatState {
  conversations: Conversation[]
  activeId: Id | null
  getById: (id: Id) => Conversation | undefined
  create: (personaId: Id, courseId?: Id) => Id
  setActive: (id: Id | null) => void
  /** 切换当前会话绑定的课程 —— 决定回答时注入哪门课的情境 */
  setCourse: (conversationId: Id, courseId: Id | undefined) => void
  /** 切换角色。记忆是跨角色共享的，所以这里只换「谁在教」 */
  setPersona: (conversationId: Id, personaId: Id) => void
  appendMessage: (conversationId: Id, message: Pick<ChatMessage, 'role' | 'content'>) => Id
  updateMessage: (conversationId: Id, messageId: Id, patch: Partial<ChatMessage>) => void
  /** 记忆第 1 层：会话过长时写入的摘要压缩结果 */
  setSummary: (conversationId: Id, summary: string, summaryUpTo: number) => void
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

      setActive: (id) => set({ activeId: id }),

      setCourse: (conversationId, courseId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, courseId } : c,
          ),
        })),

      setPersona: (conversationId, personaId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, personaId } : c,
          ),
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
    },
  ),
)

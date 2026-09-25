import { del, get, set } from 'idb-keyval'
import { createJSONStorage } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

/**
 * 用 IndexedDB 作为 zustand persist 的存储后端。
 *
 * 为什么不用 localStorage：课程、对话历史、记忆条目会持续增长，
 * localStorage 的 ~5MB 上限迟早会被撑爆，而且它是同步 API，会阻塞主线程。
 * 代价是读写异步 —— 需要在应用启动时等待 hydration 完成（见 HydrationGate）。
 */
const idbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string>(name)
    return value ?? null
  },
  setItem: async (name, value) => {
    await set(name, value)
  },
  removeItem: async (name) => {
    await del(name)
  },
}

export function createIdbJSONStorage() {
  return createJSONStorage(() => idbStorage)
}

/** 所有持久化 store 的 key 前缀，避免与同域其他应用冲突 */
export const STORAGE_PREFIX = 'lpartner'

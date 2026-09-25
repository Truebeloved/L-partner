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

/**
 * IndexedDB 在几种情况下会不可用：浏览器隐私模式、被企业策略禁用、
 * 以及单元测试环境（jsdom 没有实现它）。此时降级到内存存储 ——
 * 数据不持久化，但应用照常能用，不会白屏。
 */
const memoryFallback = new Map<string, string>()

function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/** 存储层出错（配额满、被拒绝）时不能把异常抛给调用方 —— 页面照常渲染，只是这次没存上 */
function warnOnce(error: unknown): void {
  console.warn('[L-partner] 本地存储写入失败，本次数据未持久化：', error)
}

const idbStorage: StateStorage = {
  getItem: async (name) => {
    if (!indexedDbAvailable()) return memoryFallback.get(name) ?? null
    try {
      const value = await get<string>(name)
      return value ?? null
    } catch (error) {
      warnOnce(error)
      return memoryFallback.get(name) ?? null
    }
  },

  setItem: async (name, value) => {
    if (!indexedDbAvailable()) {
      memoryFallback.set(name, value)
      return
    }
    try {
      await set(name, value)
    } catch (error) {
      warnOnce(error)
      memoryFallback.set(name, value)
    }
  },

  removeItem: async (name) => {
    if (!indexedDbAvailable()) {
      memoryFallback.delete(name)
      return
    }
    try {
      await del(name)
    } catch (error) {
      warnOnce(error)
      memoryFallback.delete(name)
    }
  },
}

export function createIdbJSONStorage() {
  return createJSONStorage(() => idbStorage)
}

/** 所有持久化 store 的 key 前缀，避免与同域其他应用冲突 */
export const STORAGE_PREFIX = 'lpartner'

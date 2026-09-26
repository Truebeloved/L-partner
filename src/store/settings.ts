import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { createIdbJSONStorage, STORAGE_PREFIX } from '@/lib/storage/idbStorage'
import type { AppSettings, LlmSettings } from '@/types/models'

/**
 * 默认指向 DeepSeek：它兼容 OpenAI 协议、国内可直连、有免费额度，
 * 是中文用户最省事的默认值。留空 apiKey，用户自己填。
 */
export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
}

export const DEFAULT_SETTINGS: AppSettings = {
  llm: DEFAULT_LLM_SETTINGS,
  activePersonaId: 'builtin-senior',
  reminderEnabled: false,
  dailyReminderTime: '20:00',
  // 默认关闭：一个刚装好的应用不该自己开始弹系统通知。
  // 用户去设置里主动开启之后才启用（与需求里"在设置的辅助功能中开启后自动调用"一致）
  desktopReminderEnabled: false,
  desktopReminderFrom: '09:00',
  desktopReminderTo: '21:30',
  desktopReminderMaxPerDay: 4,
  autoExtractMemory: true,
}

interface SettingsState {
  settings: AppSettings
  /** 是否有可用的模型配置 —— 全应用用它判断 AI 功能是否可用 */
  hasLlmConfig: () => boolean
  update: (patch: Partial<AppSettings>) => void
  updateLlm: (patch: Partial<LlmSettings>) => void
  reset: () => void
}

/**
 * 把一份（可能残缺的）持久化设置补齐成完整的设置。
 *
 * 抽成纯函数是为了能被直接测：这段逻辑的价值全在"老数据缺字段"这一种输入上，
 * 而那正是最难在界面上复现的场景。这里也顺便给 llm 做同样的逐字段补齐 ——
 * 嵌套对象在浅合并下同样会整块被旧值替换。
 */
export function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    llm: { ...DEFAULT_LLM_SETTINGS, ...stored?.llm },
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,

      hasLlmConfig: () => {
        const { baseUrl, apiKey, model } = get().settings.llm
        return baseUrl.trim() !== '' && apiKey.trim() !== '' && model.trim() !== ''
      },

      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      updateLlm: (patch) =>
        set((state) => ({
          settings: { ...state.settings, llm: { ...state.settings.llm, ...patch } },
        })),

      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: `${STORAGE_PREFIX}.settings`,
      storage: createIdbJSONStorage(),
      /*
       * 只存 settings；hasLlmConfig 是派生方法，函数无法序列化
       */
      partialize: (state) => ({ settings: state.settings }),
      /*
       * 版本号只在**存储结构**变化时递增。
       * v1 → v2：设置项按字段合并（见下面的 merge）。
       *
       * migrate 刻意是"原样返回"：真正补齐字段的是 merge，而 merge 每次读取都会跑一遍，
       * 所以老数据（v1）不需要在这里改写结构。**但 migrate 必须存在** ——
       * 只递增 version 而不给 migrate，zustand 会直接报
       * "State loaded from storage couldn't be migrated" 并放弃这份数据，
       * 用户的设置会在升级后凭空重置。
       */
      version: 2,
      migrate: (persisted) => persisted as { settings: AppSettings },
      /*
       * 合并策略是这个 store 最要命的一处细节。
       *
       * persist 默认做的是**浅合并**：`{ ...currentState, ...persistedState }`。
       * 而 settings 本身是一个对象，于是旧版本存下来的那一份会**整个替换**掉默认值 ——
       * 后加的字段在新版本里就是 undefined。这不是理论风险：旧版本没有
       * desktopReminderFrom / desktopReminderTo，用户升级后一打开桌面提醒开关，
       * 取到 undefined，`undefined.split(':')` 直接掀掉整棵 React 树，
       * 界面一片空白；而开关已经落盘，之后每次启动都是空白。
       *
       * 所以这里显式按字段合并：**持久化的值优先，缺的字段一律用默认值补上**。
       * 以后再加设置项，老用户也不会因为"没有这个字段"而崩。
       */
      merge: (persisted, current) => {
        const stored = (persisted as { settings?: Partial<AppSettings> } | undefined)?.settings
        return { ...current, settings: mergeSettings(stored) }
      },
    },
  ),
)

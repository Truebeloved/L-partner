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
      version: 1,
      // hasLlmConfig 是派生方法，不能进持久化数据（函数无法序列化）
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
)

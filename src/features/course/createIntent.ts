import { create } from 'zustand'

interface CreateCourseIntentState {
  /** 学伴替他带来的学习目标；没有待办事项时为 null */
  goal: string | null
  /** 记下一个"要去新建课程"的意图（由 AgentNotice 发出） */
  request: (goal: string) => void
  /** 处理完就清掉 —— 书架只该用它一次，否则每次进书架都会弹一遍 */
  clear: () => void
}

/**
 * 「去新建课程」的意图传递。
 *
 * 为什么需要一个中转站：全局 AI 在**输入条**里说"要按「两个月上手 Rust」新建一门课吗"，
 * 而真正能新建课程的那个弹窗长在**书架**上（NewCourseButton 持有它）。
 * 两者之间没有父子关系，也不该为此把它们缝在一起。
 *
 * 刻意**由 store 直接驱动渲染**、而不是用 useEffect 把值搬进组件 state：
 * 后者在 React 里属于"同步 setState 的副作用"，会多渲染一轮，
 * 也更容易在 StrictMode 下表现不一致。store 里有什么，界面就画什么。
 *
 * 刻意不持久化：这是一个"接下来要发生的一次跳转"，重启后还留着只会莫名其妙弹窗。
 */
export const useCreateCourseIntent = create<CreateCourseIntentState>((set) => ({
  goal: null,

  request: (goal) => set({ goal }),

  clear: () => set({ goal: null }),
}))

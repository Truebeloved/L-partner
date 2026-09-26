import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import { PersonaAvatar } from '@/components/PersonaAvatar'
import { useAssistantDock } from '@/features/assistant/dock'
import { ConversationList } from '@/features/chat/components/ConversationList'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useChatSessionContext } from '@/features/chat/context'
import { useActiveConversation } from '@/features/chat/useChatSession'
import { formatTokens } from '@/lib/llm/context'
import { MAIN_CONVERSATION_TITLE, useChatStore } from '@/store/chat'
import { useCourseStore } from '@/store/courses'
import { useMemoryStore } from '@/store/memory'
import { usePersonaStore } from '@/store/personas'
import { useSettingsStore } from '@/store/settings'

const DEFAULT_SUGGESTIONS = [
  '帮我看看今天该学什么',
  '我感觉学不进去，怎么办',
  '怎么判断自己是真的懂了',
]

const COURSE_SUGGESTIONS = [
  '用一个小例子讲讲今天这块内容',
  '我卡在这一章了，帮我拆成更小的步骤',
  '出两道题考考我，看看我哪里没懂',
]

export function ChatPage() {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const personas = usePersonaStore((state) => state.personas)
  const courses = useCourseStore((state) => state.courses)
  const conversations = useChatStore((state) => state.conversations)
  const ensureConversation = useChatStore((state) => state.ensureConversation)
  const setActive = useChatStore((state) => state.setActive)
  const setConversationPersona = useChatStore((state) => state.setPersona)
  const memoryCount = useMemoryStore((state) => state.entries.length)

  const conversation = useActiveConversation()
  /**
   * 会话状态来自应用外壳的 ChatSessionProvider，而不是在这里现起一份：
   * 输入条和这一页看的是同一场对话，两份状态必然会对不上
   * （页面上点了发送，输入条却不知道正在流式输出）。
   */
  const session = useChatSessionContext()
  /** 输入条会在这一页滑到底部变成输入区，这里只留空位 */
  const dockRef = useAssistantDock('bottom')

  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === settings.activePersonaId) ?? personas[0],
    [personas, settings.activePersonaId],
  )

  const hasLlm = Boolean(settings.llm.baseUrl && settings.llm.apiKey && settings.llm.model)
  const messages = conversation?.messages ?? []
  const lastContentLength = messages.at(-1)?.content.length ?? 0

  const activeCourse = conversation?.courseId
    ? courses.find((course) => course.id === conversation.courseId)
    : undefined
  /** 课程 id → 课程名：列表里要把「课程对话」显示成课程名 */
  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  )

  // 流式输出时内容会持续变化，所以除了条数还要盯着最后一条的长度
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [messages.length, lastContentLength])

  /**
   * 没有选中会话但有历史时，自动接上最近聊过的那一场。
   *
   * activeId 不参与持久化，所以刷新后它一定是空的。原来的表现是：
   * 左边列着一堆历史，右边却是一张"我是耐心学长"的空欢迎页 ——
   * 此时输入一句话会**新建**一场对话，等于把原本那场悄悄留在背后。
   * 微信/豆包打开就是最近一场，这里对齐同一个预期。
   */
  useEffect(() => {
    if (conversation || conversations.length === 0) return
    const latest = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (latest) setActive(latest.id)
  }, [conversation, conversations, setActive])

  /**
   * 一次都没有主对话时（全新用户、或清空过数据）先建出来。
   *
   * 「主对话」是这个应用里唯一恒定的那一场：与课程无关的话都归它，
   * 所以打开对话页就该看见它，而不是一片空白等着用户去"新对话"。
   */
  useEffect(() => {
    if (conversations.some((item) => !item.courseId)) return
    ensureConversation({ personaId: settings.activePersonaId })
  }, [conversations, ensureConversation, settings.activePersonaId])

  function handleSend(text: string) {
    // 归到哪一场由 useChatSession 里的自动分类决定，这里不再自己开对话
    void session.send(text)
  }

  async function handleRemember() {
    const count = await session.rememberNow()
    setNotice(count > 0 ? `已记住 ${count} 条新信息` : '这次对话里没有发现值得长期记住的新信息')
    window.setTimeout(() => setNotice(null), 4000)
  }

  if (!hasLlm) {
    return (
      /*
       * 没配置大模型时这一页退回"接入引导"，但**底部照样留输入条的位置** ——
       * 用户要的是"打开对话页，输入条就滑到底部"这个动作本身，
       * 它不该因为还没填 key 就不发生（填 key 是下一步的事）。
       */
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-md px-6 pt-12">
            <div className="card py-10 text-center">
              <span className="inline-flex text-ink-soft">
                <Icon name="sliders" size={28} />
              </span>
              <h2 className="card-title mt-5">先接入你的大模型 API</h2>
              <p className="muted mx-auto mt-3 max-w-sm leading-relaxed">
                学伴由你自己的模型驱动，L-partner 不内置密钥、也没有服务端。
              </p>
              <div className="mt-6">
                <Link to="/settings" className="btn btn-primary">
                  去设置里填写
                </Link>
              </div>
              <p className="mt-5 border-t border-line-soft pt-4 text-small text-ink-faint">
                没有 API Key 时，课程、计划、待办和提醒照常可用。
              </p>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-line-soft px-4 py-3">
          <div ref={dockRef} className="h-12" />
        </div>
      </div>
    )
  }

  return (
    /* 这一页占据整个内容区，是一块"铺满"的面板而不是浮起来的卡片 ——
       所以不给圆角：圆角会让它看起来是一张浮在页面上的卡片，而它其实是页面本身。
       外壳已改为「主区域自己滚动」，所以这里用 h-full 填满可用高度。
       左边常驻历史对话列表（微信/豆包的那种布局），右边是当前这场对话 */
    <div className="flex h-full overflow-hidden border border-line-soft bg-raised">
      <ConversationList
        conversations={conversations}
        activeId={conversation?.id ?? null}
        courseTitles={courseTitles}
        onSelect={setActive}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 顶栏：这场对话属于谁、用什么角色、记忆状态。
            课程不再手动绑定 —— 说话内容里认出哪门课就归到哪门课，
            这里只如实显示分类结果 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <span
            className="badge"
            title="对话按内容自动分类：与某门课程有关就进那门课的对话，其余都留在主对话里（上下文连续）"
          >
            {activeCourse ? `《${activeCourse.title}》对话` : MAIN_CONVERSATION_TITLE}
          </span>

          <select
            className="input w-auto py-1.5"
            value={settings.activePersonaId}
            onChange={(event) => {
              update({ activePersonaId: event.target.value })
              if (conversation) setConversationPersona(conversation.id, event.target.value)
            }}
            title="切换角色 —— 记忆是跨角色共享的，换了老师它依然了解你"
          >
            {personas.map((persona) => (
              // 原生 <option> 里放不了 SVG，所以只给名字。
              // 头像在各处已经有了，这里不缺那一个字形
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            {session.usedMemoryCount > 0 && (
              <span className="badge" title="本轮回答注入的记忆条数，可在「记忆」页查看和修改">
                <Icon name="layers" size={12} /> 引用 {session.usedMemoryCount} 条记忆
              </span>
            )}
            {/* 上下文规模明码标价：API 费用是用户自己付的，"花了多少"不该等到月底看账单才知道 */}
            {session.contextTokens > 0 && (
              <span
                className="badge hidden border-transparent bg-ink/5 text-ink-soft tabular sm:inline-flex"
                title={
                  settings.efficientMode
                    ? '本轮请求的上下文估算值（省流模式已开启）'
                    : '本轮请求的上下文估算值（省流模式已关闭）'
                }
              >
                约 {formatTokens(session.contextTokens)} tokens
              </span>
            )}
            {/* 计数标签做成无边框浅底：它和上面的引用标签不是同级信息，
                用同一套外框会让两个标签抢注意力 */}
            <span className="badge hidden border-transparent bg-ink/5 text-ink-soft sm:inline-flex">
              共 {memoryCount} 条记忆
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRemember}
              disabled={messages.length === 0}
              title="不等自动抽取，立刻让学伴把这次对话记下来"
            >
              记住这个
            </button>
          </div>
        </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-surface px-4 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg pt-6 text-center">
            <div className="flex justify-center">
              <PersonaAvatar value={activePersona?.avatar} size={56} />
            </div>
            <h2 className="card-title mt-4">我是{activePersona?.name ?? '你的学伴'}</h2>
            <p className="muted mt-2 leading-relaxed">
              {activePersona?.speakingStyle ?? '有什么想问的，直接说'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              {(conversation?.courseId ? COURSE_SUGGESTIONS : DEFAULT_SUGGESTIONS).map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSend(suggestion)}
                  >
                    {suggestion}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} persona={activePersona} />
          ))
        )}
      </div>

      {/* 错误条：这是 alert 红正当的使用场景（真的出错了） */}
      {session.error && (
        <div className="border-t border-alert bg-alert-soft px-4 py-2.5 text-body">
          <p className="font-bold text-alert">{session.error.message}</p>
          {session.error.hint && (
            <p className="mt-1 text-small leading-relaxed text-alert">{session.error.hint}</p>
          )}
        </div>
      )}

      {/* 提示条：中性信息，用浅灰底而不是彩色 —— 单色系统里没有"信息色" */}
      {notice && (
        <div className="border-t border-line-soft bg-ink/5 px-4 py-2 text-body text-ink">
          {notice}
        </div>
      )}

      {/*
        底部输入区：这里**不留输入框**，只留一个空位。
        学伴输入条会从页面顶部一路平滑位移下来变成这一页的输入框 ——
        整页就是对话区（消息列表 + 底部长条），而不是"页面里再嵌一个聊天框"。
        没有配置大模型时也照旧：上面的接入卡片照显示，输入条照样滑到底部。
      */}
        <div className="shrink-0 border-t border-line-soft px-4 py-3">
          <div ref={dockRef} className="h-12" />
        </div>
      </div>
    </div>
  )
}

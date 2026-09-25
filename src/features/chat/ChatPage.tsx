import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import { PersonaAvatar } from '@/components/PersonaAvatar'
import { Composer } from '@/features/chat/components/Composer'
import { MessageBubble } from '@/features/chat/components/MessageBubble'
import { useActiveConversation, useChatSession } from '@/features/chat/useChatSession'
import { useChatStore } from '@/store/chat'
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
  const createConversation = useChatStore((state) => state.create)
  const setActive = useChatStore((state) => state.setActive)
  const setCourse = useChatStore((state) => state.setCourse)
  const setConversationPersona = useChatStore((state) => state.setPersona)
  const memoryCount = useMemoryStore((state) => state.entries.length)

  const conversation = useActiveConversation()
  const session = useChatSession()

  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === settings.activePersonaId) ?? personas[0],
    [personas, settings.activePersonaId],
  )

  const hasLlm = Boolean(settings.llm.baseUrl && settings.llm.apiKey && settings.llm.model)
  const messages = conversation?.messages ?? []
  const lastContentLength = messages.at(-1)?.content.length ?? 0

  // 流式输出时内容会持续变化，所以除了条数还要盯着最后一条的长度
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [messages.length, lastContentLength])

  function handleSend(text: string) {
    if (!conversation) {
      createConversation(settings.activePersonaId)
    }
    void session.send(text)
  }

  async function handleRemember() {
    const count = await session.rememberNow()
    setNotice(count > 0 ? `已记住 ${count} 条新信息` : '这次对话里没有发现值得长期记住的新信息')
    window.setTimeout(() => setNotice(null), 4000)
  }

  if (!hasLlm) {
    return (
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
            没有 API Key 也不影响使用：课程、学习计划、每日待办和提醒都可以正常工作。
          </p>
        </div>
      </div>
    )
  }

  return (
    /* 外壳已改为「主区域自己滚动」，所以这里用 h-full 填满可用高度，
       而不是再按视口高度做减法（那会因为侧栏结构的调整而算错，留出一截空白） */
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line-soft bg-raised">
      {/* 顶栏：角色、课程、记忆状态 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
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

        <select
          className="input w-auto py-1.5"
          value={conversation?.courseId ?? ''}
          onChange={(event) => {
            const courseId = event.target.value || undefined
            if (conversation) setCourse(conversation.id, courseId)
          }}
          title="绑定一门课程，回答时会带上这门课的进度与今日任务"
        >
          <option value="">不绑定课程</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {session.usedMemoryCount > 0 && (
            <span className="badge" title="本轮回答注入的记忆条数，可在「记忆」页查看和修改">
              <Icon name="layers" size={12} /> 引用 {session.usedMemoryCount} 条记忆
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
          {conversations.length > 0 && (
            <select
              className="input w-auto py-1.5 text-small"
              value={conversation?.id ?? ''}
              onChange={(event) => setActive(event.target.value || null)}
            >
              {conversations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => createConversation(settings.activePersonaId, conversation?.courseId)}
          >
            新对话
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

      <Composer
        onSend={handleSend}
        onStop={session.stop}
        streaming={session.streaming}
        placeholder={
          activePersona
            ? `和${activePersona.name}聊聊…（Enter 发送，Shift + Enter 换行）`
            : undefined
        }
      />
    </div>
  )
}

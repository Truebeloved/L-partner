import { useCallback, useEffect, useRef, useState } from 'react'

import { pickToastMessage, planNextToast } from '@/features/reminder/desktopReminder'
import type { ToastContext } from '@/features/reminder/desktopReminder'
import { dayjs, todayKey } from '@/lib/date'
import { getAppInfo, showDesktopToast } from '@/lib/platform'
import { useCourseStore } from '@/store/courses'
import { usePlanStore } from '@/store/plans'
import { useSettingsStore } from '@/store/settings'
import { useTodoStore } from '@/store/todos'

/** 两次提醒之间的随机间隔区间。太密会烦人，太疏等于没提醒 */
const MIN_GAP_MINUTES = 75
const MAX_GAP_MINUTES = 165

/** 当日已弹条数。用 localStorage 而不是 store：它只是个当天计数器 */
const COUNTER_KEY = 'lpartner.desktop-reminder-count'

interface Counter {
  date: string
  count: number
}

function readCounter(): Counter {
  const fresh = { date: todayKey(), count: 0 }
  try {
    const raw = localStorage.getItem(COUNTER_KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw) as Counter
    // 跨天归零：上限是"每天几条"，不是"总共几条"
    return parsed.date === fresh.date ? parsed : fresh
  } catch {
    return fresh
  }
}

function writeCounter(counter: Counter): void {
  try {
    localStorage.setItem(COUNTER_KEY, JSON.stringify(counter))
  } catch {
    // 写不进去只影响当天计数，提醒本身照常
  }
}

export interface DesktopReminderState {
  /** 下一条提醒的预计时刻；null 表示今天不再弹 */
  nextAt: Date | null
  /** 今天已经弹过几条 */
  firedToday: number
  /** 立刻弹一条，用于在设置里试效果 */
  fireNow: () => Promise<boolean>
}

/**
 * 桌面小窗提醒的调度。
 *
 * 四个关键点：
 * 1. **不用 setInterval**。提醒时刻是算出来的（随机但确定），
 *    直接 setTimeout 到那一刻，而不是周期性醒来问"该弹了吗"。
 * 2. **在前台就不弹**。用户正看着应用，再弹系统小窗纯属打扰；
 *    这时跳过本次，直接安排下一条。
 * 3. 已弹条数存 **localStorage** 而不是内存 —— 应用重启、收进托盘再回来，
 *    "今天已经弹过 4 条"这件事必须还成立。
 * 4. 今天排不出下一条时，**睡到明天的活跃时段开始**再重算，
 *    而不是每小时醒来问一次（那正是 setInterval 的坏处）。
 */
export function useDesktopReminder(): DesktopReminderState {
  const settings = useSettingsStore((state) => state.settings)
  const [nextAt, setNextAt] = useState<Date | null>(null)
  const [firedToday, setFiredToday] = useState(() => readCounter().count)
  const [name, setName] = useState('同学')

  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    void getAppInfo().then((info) => {
      if (info?.hostname) setName(info.hostname)
    })
  }, [])

  /**
   * 拼出文案上下文。
   *
   * 这里现读 store（getState）而不是订阅：只在弹窗那一刻需要最新数据，
   * 订阅反而会让函数频繁换身份、把定时器重建掉。
   *
   * 写成普通函数而不是存进 ref —— 在渲染期间写 ref 在并发渲染下不安全
   * （ESLint 的 react-hooks/refs 正是抓这个）。代价是它闭包捕获了 `name`，
   * 所以下面那个 effect 的依赖里必须带上 name，否则会一直用兜底称呼。
   */
  const buildContext = useCallback((): ToastContext => {
    const today = todayKey()
    const todos = useTodoStore.getState().todos
    const todayTodos = todos.filter((todo) => todo.date === today)
    const plans = usePlanStore.getState().plans

    const activeCourses = useCourseStore
      .getState()
      .courses.map((course) => {
        const items = plans[course.id]?.items ?? []
        const unfinished = items.filter((item) => item.status === 'todo').length
        const daysLeft = course.deadline
          ? dayjs(course.deadline).startOf('day').diff(dayjs().startOf('day'), 'day')
          : null
        return { title: course.title, daysLeft, unfinished }
      })
      .filter((course) => course.unfinished > 0)
      .sort(
        (a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
      )
      .map(({ title, daysLeft }) => ({ title, daysLeft }))

    return {
      name,
      todayTotal: todayTodos.length,
      todayDone: todayTodos.filter((todo) => todo.done).length,
      overdueCount: todos.filter((todo) => !todo.done && todo.date < today).length,
      activeCourses,
    }
  }, [name])

  useEffect(() => {
    const activeFrom = settings.desktopReminderFrom
    const activeTo = settings.desktopReminderTo
    const maxPerDay = settings.desktopReminderMaxPerDay ?? 4
    // 只有固定提醒真的开着时才需要避让；关着的时刻不该在时间轴上挖洞
    const dailyReminderTime = settings.reminderEnabled ? settings.dailyReminderTime : null

    let cancelled = false

    const disarm = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const arm = () => {
      if (cancelled) return
      disarm()

      const counter = readCounter()
      setFiredToday(counter.count)

      const next = planNextToast(new Date(), {
        activeFrom,
        activeTo,
        minGapMinutes: MIN_GAP_MINUTES,
        maxGapMinutes: MAX_GAP_MINUTES,
        firedToday: counter.count,
        maxPerDay,
        dailyReminderTime,
        random: Math.random,
      })

      if (!next) {
        setNextAt(null)
        /*
         * 今天到头了：睡到**明天的活跃时段开始**再重算，中途不做任何轮询。
         * 注意 setters 的返回值必须接住 —— dayjs 是不可变的，丢掉返回值
         * 等于还是午夜，那会在凌晨 0 点把用户叫醒。
         */
        const [hour, minute] = activeFrom.split(':').map(Number)
        const wakeUp = dayjs()
          .add(1, 'day')
          .startOf('day')
          .hour(hour ?? 0)
          .minute(minute ?? 0)
        timerRef.current = window.setTimeout(() => arm(), Math.max(60_000, wakeUp.diff(dayjs())))
        return
      }

      setNextAt(next)
      timerRef.current = window.setTimeout(() => void fire(), next.getTime() - Date.now())
    }

    const fire = async () => {
      if (cancelled) return

      /*
       * 只在不处于前台时弹。
       * document.hidden 覆盖"收进托盘 / 最小化"，
       * hasFocus() 覆盖"窗口开着但用户在用别的应用"。
       * 两者加起来就等价于"用户没在看这个应用"。
       */
      const inForeground = !document.hidden && document.hasFocus()

      if (!inForeground) {
        const shown = await showDesktopToast(pickToastMessage(buildContext(), Math.random))
        if (shown) {
          const counter = readCounter()
          writeCounter({ date: counter.date, count: counter.count + 1 })
        }
      }

      arm()
    }

    if (!settings.desktopReminderEnabled) {
      // 关闭时也要清掉已经在跑的定时器，否则关了开关还会弹。
      // 这里**不**调 setNextAt(null) —— 在 effect 体里同步 setState 会触发级联渲染
      // （eslint react-hooks/set-state-in-effect）。返回时按开关派生即可，见文件末尾。
      disarm()
      return () => {
        cancelled = true
        disarm()
      }
    }

    arm()

    /*
     * 从后台回到前台时重新校准。
     * 隐藏期间定时器可能被系统挂起（休眠 / 待机），醒来时目标时刻早就过了 ——
     * 不重算的话下一条会在一个已经过去的时间点上永远等不到。
     */
    const onVisibilityChange = () => {
      if (document.hidden) return
      arm()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      disarm()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [
    settings.desktopReminderEnabled,
    settings.desktopReminderFrom,
    settings.desktopReminderTo,
    settings.desktopReminderMaxPerDay,
    // 固定提醒的时刻变了也要重排：否则已经排好的随机时刻可能正好压在它上面
    settings.reminderEnabled,
    settings.dailyReminderTime,
    /*
     * buildContext 用 useCallback 钉住了身份（只随 name 变化），所以放进依赖是安全的。
     * 如果它是个普通函数，加进来会让 effect 每次渲染都重跑、定时器不停重建 ——
     * 那正是"提醒永远不响"的典型成因。
     */
    buildContext,
  ])

  const fireNow = useCallback(() => {
    return showDesktopToast(pickToastMessage(buildContext(), Math.random))
  }, [buildContext])

  return {
    // 关闭时按开关派生：这样关掉开关的瞬间就不会再显示"下一条在…"，
    // 而不必在 effect 里额外 setState 一次
    nextAt: settings.desktopReminderEnabled ? nextAt : null,
    firedToday,
    fireNow,
  }
}

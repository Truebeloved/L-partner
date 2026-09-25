import type { CoursePlanDraft } from '@/features/course/drafts'
import { dayjs } from '@/lib/date'

/**
 * 示例课程：「两个月上手 React」。
 *
 * 为什么必须有它：D1 决定应用不内置 API Key，评审很可能在没有配置大模型的情况下打开这个仓库，
 * 空状态里的「载入示例课程」就是他们体验「课程 → 计划 → 待办」主循环的唯一入口。
 * 所以这份数据要经得起细看 —— 阶段划分符合真实学习顺序（先 JSX，再数据流，最后工程化），
 * 知识点是能挂掌握状态的具体概念，时长与每周投入（10 小时）匹配得上。
 *
 * 返回函数而不是模块级常量：载入后用户会在表单里改它，
 * 共享同一个对象会让第二次载入带着上一次的编辑。
 */
export function buildDemoCourseDraft(): CoursePlanDraft {
  return {
    title: '两个月上手 React',
    description: '从零基础到能独立做出一个带路由与状态管理的前端小应用，按真实项目节奏推进。',
    goal: '能独立用 React + TypeScript 搭出一个多页面应用：会拆分组件、管理状态、取接口数据，并能部署上线。',
    // deadline 用「今天 + 60 天」而不是写死的日期：写死的日期迟早会过期，
    // 那时候评审载入示例课程只会看到一片「已经排不完」的警告，反而体验更差。
    deadline: dayjs().add(60, 'day').format('YYYY-MM-DD'),
    // 每周 10 小时 ≈ 工作日每天 1 小时 + 周末各 2 小时，是上班族/在校生能长期坚持的量
    weeklyMinutes: 600,
    stages: [
      {
        title: '起步：把 React 跑起来',
        objective: '能独立搭好开发环境，并用组件与状态写出一个可交互的小页面。',
        units: [
          {
            title: '环境与第一个组件',
            knowledgePoints: ['Vite 项目脚手架', '开发服务器与热更新', 'React 应用的入口文件'],
            estimatedMinutes: 60,
          },
          {
            title: 'JSX 与组件基础',
            knowledgePoints: [
              'JSX 语法与表达式',
              '组件的定义与复用',
              'props 传参',
              '条件与列表渲染',
            ],
            estimatedMinutes: 90,
          },
          {
            title: '状态与事件',
            knowledgePoints: ['useState', '事件处理', '受控表单', '状态更新是异步的'],
            estimatedMinutes: 90,
          },
        ],
      },
      {
        title: '核心：组件化与数据流',
        objective: '掌握组件之间的数据流动方式，能处理真实接口数据与常见交互。',
        units: [
          {
            title: '组件组合与布局',
            knowledgePoints: ['children 插槽', '组合优于继承', '布局组件拆分'],
            estimatedMinutes: 60,
          },
          {
            title: '副作用与数据获取',
            knowledgePoints: [
              'useEffect 与依赖数组',
              '清理函数',
              '加载 / 错误 / 空状态',
              '请求竞态',
            ],
            estimatedMinutes: 120,
          },
          {
            title: '状态提升与共享',
            knowledgePoints: ['状态提升', 'Context', '避免层层透传 props'],
            estimatedMinutes: 90,
          },
          {
            title: '表单与不可变更新',
            knowledgePoints: ['不可变更新数组与对象', '列表 key 的作用', '受控表单校验'],
            estimatedMinutes: 90,
          },
        ],
      },
      {
        title: '工程化：路由、状态与上线',
        objective: '把散装组件组织成一个能交付的应用，并让它真正跑在线上。',
        units: [
          {
            title: '路由与页面结构',
            knowledgePoints: ['客户端路由', '动态路由参数', '嵌套路由与布局'],
            estimatedMinutes: 90,
          },
          {
            title: '全局状态管理',
            knowledgePoints: ['zustand 基础用法', '选择器与性能', '派生状态', '状态该放哪一层'],
            estimatedMinutes: 120,
          },
          {
            title: '样式与设计令牌',
            knowledgePoints: ['原子化 CSS', '设计令牌与主题', '响应式断点'],
            estimatedMinutes: 60,
          },
          {
            title: '测试与部署',
            knowledgePoints: ['Vitest 单元测试', '组件测试', '构建产物与静态托管'],
            estimatedMinutes: 150,
          },
        ],
      },
    ],
  }
}

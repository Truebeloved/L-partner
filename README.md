# L-partner 📘

> **把「我有哪些课、要学到什么」变成「今天该干什么」。**
> 一个带 AI 学伴的学习辅助工具：课程导入 → 学习计划 → 每日待办 → 到点提醒 → 完成情况回流调整。

<p align="left">
  <img alt="React" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-06b6d4?logo=tailwindcss&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
</p>

> OH 社团面试任务作品 · 纯前端 · 无服务端 · 数据全部留在本地

---

## 它解决什么问题

学习工具大多停在两个极端：要么是**一个聊天框**（能答疑，但不知道你在学什么），
要么是**一个待办清单**（能列任务，但不会思考）。

L-partner 想打通中间那一段：**让 AI 知道你正在学什么、学到哪了、今天该做什么**，
并且让计划随着你的实际进度调整。

```
课程导入 ──► 生成学习计划 ──► 今日待办 ──► 到点提醒
                  ▲                              │
                  └──────── 完成情况回流 ◄────────┘
```

最后那一环是关键。大多数同类作品停在「能聊天 + 有个清单」，
而「计划会跟着我的实际进度自己变」才是这个工具区别于通用聊天框的理由。

---

## 功能

### 🎯 学伴（核心）

- **自定义角色**：内置严格督学 / 耐心学长 / 苏格拉底提问者 / 简洁助教四套人格，
  可复制后修改身份、性格、说话风格、教学方式与禁忌。
- **有上下文的对话**：回答时会带上你正在学的课程、学习目标、剩余天数和今天的任务 ——
  它不是一个通用聊天框。
- **四层记忆**：

  | 层       | 记什么                         |
  | -------- | ------------------------------ |
  | 会话记忆 | 当前对话，过长时自动压缩成摘要 |
  | 事实记忆 | 专业、目标、学习习惯等稳定信息 |
  | 掌握状态 | 每个知识点学到什么程度         |
  | 情景记忆 | 什么时候问过什么、当时弄懂没有 |

- **记忆可见可控**：所有记忆都在「记忆」页列出，可修正、可归档、可删除 ——
  不给用户贴看不见的标签。切换角色**不会**丢记忆。

### 📚 课程

- **口述生成教学方案**：说一句「我想两个月学会 React」，由 AI 拆成阶段、单元与知识点。
- **手动创建**：自己填写阶段与单元结构。
- **示例课程**：没有 API Key 也能一键载入，完整体验主循环。

### 📅 计划与执行

- 按 deadline、每周可投入时长自动排期；单日学习量有硬上限。
- **排不下时会如实告知**，而不是把计划硬塞成不可能执行的样子。
- 今日待办、完成打勾、逾期任务单独提醒。

### 🔔 提醒

- 页面内弹窗 + 系统通知双通道。
- 用 `setTimeout` 精确调度而非轮询，并在页面重新可见时重新校准。

---

## 快速开始

### 在线体验

> 部署地址见仓库 About 区域的链接（GitHub Pages）。
>
> **没有 API Key 也能完整体验**课程、计划、待办、提醒和示例数据；
> 只有对话与 AI 生成方案需要配置模型。

### 本地运行

```bash
git clone <repo-url>
cd L-partner
npm install
npm run dev
```

### 配置 AI（可选）

1. 打开「设置 → 大模型接入」
2. 点一个厂商预填按钮（DeepSeek / Moonshot / 通义千问 / 智谱 GLM / 本地 Ollama）
3. 填入你自己的 API Key
4. 点「测试连接」

> **关于密钥**：L-partner 不内置任何密钥，也没有服务端。你的 Key 只存在这台设备的
> 浏览器 IndexedDB 里，请求由浏览器直接发往厂商。
>
> **关于跨域**：国内厂商（DeepSeek / Moonshot / 通义）通常允许浏览器直连；
> OpenAI 官方接口默认不允许，需要改用兼容网关或本地 Ollama。

---

## 技术栈

| 层     | 选型                       | 说明                              |
| ------ | -------------------------- | --------------------------------- |
| 构建   | Vite 8                     | —                                 |
| 框架   | React 19 + TypeScript 6    | 全程 `strict`                     |
| 样式   | Tailwind CSS 4             | 设计令牌集中在 `styles/index.css` |
| 状态   | Zustand 5                  | 每域一个 store，各自独立持久化    |
| 持久化 | IndexedDB（idb-keyval）    | 容量不受 localStorage 的 5MB 限制 |
| 路由   | React Router 7             | 用 `HashRouter` 以适配 Pages      |
| 测试   | Vitest 5 + Testing Library | 只给纯逻辑写单测                  |
| 规范   | ESLint 10 + Prettier 3     | —                                 |

**零运行时第三方 SDK**：模型调用直接用 `fetch` 实现，没有引入任何厂商 SDK。

---

## 项目结构

```
src/
├── types/models.ts    全部数据模型
├── store/             状态与持久化
├── lib/
│   ├── llm/           模型适配层（协议、错误翻译、提示词）
│   └── storage/       IndexedDB 后端
├── features/          按功能域组织
│   ├── course/  plan/  today/  reminder/
│   └── chat/  persona/  memory/  settings/
└── components/        通用组件
```

详见 [`docs/architecture.md`](docs/architecture.md)。

---

## 文档

| 文档                                                   | 内容                         |
| ------------------------------------------------------ | ---------------------------- |
| [`docs/architecture.md`](docs/architecture.md)         | 模块划分、数据流转、取舍     |
| [`docs/design-decisions.md`](docs/design-decisions.md) | 每项选型的原因与被放弃的方案 |
| [`docs/roadmap.md`](docs/roadmap.md)                   | 开发阶段与进度               |

---

## 已知限制

这些是**有意的取舍**，不是没做完：

1. **网页关闭后无法主动提醒** —— 浏览器沙箱限制。页面内弹窗是主路径。
2. **数据不跨设备** —— 没有服务端就没有同步；设置页提供 JSON 导出备份。
3. **API Key 存在浏览器里** —— 纯前端方案的固有属性，UI 中已明确提示。
4. **资料导入暂只支持 txt / md** —— epub 解析留待后续（见 roadmap）。
5. **记忆检索用关键词而非向量** —— 在几千条量级内足够，且打分过程可解释。

---

## 开发

```bash
npm run dev         # 本地开发
npm run build       # 生产构建
npm run preview     # 预览构建产物
npm run test        # 运行单测
npm run typecheck   # 类型检查
npm run lint        # 代码检查
npm run format      # 格式化
```

---

## 许可证

MIT

import type { CoursePlanDraft } from '@/features/course/drafts'
import { dayjs } from '@/lib/date'

/**
 * 内置示例课程：《C语言基础入门》。
 *
 * 结构与每一讲的原视频地址来自 B 站公开目录，随安装包一起交付 ——
 * 装上就能按真实讲次学，不需要先联网抓一遍。**不含任何个人数据**：
 * 学习进度、笔记、对话、记忆都不在这里（那些只存在本机）。
 *
 * 由 scripts/export-c-course.mjs 生成，改课程请改那个脚本后重新导出。
 */
export function buildCLanguageCourseDraft(): CoursePlanDraft {
  return {
    title: "C语言基础入门",
    description: "按 B 站合集的真实分集整理：共 100 讲、12 个阶段，每一讲都指向原视频。",
    goal: "学完《浙江大学翁恺教你C语言程序设计！C语言基础入门！》的全部 100 讲",
    deadline: dayjs().add(150, 'day').format('YYYY-MM-DD'),
    weeklyMinutes: 600,
    stages: [
      {
        title: "第 其他 章",
        objective: "看完这 4 讲",
        units: [
          { title: "C语言简史", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA", resourceLabel: "B 站原视频 · C语言简史" },
          { title: "附1 ACLLib介绍，看几个小游戏的演示_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=98", resourceLabel: "B 站原视频 · 附1 ACLLib介绍，看几个小游戏的演示_高清 720P" },
          { title: "附2 Win32API简单介绍，太难了，咱不学！_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=99", resourceLabel: "B 站原视频 · 附2 Win32API简单介绍，太难了，咱不学！_高清 720P" },
          { title: "附3 DevC++建ACLLib项目，第一个窗口跑起来_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=100", resourceLabel: "B 站原视频 · 附3 DevC++建ACLLib项目，第一个窗口跑起来_高清 720P" },
        ],
      },
      {
        title: "第 1 章",
        objective: "看完这 9 讲",
        units: [
          { title: "1.1.1 计算机与编程语言：计算机怎么做事情的，编程语言是什么_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=2", resourceLabel: "B 站原视频 · 1.1.1 计算机与编程语言：计算机怎么做事情的，编程语言是什么_高清" },
          { title: "1.1.2 计算机的思维方式：重复是计算机最擅长的_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=3", resourceLabel: "B 站原视频 · 1.1.2 计算机的思维方式：重复是计算机最擅长的_高清" },
          { title: "1.2.1 为什么是C：C语言在工业界有重要地位，在很多领域无可替代_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=4", resourceLabel: "B 站原视频 · 1.2.1 为什么是C：C语言在工业界有重要地位，在很多领域无可替代_高清" },
          { title: "1.2.2 简单历史：关于C语言和版本的极其简单的历史_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=5", resourceLabel: "B 站原视频 · 1.2.2 简单历史：关于C语言和版本的极其简单的历史_高清" },
          { title: "1.2.3 编程软件：C语言的编程软件选择太多，我们推荐DevC++_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=6", resourceLabel: "B 站原视频 · 1.2.3 编程软件：C语言的编程软件选择太多，我们推荐DevC++_高清" },
          { title: "1.3.1 第一个C程序：如何在DevC++中编辑、编译和运行程序_高清", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=7", resourceLabel: "B 站原视频 · 1.3.1 第一个C程序：如何在DevC++中编辑、编译和运行程序_高清" },
          { title: "1.3.2 详解第一个程序：程序框架、printf、出错怎么办_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=8", resourceLabel: "B 站原视频 · 1.3.2 详解第一个程序：程序框架、printf、出错怎么办_高清" },
          { title: "1.3.3 做点计算：如何让程序输出算术结果_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=9", resourceLabel: "B 站原视频 · 1.3.3 做点计算：如何让程序输出算术结果_高清" },
          { title: "1.3.4 MacOSX如何在命令行编辑、编译和运行C程序_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=10", resourceLabel: "B 站原视频 · 1.3.4 MacOSX如何在命令行编辑、编译和运行C程序_高清" },
        ],
      },
      {
        title: "第 2 章",
        objective: "看完这 11 讲",
        units: [
          { title: "2.1.1 第二周概述_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=11", resourceLabel: "B 站原视频 · 2.1.1 第二周概述_高清" },
          { title: "2.1.2 变量定义：变量是做什么的，如何定义一个变量_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=12", resourceLabel: "B 站原视频 · 2.1.2 变量定义：变量是做什么的，如何定义一个变量_高清" },
          { title: "2.1.3 变量赋值与初始化：以及如何读输入的数字_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=13", resourceLabel: "B 站原视频 · 2.1.3 变量赋值与初始化：以及如何读输入的数字_高清" },
          { title: "2.1.4 变量输入：如何让程序读入用户输入的数字，scanf14讲 关于scanf_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=14", resourceLabel: "B 站原视频 · 2.1.4 变量输入：如何让程序读入用户输入的数字，scanf14讲 关于scanf_高清" },
          { title: "2.1.5 常量vs变量：不变的量是常量_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=15", resourceLabel: "B 站原视频 · 2.1.5 常量vs变量：不变的量是常量_高清" },
          { title: "2.1.6 浮点数：整数运算的结果只有整数部分，不然就要用浮点数_高清", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=16", resourceLabel: "B 站原视频 · 2.1.6 浮点数：整数运算的结果只有整数部分，不然就要用浮点数_高清" },
          { title: "2.2.1 表达式：运算符和算子，取余计算，程序就是数据加计算_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=17", resourceLabel: "B 站原视频 · 2.2.1 表达式：运算符和算子，取余计算，程序就是数据加计算_高清" },
          { title: "2.2.2 运算符优先级：优先级、结合关系、赋值运算符_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=18", resourceLabel: "B 站原视频 · 2.2.2 运算符优先级：优先级、结合关系、赋值运算符_高清" },
          { title: "2.2.3 交换变量：如何交换两个变量的值，顺便看下Dev的调试功能_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=19", resourceLabel: "B 站原视频 · 2.2.3 交换变量：如何交换两个变量的值，顺便看下Dev的调试功能_高清" },
          { title: "2.2.4 复合赋值和递增递减：这是两类有历史也有争议的运算符_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=20", resourceLabel: "B 站原视频 · 2.2.4 复合赋值和递增递减：这是两类有历史也有争议的运算符_高清" },
          { title: "2.2.5 如何使用PAT系统来做编程练习题_高清", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=21", resourceLabel: "B 站原视频 · 2.2.5 如何使用PAT系统来做编程练习题_高清" },
        ],
      },
      {
        title: "第 3 章",
        objective: "看完这 11 讲",
        units: [
          { title: "3.1.1 PAT再解释_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=22", resourceLabel: "B 站原视频 · 3.1.1 PAT再解释_高清 720P" },
          { title: "3.1.2 第二周习题解析_高清 720P", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=23", resourceLabel: "B 站原视频 · 3.1.2 第二周习题解析_高清 720P" },
          { title: "3.1.3 0的故事_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=24", resourceLabel: "B 站原视频 · 3.1.3 0的故事_高清 720P" },
          { title: "3.2.1 做判断：if语句根据条件决定做还是不做_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=25", resourceLabel: "B 站原视频 · 3.2.1 做判断：if语句根据条件决定做还是不做_高清 720P" },
          { title: "3.2.2 判断的条件：关系运算，做比较的运算符_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=26", resourceLabel: "B 站原视频 · 3.2.2 判断的条件：关系运算，做比较的运算符_高清 720P" },
          { title: "3.2.3 找零计算器：判断，注释，流程图_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=27", resourceLabel: "B 站原视频 · 3.2.3 找零计算器：判断，注释，流程图_高清 720P" },
          { title: "3.2.4 否则的话：如果条件不成立呢？_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=28", resourceLabel: "B 站原视频 · 3.2.4 否则的话：如果条件不成立呢？_高清 720P" },
          { title: "3.2.5 if语句再探：if和else后面也可以没有{}而是一条语句_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=29", resourceLabel: "B 站原视频 · 3.2.5 if语句再探：if和else后面也可以没有{}而是一条语句_高清 720P" },
          { title: "3.3.1 嵌套的if-else：在if或else后面要执行的还是if语句_高清 720P", knowledgePoints: [], estimatedMinutes: 12, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=30", resourceLabel: "B 站原视频 · 3.3.1 嵌套的if-else：在if或else后面要执行的还是if语句_高清 720P" },
          { title: "3.3.2 级联的if-else_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=31", resourceLabel: "B 站原视频 · 3.3.2 级联的if-else_高清 720P" },
          { title: "3.3.4 多路分支：switch-case语句_高清 720P", knowledgePoints: [], estimatedMinutes: 14, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=32", resourceLabel: "B 站原视频 · 3.3.4 多路分支：switch-case语句_高清 720P" },
        ],
      },
      {
        title: "第 4 章",
        objective: "看完这 6 讲",
        units: [
          { title: "4.1.1 循环：有些事情就得用循环才能解决_高清 720P", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=33", resourceLabel: "B 站原视频 · 4.1.1 循环：有些事情就得用循环才能解决_高清 720P" },
          { title: "4.1.2 while循环：就像if一样，条件满足就不断地做后面的句子_高清 720P", knowledgePoints: [], estimatedMinutes: 15, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=34", resourceLabel: "B 站原视频 · 4.1.2 while循环：就像if一样，条件满足就不断地做后面的句子_高清 720P" },
          { title: "4.1.3 do-while循环：不管三七二十一，先做循环内的句子_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=35", resourceLabel: "B 站原视频 · 4.1.3 do-while循环：不管三七二十一，先做循环内的句子_高清 720P" },
          { title: "4.2.2 猜数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=36", resourceLabel: "B 站原视频 · 4.2.2 猜数_高清 720P" },
          { title: "4.2.3 算平均数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=37", resourceLabel: "B 站原视频 · 4.2.3 算平均数_高清 720P" },
          { title: "4.2.4 整数求逆_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=38", resourceLabel: "B 站原视频 · 4.2.4 整数求逆_高清 720P" },
        ],
      },
      {
        title: "第 5 章",
        objective: "看完这 8 讲",
        units: [
          { title: "5.1.1 for循环：这是最古老的循环，确实样子看上去有点古怪_高清 720P", knowledgePoints: [], estimatedMinutes: 14, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=39", resourceLabel: "B 站原视频 · 5.1.1 for循环：这是最古老的循环，确实样子看上去有点古怪_高清 720P" },
          { title: "5.1.2 循环的计算和选择：如何计算循环的次数，如何选择不同的循环_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=40", resourceLabel: "B 站原视频 · 5.1.2 循环的计算和选择：如何计算循环的次数，如何选择不同的循环_高清 720P" },
          { title: "5.2.1 循环控制：如何用break和continue来控制循环_高清 720P", knowledgePoints: [], estimatedMinutes: 14, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=41", resourceLabel: "B 站原视频 · 5.2.1 循环控制：如何用break和continue来控制循环_高清 720P" },
          { title: "5.2.2 嵌套的循环：在循环里面还是循环_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=42", resourceLabel: "B 站原视频 · 5.2.2 嵌套的循环：在循环里面还是循环_高清 720P" },
          { title: "5.2.3 从嵌套的循环中跳出：break只能跳出其所在的循环_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=43", resourceLabel: "B 站原视频 · 5.2.3 从嵌套的循环中跳出：break只能跳出其所在的循环_高清 720P" },
          { title: "5.3.1 前n项求和_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=44", resourceLabel: "B 站原视频 · 5.3.1 前n项求和_高清 720P" },
          { title: "5.3.2 整数分解_高清 720P", knowledgePoints: [], estimatedMinutes: 17, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=45", resourceLabel: "B 站原视频 · 5.3.2 整数分解_高清 720P" },
          { title: "5.3.3 求最大公约数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=46", resourceLabel: "B 站原视频 · 5.3.3 求最大公约数_高清 720P" },
        ],
      },
      {
        title: "第 6 章",
        objective: "看完这 21 讲",
        units: [
          { title: "6.1.1 编程练习解析4-0：给定条件的整数集_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=47", resourceLabel: "B 站原视频 · 6.1.1 编程练习解析4-0：给定条件的整数集_高清 720P" },
          { title: "6.1.2 编程练习解析4-1：水仙花数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=48", resourceLabel: "B 站原视频 · 6.1.2 编程练习解析4-1：水仙花数_高清 720P" },
          { title: "6.1.3 编程练习解析4-2：九九乘法表_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=49", resourceLabel: "B 站原视频 · 6.1.3 编程练习解析4-2：九九乘法表_高清 720P" },
          { title: "6.1.4 编程练习解析4-3：统计素数求和_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=50", resourceLabel: "B 站原视频 · 6.1.4 编程练习解析4-3：统计素数求和_高清 720P" },
          { title: "6.1.5 编程练习解析4-4：猜数游戏_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=51", resourceLabel: "B 站原视频 · 6.1.5 编程练习解析4-4：猜数游戏_高清 720P" },
          { title: "6.1.6 编程练习解析5-0：n项求和_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=52", resourceLabel: "B 站原视频 · 6.1.6 编程练习解析5-0：n项求和_高清 720P" },
          { title: "6.1.7 编程练习解析5-1~5-3_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=53", resourceLabel: "B 站原视频 · 6.1.7 编程练习解析5-1~5-3_高清 720P" },
          { title: "6.2.1 数据类型：C语言有哪些基础数据类型，sizeof可以做什么_高清 720P", knowledgePoints: [], estimatedMinutes: 12, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=54", resourceLabel: "B 站原视频 · 6.2.1 数据类型：C语言有哪些基础数据类型，sizeof可以做什么_高清 720P" },
          { title: "6.2.2 整数类型：除了int，还有多少整数类型_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=55", resourceLabel: "B 站原视频 · 6.2.2 整数类型：除了int，还有多少整数类型_高清 720P" },
          { title: "6.2.3 整数的内部表达：整数是如何表达的，尤其是负数如何表达_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=56", resourceLabel: "B 站原视频 · 6.2.3 整数的内部表达：整数是如何表达的，尤其是负数如何表达_高清 720P" },
          { title: "6.2.4 整数的范围：如何推算整数类型所能表达的数的范围，越界了会怎样_高清 720P", knowledgePoints: [], estimatedMinutes: 12, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=57", resourceLabel: "B 站原视频 · 6.2.4 整数的范围：如何推算整数类型所能表达的数的范围，越界了会怎样_高清 720P" },
          { title: "6.2.5 整数的格式化：如何格式化输入输出整数，如何处理8进制和16进制_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=58", resourceLabel: "B 站原视频 · 6.2.5 整数的格式化：如何格式化输入输出整数，如何处理8进制和16进制_高清 720P" },
          { title: "6.2.6 选择整数类型：没什么特殊需要就只用int就好了_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=59", resourceLabel: "B 站原视频 · 6.2.6 选择整数类型：没什么特殊需要就只用int就好了_高清 720P" },
          { title: "6.2.7 浮点类型：double和float，它们是什么，如何输入输出_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=60", resourceLabel: "B 站原视频 · 6.2.7 浮点类型：double和float，它们是什么，如何输入输出_高清 720P" },
          { title: "6.2.8 浮点的范围与精度：浮点数到底能表示哪些数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=61", resourceLabel: "B 站原视频 · 6.2.8 浮点的范围与精度：浮点数到底能表示哪些数_高清 720P" },
          { title: "6.2.9 字符类型_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=62", resourceLabel: "B 站原视频 · 6.2.9 字符类型_高清 720P" },
          { title: "6.2.10 逃逸字符_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=63", resourceLabel: "B 站原视频 · 6.2.10 逃逸字符_高清 720P" },
          { title: "6.2.11 类型转换：如何在不同类型之间做转换_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=64", resourceLabel: "B 站原视频 · 6.2.11 类型转换：如何在不同类型之间做转换_高清 720P" },
          { title: "6.3.1 逻辑类型：表示关系运算和逻辑运算结果的量_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=65", resourceLabel: "B 站原视频 · 6.3.1 逻辑类型：表示关系运算和逻辑运算结果的量_高清 720P" },
          { title: "6.3.2 逻辑运算：对逻辑量进行与、或、非运算_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=66", resourceLabel: "B 站原视频 · 6.3.2 逻辑运算：对逻辑量进行与、或、非运算_高清 720P" },
          { title: "6.3.3 条件运算和逗号运算_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=67", resourceLabel: "B 站原视频 · 6.3.3 条件运算和逗号运算_高清 720P" },
        ],
      },
      {
        title: "第 7 章",
        objective: "看完这 7 讲",
        units: [
          { title: "7.1.1 初见函数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=68", resourceLabel: "B 站原视频 · 7.1.1 初见函数_高清 720P" },
          { title: "7.1.2 函数的定义和使用_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=69", resourceLabel: "B 站原视频 · 7.1.2 函数的定义和使用_高清 720P" },
          { title: "7.1.3 从函数中返回_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=70", resourceLabel: "B 站原视频 · 7.1.3 从函数中返回_高清 720P" },
          { title: "7.2.1 函数原型_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=71", resourceLabel: "B 站原视频 · 7.2.1 函数原型_高清 720P" },
          { title: "7.2.2 参数传递_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=72", resourceLabel: "B 站原视频 · 7.2.2 参数传递_高清 720P" },
          { title: "7.2.3 本地变量_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=73", resourceLabel: "B 站原视频 · 7.2.3 本地变量_高清 720P" },
          { title: "7.2.4 函数庶事：一些有关函数的细节问题，main()是什么_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=74", resourceLabel: "B 站原视频 · 7.2.4 函数庶事：一些有关函数的细节问题，main()是什么_高清 720P" },
        ],
      },
      {
        title: "第 8 章",
        objective: "看完这 6 讲",
        units: [
          { title: "8.1.1 初试数组_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=75", resourceLabel: "B 站原视频 · 8.1.1 初试数组_高清 720P" },
          { title: "8.1.2 定义数组_高清 1080P", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=76", resourceLabel: "B 站原视频 · 8.1.2 定义数组_高清 1080P" },
          { title: "8.1.3 数组的例子：统计个数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=77", resourceLabel: "B 站原视频 · 8.1.3 数组的例子：统计个数_高清 720P" },
          { title: "8.2.1 数组运算_高清 720P", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=78", resourceLabel: "B 站原视频 · 8.2.1 数组运算_高清 720P" },
          { title: "8.2.2 数组例子：素数_高清 720P", knowledgePoints: [], estimatedMinutes: 19, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=79", resourceLabel: "B 站原视频 · 8.2.2 数组例子：素数_高清 720P" },
          { title: "8.2.3 二维数组_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=80", resourceLabel: "B 站原视频 · 8.2.3 二维数组_高清 720P" },
        ],
      },
      {
        title: "第 9 章",
        objective: "看完这 7 讲",
        units: [
          { title: "9.1.1 取地址运算：&运算符取得变量的地址_高清 720P", knowledgePoints: [], estimatedMinutes: 12, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=81", resourceLabel: "B 站原视频 · 9.1.1 取地址运算：&运算符取得变量的地址_高清 720P" },
          { title: "9.1.2 指针：指针变量就是记录地址的变量_高清 720P", knowledgePoints: [], estimatedMinutes: 13, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=82", resourceLabel: "B 站原视频 · 9.1.2 指针：指针变量就是记录地址的变量_高清 720P" },
          { title: "9.1.3 指针的使用：指针有什么用呢？_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=83", resourceLabel: "B 站原视频 · 9.1.3 指针的使用：指针有什么用呢？_高清 720P" },
          { title: "9.1.4 指针与数组：为什么数组传进函数后的sizeof不对了_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=84", resourceLabel: "B 站原视频 · 9.1.4 指针与数组：为什么数组传进函数后的sizeof不对了_高清 720P" },
          { title: "9.1.5 指针与const：指针本身和所指的变量都可能const_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=85", resourceLabel: "B 站原视频 · 9.1.5 指针与const：指针本身和所指的变量都可能const_高清 720P" },
          { title: "9.2.1 指针运算_高清 720P", knowledgePoints: [], estimatedMinutes: 26, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=86", resourceLabel: "B 站原视频 · 9.2.1 指针运算_高清 720P" },
          { title: "9.2.2 动态内存分配_高清 720P", knowledgePoints: [], estimatedMinutes: 18, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=87", resourceLabel: "B 站原视频 · 9.2.2 动态内存分配_高清 720P" },
        ],
      },
      {
        title: "第 10 章",
        objective: "看完这 9 讲",
        units: [
          { title: "10.1.1 字符串_高清 720P", knowledgePoints: [], estimatedMinutes: 12, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=88", resourceLabel: "B 站原视频 · 10.1.1 字符串_高清 720P" },
          { title: "10.1.2 字符串变量_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=89", resourceLabel: "B 站原视频 · 10.1.2 字符串变量_高清 720P" },
          { title: "10.1.3 字符串输入输出_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=90", resourceLabel: "B 站原视频 · 10.1.3 字符串输入输出_高清 720P" },
          { title: "10.1.4 字符串数组_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=91", resourceLabel: "B 站原视频 · 10.1.4 字符串数组_高清 720P" },
          { title: "10.2.1 单字符输入输出_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=92", resourceLabel: "B 站原视频 · 10.2.1 单字符输入输出_高清 720P" },
          { title: "10.2.2 字符串函数strlen_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=93", resourceLabel: "B 站原视频 · 10.2.2 字符串函数strlen_高清 720P" },
          { title: "10.2.3 字符串函数strc_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=94", resourceLabel: "B 站原视频 · 10.2.3 字符串函数strc_高清 720P" },
          { title: "10.2.4 字符串函数strcpy_高清 720P", knowledgePoints: [], estimatedMinutes: 11, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=95", resourceLabel: "B 站原视频 · 10.2.4 字符串函数strcpy_高清 720P" },
          { title: "10.2.6 字符串搜索函数_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=96", resourceLabel: "B 站原视频 · 10.2.6 字符串搜索函数_高清 720P" },
        ],
      },
      {
        title: "第 11 章",
        objective: "看完这 1 讲",
        units: [
          { title: "11.1.1 枚举_高清 720P", knowledgePoints: [], estimatedMinutes: 10, resourceUrl: "https://www.bilibili.com/video/BV1dr4y1n7vA?p=97", resourceLabel: "B 站原视频 · 11.1.1 枚举_高清 720P" },
        ],
      },
    ],
  }
}

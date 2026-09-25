// 预加载脚本：渲染进程与主进程之间唯一的通道。
//
// 这里刻意只暴露两个具体能力，而不是把 ipcRenderer 整个丢出去 ——
// 后者等于把「调用任意主进程功能」的权力交给页面代码，一旦以后加载了
// 外部内容就是严重的安全问题。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lpartner', {
  /** 是否为桌面端。渲染层用它决定要不要播开屏、显示哪些桌面专属能力 */
  isDesktop: true,
  /** 取本机信息（计算机名 / 用户名），供开屏问候使用 */
  getAppInfo: () => ipcRenderer.invoke('app:info'),
})

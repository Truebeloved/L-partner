// 预加载脚本：渲染进程与主进程之间唯一的通道。
//
// 这里刻意只暴露几个具体能力，而不是把 ipcRenderer 整个丢出去 ——
// 后者等于把「调用任意主进程功能」的权力交给页面代码，一旦以后加载了
// 外部内容就是严重的安全问题。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lpartner', {
  /** 是否为桌面端。渲染层用它决定要不要播开屏、显示哪些桌面专属能力 */
  isDesktop: true,
  /** 取本机信息（计算机名 / 用户名），供开屏问候与提醒文案使用 */
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  /**
   * 在右下角弹一条桌面提醒小窗。总存活 3 秒（含出现与消失动画），
   * 由主进程统一计时并负责销毁。
   * 返回是否真的弹了 —— 主窗口在前台时主进程会拒绝，避免打扰。
   */
  showToast: (payload) => ipcRenderer.invoke('reminder:toast', payload),
  /**
   * 订阅"开始退场"的通知：主进程在销毁窗口前会发一次，
   * 让渲染层有时间播放消失动画。返回取消订阅的函数。
   *
   * 计时放在主进程而不是渲染层，是为了让"总时长 3 秒"只有一个权威来源 ——
   * 两边各有一个计时器的话，迟早会走偏。
   */
  onToastDismiss: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('toast:dismiss', listener)
    return () => ipcRenderer.removeListener('toast:dismiss', listener)
  },
  /**
   * 读取一个 B 站视频/合集的目录（分 P 或合集分集）。
   *
   * 必须放在主进程：B 站对非浏览器客户端直接返回验证码，
   * 所以那里是用一个**隐藏的真实浏览器窗口**去加载页面再取数据。
   * 渲染进程自己 fetch 会被跨域拦掉，也拿不到这个能力。
   */
  fetchBilibiliCollection: (url) => ipcRenderer.invoke('bilibili:collection', url),
})

// 把"一集"变成可打开的地址。与 src/features/course/bilibili.ts 的 episodeUrl 同规则，
// 这里用 CommonJS 单独放一份：协议是稳定的，而抓取脚本跑在 Node 里、引不到 TS 源码。
function episodeUrl(episode) {
  const base = `https://www.bilibili.com/video/${episode.bvid}`
  return episode.page > 1 ? `${base}?p=${episode.page}` : base
}

module.exports = { episodeUrl }

/**
 * utils/server.js —— 后端地址的运行时切换（开发期便利功能）
 *
 * 为什么需要它：
 *   真机调试时后端地址必须是「电脑的局域网 IP」，而这个 IP 会随网络变化
 *   （换 WiFi、连手机热点、开 VPN 都会变）。每次改代码再重新编译很烦，
 *   所以把地址做成可运行时覆盖：优先读 storage，没有则用 config.js 的默认值。
 *
 * 使用方式（登录页）：长按底部「演示账号」那一行 → 弹出地址选择/输入框。
 *
 * 注意：这是开发期工具。正式版应删掉入口，并把 config.js 的默认值改成 https 域名。
 */
const { DEFAULT_BASE_URL, DEFAULT_FILE_BASE } = require('./config')

const KEY = 'cl_base_url'

/** 取当前生效的接口前缀 */
function getBaseUrl() {
  const override = wx.getStorageSync(KEY)
  return override || DEFAULT_BASE_URL
}

/** 取文件前缀（与接口同源，只是去掉 /api/v1） */
function getFileBase() {
  const base = getBaseUrl()
  return base.replace(/\/api\/v1\/?$/, '')
}

/** 设置覆盖值（传空则清除，回到默认） */
function setBaseUrl(url) {
  if (!url) {
    wx.removeStorageSync(KEY)
    return getBaseUrl()
  }
  // 容错：允许用户只填 IP:端口，自动补全协议与路径
  let v = String(url).trim()
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v
  v = v.replace(/\/+$/, '')
  if (!/\/api\/v1$/.test(v)) v = v + '/api/v1'
  wx.setStorageSync(KEY, v)
  return v
}

module.exports = { getBaseUrl, getFileBase, setBaseUrl, DEFAULT_BASE_URL, DEFAULT_FILE_BASE }

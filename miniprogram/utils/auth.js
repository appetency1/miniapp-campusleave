/**
 * utils/auth.js —— 登录态管理
 *
 * token 存在 storage 里（小程序 storage 是持久化的，除非用户清缓存）。
 * 这里集中管理三个动作：读 token / 写登录结果 / 清登录态。
 * 页面里不要直接操作 storage key，一律走这个文件，避免 key 写错导致"登录了但还是跳登录页"。
 */
const TOKEN_KEY = 'cl_token'
const USER_KEY = 'cl_user'

/** 读取 token，没有则返回空串 */
function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

/** 读取缓存的用户信息（含 realName / role / username） */
function getUser() {
  return wx.getStorageSync(USER_KEY) || null
}

/** 登录成功后写入 token 与用户信息 */
function saveAuth(token, user) {
  wx.setStorageSync(TOKEN_KEY, token)
  wx.setStorageSync(USER_KEY, user || null)
}

/** 清空登录态（退出登录 / token 失效时调用） */
function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

module.exports = { getToken, getUser, saveAuth, clearAuth }

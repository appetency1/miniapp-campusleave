/**
 * app.js —— 小程序入口
 *
 * 职责：
 *   1. 启动时读取本地 token，决定首屏是「首页」还是「登录页」
 *   2. 提供全局配置（BASE_URL）与全局数据（用户信息）
 *
 * 注意（D-03 决策）：登录方式就是账号密码，不使用 wx.login。
 * 小程序只负责把用户填的学号密码发给后端换 JWT，不涉及微信身份。
 */
const { BASE_URL } = require('./utils/config')
const { getToken, clearAuth } = require('./utils/auth')

App({
  onLaunch() {
    // 记录一次启动时间（便于后续排查冷启动问题，不影响业务）
    this.globalData.launchAt = Date.now()

    // 有 token 就直接进首页；没有则去登录页
    // 说明：这里不校验 token 是否过期 —— 过期由后端返回 40102，request.js 统一拦截并跳登录，
    //      避免启动时多发一次 /auth/me 请求拖慢首屏。
    if (!getToken()) {
      this.redirectToLogin()
    }
  },

  /**
   * 跳登录页。
   * 用 reLaunch 而不是 navigateTo：清空页面栈，防止用户按返回回到已登录的页面。
   */
  redirectToLogin() {
    clearAuth()
    wx.reLaunch({ url: '/pages/login/login' })
  },

  globalData: {
    baseUrl: BASE_URL,
    launchAt: 0,
    /** 当前登录用户（登录成功后由 login 页写入，供「我的」页展示） */
    user: null
  }
})

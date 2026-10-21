/**
 * pages/login/login.js —— 登录页
 *
 * 流程（对应 03_API §3.1）：
 *   1. 校验输入非空
 *   2. POST /auth/login  { username, password }
 *   3. 成功后把 token + 用户信息落 storage，reLaunch 到首页
 *
 * 注意：登录用的是**账号密码**，不是 wx.login（D-03 决策）。
 * 小程序端不接触微信身份，方便与 Web 后台共用同一套认证。
 */
const { post } = require('../../utils/request')
const { saveAuth, getToken } = require('../../utils/auth')
const { DEMO_ACCOUNT } = require('../../utils/config')

Page({
  data: {
    username: '',
    password: '',
    /** 当前聚焦的字段名，用于把底线变墨色 */
    focus: '',
    submitting: false,
    error: '',
    /** 登录页底部展示的演示账号文案 */
    demoText: DEMO_ACCOUNT.username + ' / ' + DEMO_ACCOUNT.password
  },

  onLoad() {
    // 已登录（比如从别的入口回来）直接进首页
    if (getToken()) {
      wx.reLaunch({ url: '/pages/student/home/home' })
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value, error: '' })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: '' })
  },

  onFocus(e) {
    this.setData({ focus: e.currentTarget.dataset.name })
  },

  onBlur() {
    this.setData({ focus: '' })
  },

  /** 一键填充演示账号（毕设演示便利，正式版可删；账号来自 utils/config.js） */
  fillDemo() {
    this.setData({ username: DEMO_ACCOUNT.username, password: DEMO_ACCOUNT.password, error: '' })
  },

  /**
   * 登录。
   * 用 submitting 做防重复提交：连点两下会发出两个请求，
   * 虽然后端幂等无副作用，但会造成两次跳转。
   */
  async onLogin() {
    if (this.data.submitting) return

    const username = (this.data.username || '').trim()
    const password = this.data.password || ''

    // 前端只做"非空"校验，格式与正确性交给后端
    if (!username) {
      this.setData({ error: '请输入学号' })
      return
    }
    if (!password) {
      this.setData({ error: '请输入密码' })
      return
    }

    this.setData({ submitting: true, error: '' })
    try {
      const data = await post('/auth/login', { username, password })

      // 角色校验：教师/管理员不该进学生端小程序（他们用 Web 后台）
      if (data.user && data.user.role !== 'STUDENT') {
        this.setData({
          submitting: false,
          error: '该账号为教师或管理员，请使用电脑端访问'
        })
        return
      }

      saveAuth(data.token, data.user)
      getApp().globalData.user = data.user

      wx.reLaunch({ url: '/pages/student/home/home' })
    } catch (err) {
      // err.message 来自后端统一响应（如"用户名或密码错误"）
      this.setData({ submitting: false, error: err.message || '登录失败，请重试' })
    }
  }
})

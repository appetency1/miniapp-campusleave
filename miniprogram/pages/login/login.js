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
const { getBaseUrl, setBaseUrl } = require('../../utils/server')

Page({
  data: {
    username: '',
    password: '',
    /** 当前聚焦的字段名，用于把底线变墨色 */
    focus: '',
    submitting: false,
    error: '',
    /** 登录页底部展示的演示账号文案 */
    demoText: DEMO_ACCOUNT.username + ' / ' + DEMO_ACCOUNT.password,
    /** 当前接口地址（去掉 /api/v1，只显示 host，方便一眼核对） */
    apiHost: ''
  },

  onLoad() {
    // 已登录（比如从别的入口回来）直接进首页
    if (getToken()) {
      wx.reLaunch({ url: '/pages/student/home/home' })
      return
    }
    this.refreshApiHost()
  },

  onShow() {
    this.refreshApiHost()
  },

  /** 刷新底部显示的接口地址 */
  refreshApiHost() {
    this.setData({ apiHost: getBaseUrl().replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') })
  },

  /**
   * 切换后端地址（长按/点击底部「接口」行触发）。
   *
   * 场景：真机调试时后端地址必须是电脑的局域网 IP，换 WiFi / 连手机热点后 IP 会变。
   * 这里给几个候选 + 手动输入，存 storage，立即生效，不用改代码重新编译。
   */
  onServerTap() {
    const current = getBaseUrl()
    const candidates = [
      '127.0.0.1:8080（开发者工具本机）',
      '10.225.223.179:8080（上次的 WLAN）',
      '26.135.94.106:8080（Radmin VPN）',
      '手动输入…'
    ]

    wx.showActionSheet({
      alertText: '当前：' + current,
      itemList: candidates,
      success: (res) => {
        if (res.tapIndex === candidates.length - 1) {
          this.askCustomHost()
          return
        }
        const picked = candidates[res.tapIndex].replace(/（.*$/, '')
        setBaseUrl(picked)
        this.refreshApiHost()
        wx.showToast({ title: '已切换到 ' + picked, icon: 'none' })
      }
    })
  },

  /** 手动输入 IP:端口 */
  askCustomHost() {
    wx.showModal({
      title: '后端地址',
      editable: true,
      placeholderText: '如 192.168.43.12:8080',
      content: getBaseUrl().replace(/^https?:\/\//, '').replace(/\/api\/v1$/, ''),
      success: (res) => {
        if (!res.confirm) return
        const v = (res.content || '').trim()
        if (!v) return
        const saved = setBaseUrl(v)
        this.refreshApiHost()
        wx.showToast({ title: '已保存，重新登录生效', icon: 'none' })
      }
    })
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

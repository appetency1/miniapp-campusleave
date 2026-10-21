/**
 * pages/student/profile/profile.js —— 我的
 *
 * 数据来源：GET /student/home 一次拿到 student（姓名/学号/班级/辅导员）+ stats。
 * 为什么复用首页接口而不新建 /student/profile：
 *   两者返回的数据高度重合（都是"学生基本信息 + 统计"），
 *   新建一个接口意味着两处 SQL、两处维护，收益很小。
 *
 * 退出登录：清本地 token → reLaunch 登录页。
 * 注意 JWT 是无状态的，服务端没有"会话"可销毁，
 * 所以退出就是客户端删 token（后端 /auth/logout 仅占位）。
 */
const { get } = require('../../../utils/request')
const { getToken, getUser, clearAuth } = require('../../../utils/auth')

Page({
  data: {
    statusBarHeight: 20,
    realName: '',
    studentNo: '',
    className: '',
    counselorName: '',
    stats: {
      totalApplications: 0,
      completed: 0,
      currentOverdue: 0,
      averageDays: 0
    }
  },

  onLoad() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const cached = getUser() || {}
    this.setData({
      statusBarHeight: info.statusBarHeight || 20,
      realName: cached.realName || '',
      studentNo: cached.username || ''
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const self = this
      // 未读数也要同步，否则从消息页切过来角标会丢
      get('/student/messages/unread-count')
        .then(res => {
          if (self.getTabBar()) self.getTabBar().setData({ selected: 3, unread: res.unread || 0 })
        })
        .catch(() => {
          if (self.getTabBar()) self.getTabBar().setData({ selected: 3 })
        })
      this.getTabBar().setData({ selected: 3 })
    }
    this.load()
  },

  async load() {
    try {
      const d = await get('/student/home')
      const student = d.student || {}
      const stats = d.stats || {}
      this.setData({
        realName: student.realName || this.data.realName,
        studentNo: student.studentNo || this.data.studentNo,
        className: student.className || '',
        counselorName: student.counselorName || '',
        stats: {
          totalApplications: stats.totalApplications || 0,
          completed: stats.completed || 0,
          currentOverdue: stats.currentOverdue || 0,
          averageDays: stats.averageDays || 0
        }
      })
    } catch (err) {
      // 静默失败：缓存的姓名/学号仍可显示，不至于整页空白
    }
  },

  /** 退出登录：二次确认，避免误触 */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入学号和密码',
      confirmText: '退出',
      confirmColor: '#B23A28',
      success: (res) => {
        if (!res.confirm) return
        clearAuth()
        wx.reLaunch({ url: '/pages/login/login' })
      }
    })
  }
})

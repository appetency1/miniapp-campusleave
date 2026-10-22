/**
 * pages/student/messages/messages.js —— 消息中心
 *
 * 两个接口：
 *   GET  /student/messages               列表
 *   GET  /student/messages/unread-count  未读数（tabBar 角标）
 *   POST /student/messages/{id}/read     单条已读
 *   POST /student/messages/read-all      全部已读
 *
 * 交互约定：点一条消息 → 标记已读 → 立即更新本地状态（不整页重刷），
 * 这样列表不会"跳一下"，体验更稳。
 */
const { get, post } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

Page({
  data: {
    statusBarHeight: 20,
    list: [],
    unread: 0,
    loading: true,
    error: ''
  },

  onLoad() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: info.statusBarHeight || 20 })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    try {
      const list = await get('/student/messages')
      const messages = (list || []).map(m => ({
        id: m.id,
        type: m.type,
        title: m.title,
        content: m.content,
        businessId: m.businessId,
        businessType: m.businessType,
        isRead: m.isRead,
        timeText: this.relativeTime(m.createdAt)
      }))
      const unread = messages.filter(m => !m.isRead).length

      this.setData({ list: messages, unread, loading: false, error: '' })
      this.syncBadge(unread)
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  /**
   * 相对时间：今天显示 "14:20"，昨天 "昨天"，更早显示 "10.18"。
   * 比绝对时间更符合消息列表的阅读习惯。
   */
  relativeTime(str) {
    const t = F.parseTime(str)
    const now = new Date()
    const isToday = t.toDateString() === now.toDateString()
    if (isToday) return F.hm(t)

    const yesterday = new Date(now.getTime() - 86400000)
    if (t.toDateString() === yesterday.toDateString()) return '昨天'

    return F.md(t)
  },

  /** 把未读数同步到 tabBar 角标 */
  syncBadge(unread) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ unread: unread || 0 })
    }
  },

  /**
   * 点一条消息：标记已读 + 跳转到关联申请详情。
   *
   * 注意别写成"已读才跳、未读只标已读"——那样用户点第一条新消息毫无反应，
   * 必须点第二次才进得去，是明显的体感 bug。
   */
  async onTapMsg(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.data.list.findIndex(m => m.id === id)
    if (idx < 0) return

    const msg = this.data.list[idx]

    if (!msg.isRead) {
      try {
        await post('/student/messages/' + id + '/read')
        // 局部更新，避免整页重刷导致列表闪动
        const key = 'list[' + idx + '].isRead'
        const unread = Math.max(0, this.data.unread - 1)
        this.setData({ [key]: true, unread })
        this.syncBadge(unread)
      } catch (err) {
        // 标记已读失败不阻断跳转：用户点消息首先是要看内容
        console.warn('mark read failed', err)
      }
    }

    if (msg.businessType === 'APPLICATION' && msg.businessId) {
      wx.navigateTo({
        url: '/pages/student/detail/detail?id=' + msg.businessId,
        // 详情页可能因权限/删除打不开，兜底提示而不是白屏
        fail: () => wx.showToast({ title: '该申请已不存在', icon: 'none' })
      })
    }
  },

  /** 全部已读 */
  async onReadAll() {
    if (this.data.unread === 0) return
    try {
      await post('/student/messages/read-all')
      const list = this.data.list.map(m => Object.assign({}, m, { isRead: true }))
      this.setData({ list, unread: 0 })
      this.syncBadge(0)
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }
})

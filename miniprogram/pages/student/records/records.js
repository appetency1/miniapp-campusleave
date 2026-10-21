/**
 * pages/student/records/records.js —— 请假记录
 *
 * 六档筛选与后端 filter 参数对应：
 *   全部 all / 进行中 active / 待审批 pending / 已通过 approved / 已销假 completed / 已驳回 rejected
 *
 * 说明：筛选在后端做（而不是前端 filter），因为真实数据量可能很大，
 * 前端筛会先拉全量再过滤，数据多了就慢。目前数据少感觉不出差异，但这是正确写法。
 */
const { get } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

Page({
  data: {
    statusBarHeight: 20,
    filters: [
      { key: 'all', label: '全部' },
      { key: 'active', label: '进行中' },
      { key: 'pending', label: '待审批' },
      { key: 'approved', label: '已通过' },
      { key: 'completed', label: '已销假' },
      { key: 'rejected', label: '已驳回' }
    ],
    active: 'all',
    list: [],
    total: 0,
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
      this.getTabBar().setData({ selected: 1 })
    }
    // 每次进页面都刷新：审批状态可能刚变，缓存会导致看到旧状态
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  /** 切换筛选 */
  onFilter(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.active) return
    this.setData({ active: key, loading: true })
    this.load()
  },

  /** 加载列表 */
  async load() {
    try {
      const list = await get('/student/applications', { filter: this.data.active })
      this.setData({
        list: (list || []).map(item => this.toView(item)),
        total: (list || []).length,
        loading: false,
        error: ''
      })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  /** 后端字段 → 视图字段（时间格式、状态色块都在这里定） */
  toView(item) {
    const chip = F.statusChip(item.effectiveStatus)
    return {
      applicationId: item.applicationId,
      // 编号取申请编号后 4 位，比长编号好读；完整编号在详情页展示
      no: (item.applicationNo || '').slice(-4),
      statusLabel: item.statusLabel || chip.label,
      chip: chip.chip,
      rangeText: F.md(item.startTime) + ' ' + F.hm(item.startTime) +
        ' — ' + F.md(item.endTime) + ' ' + F.hm(item.endTime),
      summary: item.summary,
      subText: item.subText || '',
      // 驳回/逾期用红字，其余灰字
      subCls: (item.effectiveStatus === 'REJECTED' || item.effectiveStatus === 'OVERDUE')
        ? 'card__sub--danger' : ''
    }
  },

  /** 打开详情 */
  onOpen(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/student/detail/detail?id=' + id })
  }
})

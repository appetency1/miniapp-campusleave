/**
 * pages/student/detail/detail.js —— 请假详情（M2 只读）
 *
 * M2 只做"看得清"：状态、流程时间轴、申请信息、材料、销假记录、续假。
 * M3 再挂"能操作"：销假 / 撤回 / 取消 / 续假 / 人工核验。
 *
 * 操作按钮由后端 actions 字段决定显示哪些 —— 前端不自己判断状态，
 * 避免"界面能点但接口 422"的割裂。
 */
const { get, post } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

/** 两位补零 */
const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

Page({
  data: {
    statusBarHeight: 20,
    id: null,
    d: {},
    rangeText: '',
    stateCls: '',
    timeline: [],
    materials: [],
    checkins: [],
    extension: null,
    actions: [],
    hasCheckin: false,
    checkinText: '',
    loading: true,
    error: '',

    /** 续假面板 */
    extVisible: false,
    extDate: '',
    extDateLabel: '',
    extClock: '',
    extReason: ''
  },

  onLoad(options) {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: info.statusBarHeight || 20,
      id: options.id ? Number(options.id) : null
    })
    if (!this.data.id) {
      this.setData({ loading: false, error: '缺少申请编号' })
      return
    }
    this.load()
  },

  async load() {
    try {
      const d = await get('/student/applications/' + this.data.id)
      this.applyData(d)
      this.setData({ loading: false, error: '' })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  applyData(d) {
    const chip = F.statusChip(d.effectiveStatus)

    // ---- 区间 ----
    const rangeText = F.md(d.startTime) + ' ' + F.hm(d.startTime) +
      ' — ' + F.md(d.endTime) + ' ' + F.hm(d.endTime)

    // ---- 时间轴 ----
    // 四步：提交 → 审批 → 生效 → 销假
    // 每一步的"是否完成"由展示态推导，不依赖后端额外字段
    const es = d.effectiveStatus
    const approved = d.approvedAt != null
    const started = ['IN_PROGRESS', 'OVERDUE', 'COMPLETED'].indexOf(es) >= 0
    const isCompleted = es === 'COMPLETED'

    const timeline = [
      {
        t: '提交申请',
        s: F.mdhm(d.createdAt),
        st: 'is-done'
      },
      {
        t: d.status === 'REJECTED' ? '审批驳回' : '辅导员审批',
        s: d.approvedAt ? F.mdhm(d.approvedAt) : (d.status === 'PENDING' ? '处理中' : '—'),
        st: d.status === 'PENDING' ? 'is-now' : (approved ? 'is-done' : '')
      },
      {
        t: '请假生效',
        s: started ? F.mdCN(d.startTime) + ' ' + F.hm(d.startTime) : '待生效',
        st: started ? 'is-done' : ''
      },
      {
        t: '销假完成',
        s: d.actualEndTime ? F.mdhm(d.actualEndTime) : '—',
        st: isCompleted ? 'is-done' : ''
      }
    ]

    // 撤回 / 取消也算一个终点，补一行说明更清楚
    if (es === 'WITHDRAWN' || es === 'CANCELLED') {
      timeline.push({
        t: es === 'WITHDRAWN' ? '学生撤回' : '学生取消',
        s: d.approvalComment ? d.approvalComment : (d.cancelReason || ''),
        st: 'is-muted'
      })
    }

    // ---- 材料 ----
    const materials = (d.materials || []).map(m => ({
      id: m.id,
      name: F.materialLabel(m.materialType) + ' · ' + m.fileName,
      sizeText: F.fileSize(m.fileSize)
    }))

    // ---- 销假记录 ----
    const typeMap = { GPS: '定位销假', ON_CAMPUS_CONFIRM: '校内确认', MANUAL_REVIEW: '人工核验' }
    const resultMap = { PASSED: '通过', FAILED: '未通过' }
    const reviewMap = {
      NONE: '', PENDING_REVIEW: '待核验', APPROVED: '核验通过',
      REJECTED: '核验驳回', VOID: '已关闭'
    }
    const checkins = (d.checkinLogs || []).map(x => {
      let resultLabel = resultMap[x.checkResult] || x.checkResult
      if (x.reviewStatus && reviewMap[x.reviewStatus]) {
        resultLabel = reviewMap[x.reviewStatus]
      }
      return {
        id: x.id,
        typeLabel: typeMap[x.checkType] || x.checkType,
        resultLabel,
        danger: x.checkResult === 'FAILED' && x.reviewStatus !== 'APPROVED',
        checkTime: x.checkTime,
        distanceText: x.distanceM != null ? ('距离校区 ' + Math.round(x.distanceM) + ' 米') : ''
      }
    })

    // ---- 续假 ----
    let extension = null
    if (d.extension) {
      const extStatusMap = {
        PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', WITHDRAWN: '已撤回'
      }
      extension = {
        requestedEndTime: d.extension.requestedEndTime,
        reason: d.extension.reason,
        statusLabel: extStatusMap[d.extension.status] || d.extension.status
      }
    }

    // ---- 可用动作 ----
    const actionMap = {
      CHECKIN: { key: 'CHECKIN', label: '销假', danger: false },
      EXTENSION: { key: 'EXTENSION', label: '申请续假', danger: false },
      WITHDRAW: { key: 'WITHDRAW', label: '撤回申请', danger: true },
      CANCEL: { key: 'CANCEL', label: '取消申请', danger: true },
      MANUAL_REVIEW: { key: 'MANUAL_REVIEW', label: '申请人工核验', danger: false }
    }
    const actions = (d.actions || []).map(k => actionMap[k]).filter(Boolean)
    const hasCheckin = (d.actions || []).indexOf('CHECKIN') >= 0

    this.setData({
      d,
      rangeText,
      stateCls: chip.cls,
      timeline,
      materials,
      checkins,
      extension,
      actions,
      hasCheckin,
      checkinText: d.leaveScene === 'OFF_CAMPUS' ? '返校定位并销假' : '确认结束本次请假'
    })
  },

  /**
   * 操作分发。
   *
   * 设计原则：按钮的"可不可点"由后端 actions 决定，但每个操作仍然走后端接口二次校验，
   * 前端不做状态判断——避免"界面能点但接口 422"的割裂。
   */
  onAction(e) {
    const action = e.currentTarget.dataset.action
    const d = this.data.d

    switch (action) {
      case 'CHECKIN':
        if (d.leaveScene === 'OFF_CAMPUS') {
          wx.navigateTo({
            url: '/pages/student/checkin/checkin?id=' + d.applicationId + '&no=' + (d.applicationNo || '')
          })
        } else {
          this.confirmOnCampus()
        }
        break

      case 'WITHDRAW':
        this.confirmThen('撤回申请', '撤回后本次申请将关闭，需要重新提交。', '/student/applications/' + d.applicationId + '/withdraw')
        break

      case 'CANCEL':
        this.confirmThen('取消申请', '取消后本次请假将失效。', '/student/applications/' + d.applicationId + '/cancel')
        break

      case 'EXTENSION':
        this.openExtension()
        break

      case 'MANUAL_REVIEW':
        // 核验表单在销假页（那里有定位上下文）
        wx.navigateTo({
          url: '/pages/student/checkin/checkin?id=' + d.applicationId + '&no=' + (d.applicationNo || '')
        })
        break

      default:
        break
    }
  },

  /** 二次确认后调接口（撤回 / 取消共用） */
  confirmThen(title, content, url) {
    wx.showModal({
      title,
      content,
      confirmText: '确认',
      confirmColor: '#B23A28',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await post(url, { reason: title === '撤回申请' ? '本人撤回' : '本人取消' })
          wx.showToast({ title: '已' + (title === '撤回申请' ? '撤回' : '取消'), icon: 'success' })
          setTimeout(() => this.load(), 600)
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  /** 校内确认结束 */
  confirmOnCampus() {
    const d = this.data.d
    wx.showModal({
      title: '确认结束本次请假',
      content: '确认后本次请假将标记为已完成，不可撤销。',
      confirmText: '确认结束',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await post('/student/applications/' + d.applicationId + '/checkin/on-campus')
          wx.showToast({ title: '已结束', icon: 'success' })
          setTimeout(() => this.load(), 600)
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  // ==================== 续假 ====================

  /** 打开续假面板，默认把结束时间设成原结束时间 + 1 天 */
  openExtension() {
    const d = this.data.d
    const base = F.parseTime(d.endTime)
    const next = new Date(base.getTime() + 86400000)
    const date = next.getFullYear() + '-' + pad2(next.getMonth() + 1) + '-' + pad2(next.getDate())

    this.setData({
      extVisible: true,
      extDate: date,
      extDateLabel: (next.getMonth() + 1) + '月' + next.getDate() + '日 ' + F.week(next),
      extClock: F.hm(base),
      extReason: ''
    })
  },

  onExtDate(e) {
    const p = F.parseTime(e.detail.value)
    this.setData({
      extDate: e.detail.value,
      extDateLabel: (p.getMonth() + 1) + '月' + p.getDate() + '日 ' + F.week(p)
    })
  },

  onExtClock(e) {
    this.setData({ extClock: e.detail.value })
  },

  onExtReason(e) {
    this.setData({ extReason: e.detail.value })
  },

  closeExtension() {
    this.setData({ extVisible: false })
  },

  /** 提交续假：时间必须晚于原结束时间（后端还会再校验一次） */
  async submitExtension() {
    const d = this.data.d
    const t = this.data.extDate + ' ' + this.data.extClock + ':00'
    const target = F.parseTime(t)
    const origin = F.parseTime(d.endTime)
    const baseline = origin.getTime() > Date.now() ? origin : new Date()

    if (target.getTime() <= baseline.getTime()) {
      wx.showToast({ title: '续假后的结束时间必须晚于原结束时间', icon: 'none' })
      return
    }
    if ((this.data.extReason || '').trim().length < 3) {
      wx.showToast({ title: '请填写续假原因', icon: 'none' })
      return
    }

    try {
      await post('/student/applications/' + d.applicationId + '/extensions', {
        requestedEndTime: t,
        reason: this.data.extReason.trim()
      })
      wx.showToast({ title: '已提交，等待审批', icon: 'success' })
      this.setData({ extVisible: false })
      setTimeout(() => this.load(), 600)
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    }
  },

  onBack() {
    // 页面栈只有一页时（比如从分享直接进入），退回首页更合理
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/student/home/home' })
    }
  }
})

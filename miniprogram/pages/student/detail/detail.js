/**
 * pages/student/detail/detail.js —— 请假详情（M2 只读）
 *
 * M2 只做"看得清"：状态、流程时间轴、申请信息、材料、销假记录、续假。
 * M3 再挂"能操作"：销假 / 撤回 / 取消 / 续假 / 人工核验。
 *
 * 操作按钮由后端 actions 字段决定显示哪些 —— 前端不自己判断状态，
 * 避免"界面能点但接口 422"的割裂。
 */
const { get } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

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
    error: ''
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
   * M2：全部提示"下一步完成"；M3 逐个接上真实接口。
   */
  onAction(e) {
    const action = e.currentTarget.dataset.action
    wx.showToast({ title: '该操作将在下一步（M3）完成', icon: 'none' })
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

/**
 * pages/student/home/home.js —— 首页（五态自适应）
 *
 * 数据来源：GET /student/home（后端一次性返回 当前请假 + 最近记录 + 统计）
 * 一次请求渲染整页，避免首页发 3~4 个请求导致"分块跳出来"。
 *
 * 五种状态（对应 04 方案与 formal-v2 NOTES §3）：
 *   A  请假中   → 大数字「还剩」+ 刻度尺 + 已过/共 + 销假 CTA
 *   B  待审批   → 大数字「已等待」+ 四步流程 + 撤回
 *   C  逾期     → 红色大数字「逾期」+ 红色刻度尺 + 补销假 CTA
 *   D  当前无请假（有历史）→ 场景卡 + 本学期概览 + 最近记录
 *   E  零记录   → 场景卡 + 请假须知
 *
 * 另外，刚销假完（24 小时内）会显示「本次请假已完成 + 再请一次」，
 * 这是即时反馈，比立刻跳回场景卡更符合预期。
 */
const { get } = require('../../../utils/request')
const { getToken, getUser } = require('../../../utils/auth')
const F = require('../../../utils/format')

Page({
  data: {
    loading: true,
    error: '',
    /** 状态栏高度（自定义导航栏时手动避开） */
    statusBarHeight: 20,

    // 头部
    greeting: '你好',
    dateLine: '',

    // 主卡片
    hasHero: false,          // 有没有"当前请假"要展示
    showClosedHero: false,   // 刚结束的请假（24h 内）
    stateWord: '',
    stateCls: '',
    sceneType: '',           // "请假中 · 离校 · 事假"

    rangeText: '',
    bigLabel: '',
    bigText: '',
    bigDanger: false,

    showRuler: false,
    rulerPercent: 0,
    rulerLabels: [],
    rulerNowText: '',
    rulerDanger: false,

    readLeftPre: '',
    readLeftStrong: '',
    readLeftRest: '',
    readRight: '',

    showFlow: false,
    flowSteps: [],

    facts: [],               // [{label, value}]

    ctaText: '',
    ctaGhost: false,
    ctaAction: '',           // checkin / detail / apply
    links: [],               // [{text, danger, action}]

    // 无请假时
    showScene: false,
    showOverview: false,
    overview: null,
    showRules: true,
    // 序号在 JS 里预格式化好，避免在 WXML 表达式里写比较运算（容易踩解析坑）
    rules: [
      { no: '01', text: '离校请假，返校后需在校区范围内定位销假' },
      { no: '02', text: '校内请假，结束后由本人确认完成' },
      { no: '03', text: '病假申请需随单上传就诊材料' },
      { no: '04', text: '续假需重新提交申请并等待审批' }
    ],

    // 最近记录
    recent: [],
    counselorName: '',
    className: '',
    /** 驳回原因（仅「已驳回」态有值） */
    rejectReason: '',

    /** 当前主卡片的原始数据（点击跳详情时取 applicationId） */
    currentRaw: null
  },

  onLoad() {
    // 未登录直接踢回登录页（兜底：正常情况下 app.js 启动时已处理）
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    // 自定义导航栏：手动避开状态栏（不同机型高度不同，必须动态取）
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: info.statusBarHeight || 20 })
  },

  onShow() {
    // 同步 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.load()
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  /**
   * 加载首页数据。
   * 用 Promise 包一层，方便下拉刷新等 await。
   */
  async load() {
    try {
      const data = await get('/student/home')
      this.applyData(data)
      this.setData({ loading: false, error: '' })
      this.syncBadge()
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  /** 把接口数据翻译成视图数据（所有时间/百分比计算集中在这里） */
  applyData(d) {
    const now = F.parseTime(d.now)
    const student = d.student || {}
    const user = getUser() || {}
    const stats = d.stats || {}

    // ---- 头部 ----
    const dateLine = [
      (now.getMonth() + 1) + '月' + now.getDate() + '日',
      F.week(now),
      student.className
    ].filter(Boolean).join(' · ')

    const view = {
      greeting: F.greeting(now) + '，' + (student.realName || user.realName || '同学'),
      dateLine,
      counselorName: student.counselorName || '',
      className: student.className || '',
      recent: (d.recent || []).map(r => ({
        id: r.applicationId,
        no: r.applicationNo,
        date: F.md(r.startTime),
        summary: r.summary,
        statusText: F.statusChip(r.effectiveStatus).label,
        chip: F.statusChip(r.effectiveStatus).chip
      })),
      overview: {
        off: stats.offCampusCount || 0,
        on: stats.onCampusCount || 0,
        avg: stats.averageDays || 0
      }
    }

    const hero = d.current

    if (!hero) {
      // ---- 态 E：零记录 ----
      Object.assign(view, {
        hasHero: false,
        showClosedHero: false,
        showScene: true,
        showOverview: false,
        showRules: true,
        recent: [],
        currentRaw: null
      })
      this.setData(view)
      return
    }

    const es = hero.effectiveStatus
    const chip = F.statusChip(es)
    const isClosed = ['COMPLETED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'].indexOf(es) >= 0

    // 已结束的申请：只有"刚结束 24 小时内"才作为主卡片展示，否则回到场景卡（态 D）
    if (isClosed) {
      const refTime = F.parseTime(hero.completedAt || hero.endTime)
      const within24h = (now.getTime() - refTime.getTime()) < 24 * 3600 * 1000
      if (!within24h) {
        Object.assign(view, {
          hasHero: false,
          showClosedHero: false,
          showScene: true,
          showOverview: true,
          showRules: false,
          currentRaw: null
        })
        this.setData(view)
        return
      }
    }

    // ---- 主卡片 ----
    const sceneType = chip.label + ' · ' + F.sceneLabel(hero.leaveScene) + ' · ' + F.typeLabel(hero.leaveType)

    // 区间文字
    let rangeText = ''
    if (es === 'PENDING') {
      rangeText = '申请区间 ' + F.md(hero.startTime) + ' ' + F.hm(hero.startTime) +
        ' — ' + F.md(hero.endTime) + ' ' + F.hm(hero.endTime)
    } else {
      rangeText = F.md(hero.startTime) + ' ' + F.hm(hero.startTime) +
        ' — ' + F.md(hero.endTime) + ' ' + F.hm(hero.endTime)
    }

    // 大数字 + 刻度尺 + 读数 + 流程 + 按钮
    let bigLabel = '', bigText = '', bigDanger = false
    let showRuler = false, rulerPercent = 0, rulerLabels = [], rulerNowText = '', rulerDanger = false
    let readLeftPre = '', readLeftStrong = '', readLeftRest = '', readRight = ''
    let showFlow = false, flowSteps = []
    let ctaText = '', ctaGhost = false, ctaAction = ''
    let links = []
    let facts = []

    if (es === 'IN_PROGRESS') {
      // ---- 态 A ----
      bigLabel = '还剩'
      bigText = F.clockText(hero.remainingMillis)
      showRuler = true
      rulerPercent = this.percent(hero.elapsedMillis, hero.totalMillis)
      rulerLabels = this.buildLabels(hero.startTime, hero.endTime)
      rulerNowText = '现在 ' + F.hm(now)
      readLeftPre = '已过 '
      readLeftStrong = F.partsText(hero.elapsedMillis)
      readRight = '共 ' + F.partsText(hero.totalMillis)
      ctaText = hero.leaveScene === 'OFF_CAMPUS' ? '返校定位并销假' : '确认结束本次请假'
      ctaAction = 'checkin'
      links = [{ text: '申请续假', action: 'extension' }, { text: '查看详情', action: 'detail' }]
      facts = [
        { label: '审批', value: (hero.approvedBy || '辅导员') + ' ' + (hero.approvedAt ? F.mdhm(hero.approvedAt) : '') },
        { label: '销假', value: hero.leaveScene === 'OFF_CAMPUS' ? '返校定位' : '自主确认' }
      ]
      if (hero.hasPendingExtension) {
        links[0] = { text: '续假审批中', action: 'none' }
      }
    } else if (es === 'OVERDUE') {
      // ---- 态 C ----
      bigLabel = '逾期'
      bigText = F.clockText(hero.overdueMillis)
      bigDanger = true
      showRuler = true
      rulerDanger = true
      rulerPercent = 100
      rulerLabels = this.buildLabels(hero.startTime, hero.endTime)
      rulerNowText = ''
      readLeftStrong = F.hm(hero.endTime)
      readLeftRest = ' 已到期'
      readRight = '未销假'
      ctaText = '立即补销假'
      ctaAction = 'checkin'
      links = [{ text: '查看详情', action: 'detail' }]
      facts = [
        { label: '审批', value: (hero.approvedBy || '辅导员') + ' ' + (hero.approvedAt ? F.mdhm(hero.approvedAt) : '') }
      ]
    } else if (es === 'PENDING') {
      // ---- 态 B ----
      bigLabel = '已等待'
      bigText = F.clockText(hero.waitingMillis)
      showFlow = true
      flowSteps = [
        { t: '提交', s: F.mdhm(hero.submittedAt), st: 'is-done' },
        { t: '审批', s: '处理中', st: 'is-now' },
        { t: '生效', s: F.md(hero.startTime), st: '' },
        { t: '销假', s: '—', st: '' }
      ]
      ctaText = '查看申请详情'
      ctaGhost = true
      ctaAction = 'detail'
      links = [{ text: '撤回申请', danger: true, action: 'withdraw' }]
      facts = [
        { label: '提交', value: F.mdhm(hero.submittedAt) },
        { label: '审批', value: hero.approvedBy || '待分配' }
      ]
    } else if (es === 'WAITING_START') {
      // ---- 已通过未开始 ----
      bigLabel = '还有'
      bigText = F.clockText(hero.beforeStartMillis)
      readLeftStrong = F.mdCN(hero.startTime) + ' ' + F.hm(hero.startTime)
      readLeftRest = ' 开始'
      readRight = '共 ' + F.partsText(hero.totalMillis)
      ctaText = '查看申请详情'
      ctaGhost = true
      ctaAction = 'detail'
      links = [{ text: '取消申请', danger: true, action: 'cancel' }]
      facts = [
        { label: '审批', value: (hero.approvedBy || '辅导员') + ' ' + (hero.approvedAt ? F.mdhm(hero.approvedAt) : '') },
        { label: '销假', value: hero.leaveScene === 'OFF_CAMPUS' ? '返校定位' : '自主确认' }
      ]
    } else {
      // ---- 刚结束（24h 内）：已完成 / 已驳回 / 已关闭 ----
      bigLabel = ''
      bigText = es === 'COMPLETED' ? '本次请假已完成'
        : es === 'REJECTED' ? '申请未通过' : '本次申请已关闭'
      ctaText = '再请一次'
      ctaAction = 'apply'
      links = [{ text: '查看详情', action: 'detail' }]
      facts = [
        { label: '审批', value: (hero.approvedBy || '辅导员') + ' ' + (hero.approvedAt ? F.mdhm(hero.approvedAt) : '') }
      ]
    }

    Object.assign(view, {
      hasHero: true,
      showClosedHero: isClosed,
      stateWord: sceneType,
      stateCls: chip.cls,
      rangeText,
      bigLabel, bigText, bigDanger,
      showRuler, rulerPercent, rulerLabels, rulerNowText, rulerDanger,
      readLeftPre, readLeftStrong, readLeftRest, readRight,
      showFlow, flowSteps,
      facts,
      ctaText, ctaGhost, ctaAction, links,
      showScene: false,
      showOverview: false,
      showRules: false,
      currentRaw: hero,
      // 驳回原因单独放（详情里也有，首页只做提示）
      rejectReason: es === 'REJECTED' ? (hero.rejectReason || '') : ''
    })

    this.setData(view)
  },

  /**
   * 百分比计算，限制在 0-100。
   * 用 Math.round 到 1 位小数，避免超长小数字符串传给 wxml。
   */
  percent(elapsed, total) {
    if (!total || total <= 0) return 0
    const p = (elapsed / total) * 100
    return Math.max(0, Math.min(100, Math.round(p * 10) / 10))
  },

  /**
   * 生成 7 个刻度标签（区间均分 6 段）。
   * 同一天显示小时（08 10 12...），跨天显示日期（10.20 10.21...）。
   * 与 formal-v2 的 rulerHTML 规则一致。
   */
  buildLabels(startStr, endStr) {
    const start = F.parseTime(startStr)
    const end = F.parseTime(endStr)
    const total = end.getTime() - start.getTime()
    const sameDay = start.toDateString() === end.toDateString()

    const labels = []
    for (let i = 0; i < 7; i++) {
      const t = new Date(start.getTime() + (total * i) / 6)
      labels.push(sameDay
        ? (t.getHours() < 10 ? '0' + t.getHours() : '' + t.getHours())
        : F.md(t))
    }
    return labels
  },

  /** 同步消息未读数到 tabBar 角标 */
  async syncBadge() {
    try {
      const res = await get('/student/messages/unread-count')
      const unread = res.unread || 0
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ unread })
      }
    } catch (e) {
      // 角标失败不影响主流程，静默忽略
    }
  },

  // ==================== 交互 ====================

  /** 主按钮 */
  onCta() {
    this.handleAction(this.data.ctaAction)
  },

  /** 底部文字按钮 */
  onLink(e) {
    this.handleAction(e.currentTarget.dataset.action)
  },

  /**
   * 动作分发。
   * M2 阶段：detail 跳详情页；checkin / apply / withdraw / cancel 属于 M3 流程，先给提示。
   */
  handleAction(action) {
    const hero = this.data.currentRaw
    switch (action) {
      case 'detail':
        wx.navigateTo({ url: '/pages/student/detail/detail?id=' + (hero || {}).applicationId })
        break
      case 'checkin':
      case 'apply':
      case 'extension':
      case 'withdraw':
      case 'cancel':
        wx.showToast({ title: '该功能将在下一步（M3）完成', icon: 'none' })
        break
      case 'none':
        break
      default:
        break
    }
  },

  /** 场景卡：去申请请假（M3 实现） */
  onApply(e) {
    const scene = e.currentTarget.dataset.scene
    wx.showToast({ title: F.sceneLabel(scene === 'OFF' ? 'OFF_CAMPUS' : 'ON_CAMPUS') + '请假将在 M3 完成', icon: 'none' })
  },

  /** 最近记录点击 */
  onOpenRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/student/detail/detail?id=' + id })
  },

  /** 全部记录 */
  onAllRecords() {
    wx.switchTab({ url: '/pages/student/records/records' })
  }
})

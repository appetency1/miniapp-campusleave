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
const { get, post } = require('../../../utils/request')
const { getToken, getUser } = require('../../../utils/auth')
const { getBaseUrl, probe, setBaseUrl } = require('../../../utils/server')
const F = require('../../../utils/format')

Page({
  data: {
    loading: true,
    error: '',
    /** 出错时把当前生效的后端地址显示在页面上 —— 真机排查时一眼看出连的是谁 */
    errBaseUrl: '',
    /** 状态栏高度（自定义导航栏时手动避开） */
    statusBarHeight: 20,

    // 头部
    greeting: '你好',
    dateLine: '',

    // 主卡片
    hasHero: false,          // 有没有"当前请假"要展示
    stateMain: '',           // 第一优先级：待审批 / 请假中 / 逾期
    stateSub: '',            // 第二优先级：离校 · 病假
    stateCls: '',            // 状态色类（state--warn / state--done）
    sceneType: '',           // "请假中 · 离校 · 事假"（旧字段，保留兼容）

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
    /** 除主卡片外还有几条待处理 */
    othersPending: 0,
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
      this.setData({ loading: false, error: err.message || '加载失败', errBaseUrl: getBaseUrl() })
      // 地址类失败（换 WiFi / 热点后 IP 变了）自动纠正一次，不让用户去登录页手动改
      this.autoFixBaseUrl()
    }
  },

  /**
   * 后端地址自动纠正。
   *
   * <p>真机调试最常见的坑：换网络后电脑 IP 变了，而手机 storage 里存着上次的地址，
   * 页面只会显示"请求失败"。这里在失败后探测一次常见网段，找到就把地址改掉并重试。
   *
   * <p>只有检测到"另一个可用地址"才重试 —— 如果当前地址本身是通的（说明是业务错误），
   * probe 会返回同一个 host，此时直接放弃，避免无限重试。
   */
  async autoFixBaseUrl() {
    if (this._fixing) return
    this._fixing = true
    wx.showLoading({ title: '正在查找后端…', mask: true })
    try {
      const host = await probe()
      wx.hideLoading()
      if (!host) return
      const next = setBaseUrl(host + ':8080')
      if (next && next !== this.data.errBaseUrl) {
        wx.showToast({ title: '已连接 ' + host, icon: 'none' })
        this.load()
      }
    } catch (e) {
      wx.hideLoading()
    } finally {
      this._fixing = false
    }
  },

  /** 把接口数据翻译成视图数据（所有时间/百分比计算集中在这里） */
  applyData(d) {
    const now = F.parseTime(d.now)
    const student = d.student || {}
    const user = getUser() || {}
    const stats = d.stats || {}

    // ---- 头部 ----
    // 只留日期 + 星期。班级属于个人资料，放「我的」页 —— 首页不需要它抢注意力。
    const dateLine = [
      (now.getMonth() + 1) + '月' + now.getDate() + '日',
      F.week(now)
    ].filter(Boolean).join(' · ')

    const view = {
      greeting: F.greeting(now) + '，' + (student.realName || user.realName || '同学'),
      dateLine,
      counselorName: student.counselorName || '',
      othersPending: d.othersPending || 0,
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
      // ---- 没有需要处理的请假 ----
      // 有历史 → 场景卡 + 本学期概览 + 最近记录（态 D）
      // 零记录 → 场景卡 + 请假须知（态 E）
      const hasHistory = (stats.totalApplications || 0) > 0
      Object.assign(view, {
        hasHero: false,
        showScene: true,
        showOverview: hasHistory,
        showRules: !hasHistory,
        currentRaw: null,
        othersPending: 0,
        // 清掉主卡片相关字段：虽然 wxml 里它们包在 wx:if="{{hasHero}}" 内不会渲染，
        // 但留着旧值会让 data 里出现"没有主卡片却还写着请假中"的脏状态
        stateMain: '', stateSub: '', stateCls: '', rangeText: '', bigLabel: '', bigText: '',
        showRuler: false, flowSteps: [], facts: [], ctaText: '', links: [],
        readLeftPre: '', readLeftStrong: '', readLeftRest: '', readRight: '',
        rejectReason: ''
      })
      this.setData(view)
      return
    }

    const es = hero.effectiveStatus
    const chip = F.statusChip(es)

    // ---- 主卡片 ----
    // 拆成两级：状态词是用户第一眼要找的，类型是补充说明。
    // 原来拼成一句"待审批 · 离校 · 病假"，三个信息等重，反而没有重点。
    const sceneType = chip.label + ' · ' + F.sceneLabel(hero.leaveScene) + ' · ' + F.typeLabel(hero.leaveType)
    const stateMain = chip.label
    const stateSub = F.sceneLabel(hero.leaveScene) + ' · ' + F.typeLabel(hero.leaveType)

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
      bigText = F.durationText(hero.remainingMillis)
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
      bigText = F.durationText(hero.overdueMillis)
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
      bigText = F.durationText(hero.waitingMillis)
      showFlow = true
      flowSteps = [
        { t: '提交', s: F.mdhm(hero.submittedAt), st: 'is-done' },
        { t: '审批', s: '处理中', st: 'is-now' },
        { t: '生效', s: F.md(hero.startTime), st: '' },
        { t: '销假', s: '—', st: '' }
      ]
      ctaText = '查看详情'
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
      bigText = F.durationText(hero.beforeStartMillis)
      readLeftStrong = F.mdCN(hero.startTime) + ' ' + F.hm(hero.startTime)
      readLeftRest = ' 开始'
      readRight = '共 ' + F.partsText(hero.totalMillis)
      ctaText = '查看详情'
      ctaGhost = true
      ctaAction = 'detail'
      // 已通过 = 假已批下来，这里取消的是"本次请假"，不是"申请"
      links = [{ text: '取消本次请假', danger: true, action: 'cancel' }]
      facts = [
        { label: '审批', value: (hero.approvedBy || '辅导员') + ' ' + (hero.approvedAt ? F.mdhm(hero.approvedAt) : '') },
        { label: '销假', value: hero.leaveScene === 'OFF_CAMPUS' ? '返校定位' : '自主确认' }
      ]
    } else {
      // ---- 兜底：后端理论上不会把已结束的申请当主卡片返回，这里只作防御 ----
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
      stateMain, stateSub, sceneType,
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
   * checkin：离校跳销假页；校内用二次确认 + 直接调接口（无需定位）
   * apply：跳申请页并预选场景
   * 其余（续假/撤回/取消）都进详情页操作，保证按钮与状态守卫只有一处实现
   */
  handleAction(action) {
    const hero = this.data.currentRaw || {}
    switch (action) {
      case 'detail':
        wx.navigateTo({ url: '/pages/student/detail/detail?id=' + hero.applicationId })
        break

      case 'checkin':
        if (hero.leaveScene === 'OFF_CAMPUS') {
          wx.navigateTo({
            url: '/pages/student/checkin/checkin?id=' + hero.applicationId + '&no=' + (hero.applicationNo || '')
          })
        } else {
          this.confirmOnCampusCheckin(hero)
        }
        break

      case 'apply':
        wx.navigateTo({ url: '/pages/student/apply/apply' })
        break

      case 'extension':
      case 'withdraw':
      case 'cancel':
        wx.navigateTo({ url: '/pages/student/detail/detail?id=' + hero.applicationId })
        break

      case 'none':
        break
      default:
        break
    }
  },

  /** 校内请假：二次确认后直接完成（不需要定位） */
  confirmOnCampusCheckin(hero) {
    wx.showModal({
      title: '确认结束本次请假',
      content: '确认后本次请假将标记为已完成，不可撤销。',
      confirmText: '确认结束',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await post('/student/applications/' + hero.applicationId + '/checkin/on-campus')
          wx.showToast({ title: '已结束', icon: 'success' })
          this.load()
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  /** 场景卡：去申请请假，带上预选场景 */
  onApply(e) {
    const scene = e.currentTarget.dataset.scene === 'ON' ? 'ON_CAMPUS' : 'OFF_CAMPUS'
    wx.navigateTo({ url: '/pages/student/apply/apply?scene=' + scene })
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

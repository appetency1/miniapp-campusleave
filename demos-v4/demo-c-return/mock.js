// mock.js —— 唯一数据源（原型阶段）。视图层所有可见字段均来自此处，禁止在 HTML/JS 里写死数据。
window.MOCK = {
  meta: {
    brand: 'CampusLeave',
    screenTitle: '离校返校销假',
    now: { date: '10-18', week: '周六', time: '11:32', clock: '11:32:16' }
  },

  // 申请人
  user: {
    name: '林晚',
    studentId: '2023011408',
    className: '计算机 2301',
    counselor: '张明',
    phone: '138****6621'
  },

  // 行程：校外 → 校内
  trip: { from: '校外 · 江城', to: '明德大学 · 本部' },

  // 旗舰请假申请
  leave: {
    id: 'LA20261018001',
    type: '事假',
    scene: '离校',
    period: '10-18 08:00 — 14:00',
    start: '10-18 08:00',
    end: '10-18 14:00',
    reason: '回家处理家事',
    destination: '校外 江城',
    phone: '138****6621',
    approval: { code: 'APPROVED', label: '已批准' },
    status: { code: 'IN_PROGRESS', label: '请假中' }
  },

  // 倒计时基准：11:32:16 → 14:00（10030 秒）
  countdown: { seconds: 10030, base: '11:32:16', end: '14:00' },

  // 销假时间线（Step 3）
  timeline: [
    { time: '10-17 20:12', title: '提交申请', meta: '事假 · 离校 · 08:00—14:00', icon: 'file-text' },
    { time: '10-17 21:04', title: '审批通过', meta: '张明 · 辅导员', icon: 'user-check' },
    { time: '10-18 08:00', title: '请假开始', meta: '离开校园 · 校外 江城', icon: 'log-out' },
    { time: '10-18 11:32', title: '返校销假', meta: 'GPS 距校门 128 米', icon: 'navigation' }
  ],

  // 定位模拟两态
  locate: {
    loadingText: '正在获取位置…',
    steps: ['已获取卫星定位', '正在校验距离…'],
    pass: {
      state: 'pass',
      status: '定位校验通过',
      distance: 128,
      unit: '米',
      decimals: 0,
      display: '校验通过 · 正在完成销假'
    },
    fail: {
      state: 'fail',
      status: '定位校验未通过',
      distance: 2.4,
      unit: '公里',
      decimals: 1,
      display: '当前距校门 2.4 公里，超出 500 米允许范围'
    }
  },

  // 人工核验语义
  review: {
    pendingLabel: '待核验',
    reviewStatus: 'PENDING_REVIEW',
    note: '人工核验申请已提交，辅导员将尽快复核后完成销假。'
  },

  // stub 返回数据（api.js 消费）
  api: {
    requestReturnCheckin: { ref: 'LA20261018001' },
    confirmReturnCheckin: { actualEnd: '10-18 11:32', distanceMeters: 128 },
    applyRenewal: { message: '续假申请已提交，等待辅导员审批' },
    submitManualVerify: { message: '人工核验申请已提交', reviewStatus: 'PENDING_REVIEW' }
  }
};

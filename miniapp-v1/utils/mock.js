// utils/mock.js —— 唯一数据源（视图层一律从这里取数，禁止在页面里写死业务数据）
// 与后端契约对应：见 utils/api.js 中每个桩函数的 // TODO 注释

const DB = {
  // 当前登录学生
  student: {
    name: '林晚',
    sid: '2023011408',
    className: '计算机 2301',
    college: '计算机与信息学院',
    counselor: '张明',
    counselorWorkNo: 'T2019007',
    phone: '138****6621',
    avatarText: '林'
  },

  // 演示基准时间（真实项目由服务端时间下发）
  meta: {
    now: '2026-10-18 11:32:16',
    dateText: '10 月 18 日 周一',
    weather: '晴 21°'
  },

  // 本人请假申请（8 条，覆盖全部主状态，用于筛选与空态演示）
  applications: [
    {
      id: 'A001',
      no: 'LA20261018001',
      scene: 'OFF_CAMPUS',
      type: '事假',
      startTime: '2026-10-18 08:00:00',
      endTime: '2026-10-18 14:00:00',
      actualEndTime: null,
      status: 'APPROVED',
      reason: '回家处理家事，当天往返',
      destination: '校外 · 江城',
      phone: '138****6621',
      submittedAt: '2026-10-17 20:12:00',
      approvedBy: '张明',
      approvedAt: '2026-10-17 21:04:00',
      logs: [
        { action: 'SUBMIT', label: '提交申请', at: '2026-10-17 20:12:00', by: '林晚' },
        { action: 'APPROVE', label: '审批通过', at: '2026-10-17 21:04:00', by: '张明' },
        { action: 'START', label: '请假开始', at: '2026-10-18 08:00:00', by: '系统' }
      ]
    },
    {
      id: 'A002',
      no: 'LA20261018004',
      scene: 'ON_CAMPUS',
      type: '病假',
      startTime: '2026-10-19 19:00:00',
      endTime: '2026-10-19 21:30:00',
      actualEndTime: null,
      status: 'APPROVED',
      reason: '校医院就诊，需晚间休息',
      destination: '',
      phone: '138****6621',
      submittedAt: '2026-10-18 09:40:00',
      approvedBy: '张明',
      approvedAt: '2026-10-18 10:15:00'
    },
    {
      id: 'A003',
      no: 'LA20261016003',
      scene: 'ON_CAMPUS',
      type: '病假',
      startTime: '2026-10-16 10:00:00',
      endTime: '2026-10-16 12:00:00',
      actualEndTime: '2026-10-16 11:48:00',
      status: 'COMPLETED',
      reason: '身体不适，宿舍休息',
      destination: '',
      phone: '138****6621',
      submittedAt: '2026-10-16 08:22:00',
      approvedBy: '张明',
      approvedAt: '2026-10-16 08:51:00'
    },
    {
      id: 'A004',
      no: 'LA20261014002',
      scene: 'OFF_CAMPUS',
      type: '事假',
      startTime: '2026-10-14 08:00:00',
      endTime: '2026-10-14 12:00:00',
      actualEndTime: '2026-10-14 11:35:00',
      status: 'COMPLETED',
      reason: '办理身份证换证',
      destination: '校外 · 江城 · 政务中心',
      phone: '138****6621',
      submittedAt: '2026-10-13 19:05:00',
      approvedBy: '张明',
      approvedAt: '2026-10-13 20:10:00'
    },
    {
      id: 'A005',
      no: 'LA20261012001',
      scene: 'OFF_CAMPUS',
      type: '实习',
      startTime: '2026-10-12 06:00:00',
      endTime: '2026-10-13 20:00:00',
      actualEndTime: null,
      status: 'REJECTED',
      reason: '参加校企合作企业实习',
      destination: '校外 · 江城 · 高新区',
      phone: '138****6621',
      submittedAt: '2026-10-11 15:30:00',
      approvedBy: '张明',
      approvedAt: '2026-10-11 16:20:00',
      rejectReason: '实习证明未上传，请补充材料后重新提交'
    },
    {
      id: 'A006',
      no: 'LA20261011003',
      scene: 'ON_CAMPUS',
      type: '事假',
      startTime: '2026-10-11 14:00:00',
      endTime: '2026-10-11 17:00:00',
      actualEndTime: null,
      status: 'WITHDRAWN',
      reason: '参加学院社团活动',
      destination: '',
      phone: '138****6621',
      submittedAt: '2026-10-11 09:12:00'
    },
    {
      id: 'A007',
      no: 'LA20261010002',
      scene: 'OFF_CAMPUS',
      type: '病假',
      startTime: '2026-10-10 08:00:00',
      endTime: '2026-10-10 18:00:00',
      actualEndTime: null,
      status: 'CANCELLED',
      reason: '外出就医复查',
      destination: '校外 · 江城 · 第一医院',
      phone: '138****6621',
      submittedAt: '2026-10-09 21:00:00',
      approvedBy: '张明',
      approvedAt: '2026-10-09 21:40:00',
      cancelReason: '复查改约到下周，本次取消'
    },
    {
      id: 'A008',
      no: 'LA20261008001',
      scene: 'OFF_CAMPUS',
      type: '事假',
      startTime: '2026-10-08 09:00:00',
      endTime: '2026-10-08 12:00:00',
      actualEndTime: '2026-10-08 11:52:00',
      status: 'COMPLETED',
      reason: '参加校外考试',
      destination: '校外 · 江城 · 考试中心',
      phone: '138****6621',
      submittedAt: '2026-10-07 18:40:00',
      approvedBy: '张明',
      approvedAt: '2026-10-07 19:15:00'
    }
  ],

  // 首页状态卡：以当前有效的申请为准（真实项目由后端计算 effective_status 后下发）
  homeFocusId: 'A001',

  // 统计口径（学生看自己）：申请数 / 审批通过数 / 已完成数 / 当前逾期数
  stats: {
    total: 8,
    approved: 3,
    completed: 4,
    overdue: 1
  },

  // 表单选项
  options: {
    scenes: [
      { value: 'OFF_CAMPUS', label: '离校' },
      { value: 'ON_CAMPUS', label: '校内' }
    ],
    types: ['事假', '病假', '实习', '其他']
  },

  // 定位校验演示数据（真实项目由后端返回距离与阈值）
  locate: {
    radiusLimit: 500,
    pass: { distance: 128, unit: '米', label: '距校门 128 米' },
    fail: { distance: 2.4, unit: '公里', label: '距校门 2.4 公里' }
  },

  // 通知（我的页角标用）
  notice: { unread: 2 }
};

module.exports = { DB };

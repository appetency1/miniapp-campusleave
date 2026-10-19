/* ============================================================
   CampusLeave · Demo A「晨光」学生端首页
   mock.js —— 唯一数据源
   ------------------------------------------------------------
   本文件集中存放全部演示假数据（学生 / 环境 / 请假记录 / 状态文案 /
   定位两态 / 接口时延）。视图层一律从此文件渲染，
   严禁在 index.html 或 app.js 里写死任何业务数据。
   ============================================================ */
(function () {
  'use strict';

  /* 演示基准时间：2026-10-18 11:32:16（周一 · 晴 21°） */
  var BASE_TIME = '2026-10-18 11:32:16';

  /* ---- 学生主体 ---- */
  var student = {
    name: '林晚',
    initial: '林',
    no: '2023011408',
    className: '计算机 2301',
    counselor: '张明'
  };

  /* ---- 环境信息（问候语 / 日期行 / 顶栏时钟初值） ---- */
  var env = {
    appName: '校园请假',
    greeting: '早安，' + student.name,
    dateLine: '10 月 18 日 周一 · 晴 21° · ' + student.className,
    baseTime: BASE_TIME,
    baseClock: '11:32'
  };

  /* ---- 文案映射 ---- */
  var statusText = {
    PENDING: '待审批',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    WITHDRAWN: '已撤回',
    CANCELLED: '已取消',
    COMPLETED: '已完成'
  };

  var effectiveText = {
    WAITING_START: '待开始',
    IN_PROGRESS: '请假中',
    OVERDUE: '已逾期'
  };

  var typeText = { PERSONAL: '事假', SICK: '病假', INTERN: '实习' };
  var sceneText = { OFF: '离校', ON: '校内' };

  /* ---- 胶囊筛选 ---- */
  var filters = [
    { key: 'ALL', label: '全部' },
    { key: 'ACTIVE', label: '进行中' },
    { key: 'PENDING', label: '待审批' },
    { key: 'DONE', label: '已完成' }
  ];

  /* ---- 请假记录（林晚本人 · 8 条） ---- */
  var records = [
    {
      no: 'LA20261018001', scene: 'OFF', type: 'PERSONAL',
      startAt: '2026-10-18 08:00', endAt: '2026-10-18 14:00',
      status: 'APPROVED', effective: 'IN_PROGRESS',
      scenePlace: '校外', place: '江城 → 明德大学',
      reason: '家中有事需回江城处理，已与家长沟通，返校后按时完成定位销假。',
      submittedAt: '2026-10-17 20:41', approver: '张明', approvedAt: '2026-10-17 21:04',
      comment: '同意，请注意出行安全，返校后完成定位销假。'
    },
    {
      no: 'LA20261018004', scene: 'ON', type: 'SICK',
      startAt: '2026-10-19 19:00', endAt: '2026-10-19 21:30',
      status: 'APPROVED', effective: 'WAITING_START',
      scenePlace: '校内', place: '明德大学',
      reason: '夜间发热，校医务室建议留观休息，本次不离校。',
      submittedAt: '2026-10-18 09:12', approver: '张明', approvedAt: '2026-10-18 10:03',
      comment: '同意，注意休息，如不适加重请及时联系校医院。'
    },
    {
      no: 'LA20261016003', scene: 'ON', type: 'SICK',
      startAt: '2026-10-16 10:00', endAt: '2026-10-16 12:00',
      status: 'COMPLETED', effective: '',
      scenePlace: '校内', place: '明德大学',
      reason: '感冒不适，前往校医院就诊后回宿舍休息。',
      submittedAt: '2026-10-16 09:36', approver: '张明', approvedAt: '2026-10-16 09:51',
      completedAt: '2026-10-16 12:06', comment: '同意，注意保暖。'
    },
    {
      no: 'LA20261014002', scene: 'OFF', type: 'PERSONAL',
      startAt: '2026-10-14 08:00', endAt: '2026-10-14 12:00',
      status: 'COMPLETED', effective: '',
      scenePlace: '校外', place: '江城 → 明德大学',
      reason: '办理个人证件，需离校前往江城政务大厅。',
      submittedAt: '2026-10-13 22:18', approver: '张明', approvedAt: '2026-10-13 22:40',
      completedAt: '2026-10-14 12:14', comment: '同意，按时返校销假。'
    },
    {
      no: 'LA20261012001', scene: 'OFF', type: 'INTERN',
      startAt: '2026-10-12 06:00', endAt: '2026-10-13 20:00',
      status: 'REJECTED', effective: '',
      scenePlace: '校外', place: '江城 · 星海科技园',
      reason: '参加校企合作实习，需前往企业报到。',
      submittedAt: '2026-10-11 18:22', approver: '张明', approvedAt: '2026-10-11 19:05',
      rejectReason: '实习证明未上传'
    },
    {
      no: 'LA20261011003', scene: 'ON', type: 'PERSONAL',
      startAt: '2026-10-11 14:00', endAt: '2026-10-11 17:00',
      status: 'WITHDRAWN', effective: '',
      scenePlace: '校内', place: '明德大学',
      reason: '前往图书馆整理毕业设计资料。',
      submittedAt: '2026-10-11 11:40', approver: '', approvedAt: ''
    },
    {
      no: 'LA20261010002', scene: 'OFF', type: 'SICK',
      startAt: '2026-10-10 08:00', endAt: '2026-10-10 18:00',
      status: 'CANCELLED', effective: '',
      scenePlace: '校外', place: '江城 · 市第一医院',
      reason: '按医嘱前往市医院复查。',
      submittedAt: '2026-10-09 21:12', approver: '张明', approvedAt: '2026-10-09 21:48'
    },
    {
      no: 'LA20261008001', scene: 'OFF', type: 'PERSONAL',
      startAt: '2026-10-08 09:00', endAt: '2026-10-08 12:00',
      status: 'COMPLETED', effective: '',
      scenePlace: '校外', place: '江城 → 明德大学',
      reason: '回家递交材料。',
      submittedAt: '2026-10-07 20:05', approver: '张明', approvedAt: '2026-10-07 20:31',
      completedAt: '2026-10-08 11:52', comment: '同意。'
    }
  ];

  /* ---- 定位销假两态（用于定位 sheet 演示） ---- */
  var loc = {
    pass: {
      ok: true,
      title: '定位校验通过',
      desc: '已记录你的返校位置',
      distanceText: '距校门 128 米',
      resultText: '校验通过'
    },
    out: {
      ok: false,
      title: '当前位置不在校园范围',
      desc: '请返校后重试，或申请人工核验',
      distanceText: '距校门 2.4 公里',
      resultText: '超出允许范围'
    }
  };

  /* ---- 接口模拟时延（ms） ---- */
  var timing = { records: 700, overview: 500, locate: 1800, extend: 900 };

  window.MOCK = {
    baseTime: BASE_TIME,
    student: student,
    env: env,
    statusText: statusText,
    effectiveText: effectiveText,
    typeText: typeText,
    sceneText: sceneText,
    filters: filters,
    records: records,
    loc: loc,
    timing: timing
  };
})();

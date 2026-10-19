/* ============================================================================
 * mock.js —— 唯一数据源
 * 视图层（app.js / index.html）不得硬编码任何业务数据，全部从这里读取。
 * 接入后端时，仅需替换 api.js 中的数据来源，本文件可作为联调 fixture 保留。
 * ==========================================================================*/
window.MOCK = (function () {
  'use strict';

  /* ---------- 班级 ---------- */
  var classes = [
    { id: 'cs2301', name: '计算机2301', count: 46 },
    { id: 'cs2302', name: '计算机2302', count: 45 },
    { id: 'se2301', name: '软件2301', count: 48 },
    { id: 'se2302', name: '软件2302', count: 47 }
  ];

  /* ---------- 状态中文映射（对齐 V1.2） ---------- */
  var statusMap = {
    PENDING: '待审批',
    APPROVED: '已通过',
    COMPLETED: '已完成',
    OVERDUE: '已逾期',
    REJECTED: '已驳回'
  };

  /* 场景 / 类型的中文与配色代码（配色由 styles.css 按 code 出样式） */
  var sceneMap = { 'off-campus': '离校', 'on-campus': '校内' };
  var typeMap = { personal: '事假', sick: '病假', intern: '实习' };

  /* ---------- 待审批队列（12 条） ---------- */
  var approvals = [
    {
      id: 'a1', name: '苏禾', studentNo: '2023011412', classId: 'cs2301', className: '计算机2301',
      sceneCode: 'off-campus', typeCode: 'personal',
      slot: '10-20 09:00 → 18:00', submittedAt: '10-18 09:12',
      reason: '回家参加亲属婚礼', status: 'PENDING'
    },
    {
      id: 'a2', name: '许一诺', studentNo: '2023011424', classId: 'cs2301', className: '计算机2301',
      sceneCode: 'on-campus', typeCode: 'personal',
      slot: '10-19 14:00 → 17:00', submittedAt: '10-18 09:05',
      reason: '参加学院辩论赛决赛，需赛前集中排练', status: 'PENDING'
    },
    {
      id: 'a3', name: '王梓潇', studentNo: '2023011430', classId: 'cs2302', className: '计算机2302',
      sceneCode: 'off-campus', typeCode: 'sick',
      slot: '10-19 08:00 → 10-20 18:00', submittedAt: '10-18 08:47',
      reason: '校医院开具转诊单，需去市一院复查', status: 'PENDING'
    },
    {
      id: 'a4', name: '蒋宛宜', studentNo: '2023011436', classId: 'cs2302', className: '计算机2302',
      sceneCode: 'off-campus', typeCode: 'personal',
      slot: '10-21 07:00 → 10-22 20:00', submittedAt: '10-18 08:30',
      reason: '陪同家人办理房产过户手续', status: 'PENDING'
    },
    {
      id: 'a5', name: '孟舟', studentNo: '2023011441', classId: 'se2301', className: '软件2301',
      sceneCode: 'on-campus', typeCode: 'sick',
      slot: '10-18 13:00 → 17:30', submittedAt: '10-18 08:12',
      reason: '感冒发热，需在校医院输液观察', status: 'PENDING'
    },
    {
      id: 'a6', name: '叶知夏', studentNo: '2023011447', classId: 'se2301', className: '软件2301',
      sceneCode: 'off-campus', typeCode: 'intern',
      slot: '10-20 07:00 → 10-22 20:00', submittedAt: '10-18 07:58',
      reason: '签约企业岗前培训，需到公司报到', status: 'PENDING'
    },
    {
      id: 'a7', name: '郁南', studentNo: '2023011452', classId: 'se2302', className: '软件2302',
      sceneCode: 'off-campus', typeCode: 'personal',
      slot: '10-19 09:00 → 18:00', submittedAt: '10-18 07:40',
      reason: '参加教师资格证笔试考试', status: 'PENDING'
    },
    {
      id: 'a8', name: '程亦宁', studentNo: '2023011458', classId: 'se2302', className: '软件2302',
      sceneCode: 'on-campus', typeCode: 'personal',
      slot: '10-18 19:00 → 21:30', submittedAt: '10-18 07:21',
      reason: '图书馆课题组阶段讨论，需晚归', status: 'PENDING'
    },
    {
      id: 'a9', name: '白露', studentNo: '2023011463', classId: 'cs2301', className: '计算机2301',
      sceneCode: 'off-campus', typeCode: 'sick',
      slot: '10-20 08:00 → 10-21 12:00', submittedAt: '10-18 06:55',
      reason: '拔牙术后需静养，医生建议休息两天', status: 'PENDING'
    },
    {
      id: 'a10', name: '傅野', studentNo: '2023011469', classId: 'cs2302', className: '计算机2302',
      sceneCode: 'off-campus', typeCode: 'personal',
      slot: '10-23 10:00 → 10-24 18:00', submittedAt: '10-18 06:40',
      reason: '赴外省参加亲属葬礼', status: 'PENDING'
    },
    {
      id: 'a11', name: '闻溪', studentNo: '2023011475', classId: 'se2301', className: '软件2301',
      sceneCode: 'on-campus', typeCode: 'personal',
      slot: '10-19 08:00 → 12:00', submittedAt: '10-18 06:22',
      reason: '担任校招宣讲会现场志愿者', status: 'PENDING'
    },
    {
      id: 'a12', name: '陈屿', studentNo: '2023011481', classId: 'se2302', className: '软件2302',
      sceneCode: 'on-campus', typeCode: 'sick',
      slot: '10-18 14:00 → 18:00', submittedAt: '10-18 06:10',
      reason: '急性肠胃炎，已在校医院就诊', status: 'PENDING'
    }
  ];

  /* ---------- 逾期未销假（3 条） ---------- */
  var overdue = [
    {
      id: 'o1', name: '周砚', studentNo: '2023011420', classId: 'cs2302', className: '计算机2302',
      sceneCode: 'off-campus', typeCode: 'sick',
      slot: '10-17 08:00 → 18:00', submittedAt: '10-16 20:30',
      reason: '校外就医后未按时销假', status: 'OVERDUE', overrun: '超时 17 小时'
    },
    {
      id: 'o2', name: '何知远', studentNo: '2023011431', classId: 'se2301', className: '软件2301',
      sceneCode: 'off-campus', typeCode: 'intern',
      slot: '10-16 07:00 → 10-17 20:00', submittedAt: '10-15 21:10',
      reason: '实习返程延误，未提交销假凭证', status: 'OVERDUE', overrun: '超时 39 小时'
    },
    {
      id: 'o3', name: '裴野', studentNo: '2023011444', classId: 'se2302', className: '软件2302',
      sceneCode: 'off-campus', typeCode: 'personal',
      slot: '10-16 09:00 → 10-17 18:00', submittedAt: '10-15 19:45',
      reason: '返家事由变更，未按约返校', status: 'OVERDUE', overrun: '超时 41 小时'
    }
  ];

  /* ---------- 异常核验（2 条，待人工核验） ---------- */
  var reviews = [
    {
      id: 'r1', name: '郑斯予', studentNo: '2023011433', classId: 'se2302', className: '软件2302',
      kind: '定位失败', detail: '距校门 2.4 公里', reason: '返校打卡坐标偏离校园围栏范围', status: 'PENDING'
    },
    {
      id: 'r2', name: '罗青', studentNo: '2023011439', classId: 'cs2301', className: '计算机2301',
      kind: '定位权限未授权', detail: '未获取定位权限', reason: '学生端未开启系统定位授权', status: 'PENDING'
    }
  ];

  /* ---------- 今日概况 KPI ---------- */
  var kpi = [
    { key: 'applied', label: '申请数', value: 128 },
    { key: 'approved', label: '审批通过', value: 96 },
    { key: 'completed', label: '已完成', value: 89 },
    { key: 'overdue', label: '当前逾期', value: 3, tone: 'danger' }
  ];

  /* ---------- 近 7 日申请趋势 ---------- */
  var trend = {
    title: '近 7 日申请趋势',
    unit: '件',
    labels: ['10-12', '10-13', '10-14', '10-15', '10-16', '10-17', '10-18'],
    values: [12, 18, 15, 22, 19, 26, 16]
  };

  /* ---------- 侧栏 / 顶栏文案 ---------- */
  var shell = {
    brand: '明德大学 · 请假工作台',
    pageTitle: '审批台',
    dateLabel: '2026 年 10 月 18 日 周一',
    searchPlaceholder: '搜索学生姓名 / 学号',
    bellBadge: 2,
    counselor: { name: '张明', role: '辅导员', staffNo: 'T2019007' },
    nav: [
      { key: 'desk', label: '审批台', icon: 'layout-dashboard', active: true },
      { key: 'pending', label: '待审批', icon: 'inbox' },
      { key: 'review', label: '异常核验', icon: 'shield-alert' },
      { key: 'overdue', label: '逾期', icon: 'clock-alert' },
      { key: 'stats', label: '统计', icon: 'bar-chart-3' },
      { key: 'classes', label: '班级', icon: 'users' }
    ]
  };

  /* ---------- 卡片文案 ---------- */
  var cards = {
    queueTitle: '待审批队列',
    batchLabel: '批量',
    singleLabel: '单条',
    selectAll: '全选',
    batchApprove: '批量通过',
    overdueTitle: '逾期未销假',
    reviewTitle: '异常核验',
    photoTitle: '辖区概览',
    photoStat: '辖 4 个班级 · 186 名学生',
    photoSub: '计算机2301·2302 / 软件2301·2302',
    kpiTitle: '今日概况',
    trendUnit: '件',
    approve: '通过',
    reject: '驳回',
    rejectConfirm: '确认驳回',
    rejectCancel: '取消',
    rejectPlaceholder: '填写驳回意见，如：事由与证明材料不符，请补充证明后重新提交',
    emptyDone: '全部处理完毕',
    emptyDoneSub: '当前没有待审批的申请',
    emptyOverdue: '暂无逾期记录',
    emptyOverdueSub: '所有学生均已按时销假',
    stateNormal: '定位正常'
  };

  /* ---------- 辖区概览 ---------- */
  var campus = {
    classCount: classes.length,
    studentCount: classes.reduce(function (n, c) { return n + c.count; }, 0),
    photoAlt: '校园日景'
  };

  return {
    shell: shell,
    cards: cards,
    campus: campus,
    classes: classes,
    statusMap: statusMap,
    sceneMap: sceneMap,
    typeMap: typeMap,
    approvals: approvals,
    overdue: overdue,
    reviews: reviews,
    kpi: kpi,
    trend: trend
  };
})();

/* ============================================================
   校园请假 · 学生端高保真原型
   原生 JS，零依赖，可直接以 file:// 双击打开
   架构：单一状态源 state → 分屏渲染 renderS1..S9 → 事件委托
   ============================================================ */
'use strict';
(function () {

/* ============================================================
   0. 常量与工具
   ============================================================ */
const YEAR = 2026;                       // 演示世界年份（2026-10-16 为周五，与文案一致）
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MAIN_ID = 'CL20261016001';

function dt(m, d, h, mi) { return new Date(YEAR, m - 1, d, h, mi, 0, 0); }
function p2(n) { return n < 10 ? '0' + n : '' + n; }
function addMin(d, n) { return new Date(d.getTime() + n * 60000); }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function ceil10(d) {
  const t = new Date(d.getTime());
  t.setSeconds(0, 0);
  const m = t.getMinutes();
  t.setMinutes(m + ((10 - (m % 10)) % 10));
  return t;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const fTime = d => p2(d.getHours()) + ':' + p2(d.getMinutes());
const fMD = d => p2(d.getMonth() + 1) + '.' + p2(d.getDate());
const fMDHM = d => fMD(d) + ' ' + fTime(d);
const fList = d => fMD(d) + ' ' + WD[d.getDay()] + ' ' + fTime(d);
const fDetail = d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[d.getDay()] + ' ' + fTime(d);
const fDateLine = d => (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WD_FULL[d.getDay()] + ' · ' + fTime(d);
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const ic = (name, size) =>
  '<svg class="icon' + (size ? ' icon--' + size : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';

/* 时长（人读）：26 小时 10 分 */
function durText(ms) {
  const total = Math.max(1, Math.round(ms / 60000));
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  let out = '';
  if (d > 0) out += d + ' 天 ';
  if (h > 0) out += h + ' 小时 ';
  if (m > 0 && d === 0) out += h > 0 ? m + ' 分' : m + ' 分钟';
  return out.trim() || '1 分钟';
}
/* 时长（总小时）：26 小时 10 分 */
function durHText(ms) {
  const total = Math.max(1, Math.round(ms / 60000));
  return Math.floor(total / 60) + ' 小时 ' + (total % 60) + ' 分';
}
function crossDays(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/* ============================================================
   1. 内置演示数据
   ============================================================ */
const STUDENT = {
  name: '张同学',
  no: '202301001001',
  cls: '计算机2201班',
  major: '计算机科学与技术',
  phone: '13800006621',
  phoneMask: '138****6621',
  counselor: '李老师',
  counselorPhone: '0571-8812 6060'
};

function buildApplications() {
  return [
    { /* ① 已销假 · 离校 · 病假（含 1 次续假通过） */
      id: 'CL20261008003', isMain: false, scene: 'OFF_CAMPUS', type: 'SICK', status: 'COMPLETED',
      start: dt(10, 8, 9, 0), end: dt(10, 10, 12, 0),
      reason: '感冒发烧，已在校医院就诊，需回家休息两天并按医嘱复查。',
      destination: '杭州市西湖区文一西路 100 号',
      phone: '13800006621',
      submittedAt: dt(10, 8, 7, 20), approvedAt: dt(10, 8, 8, 10), approver: '李老师',
      approveComment: '同意，请按时返校并完成定位销假。',
      completedAt: dt(10, 10, 17, 52), rejectReason: '',
      materials: [{ kind: 'preset' }],
      ext: { status: 'APPROVED', newEnd: dt(10, 10, 18, 0), submittedAt: dt(10, 8, 20, 10), reason: '复查安排在 10 月 10 日下午，申请延长至当日 18:00。' }
    },
    { /* ② 已驳回 · 校内 · 事假 */
      id: 'CL20261009002', isMain: false, scene: 'ON_CAMPUS', type: 'PERSONAL', status: 'REJECTED',
      start: dt(10, 9, 8, 0), end: dt(10, 9, 18, 0),
      reason: '参加学院组织的程序设计竞赛集训。',
      destination: '', phone: '13800006621',
      submittedAt: dt(10, 9, 14, 40), approvedAt: dt(10, 9, 15, 20), approver: '李老师',
      approveComment: '',
      rejectReason: '请假事由描述过于简单，无法判断必要性，请补充具体事项、去向及联系方式后重新提交。',
      completedAt: null, materials: [],
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    },
    { /* ③ 已撤回 · 离校 · 事假 */
      id: 'CL20261005004', isMain: false, scene: 'OFF_CAMPUS', type: 'PERSONAL', status: 'WITHDRAWN',
      start: dt(10, 5, 14, 0), end: dt(10, 6, 20, 0),
      reason: '回家处理家中事务。',
      destination: '绍兴市越城区胜利西路 88 号',
      phone: '13800006621',
      submittedAt: dt(10, 4, 21, 15), approvedAt: null, approver: '',
      approveComment: '', rejectReason: '', completedAt: null, materials: [],
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    },
    { /* ④ 已取消 · 校内 · 事假 */
      id: 'CL20261012005', isMain: false, scene: 'ON_CAMPUS', type: 'PERSONAL', status: 'CANCELLED',
      start: dt(10, 12, 8, 0), end: dt(10, 12, 12, 0),
      reason: '上午前往图书馆整理毕业设计资料。',
      destination: '', phone: '13800006621',
      submittedAt: dt(10, 11, 19, 5), approvedAt: dt(10, 11, 20, 30), approver: '李老师',
      approveComment: '同意。', rejectReason: '', completedAt: null, materials: [],
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    },
    { /* ⑥ 已通过 · 离校 · 病假（未来，用于统计口径） */
      id: 'CL20261020006', isMain: false, scene: 'OFF_CAMPUS', type: 'SICK', status: 'APPROVED',
      start: dt(10, 20, 8, 0), end: dt(10, 21, 18, 0),
      reason: '按医嘱到市区医院复查，需回家休养一天。',
      destination: '杭州市西湖区文一西路 100 号',
      phone: '13800006621',
      submittedAt: dt(10, 15, 16, 10), approvedAt: dt(10, 15, 17, 0), approver: '李老师',
      approveComment: '同意。', rejectReason: '', completedAt: null,
      materials: [{ kind: 'preset' }],
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    },
    { /* ⑤ 主记录：演示层在此条上改字段 */
      id: MAIN_ID, isMain: true, scene: 'OFF_CAMPUS', type: 'PERSONAL', status: 'IN_PROGRESS',
      start: dt(10, 16, 18, 0), end: dt(10, 17, 12, 0),
      reason: '家中有事需回家一趟，已与家长沟通，返校后按时完成定位销假。',
      destination: '宁波市海曙区中山西路 210 号',
      phone: '13800006621',
      submittedAt: dt(10, 16, 9, 42), approvedAt: dt(10, 16, 10, 5), approver: '李老师',
      approveComment: '同意，请注意出行安全，返校后完成定位销假。',
      rejectReason: '', completedAt: null,
      materials: [{ kind: 'preset' }],
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    }
  ];
}

function buildMessages() {
  return [
    {
      id: 'M1', type: 'approve', badge: '审批结果', icon: 'check', tone: 'success',
      title: '你的请假申请已通过',
      body: [
        '你提交的 10月16日 周五 18:00 — 10月17日 周六 12:00 离校请假（事假）已通过审批。',
        '请在返校后打开请假详情，完成定位销假，销假后记录将归档。'
      ],
      time: dt(10, 16, 10, 5), unread: true,
      rel: { no: MAIN_ID, span: '10.16 周五 18:00 — 10.17 周六 12:00', status: '请假中' }
    },
    {
      id: 'M2', type: 'reject', badge: '驳回通知', icon: 'warn', tone: 'danger',
      title: '你的请假申请未通过',
      body: [
        '你提交的 10月9日 周五 08:00 — 18:00 校内请假未通过审批。',
        '驳回原因：请假事由描述过于简单，无法判断必要性，请补充具体事项、去向及联系方式后重新提交。'
      ],
      time: dt(10, 9, 15, 20), unread: false,
      rel: { no: 'CL20261009002', span: '10.9 周五 08:00 — 18:00', status: '已驳回' }
    },
    {
      id: 'M3', type: 'extend', badge: '续假结果', icon: 'check', tone: 'success',
      title: '续假申请已通过',
      body: [
        '你提交的续假申请已通过，结束时间延长至 10月10日 周六 18:00。',
        '请在新的结束时间前完成销假。'
      ],
      time: dt(10, 8, 20, 40), unread: false,
      rel: { no: 'CL20261008003', span: '10.8 周四 09:00 — 10.10 周六 18:00', status: '已销假' }
    },
    {
      id: 'M4', type: 'overdue', badge: '逾期提醒', icon: 'warn', tone: 'danger',
      title: '请假已超过结束时间',
      body: [
        '你的请假已超过批准结束时间 2 小时，请尽快完成销假或提交续假申请。',
        '逾期期间记录会持续标记，销假后自动撤销。'
      ],
      time: dt(10, 10, 14, 10), unread: false,
      rel: { no: 'CL20261008003', span: '10.8 周四 09:00 — 10.10 周六 12:00', status: '已销假' }
    },
    {
      id: 'M5', type: 'system', badge: '系统通知', icon: 'info', tone: 'info',
      title: '校园请假系统使用说明',
      body: [
        '离校请假需在返校后完成定位销假，校内请假可在请假期间自主确认结束。',
        '审批结果与重要提醒会通过本页通知，提交后可在请假记录查看进度。'
      ],
      time: dt(10, 7, 9, 0), unread: false,
      rel: null
    }
  ];
}

/* ============================================================
   2. 单一状态源
   ============================================================ */
const state = {
  nowMode: 'inprogress',      // real | fixed | inprogress | overdue
  now: dt(10, 16, 18, 30),
  student: STUDENT,
  applications: [],
  messages: [],
  route: [{ id: 'S1' }],
  demo: {
    status: 'IN_PROGRESS_OFF',  // NONE/PENDING/APPROVED/IN_PROGRESS_ON/IN_PROGRESS_OFF/OVERDUE_OFF/COMPLETED/REJECTED/WITHDRAWN/CANCELLED
    scene: 'OFF_CAMPUS',
    extStatus: 'NONE',          // NONE | PENDING | APPROVED | REJECTED
    locResult: 'pass',          // pass | out | deny | fail
    visible: true
  },
  form: {},                     // S2 草稿
  extForm: {},                  // S5 草稿
  ui: {
    s3Filter: 'ALL',
    s3Fade: false,
    pulseId: null,              // 详情徽章一次性 scale
    badgeEnabled: true,         // S9「未读红点提醒」开关，仅控 tabBar 红点，不影响消息未读态
    locPhase: 'locating',
    locTimer: null
  }
};

/* ============================================================
   3. 派生计算（集中，唯一口径）
   ============================================================ */
function getMain() { return state.applications.find(a => a.id === MAIN_ID); }
function byId(id) { return state.applications.find(a => a.id === id); }

/** 当前可见申请（演示层「无」时隐藏主记录） */
function allApps() {
  return state.applications.filter(a => !(a.isMain && state.demo.status === 'NONE'));
}

/** 续假待审批期间按原结束时间计算；续假通过后按新结束时间 */
function effectiveEndTime(app) {
  if (!app) return null;
  if (app.ext && app.ext.status === 'APPROVED' && app.ext.newEnd) return app.ext.newEnd;
  return app.end;
}

/** APPROVED 且已到开始时间 → 按 IN_PROGRESS 渲染（不依赖定时写库） */
function displayStatus(app) {
  if (!app) return '';
  if (app.status === 'APPROVED' && state.now.getTime() >= app.start.getTime()) return 'IN_PROGRESS';
  return app.status;
}

function isOverdue(app) {
  if (!app) return false;
  return displayStatus(app) === 'IN_PROGRESS' && state.now.getTime() > effectiveEndTime(app).getTime();
}

/** 剩余 / 超时文案（详情与首页一致口径） */
function remainInfo(app) {
  const diff = effectiveEndTime(app).getTime() - state.now.getTime();
  const abs = Math.abs(diff);
  if (diff >= 0) return { over: false, text: '还剩 ' + durText(abs) };
  return { over: true, text: '已超过 ' + durText(abs) };
}

/** 首页问候的紧凑剩余时长（小时粒度，对齐视觉 §8） */
function remainShort(app) {
  const diff = effectiveEndTime(app).getTime() - state.now.getTime();
  const min = Math.max(1, Math.round(Math.abs(diff) / 60000));
  if (diff < 0) return '已超 ' + durText(Math.abs(diff));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  if (d > 0) return '还剩 ' + d + ' 天 ' + h + ' 小时';
  if (h > 0) return '还剩 ' + h + ' 小时';
  return '还剩 ' + min + ' 分钟';
}

/** 排序：逾期置顶 → 进行中 → 待审批 → 已通过 → 终态；组内开始时间倒序 */
function groupRank(app) {
  const s = displayStatus(app);
  if (s === 'IN_PROGRESS') return isOverdue(app) ? 0 : 1;
  if (s === 'PENDING') return 2;
  if (s === 'APPROVED') return 3;
  return 4;
}
function sortedApps(list) {
  return (list || allApps()).slice().sort((a, b) =>
    groupRank(a) - groupRank(b) || b.start.getTime() - a.start.getTime()
  );
}

/** 首页只选 1 张：IN_PROGRESS（含逾期）> APPROVED > PENDING > 最近一条终态 */
function homeApp() {
  const list = allApps();
  if (!list.length) return null;
  return sortedApps(list)[0];
}

/* 统计：累计申请 / 已批准 / 已销假 / 进行中 */
function stats() {
  const list = allApps();
  return {
    total: list.length,
    approved: list.filter(a => ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].indexOf(displayStatus(a)) >= 0).length,
    completed: list.filter(a => displayStatus(a) === 'COMPLETED').length,
    ongoing: list.filter(a => displayStatus(a) === 'IN_PROGRESS').length
  };
}

function unreadCount() { return state.messages.filter(m => m.unread).length; }

/* ============================================================
   4. 文案 / 状态映射
   ============================================================ */
const STATUS_META = {
  PENDING: { text: '待审批', cls: 'badge--pending' },
  APPROVED: { text: '已通过', cls: 'badge--approved' },
  IN_PROGRESS: { text: '请假中', cls: 'badge--progress' },
  COMPLETED: { text: '已销假', cls: 'badge--completed' },
  REJECTED: { text: '已驳回', cls: 'badge--rejected' },
  WITHDRAWN: { text: '已撤回', cls: 'badge--neutral' },
  CANCELLED: { text: '已取消', cls: 'badge--muted' }
};
const TYPE_TEXT = { SICK: '病假', PERSONAL: '事假', OTHER: '其他' };
const SCENE_TEXT = { OFF_CAMPUS: '离校', ON_CAMPUS: '校内' };
const EXT_META = {
  PENDING: { text: '续假待审批', cls: 'badge--pending' },
  APPROVED: { text: '续假已通过', cls: 'badge--approved' },
  REJECTED: { text: '续假被驳回', cls: 'badge--rejected' }
};

function badgeHTML(status, extraCls) {
  const m = STATUS_META[status] || STATUS_META.PENDING;
  return '<span class="badge ' + m.cls + (extraCls ? ' ' + extraCls : '') + '">' + m.text + '</span>';
}
function mainBadgeHTML(app, pulse) {
  const ds = displayStatus(app);
  return badgeHTML(ds, pulse ? 'badge--pulse' : '');
}
function extBadgeHTML(app) {
  if (!app.ext || app.ext.status === 'NONE') return '';
  const m = EXT_META[app.ext.status];
  return '<span class="badge badge--ext ' + m.cls + '">' + m.text + '</span>';
}
function overdueBadgeHTML() {
  return '<span class="badge badge--overdue">' + ic('warn', '12') + '逾期</span>';
}

/* ============================================================
   5. 结构片段
   ============================================================ */
function navHTML(opt) {
  opt = opt || {};
  let html = '<div class="navbar__title">' + esc(opt.title || '') + '</div>';
  if (opt.back) {
    html = '<button class="navbar__back" data-action="back" aria-label="返回">' + ic('left', '24') + '</button>' + html;
  }
  if (opt.right) {
    html += '<button class="navbar__right" data-action="' + opt.rightAction + '">' + esc(opt.right) + '</button>';
  }
  return html;
}

function emptyHTML(kind) {
  if (kind === 's1') {
    return '<div class="empty empty--s1">' +
      '<svg class="icon icon--72 empty__icon" aria-hidden="true"><use href="#i-empty"/></svg>' +
      '<div class="empty__title">还没有请假记录</div>' +
      '<div class="empty__desc">需要时从下方发起申请</div></div>';
  }
  if (kind === 's3') {
    return '<div class="empty empty--list">' +
      '<svg class="icon icon--72 empty__icon" aria-hidden="true"><use href="#i-empty"/></svg>' +
      '<div class="empty__title">还没有请假记录</div>' +
      '<div class="empty__desc">需要时从首页发起申请</div>' +
      '<button class="btn btn--outline" data-action="s3-go-home">去首页</button></div>';
  }
  if (kind === 'filter') {
    return '<div class="empty empty--list">' +
      '<svg class="icon icon--72 empty__icon" aria-hidden="true"><use href="#i-empty"/></svg>' +
      '<div class="empty__title">该状态下暂无记录</div>' +
      '<div class="empty__desc">可切换其他筛选查看</div>' +
      '<button class="btn btn--outline" data-action="s3-filter-all">查看全部</button></div>';
  }
  return '<div class="empty empty--list">' +
    '<svg class="icon icon--72 empty__icon" aria-hidden="true"><use href="#i-empty"/></svg>' +
    '<div class="empty__title">还没有消息</div>' +
    '<div class="empty__desc">审批与提醒会出现在这里</div></div>';
}

/* 卡内 3 节点时间轴 */
function miniTimelineHTML(app) {
  const ds = displayStatus(app);
  const terminal = ['REJECTED', 'WITHDRAWN', 'CANCELLED'].indexOf(ds) >= 0;
  let states, labels;
  if (terminal) { states = ['done', 'done']; labels = ['提交', '审批']; }
  else if (ds === 'PENDING') { states = ['done', 'current', 'pending']; labels = ['提交', '审批', '结束']; }
  else if (ds === 'COMPLETED') { states = ['done', 'done', 'done']; labels = ['提交', '审批', '结束']; }
  else { states = ['done', 'done', 'pending']; labels = ['提交', '审批', '结束']; }

  let dots = '';
  states.forEach((s, i) => {
    dots += '<i class="mini-tl__dot' + (s === 'done' ? ' is-done' : s === 'current' ? ' is-current' : '') + '"></i>';
    if (i < states.length - 1) {
      const doneBar = (s === 'done' || s === 'current') && !terminal;
      dots += '<i class="mini-tl__bar' + (doneBar ? ' is-done' : '') + '"></i>';
    }
  });

  return '<div class="mini-tl' + (terminal ? ' is-idle' : '') + '">' + dots + '</div>' +
    '<div class="mini-tl__labels' + (terminal ? ' is-idle' : '') + '">' +
    labels.map(l => '<span>' + l + '</span>').join('') + '</div>';
}

/* 申请卡（视觉 6.4） */
function appCardHTML(app) {
  const ds = displayStatus(app);
  const od = isOverdue(app);
  const sameDay = isSameDay(app.start, app.end);
  const startTxt = fList(app.start);
  const endTxt = sameDay ? fTime(app.end) : fList(app.end);   // 同日不重复日期

  const badges =
    (od ? overdueBadgeHTML() : '') + mainBadgeHTML(app);

  let r4 = '';
  if (ds === 'REJECTED') {
    r4 = '<div class="app-card__r4">' + esc(app.rejectReason) + '</div>';
  } else if (ds === 'COMPLETED') {
    r4 = '<div class="app-card__r4 app-card__r4--time">' + fMDHM(app.completedAt) + ' 销假</div>';
  } else if (ds === 'APPROVED') {
    r4 = '<div class="app-card__r4 app-card__r4--time">' + fMDHM(app.start) + ' 开始</div>';
  } else if (ds === 'IN_PROGRESS') {
    r4 = '<div class="app-card__r4 app-card__r4--time">' + fMDHM(app.submittedAt) + ' 提交</div>';
  } else {
    r4 = '<div class="app-card__r4 app-card__r4--time">' + fMDHM(app.submittedAt) + ' 提交</div>';
  }

  return '<article class="app-card' + (od ? ' app-card--overdue' : '') + '" role="button" tabindex="0" ' +
    'data-action="open-app" data-id="' + app.id + '" aria-label="' + esc(SCENE_TEXT[app.scene] + TYPE_TEXT[app.type] + ' ' + startTxt + ' 至 ' + fList(app.end)) + '">' +
    '<div class="app-card__r1">' +
    '<span class="scene ' + (app.scene === 'OFF_CAMPUS' ? 'scene--off' : 'scene--on') + '"><i></i>' + SCENE_TEXT[app.scene] + '</span>' +
    '<span class="sep">·</span>' +
    '<span class="app-card__type">' + TYPE_TEXT[app.type] + '</span>' +
    '<span class="badges">' + badges + '</span>' +
    '</div>' +
    '<div class="app-card__r2">' + startTxt + ' —' + (sameDay ? ' ' : '<br>') + endTxt +
    (od ? '<span class="over-text">' + remainInfo(app).text.replace('已超过', '已超') + '</span>' : '') + '</div>' +
    '<div class="app-card__r3">' + miniTimelineHTML(app) + '</div>' +
    r4 +
    '</article>';
}

/* ============================================================
   6. 分屏渲染 S1–S9
   ============================================================ */

/* ===== S1 首页 ===== */
function greetFor(app) {
  if (!app) return { icon: 'gate', t1: '今天没有请假安排', t2: '需要时从下方发起申请' };
  const ds = displayStatus(app);
  if (ds === 'IN_PROGRESS') {
    if (isOverdue(app)) return { icon: 'door', t1: '请假已超过结束时间', t2: '请尽快销假或申请续假' };
    return {
      icon: 'door',
      t1: '请假中 · ' + remainShort(app),
      t2: app.scene === 'OFF_CAMPUS' ? '返校后记得定位销假' : '请假期间可自主确认结束'
    };
  }
  if (ds === 'APPROVED') {
    return {
      icon: 'clock',
      t1: '有 1 条请假已通过',
      t2: app.scene === 'OFF_CAMPUS' ? '返校后记得定位销假' : '请假期间可自主确认结束'
    };
  }
  if (ds === 'PENDING') return { icon: 'clock', t1: '有 1 条申请等待审批', t2: '辅导员处理后会通知你' };
  if (ds === 'COMPLETED') return { icon: 'book-check', t1: '上次请假已正常销假', t2: '记录已归档，可随时查看' };
  return { icon: 'gate', t1: '今天没有请假安排', t2: '需要时从下方发起申请' };
}

function renderS1(v) {
  const app = homeApp();
  const g = greetFor(app);
  v.nav.innerHTML = navHTML({ title: '校园请假' });
  v.slot.innerHTML = '';
  v.scroll.innerHTML =
    '<div class="pad">' +
      '<div class="greet">' +
        '<div class="greet__icon">' + ic(g.icon, '32') + '</div>' +
        '<div><div class="greet__t1">' + esc(g.t1) + '</div>' +
        '<div class="greet__t2">' + esc(g.t2) + '</div></div>' +
      '</div>' +
      '<div class="dateline">' + fDateLine(state.now) + '</div>' +
      '<div class="sec-head">' +
        '<h2>我的申请</h2>' +
        '<button class="link-btn" data-action="go-records">查看全部</button>' +
      '</div>' +
      (app ? appCardHTML(app) : emptyHTML('s1')) +
      '<div class="cta-card">' +
        '<div class="cta-card__title">请假服务</div>' +
        '<div class="cta-card__desc">离校请假返校后需定位销假，校内请假可自主确认结束</div>' +
        '<button class="btn btn--primary" data-action="new-apply">' + ic('plus', '20') + '申请请假</button>' +
      '</div>' +
    '</div>';
}

/* ===== S2 申请请假 ===== */
const S2_EMPTY = {
  scene: '', type: '', start: null, end: null,
  reason: '', destination: '', phone: '', materials: [], copied: false
};

/** 建议开始时间：当前时间向上取整到 10 分钟；若已有进行中/待开始/待审批的请假，
 *  则顺延到其结束时间之后（避免默认值必然撞上时间冲突校验） */
function suggestStart() {
  let t = ceil10(state.now);
  allApps().forEach(a => {
    if (displayStatus(a) !== 'IN_PROGRESS') return;    // 只避让「当前正在请假」的区间
    const end = effectiveEndTime(a);
    if (end.getTime() > state.now.getTime()) {
      const cand = ceil10(addMin(end, 10));
      if (cand.getTime() > t.getTime()) t = cand;
    }
  });
  return t;
}

function resetApplyForm(preset) {
  state.form = Object.assign({}, S2_EMPTY, {
    start: suggestStart(),
    phone: STUDENT.phone,
    materials: [{ kind: 'preset' }],
    dirty: false
  });
  if (preset) {
    state.form.scene = preset.scene || '';
    state.form.type = preset.type || '';
    state.form.reason = preset.reason || '';
    state.form.destination = preset.destination || '';
    state.form.phone = preset.phone || STUDENT.phone;
    state.form.materials = (preset.materials || []).slice();
    state.form.start = null;
    state.form.end = null;
    state.form.copied = true;
  }
}

function renderS2(v) {
  const f = state.form;
  const off = f.scene === 'OFF_CAMPUS';
  const matCount = f.materials.length;
  v.nav.innerHTML = navHTML({ title: '申请请假', back: true });

  const errHTML = name => '<div class="field-err' + (f.errors && f.errors[name] ? ' is-on' : '') + '" data-err="' + name + '">' +
    (f.errors && f.errors[name] ? esc(f.errors[name]) : '') + '</div>';

  let durationHint = '';
  if (f.start && f.end && f.end > f.start) {
    const cd = crossDays(f.start, f.end);
    if (cd > 0) durationHint = '<div class="field-hint is-on">共 ' + durHText(f.end - f.start) + '（跨 ' + cd + ' 天）</div>';
  }

  const mats = f.materials.map((m, i) =>
    '<div class="up">' + (m.kind === 'preset' ? proofSVG() : '<img src="' + m.src + '" alt="证明材料 ' + (i + 1) + '">') +
    '<button class="up__del" data-action="mat-del" data-idx="' + i + '" aria-label="删除材料">' + ic('close', '12') + '</button></div>'
  ).join('');

  v.scroll.innerHTML =
    (f.copied ? '<div class="pad"><div class="t-ter" style="padding:12px 0 0">已复制上次填写的内容，请重新选择时间</div></div>' : '') +
    '<div class="pad">' +
      /* 请假场景 */
      '<div class="grp"><div class="grp__title" id="sceneGrp">请假场景</div>' +
        '<div class="scenes" role="radiogroup" aria-labelledby="sceneGrp">' +
          sceneCard('OFF_CAMPUS', 'out', '离校请假', '离开校园范围', f.scene) +
          sceneCard('ON_CAMPUS', 'building', '校内请假', '人仍在校园内', f.scene) +
        '</div>' + errHTML('scene') +
      '</div>' +

      /* 请假类型与时间 */
      '<div class="grp"><div class="grp__title" id="typeGrp">请假类型与时间</div>' +
        '<div class="form-card">' +
          '<div class="form-row" data-field-wrap="type" style="padding-top:12px;padding-bottom:12px">' +
            '<div class="form-row__label">请假类型<span class="req"></span></div>' +
            '<div class="seg" role="group" aria-labelledby="typeGrp" style="flex:1;max-width:200px">' +
              ['SICK', 'PERSONAL', 'OTHER'].map(k =>
                '<button class="seg__btn' + (f.type === k ? ' is-on' : '') + '" data-action="pick-type" data-val="' + k + '" aria-pressed="' + (f.type === k) + '">' + TYPE_TEXT[k] + '</button>'
              ).join('') +
            '</div>' +
          '</div>' + errHTML('type') +

          '<div class="form-row form-row--btn" data-field-wrap="start" data-action="pick-time" data-field="start">' +
            '<div class="form-row__label">开始时间<span class="req"></span></div>' +
            '<div class="form-row__value">' +
              (f.start ? esc(fDetail(f.start)) : '<span class="placeholder">请选择开始时间</span>') + ic('right', '16') +
            '</div>' +
          '</div>' + errHTML('start') +

          '<div class="form-row form-row--btn" data-field-wrap="end" data-action="pick-time" data-field="end">' +
            '<div class="form-row__label">结束时间<span class="req"></span></div>' +
            '<div class="form-row__value">' +
              (f.end ? esc(fDetail(f.end)) : '<span class="placeholder">请选择结束时间</span>') + ic('right', '16') +
            '</div>' +
          '</div>' + errHTML('end') + durationHint +
        '</div>' +
      '</div>' +

      /* 请假理由 */
      '<div class="grp"><div class="grp__title">请假理由</div>' +
        '<div class="form-card" data-field-wrap="reason">' +
          '<div class="ta-wrap">' +
            '<textarea class="ta' + (f.errors && f.errors.reason ? ' is-error' : '') + '" data-input="reason" maxlength="200" ' +
            'placeholder="说明请假原因，便于辅导员判断" aria-label="请假理由">' + esc(f.reason) + '</textarea>' +
            '<div class="ta-meta"><span class="ta-meta__hint">辅导员审批时可见</span>' +
            counterHTML(f.reason.length) + '</div>' +
          '</div>' + errHTML('reason') +
        '</div>' +
      '</div>' +

      /* 离校信息（仅离校） */
      (off ?
        '<div class="grp"><div class="grp__title">离校信息</div>' +
          '<div class="form-card">' +
            '<div class="form-row" data-field-wrap="destination">' +
              '<div class="form-row__label">离校去向<span class="req"></span></div>' +
              '<input class="input" data-input="destination" maxlength="50" placeholder="填写目的地" value="' + esc(f.destination) + '" aria-label="离校去向" inputmode="text">' +
            '</div>' + errHTML('destination') +
            '<div class="form-row" data-field-wrap="phone">' +
              '<div class="form-row__label">联系电话<span class="req"></span></div>' +
              '<input class="input" data-input="phone" maxlength="11" placeholder="填写 11 位手机号" value="' + esc(f.phone) + '" aria-label="联系电话" inputmode="numeric">' +
            '</div>' + errHTML('phone') +
          '</div>' +
        '</div>' : '') +

      /* 证明材料 */
      '<div class="grp"><div class="grp__title">证明材料<span style="color:#78849A">（病假需上传，最多 3 张）</span></div>' +
        '<div class="form-card" data-field-wrap="materials">' +
          '<div class="uploads">' + mats +
            (matCount < 3 ?
              '<label class="up up--add" aria-label="上传证明材料">' + ic('plus', '20') +
              '<input type="file" class="sr-only" accept="image/*" data-file="material"></label>' : '') +
          '</div>' + errHTML('materials') +
        '</div>' +
      '</div>' +
    '</div>';

  v.slot.innerHTML = '<div class="bar">' +
    '<button class="btn btn--primary btn--block" data-action="submit-apply">提交申请</button></div>';
}

function sceneCard(val, icon, title, desc, cur) {
  const on = cur === val;
  return '<label class="scene-card' + (on ? ' is-on' : '') + '">' +
    '<input type="radio" class="sr-only" name="scene" value="' + val + '" ' + (on ? 'checked' : '') + ' data-radio="scene">' +
    '<span class="scene-card__icon">' + ic(icon, '32') + '</span>' +
    '<span class="scene-card__title">' + title + '</span>' +
    '<span class="scene-card__desc">' + desc + '</span>' +
    '<span class="scene-card__check">' + ic('check', '12') + '</span>' +
    '</label>';
}

function counterHTML(len) {
  const cls = len >= 200 ? ' is-over' : len >= 180 ? ' is-warn' : '';
  return '<span class="counter' + cls + '">' + len + '/200</span>';
}

/* 内联 SVG 生成的「诊断证明」缩略图（预置材料，无需外部资源） */
function proofSVG() {
  return '<svg viewBox="0 0 80 80" role="img" aria-label="诊断证明">' +
    '<rect width="80" height="80" fill="#EDF0F5"/>' +
    '<rect x="13" y="7" width="54" height="66" rx="2" fill="#FFFFFF" stroke="#E2E7EF"/>' +
    '<text x="40" y="20" text-anchor="middle" font-size="7" font-weight="600" fill="#3B4557" font-family="sans-serif">诊断证明</text>' +
    '<path d="M20 26h40M20 32h40M20 38h28M20 44h34M20 50h22" stroke="#CFD6E2" stroke-width="1.2" stroke-linecap="round"/>' +
    '<circle cx="54" cy="58" r="10" fill="none" stroke="#C0281E" stroke-width="1.2" opacity="0.65"/>' +
    '<text x="54" y="61" text-anchor="middle" font-size="6" fill="#C0281E" opacity="0.8" font-family="sans-serif">校医院</text>' +
    '<path d="M20 60h18" stroke="#CFD6E2" stroke-width="1.2" stroke-linecap="round"/>' +
    '</svg>';
}

/* ===== S3 请假记录 ===== */
const FILTERS = [
  { k: 'ALL', label: '全部' },
  { k: 'PENDING', label: '待审批' },
  { k: 'APPROVED', label: '已通过' },
  { k: 'IN_PROGRESS', label: '请假中' },
  { k: 'REJECTED', label: '已驳回' },
  { k: 'COMPLETED', label: '已销假' },
  { k: 'CANCELLED', label: '已取消' },
  { k: 'WITHDRAWN', label: '已撤回' }
];

function filterApps(key) {
  const list = sortedApps();
  if (key === 'ALL') return list;
  return list.filter(a => displayStatus(a) === key); // 「已通过」不含 IN_PROGRESS
}

function renderS3(v) {
  const key = state.ui.s3Filter;
  const list = filterApps(key);
  const all = allApps();
  v.nav.innerHTML = navHTML({ title: '请假记录' });
  v.slot.innerHTML = '';

  const filters = '<div class="filters-wrap' + (v.scroll.scrollTop > 0 ? ' is-scrolled' : '') + '">' +
    '<div class="filters" role="tablist" aria-label="请假记录筛选">' +
    FILTERS.map(f =>
      '<button class="filters__item' + (f.k === key ? ' is-on' : '') + '" role="tab" ' +
      'aria-selected="' + (f.k === key) + '" data-action="s3-filter" data-val="' + f.k + '"><span>' + f.label + '</span></button>'
    ).join('') +
    '</div></div>';

  let body;
  if (!all.length) {
    body = emptyHTML('s3');
  } else if (!list.length) {
    body = emptyHTML('filter');
  } else {
    body = list.map(appCardHTML).join('');
  }

  v.scroll.innerHTML = filters +
    '<div class="list' + (state.ui.s3Fade ? ' is-fading' : '') + '">' + body + '</div>';
  state.ui.s3Fade = false;

  /* 两端渐隐只在还能往该方向滚时出现（首屏左端无内容可露出，右端同理） */
  const strip = v.scroll.querySelector('.filters');
  if (strip) strip.addEventListener('scroll', syncFilterFade, { passive: true });
  syncFilterFade();
}

/**
 * 同步筛选栏两端渐隐遮罩
 * 可滚方向才显示 8px 渐隐：scrollLeft>0 才 left，未滚到底才 right
 */
function syncFilterFade() {
  /* S3 是常驻 tab 页，隐藏时 clientWidth 为 0，直接跳过避免误判 */
  const page = tabNodes.S3;
  const wrap = page && page.querySelector('.filters-wrap');
  if (!wrap) return;
  const strip = wrap.querySelector('.filters');
  if (!strip || !strip.clientWidth) return;
  const max = strip.scrollWidth - strip.clientWidth;
  wrap.classList.toggle('can-left', strip.scrollLeft > 1);
  wrap.classList.toggle('can-right', max > 2 && strip.scrollLeft < max - 1);
}

/* ===== S4 请假详情 ===== */
function conclusionText(app) {
  const ds = displayStatus(app);
  switch (ds) {
    case 'PENDING': return '等待辅导员审批';
    case 'APPROVED': return '已通过，' + fMDHM(app.start) + ' 开始';
    case 'IN_PROGRESS':
      if (isOverdue(app)) return '已超过结束时间 ' + durText(state.now - effectiveEndTime(app));
      return '请假中，' + remainInfo(app).text;
    case 'COMPLETED': return '已销假，' + fMDHM(app.completedAt) + ' 完成';
    case 'REJECTED': return '未通过，原因见审批信息';
    case 'WITHDRAWN': return '已撤回，记录仅可查看';
    case 'CANCELLED': return '已取消，本次请假未生效';
    default: return '';
  }
}

function timelineHTML(app) {
  const ds = displayStatus(app);
  const od = isOverdue(app);
  const nodes = [];

  const submit = { t: '提交申请', d: fMDHM(app.submittedAt), st: 'is-done' };
  nodes.push(submit);

  if (['REJECTED', 'WITHDRAWN', 'CANCELLED'].indexOf(ds) >= 0) {
    const d = app.approvedAt ? fMDHM(app.approvedAt) + (app.status === 'REJECTED' ? ' · 未通过' : '') : '申请已关闭';
    nodes.push({ t: '审批', d: d, st: 'is-grey' });
    // 只画到第 2 节点，整条转灰
    nodes[0].st = 'is-grey';
    return '<ol class="tl">' + nodes.map((n, i) =>
      '<li class="tl__item ' + n.st + '" aria-label="' + esc(n.t + '，' + n.d) + '">' +
      '<span class="tl__node"></span>' + (i < nodes.length - 1 ? '<span class="tl__line"></span>' : '') +
      '<div class="tl__t">' + n.t + '</div><div class="tl__d">' + esc(n.d) + '</div></li>'
    ).join('') + '</ol>';
  }

  // 节点 2 审批
  if (ds === 'PENDING') {
    nodes.push({ t: '辅导员审批', d: '等待辅导员处理', st: 'is-current' });
  } else {
    nodes.push({ t: '辅导员审批', d: (app.approvedAt ? fMDHM(app.approvedAt) : '—') + (app.approver ? ' · ' + app.approver : ''), st: 'is-done' });
  }

  // 节点 3 开始
  if (ds === 'PENDING') {
    nodes.push({ t: '请假开始', d: '请假尚未开始', st: 'is-pending' });
  } else if (ds === 'APPROVED') {
    nodes.push({ t: '请假开始', d: fMDHM(app.start) + ' 开始', st: 'is-pending' });
  } else if (ds === 'IN_PROGRESS') {
    nodes.push({ t: '请假开始', d: fMDHM(app.start) + (od ? ' 已开始' : ' 已开始'), st: od ? 'is-danger' : 'is-current' });
  } else {
    nodes.push({ t: '请假开始', d: fMDHM(app.start), st: 'is-done' });
  }

  // 节点 4 结束
  if (ds === 'COMPLETED') {
    nodes.push({ t: '请假结束', d: fMDHM(app.completedAt) + ' 销假完成', st: 'is-done' });
  } else if (ds === 'IN_PROGRESS' && od) {
    nodes.push({ t: '请假结束', d: fMDHM(effectiveEndTime(app)) + ' 未结束', st: 'is-pending' });
  } else if (ds === 'IN_PROGRESS') {
    nodes.push({ t: '请假结束', d: fMDHM(effectiveEndTime(app)) + ' 预计', st: 'is-pending' });
  } else {
    nodes.push({ t: '请假结束', d: fMDHM(effectiveEndTime(app)), st: 'is-pending' });
  }

  return '<ol class="tl">' + nodes.map((n, i) =>
    '<li class="tl__item ' + n.st + '" aria-label="' + esc(n.t + '，' + n.d) + '">' +
    '<span class="tl__node"></span>' + (i < nodes.length - 1 ? '<span class="tl__line"></span>' : '') +
    '<div class="tl__t">' + n.t + '</div>' +
    '<div class="tl__d' + (n.st === 'is-danger' ? ' tl__d--danger' : '') + '">' + esc(n.d) + '</div></li>'
  ).join('') + '</ol>';
}

function actionBarS4(app) {
  const ds = displayStatus(app);
  const od = isOverdue(app);
  const extPending = app.ext && app.ext.status === 'PENDING';

  if (ds === 'PENDING') {
    return '<div class="bar"><button class="btn btn--outline btn--block" data-action="s4-withdraw">撤回申请</button></div>';
  }
  if (ds === 'APPROVED') {
    return '<div class="bar"><button class="btn btn--danger-outline btn--block" data-action="s4-cancel">取消申请</button></div>';
  }
  if (ds === 'IN_PROGRESS') {
    const primaryAction = app.scene === 'OFF_CAMPUS' ? 's4-locate' : 's4-finish';
    const primaryText = app.scene === 'OFF_CAMPUS' ? '返校定位并销假' : '确认结束';
    if (od) {
      return '<div class="bar bar--stack">' +
        '<div class="bar__row">' +
          '<button class="link-btn" data-action="s4-extend">申请续假</button>' +
          '<button class="link-btn" data-action="s4-manual">申请人工核验</button>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" data-action="' + primaryAction + '">' + primaryText + '</button>' +
        '</div>';
    }
    // 续假待审批时仍可进入 S5，由 S5 呈现整屏只读（F7）
    return '<div class="bar">' +
      '<button class="btn btn--secondary" data-action="s4-extend">申请续假</button>' +
      '<button class="btn btn--primary" data-action="' + primaryAction + '">' + primaryText + '</button>' +
      '</div>';
  }
  if (ds === 'REJECTED') {
    return '<div class="bar"><button class="btn btn--primary btn--block" data-action="s4-reapply">重新申请</button></div>';
  }
  return ''; // COMPLETED / WITHDRAWN / CANCELLED 无操作栏
}

function renderS4(v) {
  const app = byId(v.entry.params.id) || getMain();
  if (!app) { v.scroll.innerHTML = emptyHTML('s1'); return; }
  const ds = displayStatus(app);
  const od = isOverdue(app);
  const pulse = state.ui.pulseId === app.id;
  state.ui.pulseId = null;

  v.nav.innerHTML = navHTML({ title: '请假详情', back: true });

  const bar = actionBarS4(app);
  v.slot.innerHTML = bar;
  v.el.classList.toggle('has-bar', !!bar);

  const rows = [];
  rows.push(['请假场景', SCENE_TEXT[app.scene]]);
  rows.push(['请假类型', TYPE_TEXT[app.type]]);
  rows.push(['开始时间', fDetail(app.start)]);
  rows.push(['结束时间', fDetail(effectiveEndTime(app))]);
  rows.push(['请假理由', app.reason, true]);
  if (app.scene === 'OFF_CAMPUS') {
    rows.push(['离校去向', app.destination, true]);
    rows.push(['联系电话', app.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')]);
  }

  const approveRows = [
    ['审批状态', app.approvedAt ? (app.status === 'REJECTED' ? '未通过' : '已通过') : '待审批'],
    ['审批人', app.approver || '—'],
    ['审批时间', app.approvedAt ? fMDHM(app.approvedAt) : '—'],
    ['审批意见', app.status === 'REJECTED' ? app.rejectReason : (app.approveComment || '—'), true]
  ];

  const matHTML = app.materials && app.materials.length
    ? '<div class="materials">' + app.materials.map((m, i) =>
        '<div class="up" data-action="mat-view">' + (m.kind === 'preset' ? proofSVG() : '<img src="' + m.src + '" alt="证明材料 ' + (i + 1) + '">') + '</div>'
      ).join('') + '</div>'
    : '<div class="materials__empty">未上传证明材料</div>';

  const extBadge = extBadgeHTML(app);
  const extNote = app.ext && app.ext.status === 'PENDING'
    ? '<div class="concl__note">续假审批通过前仍按原结束时间 ' + fMDHM(effectiveEndTime(app)) + ' 处理</div>'
    : '';
  const manualNote = app.manualPending
    ? '<div class="concl__note">核验申请已提交，等待辅导员处理</div>' : '';

  v.scroll.innerHTML =
    '<div class="pad">' +
      '<div style="height:12px"></div>' +
      '<div class="concl">' +
        '<div class="concl__badges">' +
          (od ? overdueBadgeHTML() : '') +
          mainBadgeHTML(app, pulse) +
          extBadge +
        '</div>' +
        '<div class="concl__text' + (od ? ' concl__text--danger' : '') + '">' + esc(conclusionText(app)) + '</div>' +
        '<div class="concl__meta">编号 ' + app.id + ' · ' + fMDHM(app.submittedAt) + ' 申请</div>' +
        extNote + manualNote +
      '</div>' +
      (od ? '<div class="overdue-bar">' + ic('warn', '16') +
        '<span>本次请假已超过批准结束时间 ' + durText(state.now - effectiveEndTime(app)) + '，请及时销假或申请续假</span></div>' : '') +
      '<div class="card" style="margin-top:12px">' + timelineHTML(app) + '</div>' +

      '<div class="grp"><div class="grp__title">请假信息</div><div class="card">' +
        rows.map(r => rowHTML(r[0], r[1], r[2])).join('') +
      '</div></div>' +

      '<div class="grp"><div class="grp__title">审批信息</div><div class="card">' +
        approveRows.map(r => rowHTML(r[0], r[1], r[2])).join('') +
      '</div></div>' +

      '<div class="grp"><div class="grp__title">证明材料</div><div class="card">' + matHTML + '</div></div>' +
    '</div>';
}

/* ===== S5 续假申请 ===== */
function renderS5(v) {
  const app = byId(v.entry.params.id) || getMain();
  const extPending = app.ext && app.ext.status === 'PENDING';
  const od = isOverdue(app);
  const cur = effectiveEndTime(app);
  const f = state.extForm;
  v.nav.innerHTML = navHTML({ title: '续假申请', back: true });

  const newVal = f.newEnd
    ? '<span>' + fMD(f.newEnd) + ' ' + WD[f.newEnd.getDay()] + '</span><br><span>' + fTime(f.newEnd) + '</span>'
    : '<span class="compare__value--empty">请选择</span>';

  let body =
    '<div class="pad">' +
      '<div class="t-aux" style="padding:12px 0 0">原结束时间在审批通过前保持不变</div>' +
      (od ? '<div class="overdue-bar" style="margin-top:12px">' + ic('warn', '16') +
        '<span>已超过原结束时间，续假通过前仍按逾期处理</span></div>' : '') +
      '<div class="compare" style="margin-top:12px">' +
        '<div class="compare__box"><div class="compare__label">当前结束时间</div>' +
          '<div class="compare__value">' + fMD(cur) + ' ' + WD[cur.getDay()] + '<br>' + fTime(cur) + '</div></div>' +
        '<div class="compare__arrow">' + ic('arrow', '20') + '</div>' +
        '<div class="compare__box compare__box--new"><div class="compare__label">申请延长至</div>' +
          '<div class="compare__value">' + newVal + '</div></div>' +
      '</div>';

  if (extPending) {
    body +=
      '<div class="ext-state">' +
        '<div class="ext-state__row">' + extBadgeHTML(app) + '</div>' +
        '<div class="ext-state__text">' + fMDHM(app.ext.submittedAt) + ' 提交，延长至 ' + fMDHM(app.ext.newEnd) + '</div>' +
      '</div>' +
      '<div class="readonly-hint">续假审批通过前仍按原结束时间 ' + fMDHM(cur) + ' 处理，无需重复提交。</div>' +
      '</div>';
    v.scroll.innerHTML = body;
    v.slot.innerHTML = '<div class="bar"><button class="btn btn--primary btn--block" disabled>续假待审批中</button></div>';
    v.el.classList.add('has-bar');
    return;
  }

  body +=
    '<div class="grp"><div class="grp__title">延长时间</div>' +
      '<div class="form-card" data-field-wrap="newEnd">' +
        '<div class="form-row form-row--btn" data-action="pick-time" data-field="ext">' +
          '<div class="form-row__label">延长至<span class="req"></span></div>' +
          '<div class="form-row__value">' +
            (f.newEnd ? esc(fDetail(f.newEnd)) : '<span class="placeholder">请选择新的结束时间</span>') + ic('right', '16') +
          '</div>' +
        '</div>' +
        '<div class="field-err' + (f.errors && f.errors.newEnd ? ' is-on' : '') + '" data-err="newEnd">' +
          (f.errors && f.errors.newEnd ? esc(f.errors.newEnd) : '') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grp"><div class="grp__title">续假原因</div>' +
      '<div class="form-card" data-field-wrap="reason">' +
        '<div class="ta-wrap">' +
          '<textarea class="ta" data-input="extReason" maxlength="200" placeholder="说明需要延长的原因" aria-label="续假原因">' + esc(f.reason || '') + '</textarea>' +
          '<div class="ta-meta"><span class="ta-meta__hint">辅导员审批时可见</span>' + counterHTML((f.reason || '').length) + '</div>' +
        '</div>' +
        '<div class="field-err' + (f.errors && f.errors.reason ? ' is-on' : '') + '" data-err="reason">' +
          (f.errors && f.errors.reason ? esc(f.errors.reason) : '') + '</div>' +
      '</div>' +
    '</div>' +
    '</div>';

  v.scroll.innerHTML = body;
  v.slot.innerHTML = '<div class="bar"><button class="btn btn--primary btn--block" data-action="submit-ext">提交续假申请</button></div>';
  v.el.classList.add('has-bar');
}

/* ===== S6 定位销假 ===== */
/* fact[0] 为 null 表示「本次实际校验时刻」，由 renderS6 用 state.now 填充；
   只有 locating（尚未校验）保留 — */
const LOC_STATE = {
  locating: {
    ring: 'loc__ring--locating', icon: 'pin', title: '正在获取定位', desc: '请保持页面打开',
    primary: { text: '定位中', action: '', disabled: true }, secondary: null,
    fact: ['—', '—', '校验中']
  },
  success: {
    ring: 'loc__ring--success', icon: 'check', title: '定位校验通过', desc: '已为你完成本次销假',
    primary: { text: '返回申请详情', action: 's6-back' }, secondary: null,
    fact: null
  },
  out_of_range: {
    ring: 'loc__ring--danger', icon: 'warn', title: '当前位置不在校园范围', desc: '请在返校后重试，或申请人工核验',
    primary: { text: '重新定位', action: 's6-relocate' }, secondary: { text: '申请人工核验', action: 's6-manual' },
    fact: [null, '约 2.4 公里', '未通过']
  },
  permission_denied: {
    ring: 'loc__ring--danger', icon: 'warn', title: '未获得定位权限', desc: '需允许定位后重试，或申请人工核验',
    primary: { text: '重新定位', action: 's6-relocate' }, secondary: { text: '申请人工核验', action: 's6-manual' },
    fact: [null, '—', '未获得授权']
  },
  gps_failed: {
    ring: 'loc__ring--danger', icon: 'warn', title: '定位失败', desc: '请到开阔处重试，或申请人工核验',
    primary: { text: '重新定位', action: 's6-relocate' }, secondary: { text: '申请人工核验', action: 's6-manual' },
    fact: [null, '—', '定位失败']
  },
  manual_pending: {
    ring: 'loc__ring--info', icon: 'info', title: '核验申请已提交', desc: '辅导员处理后会通知你，期间仍为请假中',
    primary: { text: '返回申请详情', action: 's6-back' }, secondary: null,
    fact: null
  }
};

function renderS6(v) {
  const app = byId(v.entry.params.id) || getMain();
  const phase = state.ui.locPhase;
  const st = LOC_STATE[phase] || LOC_STATE.locating;
  v.nav.innerHTML = navHTML({ title: '返校定位销假', back: true });

  /* 失败态也要给出「本次实际校验时刻」，只有 locating 显示 — */
  const base = st.fact || [null, phase === 'success' ? '约 180 米' : '—', phase === 'success' ? '通过' : '已提交核验'];
  const facts = base.map((val, i) => (i === 0 && val === null ? fMDHM(state.now) : val));

  v.scroll.innerHTML =
    '<div class="loc">' +
      '<div class="loc__ring ' + st.ring + '">' +
        '<div class="loc__core">' + ic(st.icon) + '</div>' +
      '</div>' +
      '<div class="loc__result">' +
        '<div class="loc__title' + (st.ring.indexOf('danger') >= 0 ? ' loc__title--danger' : '') + '">' + esc(st.title) + '</div>' +
        '<div class="loc__desc">' + esc(st.desc) + '</div>' +
      '</div>' +
      '<div class="loc__facts"><div class="card">' +
        ['校验时间', '与校门距离', '校验结果'].map((label, i) =>
          '<div class="row"><div class="row__label">' + label + '</div>' +
          '<div class="row__value' + (i === 2 && phase !== 'locating' && phase !== 'success' ? ' row__value--multi' : '') + '">' +
          esc(facts[i]) + '</div></div>'
        ).join('') +
      '</div></div>' +
    '</div>';

  const p = st.primary;
  const s = st.secondary;
  v.slot.innerHTML = '<div class="bar">' +
    (s ? '<button class="btn btn--secondary" data-action="' + s.action + '">' + s.text + '</button>' : '') +
    '<button class="btn btn--primary' + (s ? '' : ' btn--block') + '"' +
    (p.disabled ? ' disabled' : ' data-action="' + p.action + '"') + '>' + p.text + '</button>' +
    '</div>';
  v.el.classList.add('has-bar');
}

/* ===== S7 消息列表 ===== */
function renderS7(v) {
  const unread = unreadCount();
  v.nav.innerHTML = navHTML({
    title: '消息',
    right: unread > 0 ? '全部已读' : '',
    rightAction: 's7-read-all'
  });
  v.slot.innerHTML = '';

  if (!state.messages.length) {
    v.scroll.innerHTML = '<div style="height:12px"></div>' + emptyHTML('s7');
    return;
  }
  v.scroll.innerHTML = '<div class="msgs">' + state.messages.map(m =>
    '<button class="msg' + (m.unread ? ' is-unread' : '') + '" data-action="open-msg" data-id="' + m.id + '">' +
      '<span class="msg__icon msg__icon--' + m.tone + '">' + ic(m.icon, '16') + '</span>' +
      '<span class="msg__main">' +
        '<span class="msg__title">' + esc(m.title) + '</span>' +
        '<span class="msg__body">' + esc(m.body.join(' ')) + '</span>' +
        '<span class="msg__time">' + (isSameDay(m.time, state.now) ? fTime(m.time) : fMDHM(m.time)) + '</span>' +
      '</span>' +
    '</button>'
  ).join('') + '</div>';
}

/* ===== S8 消息详情 ===== */
function renderS8(v) {
  const m = state.messages.find(x => x.id === v.entry.params.id);
  v.nav.innerHTML = navHTML({ title: '消息详情', back: true });
  if (!m) { v.scroll.innerHTML = ''; v.slot.innerHTML = ''; return; }

  const toneCls = m.tone === 'success' ? 'badge--approved' : m.tone === 'danger' ? 'badge--rejected' : 'badge--progress';
  const rel = m.rel;
  const relApp = rel ? byId(rel.no) : null;
  const bar = rel
    ? (relApp
        ? '<div class="bar"><button class="btn btn--primary btn--block" data-action="s8-open-app" data-id="' + relApp.id + '">查看申请详情</button></div>'
        : '<div class="bar"><button class="btn btn--primary btn--block" disabled>关联申请已无法查看</button></div>')
    : '';

  v.slot.innerHTML = bar;
  v.el.classList.toggle('has-bar', !!bar);

  v.scroll.innerHTML =
    '<div class="md">' +
      '<span class="badge ' + toneCls + '">' + m.badge + '</span>' +
      '<h1 class="md__title">' + esc(m.title) + '</h1>' +
      '<div class="md__time">' + fMDHM(m.time) + '</div>' +
      '<div class="md__body">' + m.body.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
      (rel ? '<div class="md__rel">' +
        '<p>申请编号 ' + rel.no + '</p>' +
        '<p>时间区间 ' + rel.span + '</p>' +
        '<p>当前状态 ' + (relApp ? STATUS_META[displayStatus(relApp)].text : rel.status) + '</p>' +
        '</div>' : '') +
    '</div>';
}

/* ===== S9 我的 ===== */
function renderS9(v) {
  const s = stats();
  const st = state.student;
  v.nav.innerHTML = navHTML({ title: '我的' });
  v.slot.innerHTML = '';

  v.scroll.innerHTML =
    '<div class="profile">' +
      '<div class="avatar" aria-hidden="true">' + st.name.charAt(0) + '</div>' +
      '<div class="profile__name">' + st.name + '</div>' +
      '<div class="profile__meta">' + st.no + ' · ' + st.cls + '</div>' +
    '</div>' +

    '<div class="stats">' +
      statHTML(s.total, '累计申请') +
      statHTML(s.approved, '已批准') +
      statHTML(s.completed, '已销假') +
      statHTML(s.ongoing, '进行中') +
    '</div>' +

    '<div class="card s9-card">' +
      infoRow('学号', st.no) +
      infoRow('班级', st.cls) +
      infoRow('专业', st.major) +
      infoRow('联系电话', st.phoneMask) +
    '</div>' +

    '<div class="card s9-card">' +
      infoRow('辅导员', st.counselor) +
      infoRow('联系电话', st.counselorPhone) +
    '</div>' +

    '<div class="card s9-card">' +
      /* 行高 72：标题 15/24 + 副文案 13/20，上下 padding 14，开关垂直居中 */
      '<div class="fn-row fn-row--tall">' +
        '<div class="fn-row__main">' +
          '<div class="fn-row__title">未读红点提醒</div>' +
          '<div class="fn-row__sub">关闭后仍可查看消息，仅不再提示未读</div>' +
        '</div>' +
        '<span class="fn-row__right">' +
          '<button class="sw' + (state.ui.badgeEnabled ? ' is-on' : '') + '" role="switch" ' +
          'aria-checked="' + state.ui.badgeEnabled + '" aria-label="未读红点提醒" data-action="toggle-badge"></button>' +
        '</span>' +
      '</div>' +
      '<button class="fn-row" data-action="about-app"><span class="fn-row__label">关于系统</span>' +
        '<span class="fn-row__right">' + ic('right', '16') + '</span></button>' +
    '</div>' +
    '<div style="height:64px"></div>';
}

function statHTML(n, label) {
  return '<div class="stat"><div class="stat__n">' + n + '</div><div class="stat__l">' + label + '</div></div>';
}
function infoRow(label, value) {
  return '<div class="row"><div class="row__label">' + label + '</div>' +
    '<div class="row__value">' + esc(value) + '</div></div>';
}
/**
 * 详情行
 * 短值：左 label 88 / 右 value 右对齐单行
 * 长文本（请假理由 / 离校去向 / 审批意见 / 驳回原因）：上下结构，label 13/20 在上、value 15/24 左对齐在下，
 * 行高自适应，与短值行之间沿用 1px #EDF0F5 分隔线，避免右对齐长段落读不出断句
 */
function rowHTML(label, value, multi) {
  if (!multi) return infoRow(label, value);
  return '<div class="row row--stack"><div class="row__label">' + label + '</div>' +
    '<div class="row__value">' + esc(value) + '</div></div>';
}

/* ============================================================
   7. 路由与挂载
   ============================================================ */
const RENDERERS = { S1: renderS1, S2: renderS2, S3: renderS3, S4: renderS4, S5: renderS5, S6: renderS6, S7: renderS7, S8: renderS8, S9: renderS9 };
const TAB_IDS = ['S1', 'S3', 'S7', 'S9'];

const stackEl = document.getElementById('stack');
const pushLayer = document.getElementById('pushLayer');
const layerRoot = document.getElementById('layerRoot');
const tabbarEl = document.getElementById('tabbar');
const statusTimeEl = document.getElementById('statusbarTime');
const tabNodes = {};
let pushEls = [];

/* 页面外壳：navbar / 滚动区 / 操作栏槽位（滚动区不重建 → 保留滚动位置） */
function createPageShell(id, kind) {
  const el = document.createElement('section');
  el.className = 'page' + (kind === 'push' ? ' page--push' : '');
  el.dataset.page = id;
  el.dataset.kind = kind;
  el.innerHTML = '<div class="navbar"></div><div class="page__scroll"></div><div class="bar-slot"></div>';
  const nav = el.querySelector('.navbar');
  el.querySelector('.page__scroll').addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', this.scrollTop > 0);
    const fw = this.querySelector('.filters-wrap');
    if (fw) fw.classList.toggle('is-scrolled', this.scrollTop > 0);
  }, { passive: true });
  return el;
}

function mountPage(el, entry) {
  const view = {
    el: el,
    entry: entry,
    nav: el.querySelector('.navbar'),
    scroll: el.querySelector('.page__scroll'),
    slot: el.querySelector('.bar-slot')
  };
  const fn = RENDERERS[entry.id];
  if (!fn) return;
  fn(view);
  // 操作栏存在 → 滚动区底部留 80，避免内容被遮
  el.classList.toggle('has-bar', !!el.querySelector('.bar-slot .bar'));
}

function currentPageEl() {
  if (state.route.length > 1) return pushEls[pushEls.length - 1];
  return tabNodes[state.route[0].id];
}

/* 切换 tab：保留滚动位置与筛选态（DOM 不销毁，仅重渲染数据） */
function go(tabId) {
  closeLayerAll(true);
  state.route = [{ id: tabId }];
  pushEls.forEach(el => el.remove());
  pushEls = [];
  TAB_IDS.forEach(id => {
    const el = tabNodes[id];
    el.classList.toggle('is-active', id === tabId);
  });
  renderTab(tabId);
  renderTabbar();
  updateFabPos();
}

function renderTab(id) {
  const el = tabNodes[id];
  if (!el) return;
  mountPage(el, { id: id });
}

function push(id, params) {
  const entry = { id: id, params: params || {} };
  const el = createPageShell(id, 'push');
  el.classList.add('page--enter');
  pushLayer.appendChild(el);
  state.route.push(entry);
  pushEls.push(el);
  mountPage(el, entry);
  setTimeout(() => el.classList.remove('page--enter'), 340);
  updateFabPos();
  return el;
}

function pop() {
  if (state.route.length <= 1) return;
  const el = pushEls.pop();
  state.route.pop();
  if (el) {
    el.classList.add('page--leave');
    setTimeout(() => el.remove(), 180);
  }
  // 返回后刷新下层（S4 需要反映 S5/S6 的结果）
  const top = state.route[state.route.length - 1];
  if (top.id === 'S4' && pushEls.length) mountPage(pushEls[pushEls.length - 1], top);
  else if (TAB_IDS.indexOf(top.id) >= 0) renderTab(top.id);
  renderTabbar();
  updateFabPos();
}

/** replace：S2 提交成功后以 S4 替换栈顶，返回直达 S1 */
function replaceTop(id, params) {
  const entry = { id: id, params: params || {} };
  state.route[state.route.length - 1] = entry;
  const el = pushEls[pushEls.length - 1];
  if (!el) { push(id, params); return; }
  el.dataset.page = id;
  mountPage(el, entry);
  updateFabPos();
}

/** 返回：S2/S5 有改动先确认「放弃本次填写？」 */
function tryBack() {
  const top = state.route[state.route.length - 1];
  if (top.id === 'S2' && state.form.dirty) {
    confirmDialog({
      title: '放弃本次填写？',
      body: '已填写的内容不会保存。',
      cancelText: '继续填写',
      confirmText: '放弃',
      danger: true,
      onConfirm: () => { state.form.dirty = false; pop(); }
    });
    return;
  }
  if (top.id === 'S5' && state.extForm.dirty) {
    confirmDialog({
      title: '放弃本次填写？',
      body: '已填写的内容不会保存。',
      cancelText: '继续填写',
      confirmText: '放弃',
      danger: true,
      onConfirm: () => { state.extForm.dirty = false; pop(); }
    });
    return;
  }
  pop();
}

function renderTabbar() {
  const tabId = state.route[0].id;
  Array.prototype.forEach.call(tabbarEl.querySelectorAll('.tabbar__item'), btn => {
    btn.setAttribute('aria-selected', btn.dataset.id === tabId ? 'true' : 'false');
  });
  const pill = document.getElementById('msgPill');
  /* 红点受 S9「未读红点提醒」开关控制；消息列表未读样式不受影响 */
  const n = state.ui.badgeEnabled ? unreadCount() : 0;
  pill.hidden = n <= 0;
  pill.textContent = n > 99 ? '99+' : String(n);
  const msgBtn = tabbarEl.querySelector('[data-id="S7"]');
  msgBtn.setAttribute('aria-label', n > 0 ? '消息，' + n + ' 条未读' : '消息');
}

/**
 * 演示入口定位
 *  ≥900px：停靠到手机壳右侧外 20px，垂直与 tabBar 居中对齐（壳内零悬浮元素，论文截图零遮挡）
 *  <900px：仍在壳内右下悬浮，有操作栏时抬高到 96（避开操作栏），tab 页 78
 *  位置一律由手机壳矩形反算，保证不同视口/滚动下都贴合
 */
function updateFabPos() {
  const anchor = document.getElementById('demoAnchor');
  if (!anchor) return;
  const fab = document.getElementById('demoFab');
  const hot = document.getElementById('demoHot');
  const phone = document.getElementById('phone');

  /* 显隐：隐藏后换成 24×24 透明热区唤回 */
  fab.hidden = !state.demo.visible;
  hot.hidden = state.demo.visible;

  /* 浮层（遮罩/sheet/dialog）打开时收起入口，避免压在遮罩之上 */
  anchor.classList.toggle('is-dim', !!layerRoot.querySelector('.mask'));

  const el = currentPageEl();
  const hasBar = !!(el && el.querySelector('.bar'));

  /* 每次重算前清空，避免 is-docked 与窄屏规则互相残留 */
  anchor.classList.remove('is-docked', 'is-up');
  anchor.style.left = anchor.style.right = anchor.style.top = anchor.style.bottom = '';
  if (!phone) return;

  const FAB = 44;
  const r = phone.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw >= 900) {
    /* 桌面：壳右侧外 20px，与 tabBar 垂直居中 */
    const tab = tabbarEl.getBoundingClientRect();
    const centerY = tab.height ? tab.top + (tab.height - FAB) / 2 : r.bottom - FAB - 16;
    anchor.classList.add('is-docked');
    anchor.style.left = Math.round(r.right + 20) + 'px';
    anchor.style.top = Math.round(Math.min(Math.max(centerY, 8), vh - FAB - 8)) + 'px';
  } else {
    /* 窄屏：壳内右下悬浮，距壳右边 20px、距壳底 78 / 96 */
    anchor.classList.add('is-up');
    const offsetY = hasBar ? 96 : 78;
    anchor.style.right = Math.round(Math.max(vw - r.right + 20, 20)) + 'px';
    anchor.style.bottom = Math.round(Math.max(vh - r.bottom + offsetY, 12)) + 'px';
  }
}

/** 兜底全量渲染 */
function renderAll() {
  state.now = computeNow();
  statusTimeEl.textContent = fTime(state.now);
  renderTabbar();
  renderTab(state.route[0].id);
  state.route.forEach((entry, i) => {
    if (i > 0 && pushEls[i - 1]) mountPage(pushEls[i - 1], entry);
  });
  updateFabPos();
}

/* ============================================================
   8. 浮层：Toast / 弹窗 / 底部面板 / 时间选择
   ============================================================ */
let activeDialog = null;
let fabSuppressed = false;   // 长按隐藏演示入口后，抑制随之而来的 click

function toast(msg, kind) {
  Array.prototype.forEach.call(layerRoot.querySelectorAll('.toast'), el => el.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const icon = kind === 'success' ? ic('check', '16') : kind === 'error' ? ic('warn', '16') : '';
  el.innerHTML = icon + '<span>' + esc(msg) + '</span>';
  layerRoot.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), 220);
  }, 2000);
}

function confirmDialog(opt) {
  closeDialog();
  const mask = document.createElement('div');
  mask.className = 'mask';
  const dlg = document.createElement('div');
  dlg.className = 'dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', opt.title);
  dlg.innerHTML =
    '<div class="dialog__title">' + esc(opt.title) + '</div>' +
    '<div class="dialog__body">' + esc(opt.body) + '</div>' +
    '<div class="dialog__btns">' +
      '<button data-dlg="cancel">' + esc(opt.cancelText || '取消') + '</button>' +
      '<button data-dlg="ok" class="' + (opt.danger ? 'is-danger' : '') + '">' + esc(opt.confirmText || '确认') + '</button>' +
    '</div>';
  layerRoot.appendChild(mask);
  layerRoot.appendChild(dlg);
  activeDialog = { mask: mask, dlg: dlg, trigger: document.activeElement };
  updateFabPos();          // 遮罩出现 → 收起演示入口

  const cancelBtn = dlg.querySelector('[data-dlg="cancel"]');
  cancelBtn.focus();

  function close() {
    mask.classList.add('is-closing');
    dlg.classList.add('is-closing');
    setTimeout(() => { mask.remove(); dlg.remove(); updateFabPos(); }, 200);
    activeDialog = null;
    if (dlg._trigger && dlg._trigger.focus) dlg._trigger.focus();
  }
  dlg._trigger = activeDialog.trigger;
  dlg._close = close;

  cancelBtn.addEventListener('click', close);
  dlg.querySelector('[data-dlg="ok"]').addEventListener('click', () => {
    close();
    if (opt.onConfirm) opt.onConfirm();
  });
  mask.addEventListener('click', close);
}

function closeDialog() {
  if (activeDialog && activeDialog.dlg._close) activeDialog.dlg._close();
  activeDialog = null;
}

let activeSheet = null;
function openSheet(innerHTML, opt) {
  opt = opt || {};
  closeSheet();
  const mask = document.createElement('div');
  mask.className = 'mask mask--dark';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', opt.title || '');
  sheet.innerHTML = innerHTML;
  layerRoot.appendChild(mask);
  layerRoot.appendChild(sheet);
  activeSheet = { mask: mask, sheet: sheet, trigger: document.activeElement };
  updateFabPos();          // 遮罩出现 → 收起演示入口

  mask.addEventListener('click', () => closeSheet());
  const closeBtn = sheet.querySelector('[data-sheet-close]');
  if (closeBtn) closeBtn.addEventListener('click', () => closeSheet());
  sheet.addEventListener('click', e => {
    const cancel = e.target.closest('[data-sheet-cancel]');
    if (cancel) closeSheet();
  });
  return sheet;
}

function closeSheet(cb) {
  if (!activeSheet) { if (cb) cb(); return; }
  const s = activeSheet;
  activeSheet = null;
  s.mask.classList.add('is-closing');
  s.sheet.classList.add('is-closing');
  setTimeout(() => {
    s.mask.remove();
    s.sheet.remove();
    updateFabPos();        // 遮罩移除 → 恢复演示入口
    if (s.trigger && s.trigger.focus) s.trigger.focus();
    if (cb) cb();
  }, 200);
}

function closeLayerAll(silent) {
  if (activeSheet) closeSheet();
  if (activeDialog) closeDialog();
  Array.prototype.forEach.call(layerRoot.querySelectorAll('.toast'), el => el.remove());
}

/* ===== 自定义时间选择面板（日期列 + 小时列 + 分钟列） ===== */
function openTimePicker(which) {
  const app = which === 'ext'
    ? (byId(state.route[state.route.length - 1].params.id) || getMain())
    : null;
  const baseStart = which === 'start' ? state.now
    : which === 'end' ? (state.form.start || state.now)
    : effectiveEndTime(app);
  const minAllowed = which === 'start' ? null : addMin(baseStart, 10);
  const cur = which === 'start' ? state.form.start
    : which === 'end' ? state.form.end
    : state.extForm.newEnd;
  const initial = cur || (which === 'start' ? ceil10(state.now) : addMin(baseStart, 120));

  const dayList = [];
  const day0 = startOfDay(which === 'start' ? state.now : baseStart);
  for (let i = 0; i < 31; i++) dayList.push(new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + i));
  const hours = []; for (let i = 0; i < 24; i++) hours.push(i);
  const mins = []; for (let i = 0; i < 60; i += 5) mins.push(i);

  const dIdx = Math.max(0, dayList.findIndex(d => isSameDay(d, initial)));
  const hIdx = initial.getHours();
  const mIdx = Math.max(0, Math.round(initial.getMinutes() / 5));

  const pick = { d: dIdx, h: hIdx, m: mIdx };

  const title = which === 'start' ? '选择开始时间' : which === 'end' ? '选择结束时间' : '选择延长时间';
  const html =
    '<div class="picker">' +
      '<div class="picker__head">' +
        '<button data-picker-cancel>取消</button>' +
        '<span>' + title + '</span>' +
        '<button class="picker__ok" data-picker-ok>确定</button>' +
      '</div>' +
      '<div class="picker__cols">' +
        '<div class="picker__band"></div>' +
        '<div class="picker__fade picker__fade--top"></div>' +
        '<div class="picker__fade picker__fade--bot"></div>' +
        '<div class="picker__col" data-col="d" role="listbox" aria-label="日期">' +
          dayList.map((d, i) => '<div class="picker__item' + (i === dIdx ? ' is-on' : '') + '" data-idx="' + i + '">' +
            (d.getMonth() + 1) + '.' + d.getDate() + ' ' + WD[d.getDay()] + '</div>').join('') +
        '</div>' +
        '<div class="picker__col" data-col="h" role="listbox" aria-label="小时">' +
          hours.map(h => '<div class="picker__item' + (h === hIdx ? ' is-on' : '') + '" data-idx="' + h + '">' + p2(h) + ' 时</div>').join('') +
        '</div>' +
        '<div class="picker__col" data-col="m" role="listbox" aria-label="分钟">' +
          mins.map((m, i) => '<div class="picker__item' + (i === mIdx ? ' is-on' : '') + '" data-idx="' + i + '">' + p2(m) + ' 分</div>').join('') +
        '</div>' +
      '</div>' +
    '</div>';

  const sheet = openSheet(html, { title: title });

  const cols = {
    d: sheet.querySelector('[data-col="d"]'),
    h: sheet.querySelector('[data-col="h"]'),
    m: sheet.querySelector('[data-col="m"]')
  };
  const lists = { d: dayList, h: hours, m: mins };

  requestAnimationFrame(() => {
    cols.d.scrollTop = dIdx * 36;
    cols.h.scrollTop = hIdx * 36;
    cols.m.scrollTop = mIdx * 36;
  });

  function sync(colKey) {
    const col = cols[colKey];
    const idx = Math.max(0, Math.min(lists[colKey].length - 1, Math.round(col.scrollTop / 36)));
    if (pick[colKey] === idx) return;
    pick[colKey] = idx;
    Array.prototype.forEach.call(col.querySelectorAll('.picker__item'), (it, i) => {
      it.classList.toggle('is-on', i === idx);
    });
  }
  ['d', 'h', 'm'].forEach(k => {
    let timer = null;
    cols[k].addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => sync(k), 60);
    }, { passive: true });
  });

  sheet.querySelector('[data-picker-cancel]').addEventListener('click', () => closeSheet());
  sheet.querySelector('[data-picker-ok]').addEventListener('click', () => {
    const d = dayList[pick.d];
    let result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours[pick.h], mins[pick.m], 0, 0);
    if (minAllowed && result.getTime() < minAllowed.getTime()) result = minAllowed; // picker 最小值
    applyPicked(which, result);
    closeSheet();
  });
}

function applyPicked(which, d) {
  if (which === 'start') {
    state.form.start = d;
    state.form.dirty = true;
    if (state.form.end && state.form.end <= d) state.form.end = null;
    clearFormError('start'); clearFormError('end');
    mountPage(currentPageEl(), state.route[state.route.length - 1]);
  } else if (which === 'end') {
    state.form.end = d;
    state.form.dirty = true;
    clearFormError('end');
    mountPage(currentPageEl(), state.route[state.route.length - 1]);
  } else {
    state.extForm.newEnd = d;
    state.extForm.dirty = true;
    state.extForm.errors = {};
    mountPage(currentPageEl(), state.route[state.route.length - 1]);
  }
}

/* ============================================================
   9. 校验与业务动作
   ============================================================ */
function hasConflict(start, end) {
  return allApps().some(a => {
    const s = displayStatus(a);
    if (['PENDING', 'APPROVED', 'IN_PROGRESS'].indexOf(s) < 0) return false;
    return start.getTime() < effectiveEndTime(a).getTime() && end.getTime() > a.start.getTime();
  });
}

function validateApply() {
  const f = state.form;
  const errs = {};
  if (!f.scene) errs.scene = '请选择请假场景';
  if (!f.type) errs.type = '请选择请假类型';
  if (!f.start) errs.start = '请选择开始时间';
  if (!f.end) errs.end = '请选择结束时间';
  if (f.start && f.end) {
    if (f.end.getTime() <= f.start.getTime()) errs.end = '结束时间需晚于开始时间';
    else if (hasConflict(f.start, f.end)) errs.end = '该时间段与已有请假记录重叠，请修改请假时间后重新提交';
  }
  if (!f.reason.trim()) errs.reason = '请填写请假理由';
  else if (f.reason.length > 200) errs.reason = '请假理由不超过 200 字';
  if (f.scene === 'OFF_CAMPUS') {
    if (!f.destination.trim()) errs.destination = '请填写离校去向';
    if (!/^1[3-9]\d{9}$/.test((f.phone || '').trim())) errs.phone = '请填写正确的手机号';
  }
  if (f.type === 'SICK' && f.materials.length < 1) errs.materials = '病假需上传证明材料';
  return errs;
}

function clearFormError(name) {
  if (state.form.errors) delete state.form.errors[name];
  if (state.extForm.errors) delete state.extForm.errors[name];
}

function scrollToField(name) {
  const el = currentPageEl();
  if (!el) return;
  const wrap = el.querySelector('[data-field-wrap="' + name + '"]');
  if (wrap) wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', on);
  if (on) btn.setAttribute('disabled', 'disabled');
  else btn.removeAttribute('disabled');
}

let submitLock = 0;
function submitApply(btn) {
  const now = Date.now();
  if (now - submitLock < 2000) return;      // 2s 内重复点击忽略
  const errs = validateApply();
  state.form.errors = errs;
  const first = Object.keys(errs)[0];
  mountPage(currentPageEl(), state.route[state.route.length - 1]);
  if (first) {
    scrollToField(first);
    return;
  }
  submitLock = now;
  const page = currentPageEl();
  const btns = page.querySelectorAll('[data-action="submit-apply"]');
  setLoading(btns[0], true);
  page.querySelector('.page__scroll').style.pointerEvents = 'none';

  setTimeout(() => {
    const f = state.form;
    const seq = String(state.applications.length + 1).padStart(3, '0');
    const app = {
      id: 'CL' + YEAR + '1016' + seq,
      isMain: false,
      scene: f.scene, type: f.type, status: 'PENDING',
      start: f.start, end: f.end,
      reason: f.reason.trim(), destination: f.destination.trim(), phone: f.phone.trim(),
      submittedAt: state.now, approvedAt: null, approver: '', approveComment: '',
      rejectReason: '', completedAt: null,
      materials: f.materials.slice(),
      ext: { status: 'NONE', newEnd: null, submittedAt: null, reason: '' }
    };
    state.applications.unshift(app);
    replaceTop('S4', { id: app.id });
    toast('申请已提交，等待辅导员审批', 'success');
    renderTabbar();
    submitLock = 0;
  }, 800);
}

let extLock = 0;
function submitExtension(btn) {
  if (Date.now() - extLock < 2000) return;
  const app = byId(state.route[state.route.length - 1].params.id) || getMain();
  const f = state.extForm;
  const errs = {};
  if (!f.reason || !f.reason.trim()) errs.reason = '请填写续假原因';
  const min = addMin(effectiveEndTime(app), 10);
  if (!f.newEnd) errs.newEnd = '请选择新的结束时间';
  else if (f.newEnd.getTime() < min.getTime()) {
    errs.newEnd = '新结束时间需晚于当前结束时间 ' + fMDHM(effectiveEndTime(app));
  }
  f.errors = errs;
  if (Object.keys(errs).length) {
    mountPage(currentPageEl(), state.route[state.route.length - 1]);
    scrollToField(Object.keys(errs)[0]);
    return;
  }
  extLock = Date.now();
  setLoading(btn, true);
  setTimeout(() => {
    app.ext = {
      status: 'PENDING', newEnd: f.newEnd, submittedAt: state.now, reason: f.reason.trim()
    };
    state.extForm.dirty = false;
    state.demo.extStatus = 'PENDING';
    pop();
    toast('续假申请已提交', 'success');
  }, 700);
}

/* 定位销假：进入自动跑一次 */
function runLocate() {
  clearTimeout(state.ui.locTimer);
  state.ui.locPhase = 'locating';
  const el = currentPageEl();
  if (el) mountPage(el, state.route[state.route.length - 1]);
  state.ui.locTimer = setTimeout(() => {
    // 用户已离开定位页 → 放弃本次校验，不写状态
    if (state.route[state.route.length - 1].id !== 'S6') { state.ui.locPhase = 'locating'; return; }
    const r = state.demo.locResult;
    if (r === 'pass') {
      const app = byId(state.route[state.route.length - 1].params.id) || getMain();
      app.status = 'COMPLETED';
      app.completedAt = state.now;
      app.manualPending = false;
      state.ui.locPhase = 'success';
      state.ui.pulseId = app.id;
    } else if (r === 'out') {
      state.ui.locPhase = 'out_of_range';
    } else if (r === 'deny') {
      state.ui.locPhase = 'permission_denied';
    } else {
      state.ui.locPhase = 'gps_failed';
    }
    mountPage(currentPageEl(), state.route[state.route.length - 1]);
    renderTabbar();
    // 只有 success 写 COMPLETED，失败一律保持 IN_PROGRESS
  }, 1500);
}

/* ============================================================
   10. 演示控制层
   ============================================================ */
const DEMO_STATUS = [
  { k: 'NONE', label: '无' },
  { k: 'PENDING', label: '待审批' },
  { k: 'APPROVED', label: '已通过' },
  { k: 'IN_PROGRESS_ON', label: '请假中（校内）' },
  { k: 'IN_PROGRESS_OFF', label: '请假中（离校）' },
  { k: 'OVERDUE_OFF', label: '逾期（离校）' },
  { k: 'COMPLETED', label: '已销假' },
  { k: 'REJECTED', label: '已驳回' },
  { k: 'WITHDRAWN', label: '已撤回' },
  { k: 'CANCELLED', label: '已取消' }
];
const DEMO_TIME = [
  { k: 'real', label: '真实时间' },
  { k: 'fixed', label: '固定 10.16 09:42' },
  { k: 'inprogress', label: '推进到请假中 10.16 18:30' },
  { k: 'overdue', label: '推进到逾期 10.17 12:30' }
];
const DEMO_EXT = [
  { k: 'NONE', label: '无续假' },
  { k: 'PENDING', label: '续假待审批' },
  { k: 'APPROVED', label: '续假审批通过' },
  { k: 'REJECTED', label: '续假被驳回' }
];
const DEMO_LOC = [
  { k: 'pass', label: '通过' },
  { k: 'out', label: '范围外' },
  { k: 'deny', label: '拒绝授权' },
  { k: 'fail', label: '定位失败' }
];

function computeNow() {
  if (state.nowMode === 'fixed') return dt(10, 16, 9, 42);
  if (state.nowMode === 'inprogress') return dt(10, 16, 18, 30);
  if (state.nowMode === 'overdue') return dt(10, 17, 12, 30);
  // 真实时间：取系统时钟时分，锚定演示日 10.16（避免与演示数据日期冲突）
  const r = new Date();
  return new Date(YEAR, 9, 16, r.getHours(), r.getMinutes(), 0, 0);
}

/** 演示状态在界面上高亮哪一项（由数据反推，保证与真实渲染一致） */
function activeDemoStatus() {
  if (state.demo.status === 'NONE') return 'NONE';
  const m = getMain();
  const ds = displayStatus(m);
  if (ds === 'IN_PROGRESS') {
    if (isOverdue(m)) return m.scene === 'OFF_CAMPUS' ? 'OVERDUE_OFF' : 'IN_PROGRESS_ON';
    return m.scene === 'OFF_CAMPUS' ? 'IN_PROGRESS_OFF' : 'IN_PROGRESS_ON';
  }
  if (ds === 'APPROVED') return 'APPROVED';
  return ds; // PENDING / COMPLETED / REJECTED / WITHDRAWN / CANCELLED
}

function applyDemoStatus(key) {
  const m = getMain();
  m.status = 'IN_PROGRESS';
  m.scene = 'OFF_CAMPUS';
  m.start = dt(10, 16, 18, 0);
  m.end = dt(10, 17, 12, 0);
  m.approvedAt = dt(10, 16, 10, 5);
  m.approver = '李老师';
  m.completedAt = null;
  m.rejectReason = '';
  m.approveComment = '同意，请注意出行安全，返校后完成定位销假。';
  m.manualPending = false;
  // 主记录换状态时复位续假（续假属于该条记录，换场景等于换了一条记录）
  if (state.demo.extStatus !== 'NONE') {
    state.demo.extStatus = 'NONE';
    m.ext = { status: 'NONE', newEnd: null, submittedAt: null, reason: '' };
  }

  switch (key) {
    case 'NONE': break;
    case 'PENDING': m.status = 'PENDING'; m.approvedAt = null; m.approver = ''; m.approveComment = ''; break;
    case 'APPROVED': m.status = 'APPROVED'; break;
    case 'IN_PROGRESS_ON': m.scene = 'ON_CAMPUS'; m.destination = ''; break;
    case 'IN_PROGRESS_OFF': break;
    case 'OVERDUE_OFF': state.nowMode = 'overdue'; break;
    case 'COMPLETED': m.status = 'COMPLETED'; m.completedAt = dt(10, 17, 12, 4); break;
    case 'REJECTED':
      m.status = 'REJECTED';
      m.rejectReason = '请假事由描述过于简单，无法判断必要性，请补充具体事项、去向及联系方式后重新提交。';
      break;
    case 'WITHDRAWN': m.status = 'WITHDRAWN'; break;
    case 'CANCELLED': m.status = 'CANCELLED'; break;
  }
  state.demo.status = key;
  state.demo.scene = m.scene;
  // 逾期是「时间推进」造成的计算态：切到非逾期场景时把时间退回请假中，
  // 否则会残留上一次的 10.17 12:30，导致新状态直接显示逾期
  if (key !== 'OVERDUE_OFF' && state.nowMode === 'overdue') state.nowMode = 'inprogress';

  // 状态与时间自洽：已通过必须落在开始时间之前；请假中必须已经过了开始时间
  state.now = computeNow();
  if (key === 'APPROVED' && state.now.getTime() >= m.start.getTime()) state.nowMode = 'fixed';
  if ((key === 'IN_PROGRESS_ON' || key === 'IN_PROGRESS_OFF' || key === 'OVERDUE_OFF') &&
      state.now.getTime() < m.start.getTime()) state.nowMode = 'inprogress';
  state.now = computeNow();

  // 若当前在详情类页面而目标状态无该记录 → 先 pop 回首页
  if (key === 'NONE' && state.route.length > 1) {
    go('S1');
  }
  renderAll();
  saveDemo();
  toast('演示数据已更新');
}

function applyExtStatus(v) {
  const m = getMain();
  state.demo.extStatus = v;
  if (v === 'NONE') {
    m.ext = { status: 'NONE', newEnd: null, submittedAt: null, reason: '' };
  } else {
    m.ext = {
      status: v,
      newEnd: dt(10, 17, 18, 0),
      submittedAt: dt(10, 16, 20, 10),
      reason: '返程车次延误，申请延长至 10 月 17 日 18:00。'
    };
  }
  renderAll();
  saveDemo();
  toast('演示数据已更新');
}

function applyNowMode(k) {
  state.nowMode = k;
  state.now = computeNow();
  renderAll();
  saveDemo();
  toast('演示数据已更新');
}

function applyLocResult(k) {
  state.demo.locResult = k;
  saveDemo();
  if (state.route[state.route.length - 1].id === 'S6') runLocate();
  else toast('演示数据已更新');
}

function openDemoSheet() {
  const curStatus = activeDemoStatus();
  const optRow = (list, cur, action) => list.map(o =>
    '<button class="opt' + (o.k === cur ? ' is-on' : '') + '" data-action="' + action + '" data-val="' + o.k + '">' +
    '<span>' + o.label + '</span><span class="opt__check">' + ic('check', '16') + '</span></button>'
  ).join('');

  const html =
    '<div class="sheet__head">演示控制' +
      '<button class="sheet__close" data-sheet-close aria-label="关闭">' + ic('close', '24') + '</button>' +
    '</div>' +
    '<div class="sheet__body">' +
      '<div class="sheet__group">模拟时间</div>' + optRow(DEMO_TIME, state.nowMode, 'demo-time') +
      '<div class="sheet__group">当前申请状态</div>' + optRow(DEMO_STATUS, curStatus, 'demo-status') +
      '<div class="sheet__group">续假状态</div>' + optRow(DEMO_EXT, state.demo.extStatus, 'demo-ext') +
      '<div class="sheet__group">定位结果（离校销假）</div>' + optRow(DEMO_LOC, state.demo.locResult, 'demo-loc') +
      '<div class="sheet__group">登录身份</div>' +
      '<button class="opt" data-action="demo-identity"><span>张同学</span>' +
        '<span class="opt__sub">202301001001</span><span class="opt__check" style="display:flex;color:#A9B2C2">只读</span></button>' +
      '<div class="sheet__group">演示入口</div>' +
      '<button class="opt" data-action="demo-hide"><span>隐藏「演示」按钮</span>' +
        '<span class="opt__sub">长按 800ms 也可隐藏</span></button>' +
      '<div class="sheet__group">数据</div>' +
      '<button class="opt opt--danger" data-action="demo-reset">重置演示数据</button>' +
    '</div>' +
    '<button class="sheet__cancel" data-sheet-cancel>取消</button>';
  openSheet(html, { title: '演示控制' });
}

function resetDemo() {
  try {
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_ONB);
    /* 依规范 §256：重置演示数据保留 cl_demo_visible 与 cl_settings */
  } catch (e) { /* 忽略 */ }
  state.nowMode = 'inprogress';
  state.now = computeNow();
  state.applications = buildApplications();
  state.messages = buildMessages();
  state.demo.status = 'IN_PROGRESS_OFF';
  state.demo.scene = 'OFF_CAMPUS';
  state.demo.extStatus = 'NONE';
  state.demo.locResult = 'pass';
  state.ui.s3Filter = 'ALL';
  state.ui.badgeEnabled = true;
  loadSettings();             // 用户偏好不随演示数据重置而丢失
  state.ui.locPhase = 'locating';
  resetApplyForm();
  state.extForm = { newEnd: null, reason: '', errors: {} };
  closeSheet();
  go('S1');
  toast('演示数据已重置');
}

/* ============================================================
   11. 持久化
   ============================================================ */
const LS_STATE = 'cl_demo_state';
const LS_VIS = 'cl_demo_visible';
const LS_ONB = 'cl_onboarding_seen';
const LS_SET = 'cl_settings';

function saveDemo() {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify({
      v: 1,
      status: state.demo.status,
      scene: state.demo.scene,
      nowMode: state.nowMode,
      nowAt: state.now.toISOString(),
      extStatus: state.demo.extStatus,
      locResult: state.demo.locResult,
      read: state.messages.filter(m => !m.unread).map(m => m.id),
      updatedAt: Date.now()
    }));
  } catch (e) { /* file:// 下可能不可用，忽略 */ }
}

function loadDemo() {
  let raw = null;
  try { raw = localStorage.getItem(LS_STATE); } catch (e) { return; }
  if (!raw) return;
  let d = null;
  try { d = JSON.parse(raw); } catch (e) { return; }
  if (!d || d.v !== 1) {
    try { localStorage.removeItem(LS_STATE); } catch (e) {}
    return;
  }
  if (d.nowMode) state.nowMode = d.nowMode;
  if (d.locResult) state.demo.locResult = d.locResult;
  if (d.status) {
    state.demo.status = d.status;
    applyDemoStatus(d.status);
  }
  if (d.extStatus) applyExtStatus(d.extStatus);
  if (Array.isArray(d.read)) {
    state.messages.forEach(m => { m.unread = d.read.indexOf(m.id) < 0; });
  }
  state.now = computeNow();
}

function loadVisibility() {
  let v = null;
  try { v = localStorage.getItem(LS_VIS); } catch (e) { return; }
  if (v === '0') state.demo.visible = false;
}

function saveVisibility() {
  try { localStorage.setItem(LS_VIS, state.demo.visible ? '1' : '0'); } catch (e) {}
}

function onboardingSeen() {
  try { return localStorage.getItem(LS_ONB) === '1'; } catch (e) { return false; }
}
function markOnboardingSeen() {
  try { localStorage.setItem(LS_ONB, '1'); } catch (e) {}
}

/* 用户设置（跨刷新保留的小偏好） */
function loadSettings() {
  let raw = null;
  try { raw = localStorage.getItem(LS_SET); } catch (e) { return; }
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (typeof s.badgeEnabled === 'boolean') state.ui.badgeEnabled = s.badgeEnabled;
  } catch (e) { /* 坏数据忽略，回落默认 */ }
}
function saveSettings() {
  try {
    localStorage.setItem(LS_SET, JSON.stringify({ badgeEnabled: state.ui.badgeEnabled }));
  } catch (e) {}
}

/* ============================================================
   12. 事件委托
   ============================================================ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  const id = t.dataset.id;
  const val = t.dataset.val;
  const top = state.route[state.route.length - 1];

  switch (action) {
    /* 导航 */
    case 'tab':
      if (state.route[0].id !== id || state.route.length > 1) go(id);
      break;
    case 'back':
      tryBack();
      break;
    case 'go-records':
      state.ui.s3Filter = 'ALL';
      go('S3');
      break;

    /* S1 */
    case 'new-apply':
      resetApplyForm();
      push('S2');
      break;
    case 'open-app':
      push('S4', { id: id });
      break;

    /* S2 */
    case 'pick-type':
      state.form.type = val;
      state.form.dirty = true;
      clearFormError('type');
      mountPage(currentPageEl(), top);
      break;
    case 'pick-time':
      openTimePicker(t.dataset.field);
      break;
    case 'mat-del':
      state.form.materials.splice(Number(t.dataset.idx), 1);
      state.form.dirty = true;
      mountPage(currentPageEl(), top);
      break;
    case 'submit-apply':
      submitApply(t);
      break;

    /* S3 */
    case 's3-filter':
      if (state.ui.s3Filter !== val) {
        state.ui.s3Filter = val;
        state.ui.s3Fade = true;
        renderTab('S3');
        const sel = tabNodes.S3.querySelector('.filters__item.is-on');
        if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
      break;
    case 's3-filter-all':
      state.ui.s3Filter = 'ALL';
      state.ui.s3Fade = true;
      renderTab('S3');
      break;
    case 's3-go-home':
      go('S1');
      break;

    /* S4 */
    case 's4-withdraw':
      confirmDialog({
        title: '撤回申请？',
        body: '撤回后本条申请将关闭，如需请假请重新提交。',
        cancelText: '取消',
        confirmText: '撤回',
        danger: true,
        onConfirm: () => {
          const app = byId(id || top.params.id);
          app.status = 'WITHDRAWN';
          renderAll();
          toast('申请已撤回');
        }
      });
      break;
    case 's4-cancel':
      confirmDialog({
        title: '取消本次申请？',
        body: '取消后请假不会生效，如需请假请重新申请。',
        cancelText: '返回',
        confirmText: '确认取消',
        danger: true,
        onConfirm: () => {
          const app = byId(top.params.id);
          app.status = 'CANCELLED';
          renderAll();
          toast('申请已取消');
        }
      });
      break;
    case 's4-finish':
      confirmDialog({
        title: '确认结束本次请假？',
        body: '确认后将立即销假，结束时间记为当前时间。',
        cancelText: '取消',
        confirmText: '确认结束',
        onConfirm: () => {
          const app = byId(top.params.id);
          app.status = 'COMPLETED';
          app.completedAt = state.now;
          state.ui.pulseId = app.id;
          renderAll();
          toast('已销假，记录已归档', 'success');
        }
      });
      break;
    case 's4-reapply': {
      const app = byId(top.params.id);
      resetApplyForm({
        scene: app.scene, type: app.type, reason: app.reason,
        destination: app.destination, phone: app.phone, materials: app.materials
      });
      push('S2');
      break;
    }
    case 's4-extend':
      state.extForm = { newEnd: null, reason: '', errors: {} };
      push('S5', { id: top.params.id });
      break;
    case 's4-locate':
      state.ui.locPhase = 'locating';
      push('S6', { id: top.params.id });
      setTimeout(runLocate, 60);
      break;
    case 's4-manual':
      confirmDialog({
        title: '申请人工核验？',
        body: '提交后由辅导员核对返校情况，核验通过前仍为请假中。',
        cancelText: '取消',
        confirmText: '提交核验',
        onConfirm: () => {
          const app = byId(top.params.id);
          app.manualPending = true;
          renderAll();
          toast('核验申请已提交，等待辅导员处理', 'success');
        }
      });
      break;

    /* S5 */
    case 'submit-ext':
      submitExtension(t);
      break;

    /* S6 */
    case 's6-relocate':
      if (state.demo.locResult === 'deny') toast('未获得定位权限');
      runLocate();
      break;
    case 's6-manual': {
      const app = byId(top.params.id);
      app.manualPending = true;              // 失败态不改状态，仅记录核验
      state.ui.locPhase = 'manual_pending';
      mountPage(currentPageEl(), top);
      toast('核验申请已提交，等待辅导员处理', 'success');
      break;
    }
    case 's6-back':
      pop();
      break;

    /* S7 / S8 */
    case 's7-read-all':
      state.messages.forEach(m => { m.unread = false; });
      renderTab('S7');
      renderTabbar();
      toast('已全部标为已读');
      break;
    case 'open-msg': {
      const m = state.messages.find(x => x.id === id);
      if (m) m.unread = false;
      push('S8', { id: id });
      renderTab('S7');       // 列表未读态即时更新（不弹 Toast）
      renderTabbar();
      break;
    }
    case 's8-open-app':
      push('S4', { id: id });
      break;

    /* S9 */
    case 'toggle-badge':
      state.ui.badgeEnabled = !state.ui.badgeEnabled;
      saveSettings();
      renderTab('S9');
      renderTabbar();          // 红点/pill 立即同步；pill 为绝对定位，图标不位移
      break;
    case 'about-app':
      toast('校园请假 V1.0 · 毕业设计演示');
      break;

    /* 引导 */
    case 'onboard-ok':
      markOnboardingSeen();
      document.getElementById('onboard').hidden = true;
      break;

    /* 演示层 */
    case 'demo-open':
      /* 长按隐藏后浏览器补发的那次 click 要吞掉；但随后的热区点击必须生效 */
      if (fabSuppressed) {
        fabSuppressed = false;
        if (t.id === 'demoFab') break;
      }
      if (!state.demo.visible) { state.demo.visible = true; saveVisibility(); updateFabPos(); }
      openDemoSheet();
      break;
    case 'demo-status':
      closeSheet();
      setTimeout(() => applyDemoStatus(val), 120);
      break;
    case 'demo-time':
      closeSheet();
      setTimeout(() => applyNowMode(val), 120);
      break;
    case 'demo-ext':
      closeSheet();
      setTimeout(() => applyExtStatus(val), 120);
      break;
    case 'demo-loc':
      closeSheet();
      setTimeout(() => applyLocResult(val), 120);
      break;
    case 'demo-identity':
      toast('演示固定单一身份');
      break;
    case 'demo-hide':
      state.demo.visible = false;
      saveVisibility();
      updateFabPos();
      closeSheet();
      toast('演示入口已隐藏，点右上角可唤回');
      break;
    case 'demo-reset':
      confirmDialog({
        title: '重置演示数据？',
        body: '将恢复到初始演示数据并清除已读状态。',
        cancelText: '取消',
        confirmText: '重置',
        danger: true,
        onConfirm: resetDemo
      });
      break;
    case 'mat-view':
      toast('演示环境不提供大图预览');
      break;
  }
});

/* ===== 表单输入（不触发整屏重渲染，保持焦点） ===== */
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'reason') {
    state.form.reason = el.value;
    state.form.dirty = true;
    const wrap = el.closest('.ta-wrap');
    const c = wrap.querySelector('.counter');
    c.className = 'counter' + (el.value.length >= 200 ? ' is-over' : el.value.length >= 180 ? ' is-warn' : '');
    c.textContent = el.value.length + '/200';
    const submitBtn = currentPageEl().querySelector('[data-action="submit-apply"]');
    if (submitBtn) {
      if (el.value.length > 200) submitBtn.setAttribute('disabled', 'disabled');
      else submitBtn.removeAttribute('disabled');
    }
  } else if (el.dataset.input === 'destination') {
    state.form.destination = el.value;
    state.form.dirty = true;
  } else if (el.dataset.input === 'phone') {
    state.form.phone = el.value;
    state.form.dirty = true;
  } else if (el.dataset.input === 'extReason') {
    state.extForm.reason = el.value;
    state.extForm.dirty = true;
    const wrap = el.closest('.ta-wrap');
    const c = wrap.querySelector('.counter');
    c.className = 'counter' + (el.value.length >= 200 ? ' is-over' : el.value.length >= 180 ? ' is-warn' : '');
    c.textContent = el.value.length + '/200';
  }
});

/* 失焦校验（不做输入中实时红框） */
document.addEventListener('blur', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.input) return;
  const page = currentPageEl();
  if (!page) return;
  const name = el.dataset.input === 'extReason' ? 'reason' :
    el.dataset.input === 'reason' ? 'reason' : el.dataset.input;
  const field = el.dataset.input;
  let msg = '';
  if (field === 'reason' && !state.form.reason.trim()) msg = '请填写请假理由';
  if (field === 'destination' && state.form.scene === 'OFF_CAMPUS' && !state.form.destination.trim()) msg = '请填写离校去向';
  if (field === 'phone' && !/^1[3-9]\d{9}$/.test((state.form.phone || '').trim())) msg = '请填写正确的手机号';
  if (field === 'extReason' && !(state.extForm.reason || '').trim()) msg = '请填写续假原因';
  patchFieldError(name, msg);
}, true);

function patchFieldError(name, msg) {
  const page = currentPageEl();
  if (!page) return;
  const wrap = page.querySelector('[data-field-wrap="' + name + '"]');
  if (!wrap) return;
  wrap.classList.toggle('is-error', !!msg);
  const target = wrap.querySelector('[data-err="' + name + '"]');
  if (target) {
    target.textContent = msg;
    target.classList.toggle('is-on', !!msg);
  }
  const ta = wrap.querySelector('.ta');
  if (ta) ta.classList.toggle('is-error', !!msg);
}

/* 场景单选（原生 radio，方向键天然可切换） */
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.radio === 'scene') {
    state.form.scene = el.value;
    state.form.dirty = true;
    clearFormError('scene');
    const page = currentPageEl();
    mountPage(page, state.route[state.route.length - 1]);
    // 重渲染会丢失焦点：把焦点还回选中的 radio，方向键可连续切换（F14）
    const checked = page.querySelector('input[name="scene"]:checked');
    if (checked) checked.focus();
  }
  /* 材料上传：本地图片预览 */
  if (el.dataset && el.dataset.file === 'material') {
    const file = el.files && el.files[0];
    if (!file) return;
    if (state.form.materials.length >= 3) { toast('证明材料最多上传 3 张'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      state.form.materials.push({ kind: 'file', src: ev.target.result });
      state.form.dirty = true;
      mountPage(currentPageEl(), state.route[state.route.length - 1]);
    };
    reader.readAsDataURL(file);
  }
});

/* 键盘：Esc 关闭浮层 / 返回；D 打开演示面板 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (activeSheet) { closeSheet(); return; }
    if (activeDialog) { closeDialog(); return; }
    if (state.route.length > 1) tryBack();
    return;
  }
  if ((e.key === 'd' || e.key === 'D') && !e.target.matches('input, textarea')) {
    openDemoSheet();
  }
  /* 卡片键盘可激活 */
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest && e.target.closest('.app-card');
    if (card && e.target === card) {
      e.preventDefault();
      push('S4', { id: card.dataset.id });
    }
  }
});

/* ============================================================
   13. 启动
   ============================================================ */
function boot() {
  state.applications = buildApplications();
  state.messages = buildMessages();
  state.now = computeNow();
  resetApplyForm();
  state.extForm = { newEnd: null, reason: '', errors: {} };

  loadVisibility();
  loadDemo();
  loadSettings();

  /* 4 个 tab 页常驻 DOM */
  TAB_IDS.forEach(id => {
    const shell = stackEl.querySelector('section[data-page="' + id + '"]');
    const el = createPageShell(id, 'tab');
    shell.replaceWith(el);
    tabNodes[id] = el;
  });
  tabNodes[state.route[0].id].classList.add('is-active');

  statusTimeEl.textContent = fTime(state.now);
  renderTab(state.route[0].id);
  renderTabbar();
  updateFabPos();

  /* 视口尺寸/滚动变化时重算演示入口位置与筛选渐隐（rAF 去抖） */
  let fabRaf = 0;
  const queueFabPos = () => {
    if (fabRaf) return;
    fabRaf = requestAnimationFrame(() => {
      fabRaf = 0;
      updateFabPos();
      syncFilterFade();
    });
  };
  window.addEventListener('resize', queueFabPos);
  window.addEventListener('orientationchange', queueFabPos);
  window.addEventListener('scroll', queueFabPos, { passive: true });

  /* 首次进入引导（不遮挡主流程） */
  if (!onboardingSeen()) document.getElementById('onboard').hidden = false;

  /* 长按「演示」800ms 隐藏，隐藏后右上角 24×24 热区唤回 */
  const fab = document.getElementById('demoFab');
  let pressTimer = null;
  fab.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(() => {
      state.demo.visible = false;
      fabSuppressed = true;
      saveVisibility();
      updateFabPos();
      toast('演示入口已隐藏，点右上角可唤回');
    }, 800);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
    fab.addEventListener(ev, () => clearTimeout(pressTimer));
  });
}

boot();

})();

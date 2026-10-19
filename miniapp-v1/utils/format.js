// utils/format.js —— 纯函数：时间解析、状态映射、倒计时格式化
// 注意：小程序（iOS/JSCore）对 new Date('2026-10-18 08:00:00') 支持不一致，
//       统一走 parseTime 把 '-' 换成 '/' 再解析。

/** 安全解析 'YYYY-MM-DD HH:mm:ss' → Date */
function parseTime(str) {
  if (!str) return null;
  const s = String(str).replace(/-/g, '/').replace(/\./g, '/');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → 'MM-DD HH:mm' */
function shortTime(str) {
  const d = parseTime(str);
  if (!d) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date → 'HH:mm' */
function hm(str) {
  const d = parseTime(str);
  if (!d) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 毫秒差 → 'HH : MM : SS'（固定展示；秒级跳动由页面 interval 驱动） */
function durationText(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(Math.floor(t / 3600))} : ${p(Math.floor((t % 3600) / 60))} : ${p(t % 60)}`;
}

const STATUS_TEXT = {
  PENDING: '待审批',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
  CANCELLED: '已取消',
  COMPLETED: '已完成'
};

const EFFECTIVE_TEXT = {
  WAITING_START: '待开始',
  IN_PROGRESS: '请假中',
  OVERDUE: '已逾期'
};

const SCENE_TEXT = { OFF_CAMPUS: '离校', ON_CAMPUS: '校内' };

const SCENE_SHORT = { OFF_CAMPUS: '离校', ON_CAMPUS: '校内' };

/**
 * effective_status 计算（业务规则 V1.2 §4.1）
 * 逾期判定使用 >=
 */
function effectiveStatus(app, nowStr) {
  if (!app || app.status !== 'APPROVED') return app ? app.status : '';
  const now = parseTime(nowStr);
  const start = parseTime(app.startTime);
  const end = parseTime(app.endTime);
  if (!now || !start || !end) return 'APPROVED';
  if (now < start) return 'WAITING_START';
  if (now < end) return 'IN_PROGRESS';
  return app.actualEndTime ? 'COMPLETED' : 'OVERDUE';
}

/** 状态 → 胶囊样式后缀 */
function pillKind(app, nowStr) {
  const eff = effectiveStatus(app, nowStr);
  if (eff === 'IN_PROGRESS') return 'live';
  if (eff === 'OVERDUE') return 'late';
  if (app.status === 'COMPLETED') return 'done';
  if (app.status === 'REJECTED') return 'rej';
  if (app.status === 'PENDING') return 'wait';
  if (eff === 'WAITING_START') return 'wait';
  if (app.status === 'WITHDRAWN' || app.status === 'CANCELLED') return 'done';
  return 'wait';
}

/** 状态展示文案（优先展示计算态） */
function statusLabel(app, nowStr) {
  const eff = effectiveStatus(app, nowStr);
  if (EFFECTIVE_TEXT[eff]) return EFFECTIVE_TEXT[eff];
  return STATUS_TEXT[app.status] || app.status;
}

/** 时段文案：10-18 08:00 — 14:00（同日省略后半段日期） */
function periodText(app) {
  const s = parseTime(app.startTime);
  const e = parseTime(app.endTime);
  if (!s || !e) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  const head = `${p(s.getMonth() + 1)}-${p(s.getDate())} ${p(s.getHours())}:${p(s.getMinutes())}`;
  const tail = sameDay
    ? `${p(e.getHours())}:${p(e.getMinutes())}`
    : `${p(e.getMonth() + 1)}-${p(e.getDate())} ${p(e.getHours())}:${p(e.getMinutes())}`;
  return `${head} — ${tail}`;
}

/** 两个区间是否冲突（左闭右开，业务规则 §27） */
function isOverlap(aStart, aEnd, bStart, bEnd) {
  const a1 = parseTime(aStart), a2 = parseTime(aEnd), b1 = parseTime(bStart), b2 = parseTime(bEnd);
  if (!a1 || !a2 || !b1 || !b2) return false;
  return a1 < b2 && a2 > b1;
}

module.exports = {
  parseTime,
  shortTime,
  hm,
  durationText,
  effectiveStatus,
  pillKind,
  statusLabel,
  periodText,
  isOverlap,
  STATUS_TEXT,
  EFFECTIVE_TEXT,
  SCENE_TEXT,
  SCENE_SHORT
};

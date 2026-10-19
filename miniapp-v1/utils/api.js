// utils/api.js —— 异步接口桩层
// 真实后端接入时，只需把每个函数体换成 wx.request，保持「入参 / 出参形状」不变。
// 每个函数头注释标明了未来真实端点的 HTTP 方法与路径，便于导出契约。

const { DB } = require('./mock');
const F = require('./format');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 浅拷贝，避免页面直接改到 mock 源（真实项目里数据来自网络，天然隔离） */
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * TODO: replace with GET /api/student/home
 * 返回：{ student, meta, focus, records, stats }
 */
async function getHome() {
  await delay(600);
  const now = DB.meta.now;
  const focus = DB.applications.find((a) => a.id === DB.homeFocusId) || null;
  const records = DB.applications.map((a) => ({
    id: a.id,
    no: a.no,
    scene: a.scene,
    type: a.type,
    period: F.periodText(a),
    statusLabel: F.statusLabel(a, now),
    pillKind: F.pillKind(a, now)
  }));
  return {
    code: 0,
    data: {
      student: clone(DB.student),
      meta: clone(DB.meta),
      focus: focus
        ? {
            id: focus.id,
            no: focus.no,
            scene: focus.scene,
            type: focus.type,
            reason: focus.reason,
            destination: focus.destination,
            period: F.periodText(focus),
            startTime: focus.startTime,
            endTime: focus.endTime,
            statusLabel: F.statusLabel(focus, now),
            pillKind: F.pillKind(focus, now),
            effective: F.effectiveStatus(focus, now)
          }
        : null,
      records,
      stats: clone(DB.stats)
    }
  };
}

/**
 * TODO: replace with GET /api/student/applications?scene=&status=
 * 返回：{ list: [...] }
 */
async function getRecords() {
  await delay(450);
  const now = DB.meta.now;
  const list = DB.applications.map((a) => ({
    id: a.id,
    no: a.no,
    scene: a.scene,
    sceneText: F.SCENE_TEXT[a.scene],
    type: a.type,
    period: F.periodText(a),
    statusLabel: F.statusLabel(a, now),
    pillKind: F.pillKind(a, now),
    effective: F.effectiveStatus(a, now)
  }));
  return { code: 0, data: { list, stats: clone(DB.stats) } };
}

/**
 * TODO: replace with GET /api/student/applications/{id}
 * 返回：{ detail }
 */
async function getDetail(id) {
  await delay(400);
  const a = DB.applications.find((x) => x.id === id);
  if (!a) return { code: 404, message: '申请不存在' };
  const now = DB.meta.now;
  const logs = (a.logs || []).slice();
  if (!logs.length) {
    logs.push({ action: 'SUBMIT', label: '提交申请', at: a.submittedAt, by: DB.student.name });
    if (a.approvedAt) logs.push({ action: 'APPROVE', label: '审批通过', at: a.approvedAt, by: a.approvedBy });
    if (a.status === 'REJECTED' && a.approvedAt) logs[logs.length - 1].label = '审批驳回';
    if (a.actualEndTime) logs.push({ action: 'COMPLETE', label: '销假完成', at: a.actualEndTime, by: DB.student.name });
  }
  return {
    code: 0,
    data: {
      detail: {
        id: a.id,
        no: a.no,
        sceneText: F.SCENE_TEXT[a.scene],
        type: a.type,
        period: F.periodText(a),
        reason: a.reason,
        destination: a.destination,
        phone: a.phone,
        submittedAt: F.shortTime(a.submittedAt),
        approvedBy: a.approvedBy || '',
        approvedAt: a.approvedAt ? F.shortTime(a.approvedAt) : '',
        actualEndTime: a.actualEndTime ? F.shortTime(a.actualEndTime) : '',
        rejectReason: a.rejectReason || '',
        cancelReason: a.cancelReason || '',
        statusLabel: F.statusLabel(a, now),
        pillKind: F.pillKind(a, now),
        effective: F.effectiveStatus(a, now),
        canCancel: F.effectiveStatus(a, now) === 'WAITING_START',
        canExtend: ['IN_PROGRESS', 'OVERDUE'].indexOf(F.effectiveStatus(a, now)) >= 0,
        canWithdraw: a.status === 'PENDING',
        logs
      }
    }
  };
}

/**
 * TODO: replace with POST /api/student/applications
 * 入参：{ scene, type, startTime, endTime, reason, destination, phone }
 */
async function submitApplication(payload) {
  await delay(700);
  const now = DB.meta.now;
  const list = DB.applications.filter((a) => a.status === 'PENDING' || a.status === 'APPROVED');
  const clash = list.some((a) => F.isOverlap(payload.startTime, payload.endTime, a.startTime, a.endTime));
  if (clash) {
    return { code: 409, message: '当前时间段与已有请假申请冲突，请修改请假时间' };
  }
  const a = {
    id: 'A' + (DB.applications.length + 1),
    no: 'LA' + now.slice(0, 10).replace(/-/g, '') + '' + (DB.applications.length + 1),
    scene: payload.scene,
    type: payload.type,
    startTime: payload.startTime,
    endTime: payload.endTime,
    actualEndTime: null,
    status: 'PENDING',
    reason: payload.reason,
    destination: payload.destination || '',
    phone: payload.phone || '',
    submittedAt: now
  };
  DB.applications.unshift(a);
  DB.stats.total += 1;
  return { code: 0, data: { id: a.id, no: a.no } };
}

/**
 * TODO: replace with POST /api/student/applications/{id}/checkin
 * 入参：{ id, mode: 'pass' | 'fail' }（mode 仅用于原型演示两种结果）
 */
async function locateCheckin(payload) {
  await delay(1800);
  const kind = payload.mode === 'fail' ? 'fail' : 'pass';
  const d = DB.locate[kind];
  return {
    code: kind === 'pass' ? 0 : 422,
    data: {
      kind,
      distance: d.distance,
      unit: d.unit,
      label: d.label,
      limit: DB.locate.radiusLimit
    }
  };
}

/**
 * TODO: replace with POST /api/student/applications/{id}/complete
 */
async function confirmCheckin(id) {
  await delay(600);
  const a = DB.applications.find((x) => x.id === id);
  const at = DB.meta.now;
  if (a) {
    a.actualEndTime = at;
    a.status = 'COMPLETED';
    DB.stats.completed += 1;
  }
  return { code: 0, data: { actualEnd: F.shortTime(at) } };
}

/**
 * TODO: replace with POST /api/student/manual-review
 * 入参：{ id, reason }
 */
async function submitManualReview(payload) {
  await delay(600);
  return { code: 0, data: { reviewStatus: 'PENDING_REVIEW', reason: payload.reason } };
}

/**
 * TODO: replace with POST /api/student/applications/{id}/extensions
 * 入参：{ id, requestedEndTime, reason }
 */
async function submitExtension(payload) {
  await delay(650);
  const d = DB.meta.now.slice(0, 10);
  if (String(payload.requestedEndTime) < d) {
    return { code: 422, message: '新的结束时间必须晚于当前时间' };
  }
  return { code: 0, data: { status: 'PENDING' } };
}

module.exports = {
  getHome,
  getRecords,
  getDetail,
  submitApplication,
  locateCheckin,
  confirmCheckin,
  submitManualReview,
  submitExtension
};

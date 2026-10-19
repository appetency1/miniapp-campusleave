/* ============================================================================
 * api.js —— async stub 层
 * 所有读操作与数据变更都必须经过这一层；接入后端时替换每个 TODO 处的端点。
 * 统一模拟网络延迟，并提供 loading / empty / error 三种分支所需的错误抛出。
 * ==========================================================================*/
window.API = (function () {
  'use strict';

  var LATENCY = 600;          // 模拟网络往返延迟（毫秒）
  var forceError = false;     // true 时下一次请求抛错，用于演示 error 分支

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function boom() {
    if (forceError) { forceError = false; return new Error('网络请求失败，请检查网络后重试'); }
    return null;
  }

  function call(fn, ms) {
    return delay(ms == null ? LATENCY : ms).then(function () {
      var err = boom();
      if (err) throw err;
      return fn();
    });
  }

  return {
    LATENCY: LATENCY,

    /* 演示用：设 true 后下一次请求抛错（双击打开时可用 url 加 #error 触发） */
    setForceError: function (v) { forceError = !!v; },

    /* ---- 读 ---- */
    fetchApprovals: function () {
      // TODO: replace with GET /api/teacher/leave-requests?status=PENDING&counselorNo=T2019007
      return call(function () { return clone(window.MOCK.approvals); });
    },
    fetchOverdue: function () {
      // TODO: replace with GET /api/teacher/leave-requests?status=OVERDUE
      return call(function () { return clone(window.MOCK.overdue); });
    },
    fetchReviews: function () {
      // TODO: replace with GET /api/teacher/verifications?status=PENDING
      return call(function () { return clone(window.MOCK.reviews); });
    },
    fetchKpi: function () {
      // TODO: replace with GET /api/teacher/dashboard/kpi?date=2026-10-18
      return call(function () { return clone(window.MOCK.kpi); });
    },
    fetchTrend: function () {
      // TODO: replace with GET /api/teacher/dashboard/trend?days=7
      return call(function () { return clone(window.MOCK.trend); });
    },

    /* ---- 写（数据变更） ---- */
    approve: function (id) {
      // TODO: replace with POST /api/teacher/leave-requests/:id/approve
      return call(function () { return { ok: true, id: id, status: 'APPROVED' }; }, 320);
    },
    reject: function (id, opinion) {
      // TODO: replace with POST /api/teacher/leave-requests/:id/reject  body:{ opinion }
      return call(function () { return { ok: true, id: id, opinion: opinion, status: 'REJECTED' }; }, 320);
    },
    batchApprove: function (ids) {
      // TODO: replace with POST /api/teacher/leave-requests/batch-approve  body:{ ids }
      return call(function () { return { ok: true, ids: ids.slice(), status: 'APPROVED' }; }, 420);
    },
    restore: function (id) {
      // TODO: replace with POST /api/teacher/leave-requests/:id/restore
      return call(function () { return { ok: true, id: id, status: 'PENDING' }; }, 260);
    }
  };
})();

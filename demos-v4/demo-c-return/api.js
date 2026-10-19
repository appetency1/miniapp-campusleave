// api.js —— 前端唯一接口访问层（原型阶段为 async stub，带延迟 / loading / error 语义）。
// 所有方法返回 Promise<{ code, message, data }>，后续接真实后端时逐个替换即可。
(function () {
  'use strict';

  var M = window.MOCK;

  // 模拟网络延迟
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // 统一成功响应包装
  function ok(data, ms) {
    return delay(ms || 700).then(function () {
      return { code: 0, message: 'ok', data: data };
    });
  }

  // 统一失败响应（预留：接入真实接口时沿用该结构，前端已具备 .catch 分支）
  function fail(message, ms) {
    return delay(ms || 600).then(function () {
      return Promise.reject({ code: 500, message: message || '网络异常，请重试', data: null });
    });
  }

  window.Api = {
    // TODO: replace with POST /api/leave/{id}/return-checkin —— 发起返校定位销假
    requestReturnCheckin: function (payload) {
      return ok({ id: payload.id, ref: M.api.requestReturnCheckin.ref }, 700);
    },

    // TODO: replace with POST /api/leave/{id}/return-checkin/confirm —— GPS 校验通过后确认销假
    confirmReturnCheckin: function (payload) {
      return ok({
        id: payload.id,
        actualEnd: M.api.confirmReturnCheckin.actualEnd,
        distanceMeters: payload.distanceMeters
      }, 600);
    },

    // TODO: replace with POST /api/leave/{id}/renewal —— 申请续假
    applyRenewal: function (payload) {
      return ok({ id: payload.id, message: M.api.applyRenewal.message }, 800);
    },

    // TODO: replace with POST /api/leave/{id}/manual-review —— 申请人工核验
    submitManualVerify: function (payload) {
      return ok({
        id: payload.id,
        reason: payload.reason,
        message: M.api.submitManualVerify.message,
        reviewStatus: M.api.submitManualVerify.reviewStatus
      }, 900);
    },

    // 预留未使用的失败分支，保持接口层形态完整
    _fail: fail
  };
})();

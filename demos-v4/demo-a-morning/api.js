/* ============================================================
   CampusLeave · Demo A「晨光」学生端首页
   api.js —— async stub 层（前端联调用）
   ------------------------------------------------------------
   约定：
   · 所有方法返回 Promise，内含模拟网络延迟（取自 mock.timing）
   · 每个方法首行给出以后端接口替换的 TODO 注释
   · 覆盖 loading（延迟期间）/ empty（空数组）/ error（可注入失败）分支
   · 视图层只调用本文件，不直接读取 mock 数据
   ============================================================ */
(function () {
  'use strict';

  var M = window.MOCK;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function ApiError(message, code) {
    var e = new Error(message);
    e.name = 'ApiError';
    e.code = code || 'E_UNKNOWN';
    return e;
  }

  var Api = {
    /* 演示开关：置 true 时下一次请求抛错，用于演示 error 分支 */
    _failNext: false,
    failNext: function (on) { this._failNext = !!on; },

    /* 是否已接入真实后端（恒为 false，纯静态原型） */
    isStub: true,

    /**
     * 首页概览：学生信息 + 环境 + 请假记录
     * TODO: replace with GET /api/home/overview
     */
    getOverview: function () {
      var self = this;
      return delay(M.timing.overview).then(function () {
        if (self._failNext) { self._failNext = false; throw ApiError('首页数据加载失败，请稍后重试', 'E_OVERVIEW'); }
        return {
          student: M.student,
          env: M.env,
          records: M.records.slice()
        };
      });
    },

    /**
     * 请假记录列表（可按筛选键过滤）
     * @param {{filter?:string}} params
     * TODO: replace with GET /api/applications?filter=ALL
     */
    getRecords: function (params) {
      var self = this;
      var filter = (params && params.filter) || 'ALL';
      return delay(M.timing.records).then(function () {
        if (self._failNext) { self._failNext = false; throw ApiError('记录加载失败，请检查网络后重试', 'E_RECORDS'); }
        var list = M.records.slice();
        return { filter: filter, list: list, total: list.length };
      });
    },

    /**
     * 返校定位销假
     * @param {{applicationNo:string, result:'pass'|'out'}} params
     * TODO: replace with POST /api/leave/locate  body:{ applicationNo, lng, lat }
     */
    locate: function (params) {
      var self = this;
      var result = (params && params.result) === 'out' ? 'out' : 'pass';
      return delay(M.timing.locate).then(function () {
        if (self._failNext) { self._failNext = false; throw ApiError('定位服务暂时不可用', 'E_LOCATE'); }
        var data = M.loc[result];
        return {
          applicationNo: (params && params.applicationNo) || '',
          ok: data.ok,
          title: data.title,
          desc: data.desc,
          distanceText: data.distanceText,
          resultText: data.resultText
        };
      });
    },

    /**
     * 提交续假申请（成功后返回一条 PENDING 记录）
     * @param {{applicationNo:string, scene:string, type:string, scenePlace:string,
     *          place:string, newEnd:string, reason:string, submittedAt:string, seq:number}} params
     * TODO: replace with POST /api/leave/extend  body:{ applicationNo, newEndTime, reason }
     */
    submitExtension: function (params) {
      var self = this;
      return delay(M.timing.extend).then(function () {
        if (self._failNext) { self._failNext = false; throw ApiError('续假申请提交失败，请稍后重试', 'E_EXTEND'); }
        var seq = String(params.seq || 1);
        while (seq.length < 3) seq = '0' + seq;
        return {
          no: 'LA' + (params.submittedAt || '').slice(0, 10).replace(/-/g, '') + 'E' + seq,
          scene: params.scene,
          type: params.type,
          startAt: params.startAt,
          endAt: params.newEnd,
          status: 'PENDING',
          effective: '',
          scenePlace: params.scenePlace,
          place: params.place,
          reason: params.reason,
          submittedAt: params.submittedAt,
          approver: '',
          approvedAt: ''
        };
      });
    }
  };

  window.Api = Api;
})();

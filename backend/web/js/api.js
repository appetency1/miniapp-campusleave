/* ============================================================
   api.js —— 后端接口封装 + 一次性数据加载

   设计取舍：
   后台页面是同步渲染的（拿到数据直接 el() 拼 DOM），如果逐个页面改成
   async/await，7 个页面都要动，且容易出现"渲染时数据还没到"的空屏。
   所以这里做了一层"启动时全量拉取"：登录成功后一次性把教师端需要的
   6 份数据拉进 window.STORE，页面继续同步读。

   学院量级的数据（几个班、几百条申请）一次拉完没有压力；
   真要到几千条再改成分页懒加载。

   注意：这里 deliberately 用 GET /teacher/applications?tab=records&size=200
   拉全量而不是分页，因为前端列表的筛选/排序都在内存里做。
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});
  var BASE = '/api/v1';
  var TOKEN_KEY = 'cl_admin_token';

  /* 先给一个空壳：任何页面在数据到达前读 STORE 也不会炸（画出来是空列表）。
     app.js 的 boot 会保证"数据到位后才进主界面"，这里只是兜底。 */
  window.STORE = window.STORE || {
    teacher: { name: '', no: '', department: '', classes: [], classList: [] },
    workbench: { pendingCount: 0, inProgressCount: 0, abnormalCount: 0, overdueCount: 0, todos: [] },
    apps: [],
    extensions: [],
    students: [],
    stats: { totalApplications: 0, approved: 0, completed: 0, currentOverdue: 0 }
  };

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* 隐私模式下 sessionStorage 可能不可用，忽略 */ }
  }

  /**
   * 统一请求。后端约定 { code, message, data, traceId }，code===0 为成功。
   * 失败抛 Error(message)，由调用方决定 toast 还是页面提示。
   */
  function request(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var tk = token();
    if (tk) headers.Authorization = 'Bearer ' + tk;

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () {
        throw new Error('接口返回非 JSON（HTTP ' + r.status + '），请确认后端已启动');
      }).then(function (j) {
        if (j && j.code === 0) return j.data;
        if (r.status === 401) {
          setToken('');
          if (location.hash.indexOf('#/login') !== 0) location.hash = '#/login';
        }
        throw new Error((j && j.message) || ('请求失败（HTTP ' + r.status + '）'));
      });
    }, function () {
      throw new Error('连不上后端：请确认服务已启动，且与浏览器同源');
    });
  }

  function get(path) { return request(path); }
  function post(path, body) { return request(path, { method: 'POST', body: body || {} }); }

  /** 登录：成功后写入 token */
  function login(username, password) {
    return request('/auth/login', { method: 'POST', body: { username: username, password: password } })
      .then(function (data) {
        if (data.user.role !== 'TEACHER' && data.user.role !== 'ADMIN') {
          throw new Error('该账号不是教师账号，请用小程序端登录');
        }
        setToken(data.token);
        return data.user;
      });
  }

  /** 一次性拉取后台需要的全部数据到 window.STORE */
  function loadStore() {
    return Promise.all([
      get('/teacher/profile'),
      get('/teacher/workbench'),
      get('/teacher/applications?tab=records&size=200'),
      get('/teacher/extensions?size=200'),
      get('/teacher/students?size=200'),
      get('/teacher/stats')
    ]).then(function (r) {
      window.STORE = {
        teacher: r[0],
        workbench: r[1],
        apps: r[2].list || [],
        extensions: r[3].list || [],
        students: r[4].list || [],
        stats: r[5],
        loadedAt: Date.now()
      };
      return window.STORE;
    });
  }

  /** 审批等写操作之后调用：重新拉一次，保证列表与工作台计数同步 */
  function refresh() { return loadStore(); }

  ADMIN.api = {
    token: token,
    setToken: setToken,
    request: request,
    get: get,
    post: post,
    login: login,
    loadStore: loadStore,
    refresh: refresh
  };
})();

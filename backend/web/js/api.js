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
  var ROLE_KEY = 'cl_console_role';

  /* 先给一个空壳：任何页面在数据到达前读 STORE 也不会炸（画出来是空列表）。
     app.js 的 boot 会保证"数据到位后才进主界面"，这里只是兜底。 */
  window.STORE = window.STORE || {
    role: '',
    me: { realName: '', username: '' },
    teacher: { name: '', no: '', department: '', classes: [], classList: [] },
    workbench: { pendingCount: 0, inProgressCount: 0, abnormalCount: 0, overdueCount: 0, todos: [] },
    apps: [],
    extensions: [],
    students: [],
    stats: { totalApplications: 0, approved: 0, completed: 0, currentOverdue: 0 },
    admin: { users: [], classes: [], bindings: [], configs: [], stats: {}, overview: {} }
  };

  /** 当前登录角色：TEACHER 或 ADMIN，决定菜单和数据源 */
  function role() {
    try { return sessionStorage.getItem(ROLE_KEY) || ''; } catch (e) { return ''; }
  }
  function setRole(r) {
    try {
      if (r) sessionStorage.setItem(ROLE_KEY, r);
      else sessionStorage.removeItem(ROLE_KEY);
    } catch (e) { /* 忽略 */ }
  }

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
      // fetch 直接失败（连不上）。最常见的不是后端没起，而是用 file:// 打开了页面：
      // 这时候 "/api/v1/..." 会被解析成 file:///api/v1/...，请求根本发不出去。
      if (location.protocol === 'file:') {
        throw new Error('页面是用文件方式打开的（file://）。请改用 http://localhost:8080/admin/ 访问');
      }
      throw new Error('连不上后端：请确认 8080 端口的服务已启动');
    });
  }

  function get(path) { return request(path); }
  function post(path, body) { return request(path, { method: 'POST', body: body || {} }); }
  function put(path, body) { return request(path, { method: 'PUT', body: body || {} }); }
  function del(path) { return request(path, { method: 'DELETE' }); }

  /** 登录：成功后写入 token 与角色（角色决定之后拉哪套数据、渲染哪套菜单） */
  function login(username, password) {
    return request('/auth/login', { method: 'POST', body: { username: username, password: password } })
      .then(function (data) {
        if (data.user.role !== 'TEACHER' && data.user.role !== 'ADMIN') {
          throw new Error('该账号不是教师或管理员账号，请用小程序端登录');
        }
        setToken(data.token);
        setRole(data.user.role);
        return data.user;
      });
  }

  /** 教师端：6 份数据一次拉齐 */
  function loadTeacherStore() {
    return Promise.all([
      get('/teacher/profile'),
      get('/teacher/workbench'),
      get('/teacher/applications?tab=records&size=200'),
      get('/teacher/extensions?size=200'),
      get('/teacher/students?size=200'),
      get('/teacher/stats')
    ]).then(function (r) {
      setStore({
        role: 'TEACHER',
        me: { realName: r[0].name || '', username: r[0].no || '' },
        teacher: r[0],
        workbench: r[1],
        apps: r[2].list || [],
        extensions: r[3].list || [],
        students: r[4].list || [],
        stats: r[5]
      });
      return window.STORE;
    });
  }

  /** 管理端：账号 / 班级 / 绑定 / 配置 / 统计 */
  function loadAdminStore() {
    return Promise.all([
      get('/auth/me'),
      get('/admin/users?size=200'),
      get('/admin/classes?size=200'),
      get('/admin/teacher-classes'),
      get('/admin/configs'),
      get('/admin/stats'),
      // 概览失败不阻塞整个后台：即使这个接口还没上线（后端未重启），
      // 也应该能进到其他页面，只是概览页显示空数据
      get('/admin/overview').catch(function () { return null; })
    ]).then(function (r) {
      var me = r[0] || {};
      setStore({
        role: 'ADMIN',
        me: me,
        // 顶栏与班级范围切换读的是 teacher.name / teacher.classes，这里给等价字段
        teacher: {
          name: me.realName || me.username || '',
          no: me.username || '',
          department: '系统管理员',
          classes: [],
          classList: []
        },
        // 教师端的数据结构留空，避免误进教师页面时读 undefined 崩掉
        workbench: { pendingCount: 0, inProgressCount: 0, abnormalCount: 0, overdueCount: 0, todos: [] },
        apps: [],
        extensions: [],
        students: [],
        stats: r[5] || {},
        admin: {
          users: (r[1] && r[1].list) || [],
          classes: (r[2] && r[2].list) || [],
          bindings: r[3] || [],
          configs: r[4] || [],
          stats: r[5] || {},
          overview: r[6] || {}
        }
      });
      return window.STORE;
    });
  }

  /** 一次性拉取当前角色需要的全部数据到 window.STORE */
  function loadStore() {
    return role() === 'ADMIN' ? loadAdminStore() : loadTeacherStore();
  }

  function setStore(next) {
    next.loadedAt = Date.now();
    window.STORE = next;
  }

  /** 审批等写操作之后调用：重新拉一次，保证列表与工作台计数同步 */
  function refresh() { return loadStore(); }

  ADMIN.api = {
    token: token,
    setToken: setToken,
    role: role,
    setRole: setRole,
    request: request,
    get: get,
    post: post,
    put: put,
    del: del,
    login: login,
    loadStore: loadStore,
    refresh: refresh
  };
})();

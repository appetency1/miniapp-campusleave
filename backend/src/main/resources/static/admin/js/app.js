/* ============================================================
   app.js —— 启动、角色菜单、班级范围、内存登录态、数据派生
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});
  var ui = ADMIN.ui;
  var el = ui.el;
  var router = ADMIN.router;
  var MOCK = window.MOCK;

  /* ---------------- 内存态 ---------------- */
  var state = (ADMIN.state = {
    loggedIn: false,
    scope: 'all',
    decided: {},   // appId -> 'approved' | 'rejected'
    reviewed: {}   // checkinId -> 'approved' | 'rejected'
  });

  /* ---------------- 数据派生 ---------------- */
  function inScope(row) {
    return state.scope === 'all' || row.className === state.scope;
  }

  function appById(id) {
    return MOCK.apps.filter(function (a) { return String(a.id) === String(id); })[0] || null;
  }

  function liveState(a) {
    if (a.status !== 'APPROVED') return null;
    if (a.effective === 'COMPLETED' || a.effective === 'WAITING_START') return null;
    var end = ui.parse(a.end);
    var ended = end && Date.now() > end.getTime();
    if (a.effective === 'OVERDUE' || (a.effective === 'IN_PROGRESS' && ended)) return 'OVERDUE';
    if (a.effective === 'IN_PROGRESS') return 'IN_PROGRESS';
    return null;
  }

  function pendingQueue() {
    return MOCK.apps.filter(function (a) {
      return inScope(a) && a.status === 'PENDING' && !state.decided[a.id];
    }).sort(function (x, y) {
      return ui.parse(x.submittedAt) - ui.parse(y.submittedAt);
    });
  }

  function extensionQueue() {
    return MOCK.extensions.filter(function (e) {
      return e.status === 'PENDING' && !state.decided['ext' + e.id] && inScope(e);
    }).sort(function (x, y) {
      return ui.parse(x.submittedAt) - ui.parse(y.submittedAt);
    });
  }

  function reviewQueue() {
    var out = [];
    MOCK.apps.forEach(function (a) {
      if (!inScope(a)) return;
      var pending = (a.checkins || []).filter(function (c) {
        return c.review === 'PENDING_REVIEW' && !state.reviewed[c.id];
      });
      if (!pending.length) return;
      var latest = pending[pending.length - 1];
      out.push({ app: a, checkins: pending, checkin: latest });
    });
    return out.sort(function (x, y) {
      return ui.parse(x.checkin.time) - ui.parse(y.checkin.time);
    });
  }

  function liveApps() {
    return MOCK.apps.filter(function (a) { return inScope(a) && liveState(a); });
  }

  function todayApps() {
    var start = ui.startOfDay(new Date()).getTime();
    var end = start + 86400000;
    return MOCK.apps.filter(function (a) {
      if (!inScope(a)) return false;
      var s = ui.parse(a.start), e = ui.parse(a.end);
      if (!s || !e) return false;
      return s.getTime() <= end && e.getTime() >= start;
    }).sort(function (x, y) { return ui.parse(x.start) - ui.parse(y.start); });
  }

  ADMIN.store = {
    inScope: inScope,
    appById: appById,
    liveState: liveState,
    pending: pendingQueue,
    extensions: extensionQueue,
    reviewQueue: reviewQueue,
    liveApps: liveApps,
    todayApps: todayApps,
    decideApp: function (id, verdict) { state.decided[id] = verdict; },
    decideCheckins: function (ids, verdict) {
      (ids || []).forEach(function (id) { state.reviewed[id] = verdict; });
    },
    summary: function () {
      var pend = pendingQueue();
      var rev = reviewQueue();
      var ext = extensionQueue();
      var live = liveApps();
      var overdue = live.filter(function (a) { return liveState(a) === 'OVERDUE'; });
      var extHours = 0;
      if (ext.length) {
        var o = ui.parse(ext[0].originEnd), r = ui.parse(ext[0].requestedEnd);
        if (o && r) extHours = Math.round((r - o) / 3600000);
      }
      return {
        pending: pend,
        review: rev,
        extensions: ext,
        live: live,
        overdue: overdue,
        extHours: extHours
      };
    }
  };

  /* ---------------- 菜单 ---------------- */
  var MENU = [
    {
      title: '概览',
      items: [{ key: 'workbench', label: '工作台', glyph: '台', href: '#/workbench' }]
    },
    {
      title: '审批',
      items: [
        { key: 'pending', label: '待审批', glyph: '待', href: '#/pending', count: function () { return pendingQueue().length; } },
        { key: 'review', label: '异常核验', glyph: '验', href: '#/review', count: function () { return reviewQueue().length; } }
      ]
    },
    {
      title: '台账',
      items: [
        { key: 'records', label: '申请记录', glyph: '记', href: '#/records' },
        { key: 'students', label: '学生', glyph: '生', href: '#/students' }
      ]
    }
  ];

  function activeKey() {
    var p = router.current() || '';
    if (p.indexOf('/pending') === 0) return 'pending';
    if (p.indexOf('/review') === 0) return 'review';
    if (p.indexOf('/records') === 0) return 'records';
    if (p.indexOf('/students') === 0) return 'students';
    if (p.indexOf('/workbench') === 0) return 'workbench';
    return '';
  }

  function renderNav() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = '';
    var active = activeKey();
    MENU.forEach(function (group) {
      var wrap = el('div', { class: 'nav-group' }, [
        el('div', { class: 'nav-title', text: group.title })
      ]);
      group.items.forEach(function (it) {
        var a = el('a', {
          class: 'nav-item' + (active === it.key ? ' is-on' : ''),
          href: it.href,
          dataset: { label: it.label }
        });
        a.appendChild(el('span', { class: 'nav-glyph', text: it.glyph }));
        a.appendChild(el('span', { class: 'nav-label', text: it.label }));
        if (it.count) {
          var n = it.count();
          if (n) a.appendChild(el('span', { class: 'count', text: String(n) }));
        }
        wrap.appendChild(a);
      });
      nav.appendChild(wrap);
    });
  }

  /* ---------------- 顶栏 ---------------- */
  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.dd.is-open'), function (dd) {
      dd.classList.remove('is-open');
      var b = dd.querySelector('.dd-btn');
      if (b) b.classList.remove('is-open');
    });
  }

  function dropdown(label, items) {
    var dd = el('div', { class: 'dd' });
    var btn = el('button', { class: 'dd-btn', attrs: { type: 'button' } }, [
      el('span', { text: label }),
      ui.icon('chevron')
    ]);
    var menu = el('div', { class: 'dd-menu', attrs: { role: 'menu' } });
    items.forEach(function (it) {
      if (it.sep) { menu.appendChild(el('div', { class: 'dd-sep' })); return; }
      var b = el('button', { class: 'dd-item' + (it.on ? ' is-on' : ''), attrs: { type: 'button', role: 'menuitem' } }, [
        el('span', { text: it.label }),
        it.on ? el('span', { class: 'dd-check' }, ui.icon('check')) : null
      ]);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenus();
        if (it.onClick) it.onClick();
      });
      menu.appendChild(b);
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var was = dd.classList.contains('is-open');
      closeMenus();
      if (!was) { dd.classList.add('is-open'); btn.classList.add('is-open'); }
    });
    dd.appendChild(btn);
    dd.appendChild(menu);
    return dd;
  }

  function renderTop() {
    var top = document.getElementById('topRight');
    if (!top) return;
    top.innerHTML = '';

    var scopeLabel = state.scope === 'all' ? '班级范围' : state.scope;
    var scopeItems = [
      { label: '全部班级', on: state.scope === 'all', onClick: function () { setScope('all'); } },
      { label: '计算机2301', on: state.scope === '计算机2301', onClick: function () { setScope('计算机2301'); } },
      { label: '计算机2302', on: state.scope === '计算机2302', onClick: function () { setScope('计算机2302'); } }
    ];
    var accountItems = [
      { label: '个人信息', onClick: function () { router.go('/profile'); } },
      { sep: true },
      { label: '退出登录', onClick: function () { logout(); } }
    ];

    top.appendChild(dropdown(scopeLabel, scopeItems));
    top.appendChild(el('div', { class: 'top-divider' }));
    top.appendChild(dropdown(MOCK.teacher.name, accountItems));
  }

  function setScope(v) {
    state.scope = v;
    renderTop();
    renderNav();
    router.refresh();
  }

  /* ---------------- 面包屑 ---------------- */
  function crumbs(list) {
    var c = document.getElementById('crumbs');
    if (!c) return;
    c.innerHTML = '';
    (list || []).forEach(function (item, i) {
      if (i) c.appendChild(el('span', { class: 'crumb-sep', text: '›' }));
      if (item.href) c.appendChild(el('a', { href: item.href, text: item.label }));
      else c.appendChild(el('span', { class: 'crumb-last', text: item.label }));
    });
  }

  /* ---------------- 登录态 ---------------- */
  function enterApp() {
    state.loggedIn = true;
    document.body.dataset.role = 'app';
    var root = document.getElementById('login-root');
    if (root) root.innerHTML = '';
    renderNav();
    renderTop();
    router.go('/workbench');
  }

  function logout() {
    state.loggedIn = false;
    document.body.dataset.role = 'guest';
    document.getElementById('nav').innerHTML = '';
    document.getElementById('topRight').innerHTML = '';
    crumbs([]);
    router.go('/login');
  }

  /* ---------------- 路由表 ---------------- */
  function registerRoutes() {
    router.on('/login', ADMIN.pages.login);
    router.on('/workbench', ADMIN.pages.workbench);
    router.on('/pending', ADMIN.pages.pending);
    router.on('/pending/ext', ADMIN.pages.pending);
    router.on('/pending/:id', ADMIN.pages.pending);
    router.on('/review', ADMIN.pages.review);
    router.on('/review/:id', ADMIN.pages.review);
    router.on('/records', ADMIN.pages.records);
    router.on('/records/:id', ADMIN.pages.records);
    router.on('/students', ADMIN.pages.records);
    router.on('/profile', ADMIN.pages.records);
    router.on('/', ADMIN.pages.workbench);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    ADMIN.shell = {
      crumbs: crumbs,
      renderNav: renderNav,
      renderTop: renderTop,
      enterApp: enterApp,
      logout: logout,
      sync: function () { renderNav(); }
    };

    registerRoutes();

    document.addEventListener('click', function () { closeMenus(); });

    router.start({
      guard: function (path) {
        if (path === '/login') {
          if (state.loggedIn) { router.go('/workbench'); return false; }
          return true;
        }
        if (!state.loggedIn) { router.go('/login'); return false; }
        return true;
      },
      onBefore: function () {
        renderNav();
        if (state.loggedIn) renderTop();
        crumbs([]);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

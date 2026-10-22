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
    return STORE.apps.filter(function (a) { return String(a.id) === String(id); })[0] || null;
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
    return STORE.apps.filter(function (a) {
      return inScope(a) && a.status === 'PENDING' && !state.decided[a.id];
    }).sort(function (x, y) {
      return ui.parse(x.submittedAt) - ui.parse(y.submittedAt);
    });
  }

  function extensionQueue() {
    return STORE.extensions.filter(function (e) {
      return e.status === 'PENDING' && !state.decided['ext' + e.id] && inScope(e);
    }).sort(function (x, y) {
      return ui.parse(x.submittedAt) - ui.parse(y.submittedAt);
    });
  }

  function reviewQueue() {
    var out = [];
    STORE.apps.forEach(function (a) {
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
    return STORE.apps.filter(function (a) { return inScope(a) && liveState(a); });
  }

  function todayApps() {
    var start = ui.startOfDay(new Date()).getTime();
    var end = start + 86400000;
    return STORE.apps.filter(function (a) {
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
    /**
     * 审批动作：走真实接口，成功后重新拉数据并整页重载。
     *
     * <p>为什么整页 reload：后台页面是"派生数据 + 同步渲染"结构，
     * 局部改内存会出现"UI 显示已通过、后端其实失败"的假象。
     * 审批是低频不可逆操作，宁可重载一次换取状态绝对准确。
     *
     * @param id     申请 id，或 'ext7' 这种续假 id（前缀区分）
     * @param verdict 'approved' | 'rejected'
     */
    decideApp: function (id, verdict, reason) {
      var api = ADMIN.api;
      var isExt = String(id).indexOf('ext') === 0;
      var realId = isExt ? String(id).slice(3) : id;
      var url, body;
      if (isExt) {
        url = '/teacher/extensions/' + realId + (verdict === 'approved' ? '/approve' : '/reject');
        body = verdict === 'approved' ? { comment: '同意延长' } : { reason: reason };
      } else {
        url = '/teacher/applications/' + realId + (verdict === 'approved' ? '/approve' : '/reject');
        body = verdict === 'approved' ? { comment: '同意' } : { reason: reason };
      }
      return api.post(url, body).then(function () {
        return api.refresh();
      }).then(function () {
        location.reload();
      }).catch(function (e) {
        alert('操作失败：' + (e && e.message ? e.message : '未知错误'));
        return api.refresh();
      });
    },

    /** 核验动作：同上，一条申请下的多条待核验记录要逐条提交 */
    decideCheckins: function (ids, verdict, comment) {
      var api = ADMIN.api;
      var action = verdict === 'approved' ? 'APPROVE' : 'REJECT';
      var chain = Promise.resolve();
      (ids || []).forEach(function (id) {
        chain = chain.then(function () {
          return api.post('/teacher/checkin-logs/' + id + '/review', {
            action: action,
            comment: comment || (verdict === 'approved' ? '核验通过' : '核验驳回')
          });
        });
      });
      return chain.then(function () {
        return api.refresh();
      }).then(function () {
        location.reload();
      }).catch(function (e) {
        alert('操作失败：' + (e && e.message ? e.message : '未知错误'));
        return api.refresh();
      });
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
      title: '',
      items: [{ key: 'workbench', label: '工作台', icon: 'gauge', href: '#/workbench' }]
    },
    {
      title: '审批',
      items: [
        { key: 'pending', label: '待审批', icon: 'clipboard', href: '#/pending', count: function () { return pendingQueue().length; }, alert: true },
        { key: 'review', label: '异常核验', icon: 'checklist', href: '#/review', count: function () { return reviewQueue().length; } }
      ]
    },
    {
      title: '记录',
      items: [{ key: 'records', label: '申请记录', icon: 'folder', href: '#/records' }]
    },
    {
      title: '学生',
      items: [{ key: 'students', label: '学生管理', icon: 'person', href: '#/students' }]
    }
  ];

  /* 管理端菜单：按设计稿的四组结构 */
  var MENU_ADMIN = [
    {
      title: '',
      items: [
        { key: 'admin-home', label: '概览', icon: 'nav-home', href: '#/admin/home' }
      ]
    },
    {
      title: '业务管理',
      items: [
        { key: 'admin-apps', label: '请假申请', icon: 'nav-doc', href: '#/admin/apps' },
        { key: 'admin-records', label: '请假记录', icon: 'nav-checklist', href: '#/admin/records' },
        { key: 'admin-review', label: '异常核验', icon: 'nav-shield', href: '#/admin/review' }
      ]
    },
    {
      title: '人员管理',
      items: [
        { key: 'admin-students', label: '学生管理', icon: 'nav-person', href: '#/admin/students' },
        { key: 'admin-teachers', label: '教师管理', icon: 'nav-people', href: '#/admin/teachers' },
        { key: 'admin-classes', label: '班级管理', icon: 'nav-team', href: '#/admin/classes' }
      ]
    },
    {
      title: '系统管理',
      items: [
        { key: 'admin-rules', label: '请假规则', icon: 'nav-shield-alert', href: '#/admin/rules' },
        { key: 'admin-configs', label: '系统设置', icon: 'nav-gear', href: '#/admin/configs' }
      ]
    }
  ];

  /* 设计稿切出来的 PNG 图标；不在这张表里的（管理端那几个）继续用内联 SVG */
  var PNG_ICON_NAMES = {
    gauge: 1, clipboard: 1, checklist: 1, folder: 1, person: 1,
    bell: 1, 'calendar-clock': 1, book: 1,
    'nav-home': 1, 'nav-doc': 1, 'nav-shield': 1, 'nav-person': 1, 'nav-people': 1,
    'nav-team': 1, 'nav-gear': 1, 'nav-checklist': 1, 'nav-shield-alert': 1, 'nav-sync': 1
  };
  function navIcon(name) {
    return PNG_ICON_NAMES[name] ? ui.pngIcon(name) : ui.icon(name);
  }

  /** 当前角色对应的菜单。角色存在 sessionStorage 里，刷新后仍能识别。 */
  function menuOf() {
    return ADMIN.api.role() === 'ADMIN' ? MENU_ADMIN : MENU;
  }

  function activeKey() {
    var p = router.current() || '';
    if (p.indexOf('/admin/home') === 0) return 'admin-home';
    if (p.indexOf('/admin/apps') === 0) return 'admin-apps';
    if (p.indexOf('/admin/records') === 0) return 'admin-records';
    if (p.indexOf('/admin/review') === 0) return 'admin-review';
    if (p.indexOf('/admin/students') === 0) return 'admin-students';
    if (p.indexOf('/admin/teachers') === 0) return 'admin-teachers';
    if (p.indexOf('/admin/users') === 0) return 'admin-students';
    if (p.indexOf('/admin/classes') === 0) return 'admin-classes';
    if (p.indexOf('/admin/bindings') === 0) return 'admin-classes';
    if (p.indexOf('/admin/rules') === 0) return 'admin-rules';
    if (p.indexOf('/admin/configs') === 0) return 'admin-configs';
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
    menuOf().forEach(function (group) {
      var wrap = el('div', { class: 'nav-group' }, []);
      if (group.title) wrap.appendChild(el('div', { class: 'nav-title', text: group.title }));
      group.items.forEach(function (it) {
        var a = el('a', {
          class: 'nav-item' + (active === it.key ? ' is-on' : ''),
          href: it.href,
          dataset: { label: it.label }
        });
        a.appendChild(el('span', { class: 'nav-glyph' }, [navIcon(it.icon)]));
        a.appendChild(el('span', { class: 'nav-label', text: it.label }));
        if (it.count) {
          var n = it.count();
          if (n) a.appendChild(el('span', { class: 'count' + (it.alert ? ' count--alert' : ''), text: String(n) }));
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
    var btn = el('button', { class: 'dd-btn', attrs: { type: 'button' } }, []);
    if (typeof label === 'string') btn.appendChild(el('span', { text: label }));
    else if (label) btn.appendChild(label);
    btn.appendChild(ui.icon('chevron'));
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

    var isAdmin = ADMIN.api.role() === 'ADMIN';
    var name = STORE.teacher.name || '';

    var accountItems = [
      { label: '账号管理', onClick: function () { router.go(isAdmin ? '/admin/users' : '/profile'); } },
      { sep: true },
      { label: '退出登录', onClick: function () { logout(); } }
    ];

    /* 通知铃铛：点一下去待审批（教师）或账号页（管理员）。
       红点表示有待办，没有待办就不显示。 */
    var hasTodo = isAdmin ? false : pendingQueue().length > 0;
    var bell = el('button', { class: 'top-bell', attrs: { type: 'button', 'aria-label': '通知' } }, [
      ui.pngIcon('bell', 19),
      hasTodo ? el('i', { class: 'top-bell-dot' }) : null
    ]);
    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      router.go(isAdmin ? '/admin/home' : '/pending');
    });
    top.appendChild(bell);

    /* 用户菜单：头像 + 姓名 + 箭头。
       头像图放 assets/avatar.png，没图时自动回退成姓名首字。 */
    var avatar = el('span', { class: 'top-avatar' }, [el('span', { text: (name || '?').slice(0, 1) })]);
    var img = el('img', { attrs: { src: 'assets/avatar-teacher.png', alt: '' } });
    img.addEventListener('error', function () { img.remove(); });
    avatar.appendChild(img);

    top.appendChild(dropdown(el('span', { class: 'top-user' }, [
      avatar,
      el('span', { class: 'top-name', text: name })
    ]), accountItems));
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
    // 按角色落到各自首页：管理员没有"工作台"，直接进账号管理
    router.go(ADMIN.api.role() === 'ADMIN' ? '/admin/home' : '/workbench');
  }

  function logout() {
    state.loggedIn = false;
    ADMIN.api.setToken('');
    ADMIN.api.setRole('');
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
    router.on('/students', ADMIN.pages.students);
    router.on('/profile', ADMIN.pages.profile);

    /* ---- 管理端 ---- */
    router.on('/admin/home', ADMIN.pages.adminHome);
    router.on('/admin/users', ADMIN.pages.adminUsers);
    router.on('/admin/students', ADMIN.pages.adminStudents);
    router.on('/admin/teachers', ADMIN.pages.adminTeachers);
    router.on('/admin/classes', ADMIN.pages.adminClasses);
    router.on('/admin/bindings', ADMIN.pages.adminBindings);
    router.on('/admin/configs', ADMIN.pages.adminConfigs);
    /* 业务数据视图还没做，先给占位页，避免点了没反应 */
    router.on('/admin/apps', ADMIN.pages.adminApps);
    router.on('/admin/records', ADMIN.pages.adminApps);
    router.on('/admin/review', ADMIN.pages.adminApps);
    router.on('/admin/rules', ADMIN.pages.adminRules);

    router.on('/', ADMIN.pages.workbench);
  }


  /* ---------------- 字号缩放（右下角滑块） ----------------
     只缩放字号与行高（--fs），间距不动 —— 这样放大后信息密度不变，
     卡片自然被内容撑高，不会像整体 zoom 那样把布局一起放大导致溢出。 */
  var FS_KEY = 'cl_font_scale';

  function initFontScale() {
    var val = 1.10;
    try {
      var saved = parseFloat(localStorage.getItem(FS_KEY));
      if (!isNaN(saved) && saved >= 0.9 && saved <= 1.4) val = saved;
    } catch (e) { /* 隐私模式读不到就用默认值 */ }

    document.documentElement.style.setProperty('--fs', String(val));

    var range = el('input', {
      class: 'fs-range',
      attrs: { type: 'range', min: '90', max: '140', step: '2', value: String(Math.round(val * 100)) }
    });
    var label = el('b', { class: 'fs-val', text: Math.round(val * 100) + '%' });
    var panel = el('div', { class: 'fs-panel' }, [
      el('div', { class: 'fs-row' }, [el('span', { text: '显示大小' }), label]),
      range,
      el('div', { class: 'fs-hint', text: '拖动调节 · 设置会记住' })
    ]);
    var fab = el('button', { class: 'fs-fab', attrs: { type: 'button', title: '显示大小' }, text: 'Aa' });
    var ctl = el('div', { class: 'fs-ctl' }, [panel, fab]);
    document.body.appendChild(ctl);

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      ctl.classList.toggle('is-open');
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { ctl.classList.remove('is-open'); });

    range.addEventListener('input', function () {
      var v = parseInt(range.value, 10) / 100;
      document.documentElement.style.setProperty('--fs', String(v));
      label.textContent = Math.round(v * 100) + '%';
      try { localStorage.setItem(FS_KEY, String(v)); } catch (e) { /* 忽略 */ }
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    /* 双击打开（file://）时接口永远调不通：相对路径 /api/v1 会被解析成 file:///api/v1。
       与其让用户点完登录才看到一句"连不上后端"，不如一进来就说清正确地址。 */
    if (location.protocol === 'file:') {
      document.body.dataset.role = 'guest';
      var box = document.getElementById('login-root');
      if (box) {
        box.innerHTML = '';
        box.appendChild(el('div', { class: 'login' }, [
          el('h1', { class: 'login-h1', text: '请用网址访问' }),
          el('div', { class: 'login-sub', text: '这个页面由后端托管，不能直接双击打开' }),
          el('div', { class: 'login-body' }, [
            el('div', { class: 'login-hint', text: '在浏览器地址栏输入：' }),
            el('div', { class: 'file-hint-url', text: 'http://localhost:8080/admin/' }),
            el('div', { class: 'login-hint', text: '前提是后端已启动 —— 双击项目根目录的 start-backend.cmd。' })
          ])
        ]));
      }
      return;
    }

    /* 深链要在这里先存下来：router.start 的 guard 会把未登录的 hash 改写成 #/login，
       等异步登录完成后 location.hash 已经不是用户原本要去的页面了。 */
    var deepLink = location.hash.replace(/^#/, '') || '/workbench';
    if (deepLink === '/login') deepLink = '/workbench';
    ADMIN.shell = {
      crumbs: crumbs,
      renderNav: renderNav,
      renderTop: renderTop,
      enterApp: enterApp,
      logout: logout,
      sync: function () { renderNav(); },
      /** 重绘当前页：写操作刷新 STORE 后调用，避免各页面自己写重绘逻辑 */
      rerender: function () { router.go(router.current() || '/workbench'); }
    };

    registerRoutes();
    initFontScale();

    /* 已登录过（刷新页面）：sessionStorage 里还有 token，先把数据拉齐再渲染，
       否则页面会在 STORE 还是空数组时画出空列表。 */
    if (ADMIN.api.token()) {
      state.loggedIn = true;
      document.body.dataset.role = 'app';
      ADMIN.api.loadStore().then(function () {
        renderNav();
        renderTop();
        // 数据到位后主动渲染：router.start 时因未登录已被挡回 /login，
        // 恢复登录态后必须有人再触发一次页面渲染，否则就是"壳有了、内容空白"
        router.go(deepLink);
      }).catch(function (e) {
        console.error('[admin] 数据加载失败', e);
        ADMIN.api.setToken('');
        state.loggedIn = false;
        document.body.dataset.role = 'guest';
        router.go('/login');
      });
    }

    /* 演示深链：?demo=1 用教师账号，?demo=admin 用管理员账号，自动登录。
       截图验证与答辩都用它，省一次输入；不带参数时行为不变。 */
    var demoMatch = location.search.match(/[?&]demo=([^&]+)/);
    if (demoMatch && !ADMIN.api.token()) {
      var demoUser = demoMatch[1] === 'admin' ? 'admin' : 'T2023001';
      ADMIN.api.login(demoUser, '123456')
        .then(function () { return ADMIN.api.loadStore(); })
        .then(function () {
          state.loggedIn = true;
          document.body.dataset.role = 'app';
          renderNav();
          renderTop();
          router.go(deepLink);
        })
        .catch(function (e) {
          console.error('[admin] 演示登录失败', e);
        });
    }

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

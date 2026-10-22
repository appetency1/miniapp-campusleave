/* ============================================================
   router.js —— hash 路由 + 查询串解析 + 返回位置恢复
   路由表由 app.js 注册；页面统一签名 handler(page, ctx)
   ctx = { params, query, path }
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});

  var routes = [];
  var current = null;
  var prevPath = null;
  var lastEnter = false;
  var scrollMap = {};
  var guard = null;
  var onBefore = null;

  /**
   * "同一个视图"判定 —— 入场动画的门控必须是视图级，不是路径级。
   *
   * 主从两栏的页面（left list + right detail）在同一视图内换选中项时，
   * 页面结构根本没变，只是重渲染左右两栏。按路径判定的话，点另一条就整页
   * 淡入一次，用户会以为点了刷新（"我是不是不小心刷新了？"）。
   *
   *   · /pending ↔ /pending/ext ↔ /pending/:id  —— 同一视图（pending.js 只换 data）
   *   · /review  ↔ /review/:id                  —— 同一视图（review.js 只换 local.sel）
   *
   * 刻意**不合并**的两组：
   *   · /records ↔ /records/:id     表格页 → 整页详情，是真的换页
   *   · /admin/apps ↔ /admin/records ↔ /admin/review
   *     三者共用 adminApps 组件，但是左侧三个不同导航项，标题与默认筛选都不同，
   *     属于真实导航（点导航不淡入会像"没跳转"），保留入场。
   */
  function viewFamily(p) {
    if (p.indexOf('/pending') === 0) return 'pending';
    if (p.indexOf('/review') === 0) return 'review';
    return null;
  }

  function sameView(a, b) {
    if (!a || !b) return false;
    var fa = viewFamily(a);
    return fa !== null && fa === viewFamily(b);
  }

  function compile(pattern) {
    var keys = [];
    var src = '^' + pattern.replace(/\/:([A-Za-z0-9_]+)/g, function (_, k) {
      keys.push(k);
      return '/([^/]+)';
    }) + '/?$';
    return { re: new RegExp(src), keys: keys };
  }

  function on(pattern, handler) {
    var c = compile(pattern);
    routes.push({ pattern: pattern, re: c.re, keys: c.keys, handler: handler });
  }

  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) raw = '/';
    var qi = raw.indexOf('?');
    var path = qi === -1 ? raw : raw.slice(0, qi);
    var query = {};
    if (qi !== -1) {
      raw.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var i = pair.indexOf('=');
        var k = i === -1 ? pair : pair.slice(0, i);
        var v = i === -1 ? '' : pair.slice(i + 1);
        query[decodeURIComponent(k)] = decodeURIComponent(v);
      });
    }
    if (path.length > 1 && path.slice(-1) === '/') path = path.slice(0, -1);
    return { path: path, query: query };
  }

  function find(path) {
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(path);
      if (m) {
        var params = {};
        routes[i].keys.forEach(function (k, idx) { params[k] = decodeURIComponent(m[idx + 1]); });
        return { route: routes[i], params: params };
      }
    }
    return null;
  }

  function go(path) {
    var next = '#' + path;
    if (location.hash === next) { render(); return; }
    location.hash = next;
  }

  function refresh() { render(); }

  function render() {
    var h = parseHash();
    if (guard && guard(h.path) === false) return;

    var main = document.getElementById('main');
    if (!main) return;

    var pageEl = main.querySelector('.page');
    if (current && pageEl) scrollMap[current] = pageEl.scrollTop || 0;

    var hit = find(h.path);
    main.innerHTML = '';
    var page = document.createElement('div');
    page.className = 'page';
    main.appendChild(page);
    current = h.path;

    if (onBefore) onBefore(h.path, hit ? hit.params : {});

    if (hit) {
      hit.route.handler(page, { params: hit.params, query: h.query, path: h.path });
    } else {
      page.className = 'page page--scroll';
      page.appendChild(ADMIN.ui.empty({
        title: '这个地址没有对应的页面。',
        note: '请从左侧导航进入，或回到工作台。'
      }));
    }

    /* 入场门控：path 变了、且不属于同一个视图，才加 .page--enter。
       首屏（prevPath 为 null）算一次入场 —— 这是"页面首次出现"，
       与后面的 refresh/rerender 区分开（那时 prevPath 已经有值且相同）。
       注意必须在 handler 之后加 —— 各页面 handler 会重写 page.className
       （'page' / 'page page--scroll'），先加会被抹掉。
       同一帧内加类，浏览器还没绘制，不会出现"闪一下再播"。 */
    lastEnter = prevPath !== h.path && !sameView(prevPath, h.path);
    prevPath = h.path;
    if (lastEnter) page.classList.add('page--enter');
    /* 数字滚动 / 折线环形绘制与入场共用这一个门控：
       重绘（refresh / rerender）时直接落终值，不重播。 */
    if (ADMIN.motion) ADMIN.motion.onPage(page, lastEnter);

    var restore = scrollMap[h.path];
    if (restore) {
      requestAnimationFrame(function () {
        var p = main.querySelector('.page');
        if (p) p.scrollTop = restore;
      });
    }
  }

  function start(opts) {
    guard = (opts && opts.guard) || null;
    onBefore = (opts && opts.onBefore) || null;
    window.addEventListener('hashchange', render);
    if (!location.hash) {
      location.hash = '#/workbench';
    } else {
      render();
    }
  }

  ADMIN.router = {
    on: on,
    start: start,
    go: go,
    refresh: refresh,
    parseHash: parseHash,
    current: function () { return current; },
    /** 最近一次 render 是否走了"页面入场"（供调试与验收断言用） */
    lastEnter: function () { return lastEnter; }
  };
})();

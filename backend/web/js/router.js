/* ============================================================
   router.js —— hash 路由 + 查询串解析 + 返回位置恢复
   路由表由 app.js 注册；页面统一签名 handler(page, ctx)
   ctx = { params, query, path }
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});

  var routes = [];
  var current = null;
  var scrollMap = {};
  var guard = null;
  var onBefore = null;

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
    current: function () { return current; }
  };
})();

/* ============================================================================
 * app.js —— 单一 state + render + 事件
 * 所有业务数据来自 MOCK（视图层零硬编码）；所有数据变更走 API stub。
 * ==========================================================================*/
(function () {
  'use strict';

  var M = window.MOCK;
  var API = window.API;
  var SHELL = M.shell;
  var CARDS = M.cards;

  /* ---------------------------------------------------------------- 内联图标
   * Lucide 官方路径，直接内联为 SVG（stroke 1.8 / currentColor / 16·20·24）
   * ----------------------------------------------------------------------*/
  var ICONS = {
    'layout-dashboard':
      '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>' +
      '<rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'inbox':
      '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
      '<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'shield-alert':
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
      '<path d="M12 8v4"/><path d="M12 16h.01"/>',
    'clock-alert':
      '<path d="M12.338 21.994A10 10 0 1 1 21.925 13.227"/><path d="M12 6v6l2 1"/><path d="M21 18h-6"/><path d="M18 21v.01"/>',
    'bar-chart-3':
      '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    'users':
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
      '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'bell':
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
      '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'graduation-cap':
      '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>' +
      '<path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'calendar':
      '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'check-check': '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'circle-alert': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    'map-pin':
      '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
      '<circle cx="12" cy="10" r="3"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    'image': '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    'undo': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'
  };

  function icon(name, cls) {
    var path = ICONS[name] || ICONS['circle-alert'];
    return '<svg class="icon ' + (cls || 'icon--20') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  }

  /* ---------------------------------------------------------------- 工具 */
  function byId(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function firstChar(s) { return esc(String(s || '').trim().charAt(0) || '·'); }
  function sceneCls(code) { return code === 'off-campus' ? 'off' : 'on-campus'; }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------------------------------------------------------------- state */
  var state = {
    loading: true,
    error: null,
    approvals: [],
    overdue: [],
    reviews: [],
    kpi: [],
    trend: null,
    batch: false,
    selected: new Set(),
    query: '',
    filter: 'all',        // 'all' | 'overdue'
    rejecting: null,      // 正在填写驳回意见的申请 id
    rejectDraft: '',
    dismissing: new Set(),
    dismissed: [],        // [{ item, index }] 供撤销
    kpiAnimated: false
  };

  /* =============================================================== 侧栏/顶栏 */
  function renderShell() {
    byId('sidebarBrand').innerHTML =
      '<span class="brand__mark">' + icon('graduation-cap', 'icon--20') + '</span>' +
      '<span class="brand__text">' + esc(SHELL.brand) + '</span>';

    byId('nav').innerHTML = SHELL.nav.map(function (n) {
      return '<button class="nav__item' + (n.key === state.nav ? ' is-active' : '') + '" type="button" data-nav="' + esc(n.key) + '">' +
        icon(n.icon, 'icon--20') + '<span class="nav__label">' + esc(n.label) + '</span></button>';
    }).join('');

    byId('sidebarFoot').innerHTML =
      '<div class="counselor"><span class="ava">' + firstChar(SHELL.counselor.name) + '</span>' +
      '<span class="counselor__info"><span class="counselor__name">' + esc(SHELL.counselor.name) +
      ' · ' + esc(SHELL.counselor.role) + '</span><span class="counselor__meta">工号 ' +
      esc(SHELL.counselor.staffNo) + '</span></span></div>';

    byId('pageTitle').textContent = SHELL.pageTitle;
    byId('dateLabel').textContent = SHELL.dateLabel;
    byId('searchIcon').innerHTML = icon('search', 'icon--20');
    byId('bellIcon').innerHTML = icon('bell', 'icon--20');
    byId('bellBadge').textContent = SHELL.bellBadge;
    byId('searchInput').setAttribute('placeholder', SHELL.searchPlaceholder);
  }

  /* =============================================================== 骨架屏 */
  function renderSkeleton() {
    byId('cardQueue').innerHTML =
      '<div class="card__head"><div class="sk sk--title"></div></div>' +
      '<div class="sk__stack">' + repeat('<div class="sk sk--row"></div>', 6) + '</div>';
    byId('cardOverdue').innerHTML =
      '<div class="card__head"><div class="sk sk--title"></div></div>' +
      '<div class="sk__stack">' + repeat('<div class="sk sk--row"></div>', 3) + '</div>';
    byId('cardReview').innerHTML =
      '<div class="card__head"><div class="sk sk--title"></div></div>' +
      '<div class="sk__stack">' + repeat('<div class="sk sk--row"></div>', 2) + '</div>';
    byId('cardKpi').innerHTML =
      '<div class="card__head"><div class="sk sk--title"></div></div>' +
      '<div class="kpi">' + repeat('<div class="kpi__cell"><div class="sk sk--num"></div></div>', 4) + '</div>';
    byId('cardTrend').innerHTML =
      '<div class="card__head"><div class="sk sk--title"></div></div>' +
      '<div class="sk" style="flex:1;min-height:120px;"></div>';
  }
  function repeat(s, n) { var out = ''; for (var i = 0; i < n; i++) out += s; return out; }

  /* =============================================================== 卡片 4：照片 */
  function renderPhoto() {
    byId('cardPhoto').innerHTML =
      '<figure class="photo">' +
        '<img class="photo__img" src="assets/campus-day.jpg" alt="' + esc(M.campus.photoAlt) + '">' +
        '<span class="photo__top">' + icon('image', 'icon--16') + esc(CARDS.photoTitle) + '</span>' +
        '<figcaption class="photo__cap">' +
          '<span class="photo__stat">' + esc(CARDS.photoStat) + '</span>' +
          '<span class="photo__sub">' + esc(CARDS.photoSub) + '</span>' +
        '</figcaption>' +
      '</figure>';
  }

  /* =============================================================== 卡片 1：队列 */
  function queueRows() {
    var rows = state.filter === 'overdue'
      ? state.overdue.map(function (o) { var c = shallow(o); c.kind = 'overdue'; return c; })
      : state.approvals.map(function (a) { var c = shallow(a); c.kind = 'approval'; return c; });
    var q = state.query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (r) {
        return String(r.name).toLowerCase().indexOf(q) >= 0 || String(r.studentNo).indexOf(q) >= 0;
      });
    }
    return rows;
  }
  function shallow(o) { var c = {}; for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; } return c; }

  function approvalRowHtml(it) {
    var batch = state.batch;
    var h = '<div class="req" data-id="' + esc(it.id) + '">';
    h += '<div class="req__lead">';
    if (batch) {
      h += '<label class="req__check"><input type="checkbox" data-check="' + esc(it.id) + '"' +
        (state.selected.has(it.id) ? ' checked' : '') + ' aria-label="选择 ' + esc(it.name) + '"></label>';
    }
    h += '<span class="ava">' + firstChar(it.name) + '</span></div>';
    h += '<div class="req__main">';
    h += '<div class="req__line1"><span class="req__name">' + esc(it.name) + '</span>' +
      '<span class="req__no">' + esc(it.studentNo) + '</span>' +
      '<span class="req__cls">' + esc(it.className) + '</span></div>';
    h += '<div class="req__line2">' +
      '<span class="chip chip--scene-' + sceneCls(it.sceneCode) + '">' + esc(M.sceneMap[it.sceneCode]) + '</span>' +
      '<span class="chip chip--type-' + esc(it.typeCode) + '">' + esc(M.typeMap[it.typeCode]) + '</span>' +
      '</div>';
    h += '<div class="req__line3">' +
      '<span class="req__time">' + icon('clock', 'icon--16') + esc(it.slot) + '</span>' +
      '<span class="req__time">' + icon('calendar', 'icon--16') + '提交 ' + esc(it.submittedAt) + '</span>' +
      '<span class="req__reason">' + esc(it.reason) + '</span>' +
      '</div></div>';
    h += '<div class="req__ops">' +
      '<button class="btn btn--danger-ghost" type="button" data-act="reject" data-id="' + esc(it.id) + '">' + esc(CARDS.reject) + '</button>' +
      '<button class="btn btn--primary" type="button" data-act="approve" data-id="' + esc(it.id) + '">' + esc(CARDS.approve) + '</button>' +
      '</div></div>';

    if (state.rejecting === it.id) {
      h += '<div class="reject-panel">' +
        '<div class="reject-panel__label">驳回意见</div>' +
        '<textarea class="reject-panel__input" id="rejectInput" placeholder="' + esc(CARDS.rejectPlaceholder) + '">' + esc(state.rejectDraft) + '</textarea>' +
        '<div class="reject-panel__ops">' +
          '<button class="btn btn--ghost" type="button" data-act="reject-cancel" data-id="' + esc(it.id) + '">' + esc(CARDS.rejectCancel) + '</button>' +
          '<button class="btn btn--danger" type="button" data-act="reject-confirm" data-id="' + esc(it.id) + '">' + esc(CARDS.rejectConfirm) + '</button>' +
        '</div></div>';
    }
    return h;
  }

  function overdueRowHtml(it) {
    var h = '<div class="req" data-id="' + esc(it.id) + '">';
    h += '<div class="req__lead"><span class="ava ava--danger">' + firstChar(it.name) + '</span></div>';
    h += '<div class="req__main">';
    h += '<div class="req__line1"><span class="req__name">' + esc(it.name) + '</span>' +
      '<span class="req__no">' + esc(it.studentNo) + '</span>' +
      '<span class="req__cls">' + esc(it.className) + '</span></div>';
    h += '<div class="req__line2">' +
      '<span class="chip chip--scene-' + sceneCls(it.sceneCode) + '">' + esc(M.sceneMap[it.sceneCode]) + '</span>' +
      '<span class="chip chip--type-' + esc(it.typeCode) + '">' + esc(M.typeMap[it.typeCode]) + '</span>' +
      '<span class="mini__tag mini__tag--danger">' + esc(it.overrun) + '</span></div>';
    h += '<div class="req__line3">' +
      '<span class="req__time">' + icon('clock', 'icon--16') + esc(it.slot) + '</span>' +
      '<span class="req__reason">' + esc(it.reason) + '</span></div></div>';
    h += '<div class="req__ops"><button class="btn btn--ghost" type="button" data-act="remind" data-id="' +
      esc(it.id) + '">' + esc('催办销假') + '</button></div>';
    return h + '</div>';
  }

  function stateHtml(kind, title, sub) {
    var ico = kind === 'done' ? 'check-circle' : (kind === 'error' ? 'circle-alert' : 'clock');
    var cls = kind === 'error' ? ' state--error' : (kind === 'done' ? '' : ' state--muted');
    var h = '<div class="state' + cls + '"><span class="state__ico">' + icon(ico, 'icon--28') + '</span>';
    if (kind === 'error') {
      h += '<span class="state__title">' + esc(title) + '</span><span class="state__sub">' + esc(sub) + '</span>' +
        '<button class="btn btn--ghost" type="button" data-act="retry">' + icon('refresh', 'icon--16') + esc('重新加载') + '</button>';
    } else {
      h += '<span class="state__title">' + esc(title) + '</span><span class="state__sub">' + esc(sub) + '</span>';
    }
    return h + '</div>';
  }

  function renderQueue() {
    var el = byId('cardQueue');
    if (state.error) {
      el.innerHTML = '<div class="card__head"><h2 class="card__title">' + esc(CARDS.queueTitle) + '</h2></div>' +
        stateHtml('error', '加载失败', state.error);
      return;
    }
    var rows = queueRows();
    var h = '<div class="card__head">' +
      '<h2 class="card__title">' + esc(CARDS.queueTitle) + '</h2>' +
      '<span class="card__count num" id="queueCount">' + state.approvals.length + '</span>' +
      '<div class="card__grow"></div>';

    if (state.filter === 'all') {
      h += '<div class="seg">' +
        '<button class="seg__btn' + (state.batch ? '' : ' is-on') + '" type="button" data-act="mode" data-mode="single">' + esc(CARDS.singleLabel) + '</button>' +
        '<button class="seg__btn' + (state.batch ? ' is-on' : '') + '" type="button" data-act="mode" data-mode="batch">' + esc(CARDS.batchLabel) + '</button>' +
        '</div>';
    }
    h += '</div>';

    if (state.filter === 'overdue') {
      h += '<div class="queue-filter">' + icon('clock-alert', 'icon--16') +
        '<span class="queue-filter__text">仅显示逾期未销假</span>' +
        '<button class="btn btn--ghost" type="button" data-act="clear-filter">返回全部</button></div>';
    }
    if (state.batch && state.filter === 'all') {
      var allSel = rows.length > 0 && rows.every(function (r) { return state.selected.has(r.id); });
      h += '<div class="batch-bar">' +
        '<label class="check"><input type="checkbox" id="selectAll"' + (allSel ? ' checked' : '') + '>' + esc(CARDS.selectAll) + '</label>' +
        '<span class="card__grow"></span>' +
        '<button class="btn btn--primary" type="button" data-act="batch-approve"' + (state.selected.size ? '' : ' disabled') + '>' +
        icon('check-check', 'icon--16') + esc(CARDS.batchApprove) + ' · ' + state.selected.size + '</button></div>';
    }

    if (!rows.length) {
      h += state.filter === 'overdue'
        ? stateHtml('muted', CARDS.emptyOverdue, CARDS.emptyOverdueSub)
        : stateHtml('done', CARDS.emptyDone, CARDS.emptyDoneSub);
    } else {
      h += '<div class="req-list">' + rows.map(function (r) {
        return r.kind === 'overdue' ? overdueRowHtml(r) : approvalRowHtml(r);
      }).join('') + '</div>';
    }
    el.innerHTML = h;
  }

  /* =============================================================== 卡片 2/3 */
  function renderOverdue() {
    var el = byId('cardOverdue');
    if (state.error) { el.innerHTML = stateHtml('error', '加载失败', state.error); return; }
    var h = '<div class="card__head">' + icon('clock-alert', 'icon--20') +
      '<h2 class="card__title">' + esc(CARDS.overdueTitle) + '</h2>' +
      '<div class="card__grow"></div>' +
      '<span class="card__count num">' + state.overdue.length + '</span></div>';
    h += '<ul class="mini-list">' + state.overdue.map(function (o) {
      return '<li class="mini">' +
        '<span class="mini__ava">' + firstChar(o.name) + '</span>' +
        '<span class="mini__main">' +
          '<span class="mini__name">' + esc(o.name) + '<span class="mini__cls">' + esc(o.className) + '</span></span>' +
          '<span class="mini__sub">' + esc(M.sceneMap[o.sceneCode]) + ' · ' + esc(M.typeMap[o.typeCode]) + ' · ' + esc(o.slot) + '</span>' +
        '</span>' +
        '<span class="mini__tag mini__tag--danger">' + esc(o.overrun) + '</span>' +
        '</li>';
    }).join('') + '</ul>';
    el.innerHTML = h;
    el.classList.toggle('is-filtering', state.filter === 'overdue');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', CARDS.overdueTitle + ' — 点击筛选待审批列表');
  }

  function renderReviews() {
    var el = byId('cardReview');
    if (state.error) { el.innerHTML = stateHtml('error', '加载失败', state.error); return; }
    var h = '<div class="card__head">' + icon('shield-alert', 'icon--20') +
      '<h2 class="card__title">' + esc(CARDS.reviewTitle) + '</h2>' +
      '<div class="card__grow"></div>' +
      '<span class="card__count num" style="color:var(--warn)">' + state.reviews.length + '</span></div>';
    h += '<ul class="mini-list">' + state.reviews.map(function (r) {
      return '<li class="mini">' +
        '<span class="mini__ava">' + firstChar(r.name) + '</span>' +
        '<span class="mini__main">' +
          '<span class="mini__name">' + esc(r.name) + '<span class="mini__cls">' + esc(r.className) + '</span></span>' +
          '<span class="mini__sub">' + esc(r.kind) + '：' + esc(r.detail) + '</span>' +
        '</span>' +
        '<span class="mini__tag mini__tag--warn">' + esc('待核验') + '</span>' +
        '</li>';
    }).join('') + '</ul>';
    el.innerHTML = h;
  }

  /* =============================================================== 卡片 5：KPI */
  function renderKpi() {
    var el = byId('cardKpi');
    if (state.error) { el.innerHTML = stateHtml('error', '加载失败', state.error); return; }
    var h = '<div class="card__head">' + icon('bar-chart-3', 'icon--20') +
      '<h2 class="card__title">' + esc(CARDS.kpiTitle) + '</h2></div><div class="kpi">';
    h += state.kpi.map(function (k, i) {
      var cls = k.tone === 'danger' ? ' kpi__cell--danger' : (i === 0 ? ' kpi__cell--brand' : '');
      return '<div class="kpi__cell' + cls + '">' +
        '<span class="kpi__num num" data-kpi="' + esc(k.key) + '" data-to="' + k.value + '">' +
        (state.kpiAnimated ? k.value : 0) + '</span>' +
        '<span class="kpi__label">' + esc(k.label) + '</span></div>';
    }).join('');
    el.innerHTML = h + '</div>';
    if (!state.kpiAnimated) { animateKpi(); state.kpiAnimated = true; }
  }

  function animateKpi() {
    qsa('.kpi__num').forEach(function (node) {
      var to = Number(node.getAttribute('data-to')) || 0;
      if (reduced()) { node.textContent = String(to); return; }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / 900);
        var e = 1 - Math.pow(1 - p, 3);
        node.textContent = String(Math.round(to * e));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* =============================================================== 卡片 6：趋势 */
  function renderTrend() {
    var el = byId('cardTrend');
    if (state.error) { el.innerHTML = stateHtml('error', '加载失败', state.error); return; }
    var t = state.trend;
    var head = '<div class="card__head">' + icon('bar-chart-3', 'icon--20') +
      '<h2 class="card__title">' + esc(t.title) + '</h2>' +
      '<div class="card__grow"></div>' +
      '<span class="card__note">单位：' + esc(t.unit || CARDS.trendUnit) + '</span></div>';

    var W = 620, H = 210, padL = 38, padR = 14, padT = 16, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = Math.max.apply(null, t.values);
    var yMax = Math.ceil(max * 1.15 / 5) * 5;
    var n = t.values.length, stepW = plotW / n;
    var barW = Math.min(stepW * 0.46, 34);
    function cx(i) { return padL + stepW * i + stepW / 2; }
    function cy(v) { return padT + plotH * (1 - v / yMax); }

    var grid = '', ylab = '', xlab = '', bars = '', dots = '', pts = [];
    for (var g = 0; g <= 4; g++) {
      var yy = padT + plotH * (1 - g / 4);
      grid += '<line class="trend__grid" x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '"/>';
      ylab += '<text class="trend__axis" x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + Math.round(yMax * g / 4) + '</text>';
    }
    for (var i = 0; i < n; i++) {
      var v = t.values[i], x = cx(i), y = cy(v), bh = (padT + plotH) - y;
      bars += '<rect class="trend__bar' + (v === max ? ' trend__bar--top' : '') + '" x="' + (x - barW / 2).toFixed(1) +
        '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) +
        '" rx="4" style="transition-delay:' + (120 + i * 60) + 'ms"/>';
      pts.push([x, y]);
      dots += '<circle class="trend__dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2"/>';
      xlab += '<text class="trend__axis" x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(t.labels[i]) + '</text>';
    }
    var len = 0;
    for (var k = 1; k < pts.length; k++) {
      var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    len = Math.ceil(len * 1.06) + 12;
    var poly = '<polyline class="trend__line" points="' + pts.map(function (p) {
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join(' ') + '" style="--len:' + len + 'px"/>';

    el.innerHTML = head + '<div class="trend"><svg class="trend__svg" viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(t.title) + '">' +
      grid + bars + poly + dots + xlab + ylab + '</svg></div>';
  }

  /* =============================================================== 渲染总控 */
  function renderAll() {
    renderQueue();
    renderOverdue();
    renderReviews();
    renderKpi();
    renderTrend();
  }

  /* stagger=true 时按 60ms 递进错峰入场；否则立即显示 */
  function revealBento(stagger) {
    var cards = qsa('.card');
    cards.forEach(function (c) { c.classList.remove('is-in'); c.style.transitionDelay = '0ms'; });
    void document.body.offsetWidth; // 强制回流，确保动画重播
    cards.forEach(function (c, i) {
      c.style.transitionDelay = (stagger ? i * 60 : 0) + 'ms';
      c.classList.add('is-in');
    });
  }

  /* =============================================================== Toast */
  function showToast(text, undoItem, tone) {
    var layer = byId('toastLayer');
    var node = document.createElement('div');
    node.className = 'toast' + (tone === 'danger' ? ' toast--danger' : '');
    node.setAttribute('role', 'status');
    node.innerHTML =
      '<span class="toast__ico">' + icon(tone === 'danger' ? 'x' : 'check', 'icon--20') + '</span>' +
      '<span class="toast__text">' + esc(text) + '</span>' +
      (undoItem ? '<button class="toast__undo" type="button">' + esc('撤销') + '</button>' : '');
    layer.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });

    var timer = setTimeout(function () { hide(node); }, 5200);
    function hide(el) {
      clearTimeout(timer);
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }
    var undoBtn = node.querySelector('.toast__undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        hide(node);
        undo(undoItem);
      });
    }
  }

  /* =============================================================== 交互动作 */
  function removeApproval(id) {
    for (var i = 0; i < state.approvals.length; i++) {
      if (state.approvals[i].id === id) return { item: state.approvals.splice(i, 1)[0], index: i };
    }
    return null;
  }

  function approveItem(id) {
    if (state.dismissing.has(id)) return;
    var row = document.querySelector('.req[data-id="' + id + '"]');
    if (row) row.classList.add('is-leaving');
    state.dismissing.add(id);
    state.selected.delete(id);
    API.approve(id).then(function () {
      var removed = removeApproval(id);
      state.dismissing.delete(id);
      if (!removed) return;
      state.dismissed.push(removed);
      var it = removed.item;
      renderQueue();
      showToast('已通过 ' + it.name + ' 的' + M.sceneMap[it.sceneCode] + M.typeMap[it.typeCode] + '申请', removed);
    }).catch(function (err) {
      state.dismissing.delete(id);
      if (row) row.classList.remove('is-leaving');
      showToast(err.message || '操作失败', null, 'danger');
      load();
    });
  }

  function openReject(id) {
    state.rejecting = id;
    state.rejectDraft = '';
    renderQueue();
    var box = byId('rejectInput');
    if (box) box.focus();
  }

  function confirmReject(id) {
    var box = byId('rejectInput');
    var opinion = (box && box.value || '').trim();
    if (!opinion) {
      if (box) { box.focus(); box.style.borderColor = 'var(--danger)'; }
      showToast('请填写驳回意见后再确认', null, 'danger');
      return;
    }
    state.rejecting = null;
    var row = document.querySelector('.req[data-id="' + id + '"]');
    if (row) row.classList.add('is-leaving', 'is-leaving--reject');
    var panel = document.querySelector('.reject-panel');
    if (panel) { panel.style.transition = 'opacity .2s ease'; panel.style.opacity = '0'; }

    API.reject(id, opinion).then(function () {
      var removed = removeApproval(id);
      if (!removed) { renderQueue(); return; }
      var it = removed.item;
      renderQueue();
      showToast('已驳回 ' + it.name + ' 的申请', null, 'danger');
    }).catch(function (err) {
      showToast(err.message || '操作失败', null, 'danger');
      load();
    });
  }

  function batchApprove() {
    var ids = Array.prototype.slice.call(state.approvals.map(function (a) { return a.id; }))
      .filter(function (id) { return state.selected.has(id); });
    if (!ids.length) return;
    var stagger = reduced() ? 0 : 90;
    var animTotal = (ids.length - 1) * stagger + 360;   // 末条动画结束时刻
    var t0 = performance.now();
    ids.forEach(function (id, i) {
      setTimeout(function () {
        var row = document.querySelector('.req[data-id="' + id + '"]');
        if (row) row.classList.add('is-leaving');
      }, i * stagger);
    });
    API.batchApprove(ids).then(function () {
      var wait = Math.max(0, animTotal - (performance.now() - t0));
      return new Promise(function (res) { setTimeout(res, wait); });
    }).then(function () {
      var names = [];
      ids.forEach(function (id) {
        var removed = removeApproval(id);
        if (removed) { state.dismissed.push(removed); names.push(removed.item.name); }
      });
      state.selected.clear();
      state.batch = false;
      renderQueue();
      showToast('已批量通过 ' + ids.length + ' 条申请：' + names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' : ''), null);
    }).catch(function (err) {
      showToast(err.message || '批量操作失败', null, 'danger');
      load();
    });
  }

  function undo(entry) {
    var item = entry.item;
    API.restore(item.id).then(function () {
      state.dismissed = state.dismissed.filter(function (d) { return d.item.id !== item.id; });
      var exists = state.approvals.some(function (a) { return a.id === item.id; });
      if (!exists) state.approvals.splice(Math.min(entry.index, state.approvals.length), 0, item);
      renderQueue();
      showToast('已撤销，' + item.name + ' 的申请回到待审批队列', null);
    }).catch(function (err) {
      showToast(err.message || '撤销失败', null, 'danger');
    });
  }

  function setFilter(f) {
    state.filter = f;
    state.rejecting = null;
    if (f !== 'all') { state.batch = false; state.selected.clear(); }
    renderQueue();
    var od = byId('cardOverdue');
    if (od) od.classList.toggle('is-filtering', f === 'overdue');
  }

  function setBatch(on) {
    state.batch = on;
    if (!on) state.selected.clear();
    renderQueue();
  }

  /* =============================================================== 数据加载 */
  function load() {
    state.loading = true;
    state.error = null;
    state.selected.clear();
    renderSkeleton();
    Promise.all([
      API.fetchApprovals(), API.fetchOverdue(), API.fetchReviews(), API.fetchKpi(), API.fetchTrend()
    ]).then(function (res) {
      state.approvals = res[0];
      state.overdue = res[1];
      state.reviews = res[2];
      state.kpi = res[3];
      state.trend = res[4];
      state.loading = false;
      renderAll();
      revealBento(true);
    }).catch(function (err) {
      state.loading = false;
      state.error = (err && err.message) || '数据加载失败';
      renderAll();
      revealBento(true);
    });
  }

  /* =============================================================== 事件绑定 */
  function bind() {
    byId('nav').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-nav]');
      if (!btn) return;
      var key = btn.getAttribute('data-nav');
      state.nav = key;
      qsa('.nav__item', byId('nav')).forEach(function (n) {
        n.classList.toggle('is-active', n.getAttribute('data-nav') === key);
      });
      if (key === 'overdue') { setFilter('overdue'); return; }
      if (key === 'pending' || key === 'desk') { setFilter('all'); return; }
      var label = (SHELL.nav.filter(function (n) { return n.key === key; })[0] || {}).label || '';
      showToast('「' + label + '」为演示占位，本原型聚焦审批台', null);
    });

    byId('searchInput').addEventListener('input', function (e) {
      state.query = e.target.value || '';
      renderQueue();
    });

    byId('bellBtn').addEventListener('click', function () {
      showToast('有 ' + SHELL.bellBadge + ' 条待处理提醒：逾期销假 / 异常核验', null);
    });

    byId('cardOverdue').addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      setFilter(state.filter === 'overdue' ? 'all' : 'overdue');
    });
    byId('cardOverdue').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(state.filter === 'overdue' ? 'all' : 'overdue'); }
    });

    var queue = byId('cardQueue');

    queue.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'approve') approveItem(id);
      else if (act === 'reject') openReject(id);
      else if (act === 'reject-cancel') { state.rejecting = null; renderQueue(); }
      else if (act === 'reject-confirm') confirmReject(id);
      else if (act === 'mode') setBatch(btn.getAttribute('data-mode') === 'batch');
      else if (act === 'batch-approve') batchApprove();
      else if (act === 'clear-filter') setFilter('all');
      else if (act === 'retry') load();
      else if (act === 'remind') {
        var o = state.overdue.filter(function (x) { return x.id === id; })[0];
        showToast('已向 ' + (o ? o.name : '该学生') + ' 发送销假催办通知', null);
      }
    });

    queue.addEventListener('change', function (e) {
      var check = e.target.closest('[data-check]');
      if (check) {
        var id = check.getAttribute('data-check');
        if (check.checked) state.selected.add(id); else state.selected.delete(id);
        renderQueue();
        return;
      }
      if (e.target.id === 'selectAll') {
        var on = e.target.checked;
        queueRows().forEach(function (r) { if (on) state.selected.add(r.id); else state.selected.delete(r.id); });
        renderQueue();
      }
    });
  }

  /* =============================================================== 启动 */
  function init() {
    if (/error/i.test(window.location.hash)) { API.setForceError(true); }
    renderShell();
    renderPhoto();
    renderSkeleton();
    bind();
    revealBento(false);  // 骨架屏先无错峰入场
    load();              // 数据回来后（见 load）再按 60ms 错峰重播一次
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

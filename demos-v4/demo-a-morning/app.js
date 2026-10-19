/* ============================================================
   CampusLeave · Demo A「晨光」学生端首页
   app.js —— 单一 state 对象 + 渲染函数 + 事件委托
   ------------------------------------------------------------
   架构：state 变更 → 局部重渲染（renderCard / renderFilter / renderList /
   renderSheet）；倒计时每秒只原地更新数字，不整屏重排。
   数据一律来自 mock.js（经 api.js stub 返回），视图层零硬编码业务数据。
   ============================================================ */
(function () {
  'use strict';

  var M = window.MOCK;
  var Api = window.Api;

  /* ---------- 内联 Lucide 图标（stroke-width 1.8 / currentColor） ---------- */
  var ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    list: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  };

  function icon(name, size) {
    var cls = 'ico' + (size ? ' ico--' + size : '');
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* 'YYYY-MM-DD HH:MM[:SS]' / ISO → Date（本地时区） */
  function parseTs(s) {
    var p = String(s).replace('T', ' ').split(' ');
    var d = p[0].split('-').map(Number);
    var t = (p[1] || '0:0').split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, t[2] || 0, 0);
  }
  function fmtHM(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDateTime(d) {
    return '' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + fmtHM(d);
  }
  function fmtInput(d) {
    return '' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + fmtHM(d);
  }
  function addMin(d, n) { return new Date(d.getTime() + n * 60000); }

  /* 相对演示日的日期标签：今天 / 明天 / MM-DD */
  function dayLabel(d, anchor) {
    var a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((x - a) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function spanText(r) {
    var s = parseTs(r.startAt), e = parseTs(r.endAt);
    var sl = dayLabel(s, state.now), el = dayLabel(e, state.now);
    if (sl === el) return sl + ' ' + fmtHM(s) + ' — ' + fmtHM(e);
    return sl + ' ' + fmtHM(s) + ' — ' + el + ' ' + fmtHM(e);
  }

  /* ---------- 单一状态源 ---------- */
  var state = {
    filter: 'ALL',        // ALL | ACTIVE | PENDING | DONE
    scene: 'OFF',         // OFF（离校）| ON（校内）
    sheet: null,          // null | 'detail' | 'locate' | 'extend'
    sheetNo: null,
    locateResult: 'pass', // pass | out（演示开关）
    locatePhase: 'idle',  // idle | locating | done
    locateRes: null,
    records: [],
    now: null,
    submitting: false,
    loading: true,
    error: false,
    extend: { endAt: '', reason: '', errors: {} }
  };

  var tickTimer = null;
  var locateTimer = null;
  var prevCd = null;

  /* ---------- 派生 ---------- */
  function findRec(no) {
    if (!no) return null;
    for (var i = 0; i < state.records.length; i++) if (state.records[i].no === no) return state.records[i];
    return null;
  }
  function sceneRank(r) {
    if (r.effective === 'OVERDUE') return 0;
    if (r.effective === 'IN_PROGRESS') return 1;
    if (r.effective === 'WAITING_START') return 2;
    if (r.status === 'APPROVED') return 3;
    if (r.status === 'PENDING') return 4;
    return 5;
  }
  function sortRecs(list) {
    return list.slice().sort(function (a, b) {
      var d = sceneRank(a) - sceneRank(b);
      if (d) return d;
      return parseTs(b.startAt) - parseTs(a.startAt);
    });
  }
  /* 当前请假（只取「进行中 / 待开始 / 逾期」的有效记录） */
  function currentRec(scene) {
    var list = sortRecs(state.records.filter(function (r) {
      return r.scene === scene && ['IN_PROGRESS', 'WAITING_START', 'OVERDUE'].indexOf(r.effective) >= 0;
    }));
    return list[0] || null;
  }
  function filtered() {
    var all = sortRecs(state.records);
    if (state.filter === 'ACTIVE') {
      return all.filter(function (r) { return ['IN_PROGRESS', 'WAITING_START', 'OVERDUE'].indexOf(r.effective) >= 0; });
    }
    if (state.filter === 'PENDING') return all.filter(function (r) { return r.status === 'PENDING'; });
    if (state.filter === 'DONE') return all.filter(function (r) { return r.status === 'COMPLETED'; });
    return all;
  }
  function chipOf(r) {
    if (r.effective) {
      return {
        text: M.effectiveText[r.effective] || r.effective,
        tone: r.effective === 'OVERDUE' ? 'danger' : (r.effective === 'IN_PROGRESS' ? 'live' : 'wait')
      };
    }
    var tone = 'muted';
    if (r.status === 'REJECTED') tone = 'danger';
    else if (r.status === 'APPROVED') tone = 'ok';
    else if (r.status === 'PENDING') tone = 'wait';
    return { text: M.statusText[r.status] || r.status, tone: tone };
  }
  function metaLine(r) {
    var place = r.scenePlace ? (r.scenePlace + ' ' + r.place) : r.place;
    return (M.typeText[r.type] || '') + ' · ' + spanText(r) + ' · ' + place;
  }

  /* 倒计时文本（相对当前记录 end_time 递减） */
  function cdText() {
    var r = currentRec(state.scene);
    if (!r) return null;
    var ms = parseTs(r.endAt).getTime() - state.now.getTime();
    if (ms < 0) ms = 0;
    var t = Math.floor(ms / 1000);
    return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
  }
  function cdHTML(text, changed) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ':') out += '<span class="cd__sep">:</span>';
      else out += '<span class="cd__d' + (changed && changed[i] ? ' is-roll' : '') + '">' + ch + '</span>';
    }
    return out;
  }

  /* ---------- 渲染：静态块 ---------- */
  function renderPagehead() {
    document.getElementById('pagehead').innerHTML =
      '<span class="brand"><span class="brand__mark">' + icon('pin', '16') + '</span>' + esc(M.env.appName) + '</span>' +
      '<span class="avatar" aria-hidden="true">' + esc(M.student.initial) + '</span>';
  }
  function renderHero() {
    document.getElementById('hero').innerHTML =
      '<h1 class="hero__hi">' + esc(M.env.greeting) + '</h1>' +
      '<p class="hero__sub">' + esc(M.env.dateLine) + '</p>';
  }
  function renderTabbar() {
    var items = [
      { k: 'home', l: '首页', i: 'home' },
      { k: 'records', l: '记录', i: 'list' },
      { k: 'messages', l: '消息', i: 'message' },
      { k: 'me', l: '我的', i: 'user' }
    ];
    document.getElementById('tabbar').innerHTML = items.map(function (it) {
      return '<button class="tab' + (it.k === 'home' ? ' is-on' : '') + '" data-act="tab" data-tab="' + it.k +
        '" aria-label="' + it.l + '">' + icon(it.i, '24') + '<span>' + it.l + '</span></button>';
    }).join('');
  }

  /* ---------- 渲染：玻璃状态卡 ---------- */
  function renderCard() {
    var el = document.getElementById('card');

    if (state.loading) {
      el.innerHTML =
        '<div class="card">' +
          '<div class="sk" style="height:20px;width:38%;border-radius:8px"></div>' +
          '<div class="sk" style="height:44px;width:68%;margin:22px auto 0;border-radius:10px"></div>' +
          '<div class="sk" style="height:14px;width:52%;margin:14px auto 0;border-radius:8px"></div>' +
          '<div class="sk" style="height:50px;width:100%;margin:18px 0 0;border-radius:18px"></div>' +
        '</div>';
      return;
    }

    var r = currentRec(state.scene);
    if (!r) {
      el.innerHTML = '<div class="card"><div class="state" style="background:none;box-shadow:none">' +
        '<span class="state__ico">' + icon('clock', '48') + '</span>' +
        '<div class="state__t">当前没有待处理的请假</div>' +
        '<div class="state__d">需要离校或校内请假时，可从记录页发起</div></div></div>';
      prevCd = null;
      return;
    }

    var isOff = r.scene === 'OFF';
    var c = chipOf(r);
    var pillCls = (c.tone === 'live' || c.tone === 'danger') ? 'pill--live' : 'pill--wait';
    var ctaText = isOff ? '返校定位销假' : '确认结束';
    var ctaAct = isOff ? 'cta-locate' : 'cta-finish';
    var cap = isOff ? '距销假截止' : '距结束';

    el.innerHTML =
      '<div class="card" data-act="open-detail">' +
        '<div class="card__head">' +
          '<div class="seg" role="tablist" aria-label="请假场景">' +
            '<button class="seg__btn' + (isOff ? ' is-on' : '') + '" data-act="seg" data-scene="OFF" role="tab" aria-selected="' + isOff + '">离校</button>' +
            '<button class="seg__btn' + (isOff ? '' : ' is-on') + '" data-act="seg" data-scene="ON" role="tab" aria-selected="' + (!isOff) + '">校内</button>' +
          '</div>' +
          '<span class="pill ' + pillCls + '"><i class="dot"></i>' + esc(c.text) + '</span>' +
        '</div>' +
        '<div class="cd" id="cd">' + cdHTML(cdText()) + '</div>' +
        '<div class="card__cap">' + cap + '</div>' +
        '<div class="card__meta">' + esc(metaLine(r)) + '</div>' +
        '<button class="btn btn--primary btn--block" data-act="' + ctaAct + '"><span class="btn__label">' + ctaText + '</span></button>' +
        '<button class="btn btn--ghost btn--block" data-act="cta-extend"><span class="btn__label">申请续假</span></button>' +
      '</div>';
    prevCd = cdText();
  }

  /* ---------- 渲染：胶囊筛选 ---------- */
  function renderFilter() {
    document.getElementById('filter').innerHTML = M.filters.map(function (f) {
      var on = f.key === state.filter;
      return '<button class="chip' + (on ? ' is-on' : '') + '" data-act="filter" data-filter="' + f.key +
        '" aria-pressed="' + on + '">' + esc(f.label) + '</button>';
    }).join('');
  }

  /* ---------- 渲染：记录列表 ---------- */
  function rowHTML(r, i) {
    var off = r.scene === 'OFF';
    var c = chipOf(r);
    return '<button class="row ' + (off ? 'row--off' : 'row--on') + '" data-act="open-detail" data-no="' + esc(r.no) + '" ' +
      'style="--i:' + i + '">' +
      '<span class="row__ico">' + icon(off ? 'pin' : 'building', '20') + '</span>' +
      '<span class="row__main">' +
        '<span class="row__t">' + esc(M.typeText[r.type] || '') + ' · ' + esc(M.sceneText[r.scene]) + '</span>' +
        '<span class="row__s">' + esc(spanText(r)) + '</span>' +
      '</span>' +
      '<span class="row__chip chip-st chip-st--' + c.tone + '">' + esc(c.text) + '</span>' +
    '</button>';
  }
  function skelHTML() {
    var rows = '';
    for (var i = 0; i < 3; i++) {
      rows += '<div class="skel__row">' +
        '<span class="sk" style="width:34px;height:34px;border-radius:12px"></span>' +
        '<span style="flex:1"><span class="sk" style="display:block;height:14px;width:42%"></span>' +
        '<span class="sk" style="display:block;height:12px;width:64%;margin-top:7px"></span></span>' +
        '<span class="sk" style="width:56px;height:22px;border-radius:999px"></span>' +
      '</div>';
    }
    return '<div class="skel">' + rows + '</div>';
  }
  function emptyHTML() {
    return '<div class="state">' +
      '<span class="state__ico">' + icon('file', '48') + '</span>' +
      '<div class="state__t">暂无相关请假记录</div>' +
      '<div class="state__d">当前筛选条件下没有匹配的记录</div>' +
      '<button class="btn btn--ghost" data-act="filter" data-filter="ALL"><span class="btn__label">查看全部</span></button>' +
    '</div>';
  }
  function errorHTML() {
    return '<div class="state">' +
      '<span class="state__ico">' + icon('alert', '48') + '</span>' +
      '<div class="state__t">记录加载失败</div>' +
      '<div class="state__d">请检查网络后重试</div>' +
      '<button class="btn btn--ghost" data-act="retry"><span class="btn__label">重新加载</span></button>' +
    '</div>';
  }
  function renderList() {
    var el = document.getElementById('list');
    if (state.loading) { el.innerHTML = skelHTML(); return; }
    if (state.error) { el.innerHTML = errorHTML(); return; }
    var list = filtered();
    if (!list.length) { el.innerHTML = emptyHTML(); return; }
    el.innerHTML = '<div class="listbox stagger">' + list.map(rowHTML).join('') + '</div>';
  }

  /* ---------- 渲染：底部 sheet ---------- */
  function tlHTML(nodes) {
    return nodes.map(function (n) {
      var cls = n.s === 'skip' ? 'is-skip' : n.s === 'fail' ? 'is-fail' : n.s === 'cur' ? 'is-cur' : '';
      return '<li class="tl__i ' + cls + '"><span class="tl__n"></span>' +
        '<div class="tl__t">' + esc(n.t) + '</div><div class="tl__d">' + esc(n.d) + '</div></li>';
    }).join('');
  }
  function timelineNodes(r) {
    var n = [{ t: '提交申请', d: r.submittedAt || '—', s: 'done' }];
    if (r.status === 'PENDING') {
      n.push({ t: '辅导员审批', d: '等待辅导员处理', s: 'cur' });
      return n;
    }
    if (r.status === 'REJECTED') {
      n.push({ t: '辅导员审批', d: spanText2(r.approvedAt) + ' · 未通过', s: 'fail' });
      return n;
    }
    if (r.status === 'WITHDRAWN' || r.status === 'CANCELLED') {
      n.push({ t: '辅导员审批', d: '申请已关闭', s: 'skip' });
      return n;
    }
    n.push({ t: '审批通过', d: spanText2(r.approvedAt) + (r.approver ? ' · ' + r.approver : ''), s: 'done' });
    if (r.status === 'COMPLETED') {
      n.push({ t: '请假开始', d: startLabel(r), s: 'done' });
      n.push({ t: '销假完成', d: spanText2(r.completedAt || r.endAt), s: 'done' });
    } else if (r.effective === 'WAITING_START') {
      n.push({ t: '请假开始', d: startLabel(r), s: 'skip' });
      n.push({ t: '待销假', d: '结束前完成销假或申请续假', s: 'skip' });
    } else {
      n.push({ t: '请假开始', d: startLabel(r), s: 'done' });
      n.push({ t: '待销假', d: '截止 ' + endLabel(r), s: 'cur' });
    }
    return n;
  }
  function spanText2(s) {
    if (!s) return '—';
    var d = parseTs(s);
    return dayLabel(d, state.now) + ' ' + fmtHM(d);
  }
  function startLabel(r) { return dayLabel(parseTs(r.startAt), state.now) + ' ' + fmtHM(parseTs(r.startAt)); }
  function endLabel(r) { return dayLabel(parseTs(r.endAt), state.now) + ' ' + fmtHM(parseTs(r.endAt)); }
  function dlRow(k, v, mono) {
    return '<div class="dl__row"><span class="dl__k">' + esc(k) + '</span>' +
      '<span class="dl__v' + (mono ? ' is-mono' : '') + '">' + esc(v) + '</span></div>';
  }

  function detailSheetHTML() {
    var r = findRec(state.sheetNo) || currentRec(state.scene);
    if (!r) return '';
    var c = chipOf(r);
    var isOff = r.scene === 'OFF';
    var ctaText = isOff ? '返校定位销假' : '确认结束';
    var ctaAct = isOff ? 'cta-locate' : 'cta-finish';
    return '<div class="sheet__grab"></div>' +
      '<div class="sheet__head"><span class="sheet__title">请假详情</span>' +
        '<button class="sheet__close" data-act="sheet-close" aria-label="关闭">' + icon('close', '20') + '</button></div>' +
      '<div class="sheet__body">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="chip-st chip-st--' + c.tone + '">' + esc(c.text) + '</span>' +
          '<span style="font-family:var(--mono);font-size:13px;color:var(--sub)">' + esc(r.no) + '</span>' +
        '</div>' +
        '<ol class="tl">' + tlHTML(timelineNodes(r)) + '</ol>' +
        '<div class="dl">' +
          dlRow('时段', spanText(r), true) +
          dlRow('场景', M.sceneText[r.scene] + ' · ' + r.place) +
          dlRow('事由', r.reason) +
          (r.rejectReason ? dlRow('驳回原因', r.rejectReason) : '') +
          dlRow('审批', (r.approver || '—') + (r.approvedAt ? ' · ' + r.approvedAt : '')) +
        '</div>' +
        '<button class="btn btn--primary btn--block" data-act="' + ctaAct + '" data-no="' + esc(r.no) + '"><span class="btn__label">' + ctaText + '</span></button>' +
        '<button class="btn btn--ghost btn--block" data-act="cta-extend" data-no="' + esc(r.no) + '"><span class="btn__label">申请续假</span></button>' +
      '</div>';
  }

  function locateSheetHTML() {
    var r = findRec(state.sheetNo) || currentRec(state.scene);
    var locating = state.locatePhase !== 'done';
    var res = state.locateRes;
    var coreCls = locating ? '' : (res && res.ok ? ' radar__core--done' : ' radar__core--bad');
    var coreIcon = locating ? 'crosshair' : (res && res.ok ? 'check' : 'warn');

    var seg = '<div class="seg" style="margin:6px auto 0" role="tablist" aria-label="模拟定位结果">' +
      '<button class="seg__btn' + (state.locateResult === 'pass' ? ' is-on' : '') + '" data-act="loc-seg" data-loc="pass" aria-selected="' + (state.locateResult === 'pass') + '">通过</button>' +
      '<button class="seg__btn' + (state.locateResult === 'out' ? ' is-on' : '') + '" data-act="loc-seg" data-loc="out" aria-selected="' + (state.locateResult === 'out') + '">超范围</button>' +
    '</div>';

    var body = '';
    if (locating) {
      body =
        '<div class="loc-title">正在获取位置…</div>' +
        '<div class="loc-desc">请保持页面打开，约需 2 秒</div>';
    } else if (res && res.ok) {
      body =
        '<div class="loc-title">' + esc(res.title) + '</div>' +
        '<div class="loc-desc">' + esc(res.desc) + '</div>' +
        '<div class="dl loc-facts">' +
          dlRow('校验时间', fmtDateTime(state.now), true) +
          dlRow('与校门距离', res.distanceText, true) +
          dlRow('校验结果', res.resultText) +
        '</div>' +
        '<div class="loc-cta">' +
          '<button class="btn btn--primary btn--block" data-act="loc-confirm" data-no="' + esc(r ? r.no : '') + '"><span class="btn__label">确认销假</span></button>' +
        '</div>';
    } else {
      body =
        '<div class="loc-title loc-title--bad">' + esc(res ? res.title : '定位失败') + '</div>' +
        '<div class="loc-desc">' + esc(res ? res.desc : '请稍后重试') + '</div>' +
        '<div class="dl loc-facts">' +
          dlRow('校验时间', fmtDateTime(state.now), true) +
          dlRow('与校门距离', res ? res.distanceText : '—', true) +
          dlRow('校验结果', res ? res.resultText : '定位失败') +
        '</div>' +
        '<div class="loc-cta">' +
          '<button class="btn btn--primary btn--block" data-act="loc-relocate"><span class="btn__label">重新定位</span></button>' +
          '<button class="btn btn--ghost btn--block" data-act="loc-verify"><span class="btn__label">申请人工核验</span></button>' +
        '</div>';
    }

    return '<div class="sheet__grab"></div>' +
      '<div class="sheet__head"><span class="sheet__title">返校定位销假</span>' +
        '<button class="sheet__close" data-act="sheet-close" aria-label="关闭">' + icon('close', '20') + '</button></div>' +
      '<div class="sheet__body">' + seg +
        '<div class="radar' + (locating ? '' : ' radar--still') + '">' +
          '<span class="radar__ring"></span><span class="radar__ring"></span>' +
          '<span class="radar__ring"></span>' +
          '<span class="radar__core' + coreCls + '">' + icon(coreIcon, '24') + '</span>' +
        '</div>' +
        body +
      '</div>';
  }

  function extendSheetHTML() {
    var r = findRec(state.sheetNo) || currentRec(state.scene);
    if (!r) return '';
    var f = state.extend;
    var minMom = addMin(parseTs(r.endAt), 10);
    return '<div class="sheet__grab"></div>' +
      '<div class="sheet__head"><span class="sheet__title">申请续假</span>' +
        '<button class="sheet__close" data-act="sheet-close" aria-label="关闭">' + icon('close', '20') + '</button></div>' +
      '<div class="sheet__body">' +
        '<div class="dl"><div class="dl__row"><span class="dl__k">当前结束</span>' +
          '<span class="dl__v is-mono">' + esc(spanText(r)) + '</span></div>' +
          '<div class="dl__row"><span class="dl__k">申请事由</span>' +
          '<span class="dl__v">' + esc(r.reason) + '</span></div></div>' +
        '<div class="field"><div class="field__label">新的结束时间<span class="req">*</span></div>' +
          '<input class="input' + (f.errors.endAt ? ' is-error' : '') + '" type="datetime-local" data-input="endAt" ' +
          'min="' + fmtInput(minMom) + '" value="' + esc(f.endAt) + '" aria-label="新的结束时间">' +
          '<div class="field__err">' + esc(f.errors.endAt || '') + '</div></div>' +
        '<div class="field"><div class="field__label">续假事由<span class="req">*</span></div>' +
          '<textarea class="ta' + (f.errors.reason ? ' is-error' : '') + '" data-input="reason" maxlength="200" ' +
          'placeholder="说明需要延长的原因" aria-label="续假事由">' + esc(f.reason) + '</textarea>' +
          '<div class="field__err">' + esc(f.errors.reason || '') + '</div></div>' +
        '<button class="btn btn--primary btn--block" data-act="ext-submit"><span class="btn__label">提交续假申请</span></button>' +
      '</div>';
  }

  function renderSheet() {
    var sheet = document.getElementById('sheet');
    if (!state.sheet) { sheet.innerHTML = ''; return; }
    if (state.sheet === 'detail') sheet.innerHTML = detailSheetHTML();
    else if (state.sheet === 'locate') sheet.innerHTML = locateSheetHTML();
    else if (state.sheet === 'extend') sheet.innerHTML = extendSheetHTML();
  }

  /* ---------- 浮层控制 ---------- */
  function openSheet(kind, no) {
    state.sheet = kind;
    state.sheetNo = no || null;
    renderSheet();
    var sheet = document.getElementById('sheet');
    var scrim = document.getElementById('sheetScrim');
    scrim.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(function () { scrim.classList.add('open'); sheet.classList.add('open'); });
    if (kind === 'locate') startLocate();
  }
  function closeSheet() {
    if (!state.sheet) return;
    var sheet = document.getElementById('sheet');
    var scrim = document.getElementById('sheetScrim');
    scrim.classList.remove('open');
    sheet.classList.remove('open');
    state.sheet = null;
    state.sheetNo = null;
    if (locateTimer) { clearTimeout(locateTimer); locateTimer = null; }
    setTimeout(function () {
      if (!state.sheet) { sheet.hidden = true; scrim.hidden = true; }
    }, 320);
  }

  /* ---------- 定位流程（调用 api stub） ---------- */
  function startLocate() {
    state.locatePhase = 'locating';
    state.locateRes = null;
    renderSheet();
    if (locateTimer) clearTimeout(locateTimer);
    locateTimer = setTimeout(function () {
      Api.locate({ applicationNo: state.sheetNo, result: state.locateResult }).then(function (res) {
        if (state.sheet !== 'locate') return;
        state.locatePhase = 'done';
        state.locateRes = res;
        renderSheet();
      }).catch(function (err) {
        if (state.sheet !== 'locate') return;
        state.locatePhase = 'done';
        state.locateRes = { ok: false, title: '定位失败', desc: err.message, distanceText: '—', resultText: '定位失败' };
        renderSheet();
      });
    }, 40);
  }

  /* ---------- 续假提交流程（调用 api stub） ---------- */
  function setBtnLoading(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-loading', on);
    if (on) {
      btn.disabled = true;
      if (!btn.querySelector('.spinner')) btn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
    } else {
      btn.disabled = false;
      var sp = btn.querySelector('.spinner');
      if (sp) sp.remove();
    }
  }
  function submitExtend(btn) {
    if (state.submitting) return;
    var r = findRec(state.sheetNo) || currentRec(state.scene);
    if (!r) return;
    var f = state.extend;
    var errs = {};
    if (!f.endAt) errs.endAt = '请选择新的结束时间';
    else {
      var d = parseTs(f.endAt);
      if (isNaN(d.getTime())) errs.endAt = '结束时间格式不正确';
      else if (d.getTime() <= parseTs(r.endAt).getTime()) errs.endAt = '新结束时间需晚于当前结束时间';
    }
    if (!f.reason.trim()) errs.reason = '请填写续假事由';
    f.errors = errs;
    if (Object.keys(errs).length) { renderSheet(); return; }

    state.submitting = true;
    setBtnLoading(btn, true);
    Api.submitExtension({
      applicationNo: r.no,
      scene: r.scene,
      type: r.type,
      startAt: r.startAt,
      newEnd: f.endAt.replace('T', ' '),
      reason: f.reason.trim(),
      scenePlace: r.scenePlace,
      place: r.place,
      submittedAt: fmtDateTime(state.now),
      seq: state.records.length + 1
    }).then(function (rec) {
      state.records.push(rec);
      state.submitting = false;
      toast('续假申请已提交，等待辅导员审批', 'success');
      closeSheet();
      renderCard();
      renderFilter();
      renderList();
    }).catch(function (err) {
      state.submitting = false;
      setBtnLoading(btn, false);
      toast(err.message || '提交失败，请重试');
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    var host = document.getElementById('toastHost');
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = (kind === 'success' ? '<span class="toast__ico">' + icon('checkCircle', '16') + '</span>' : '') +
      '<span>' + esc(msg) + '</span>';
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 260);
    }, 2200);
  }

  /* ---------- 倒计时 ---------- */
  function tick() {
    state.now = new Date(state.now.getTime() + 1000);
    var st = document.getElementById('statusTime');
    if (st) st.textContent = fmtHM(state.now);
    var text = cdText();
    if (text === null) return;
    var changed = {};
    for (var i = 0; i < text.length; i++) {
      if (!prevCd || prevCd.charAt(i) !== text.charAt(i)) changed[i] = true;
    }
    prevCd = text;
    var el = document.getElementById('cd');
    if (el) el.innerHTML = cdHTML(text, changed);
  }
  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, 1000);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (locateTimer) { clearTimeout(locateTimer); locateTimer = null; }
  }

  /* ---------- 数据加载（调用 api stub） ---------- */
  function loadOverview() {
    state.loading = true;
    state.error = false;
    renderCard();
    renderList();
    Api.getOverview().then(function (res) {
      state.records = res.records;
      state.loading = false;
      state.error = false;
      renderCard();
      renderFilter();
      renderList();
      prevCd = cdText();
      startTick();
    }).catch(function () {
      state.loading = false;
      state.error = true;
      renderList();
    });
  }
  function loadRecords() {
    state.loading = true;
    state.error = false;
    renderList();
    Api.getRecords({ filter: state.filter }).then(function (res) {
      state.records = res.list;
      state.loading = false;
      state.error = false;
      renderCard();
      renderList();
      prevCd = cdText();
      if (!tickTimer) startTick();
    }).catch(function () {
      state.loading = false;
      state.error = true;
      renderList();
    });
  }

  /* ---------- 事件委托 ---------- */
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var rec = currentRec(state.scene);

    switch (act) {
      case 'seg':
        state.scene = el.dataset.scene;
        renderCard();
        break;

      case 'filter':
        state.filter = el.dataset.filter;
        renderFilter();
        renderList();
        break;

      case 'retry':
        loadRecords();
        break;

      case 'open-detail':
        openSheet('detail', el.dataset.no || (rec && rec.no));
        break;

      case 'cta-locate':
        openSheet('locate', el.dataset.no || (rec && rec.no));
        break;

      case 'cta-finish':
        finishLeave(el.dataset.no || (rec && rec.no));
        break;

      case 'cta-extend':
        openExtend(el.dataset.no || (rec && rec.no));
        break;

      case 'loc-seg':
        state.locateResult = el.dataset.loc;
        startLocate();
        break;

      case 'loc-relocate':
        startLocate();
        break;

      case 'loc-verify':
        toast('核验申请已提交，等待辅导员处理', 'success');
        closeSheet();
        break;

      case 'loc-confirm':
        finishLeave(el.dataset.no || (rec && rec.no));
        break;

      case 'ext-submit':
        submitExtend(el);
        break;

      case 'sheet-close':
        closeSheet();
        break;

      case 'tab':
        onTab(el.dataset.tab);
        break;
    }
  }

  function onTab(key) {
    var screen = document.getElementById('screen');
    if (key === 'home') {
      screen.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (key === 'records') {
      state.filter = 'ALL';
      renderFilter();
      renderList();
      document.getElementById('filter').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (key === 'messages') {
      toast('「消息」模块在 Demo A 未展开');
    } else {
      toast('「我的」模块在 Demo A 未展开');
    }
  }

  function openExtend(no) {
    var r = findRec(no) || currentRec(state.scene);
    if (!r) return;
    var d = addMin(parseTs(r.endAt), 180);
    state.extend = { endAt: fmtInput(d), reason: '', errors: {} };
    openSheet('extend', no);
  }

  function finishLeave(no) {
    var r = findRec(no) || currentRec(state.scene);
    if (!r) return;
    r.status = 'COMPLETED';
    r.effective = '';
    r.completedAt = fmtDateTime(state.now);
    toast('已销假，记录已归档', 'success');
    closeSheet();
    renderCard();
    renderList();
  }

  function onSubmitKey(e) {
    if (e.key === 'Escape' && state.sheet) closeSheet();
  }
  function onInput(e) {
    var el = e.target;
    if (!el || !el.dataset || !el.dataset.input) return;
    if (el.dataset.input === 'endAt') { state.extend.endAt = el.value; state.extend.errors.endAt = ''; }
    else if (el.dataset.input === 'reason') { state.extend.reason = el.value; state.extend.errors.reason = ''; }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    /* 先开启载入揭示，保证即使后续渲染异常也不会留白屏 */
    document.getElementById('phone').classList.add('booted');

    state.now = parseTs(M.env.baseTime);
    document.getElementById('statusTime').textContent = fmtHM(state.now);

    renderPagehead();
    renderHero();
    renderFilter();
    renderTabbar();
    renderCard();   /* loading 骨架 */
    renderList();   /* loading 骨架 */

    document.getElementById('sheetScrim').addEventListener('click', closeSheet);

    loadOverview();

    window.addEventListener('beforeunload', stopTick);
    window.addEventListener('pagehide', stopTick);
  }

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onSubmitKey);
  document.addEventListener('input', onInput);

  boot();
})();

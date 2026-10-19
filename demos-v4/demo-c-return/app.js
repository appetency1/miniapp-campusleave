// app.js —— 单一 state + render + 事件绑定。视图数据全部来自 mock.js，经 api.js 提交。
(function () {
  'use strict';

  var M = window.MOCK;
  var Api = window.Api;

  /* ---------- Lucide 内联 SVG（stroke 1.8 / currentColor） ---------- */
  var ICONS = {
    'signal': '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
    'wifi': '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    'battery': '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/><line x1="6" x2="6" y1="11" y2="13"/><line x1="10" x2="10" y1="11" y2="13"/><line x1="14" x2="14" y1="11" y2="13"/>',
    'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'navigation': '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'log-in': '<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    'log-out': '<path d="m16 17-5-5 5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };

  function icon(name, size) {
    var inner = ICONS[name] || '';
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true">' + inner + '</svg>';
  }

  function hydrateIcons(root) {
    var nodes = (root || document).querySelectorAll('[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var size = parseInt(n.getAttribute('data-size') || '20', 10);
      n.innerHTML = icon(n.getAttribute('data-icon'), size);
    }
  }

  /* ---------- 单一 state ---------- */
  var state = {
    step: 'return',        // return | locate | done
    locateResult: 'pass',  // pass | fail
    sheet: false,
    countdown: M.countdown.seconds,
    submitting: false
  };

  var el = {};
  var IDS = ['sb-time', 'trip-from', 'trip-to', 'pass-name', 'pass-sid', 'pass-status-label',
    'countdown', 'g-type', 'g-scene', 'g-period', 'g-counselor', 'pass-code',
    'screen-return', 'screen-locate', 'screen-done', 'seg', 'locate-status', 'locate-step2',
    'locate-step1-text', 'locate-step2-text',
    'radar', 'result-card', 'result-icon', 'locate-distance', 'locate-unit', 'locate-note',
    'locate-chip', 'btn-recheck', 'btn-verify', 'btn-home', 'sheet-scrim', 'sheet', 'sheet-input',
    'sheet-submit', 'sheet-close', 'timeline', 'stamp', 'done-end', 'btn-home2', 'btn-locate',
    'btn-renew', 'toast'];

  function cacheDom() {
    for (var i = 0; i < IDS.length; i++) {
      el[IDS[i]] = document.getElementById(IDS[i]);
    }
  }

  /* ---------- 工具 ---------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtClock(sec) {
    if (sec < 0) sec = 0;
    return pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor((sec % 3600) / 60)) + ':' + pad2(sec % 60);
  }

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function countUp(node, from, to, decimals, dur) {
    if (!node) return;
    if (reduced()) { node.textContent = to.toFixed(decimals); return; }
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = (from + (to - from) * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var toastTimer = null;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-on');
      setTimeout(function () { el.toast.hidden = true; }, 240);
    }, 2200);
  }

  function setActions(keys) {
    [['recheck', el['btn-recheck']], ['verify', el['btn-verify']], ['home', el['btn-home']]]
      .forEach(function (pair) {
        if (pair[1]) pair[1].hidden = keys.indexOf(pair[0]) === -1;
      });
  }

  /* ---------- 渲染：静态数据 ---------- */
  function renderData() {
    el['sb-time'].textContent = M.meta.now.time;
    el['trip-from'].textContent = M.trip.from;
    el['trip-to'].textContent = M.trip.to;

    el['pass-name'].textContent = M.user.name;
    el['pass-sid'].textContent = M.user.studentId;
    el['pass-status-label'].textContent = M.leave.status.label;
    el['countdown'].textContent = fmtClock(state.countdown);

    el['g-type'].textContent = M.leave.type;
    el['g-scene'].textContent = M.leave.scene;
    el['g-period'].textContent = M.leave.period;
    el['g-counselor'].textContent = M.user.counselor;
    el['pass-code'].textContent = M.leave.id;

    el['done-end'].textContent = M.api.confirmReturnCheckin.actualEnd;
    el['locate-distance'].textContent = M.locate[state.locateResult].distance.toFixed(M.locate[state.locateResult].decimals);
    el['locate-step1-text'].textContent = M.locate.steps[0];
    el['locate-step2-text'].textContent = M.locate.steps[1];

    renderTimeline();
  }

  function renderTimeline() {
    var html = '';
    for (var i = 0; i < M.timeline.length; i++) {
      var e = M.timeline[i];
      var last = (i === M.timeline.length - 1) ? ' is-last' : '';
      html += '<div class="tl-item' + last + '" style="--i:' + i + '">' +
        '<div class="tl__dot">' + icon(e.icon, 14) + '</div>' +
        '<div class="tl__body">' +
        '<div class="tl__time">' + e.time + '</div>' +
        '<div class="tl__title">' + e.title + '</div>' +
        '<div class="tl__meta">' + e.meta + '</div>' +
        '</div></div>';
    }
    el['timeline'].innerHTML = html;
  }

  /* ---------- 步骤机 ---------- */
  function showStep(name) {
    state.step = name;
    ['return', 'locate', 'done'].forEach(function (k) {
      var scr = el['screen-' + k];
      if (scr) scr.classList.toggle('is-active', k === name);
    });

    if (name === 'return') startCountdown();
    else stopCountdown();

    if (name === 'locate') beginLocate();

    if (name === 'done') {
      el['stamp'].classList.remove('is-on');
      void el['stamp'].offsetWidth;
      el['stamp'].classList.add('is-on');

      el['timeline'].classList.remove('is-revealed');
      void el['timeline'].offsetWidth;
      el['timeline'].classList.add('is-revealed');
    }
  }

  /* ---------- 倒计时 ---------- */
  var ticker = null;
  function startCountdown() {
    stopCountdown();
    state.countdown = M.countdown.seconds;
    el['countdown'].textContent = fmtClock(state.countdown);
    ticker = setInterval(function () {
      state.countdown = Math.max(0, state.countdown - 1);
      el['countdown'].textContent = fmtClock(state.countdown);
    }, 1000);
  }
  function stopCountdown() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  /* ---------- 定位流程 ---------- */
  var locateTimers = [];
  function clearLocateTimers() {
    locateTimers.forEach(clearTimeout);
    locateTimers = [];
  }

  function beginLocate() {
    clearLocateTimers();

    el['result-card'].classList.remove('is-shown');
    el['result-card'].setAttribute('data-state', state.locateResult);
    el['locate-status'].textContent = M.locate.loadingText;
    el['locate-step2'].classList.remove('is-on');
    el['locate-step2'].style.display = '';
    el['radar'].classList.add('is-spinning');
    el['locate-distance'].textContent = '0';
    el['locate-unit'].textContent = '';
    el['locate-note'].textContent = '';
    el['locate-chip'].hidden = true;
    setActions([]);

    locateTimers.push(setTimeout(function () {
      el['locate-step2'].classList.add('is-on');
    }, 900));

    locateTimers.push(setTimeout(function () {
      el['radar'].classList.remove('is-spinning');
      showResult(state.locateResult);
    }, 2000));
  }

  function showResult(kind) {
    var d = M.locate[kind];
    var card = el['result-card'];

    card.setAttribute('data-state', kind);
    el['result-icon'].innerHTML = icon(kind === 'pass' ? 'check' : 'x', 26);
    el['locate-unit'].textContent = d.unit;
    el['locate-note'].textContent = d.display;
    el['locate-status'].textContent = d.status;
    /* 结果出来后收起「正在校验距离…」步骤行，避免与结果态矛盾 */
    el['locate-step2'].style.display = 'none';
    setActions(kind === 'pass' ? [] : ['recheck', 'verify']);
    card.classList.add('is-shown');

    countUp(el['locate-distance'], 0, d.distance, d.decimals, 900);

    if (kind === 'pass') {
      locateTimers.push(setTimeout(confirmCheckin, 1400));
    }
  }

  function confirmCheckin() {
    Api.confirmReturnCheckin({
      id: M.leave.id,
      distanceMeters: M.locate.pass.distance,
      at: M.meta.now.date + ' ' + M.meta.now.time
    }).then(function (res) {
      el['done-end'].textContent = res.data.actualEnd;
      showStep('done');
    }).catch(function (err) {
      toast((err && err.message) || '销假提交失败，请重试');
    });
  }

  /* ---------- sheet / 人工核验 ---------- */
  function openSheet() {
    state.sheet = true;
    el['sheet-scrim'].hidden = false;
    void el['sheet-scrim'].offsetWidth;
    el['sheet-scrim'].classList.add('is-open');
    el['sheet'].classList.add('is-open');
    el['sheet-input'].focus();
  }

  function closeSheet() {
    state.sheet = false;
    el['sheet'].classList.remove('is-open');
    el['sheet-scrim'].classList.remove('is-open');
    setTimeout(function () { el['sheet-scrim'].hidden = true; }, 280);
  }

  function submitVerify() {
    if (state.submitting) return;
    var reason = el['sheet-input'].value.trim();
    if (!reason) { toast('请简要填写申请事由'); return; }

    state.submitting = true;
    el['sheet-submit'].classList.add('is-loading');
    el['sheet-submit'].disabled = true;

    Api.submitManualVerify({ id: M.leave.id, reason: reason }).then(function (res) {
      state.submitting = false;
      el['sheet-submit'].classList.remove('is-loading');
      el['sheet-submit'].disabled = false;
      el['sheet-input'].value = '';
      closeSheet();
      renderPendingReview(res.data);
      toast(res.data.message);
    }).catch(function (err) {
      state.submitting = false;
      el['sheet-submit'].classList.remove('is-loading');
      el['sheet-submit'].disabled = false;
      toast((err && err.message) || '提交失败，请重试');
    });
  }

  function renderPendingReview(data) {
    var card = el['result-card'];
    card.setAttribute('data-state', 'pending');
    card.classList.add('is-shown');
    el['result-icon'].innerHTML = icon('clock', 26);
    el['locate-distance'].textContent = '';
    el['locate-unit'].textContent = '';
    el['locate-note'].textContent = M.review.note;
    el['locate-chip'].hidden = false;
    el['locate-chip'].textContent = data.reviewStatus || M.review.reviewStatus;
    el['locate-status'].textContent = M.review.pendingLabel;
    setActions(['home']);
  }

  function goHome() {
    closeSheet();
    clearLocateTimers();
    showStep('return');
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    // Step 1 · 返校定位销假
    el['btn-locate'].addEventListener('click', function () {
      if (state.submitting) return;
      state.submitting = true;
      el['btn-locate'].classList.add('is-loading');
      Api.requestReturnCheckin({ id: M.leave.id, at: M.meta.now.date + ' ' + M.meta.now.time })
        .then(function () {
          state.submitting = false;
          el['btn-locate'].classList.remove('is-loading');
          showStep('locate');
        })
        .catch(function (err) {
          state.submitting = false;
          el['btn-locate'].classList.remove('is-loading');
          toast((err && err.message) || '请求失败，请重试');
        });
    });

    // Step 1 · 申请续假
    el['btn-renew'].addEventListener('click', function () {
      Api.applyRenewal({ id: M.leave.id }).then(function (res) {
        toast(res.data.message);
      }).catch(function (err) {
        toast((err && err.message) || '续假申请失败，请重试');
      });
    });

    // Step 2 · 模拟两态
    el['seg'].addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.seg__btn') : null;
      if (!btn) return;
      state.locateResult = btn.getAttribute('data-value');
      var all = el['seg'].querySelectorAll('.seg__btn');
      for (var i = 0; i < all.length; i++) {
        all[i].classList.toggle('is-active', all[i] === btn);
      }
      if (state.step === 'locate') beginLocate();
    });

    el['btn-recheck'].addEventListener('click', beginLocate);
    el['btn-verify'].addEventListener('click', openSheet);
    el['btn-home'].addEventListener('click', goHome);
    el['btn-home2'].addEventListener('click', goHome);

    el['sheet-close'].addEventListener('click', closeSheet);
    el['sheet-scrim'].addEventListener('click', closeSheet);
    el['sheet-submit'].addEventListener('click', submitVerify);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.sheet) closeSheet();
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    hydrateIcons(document);
    cacheDom();
    renderData();
    bindEvents();
    showStep('return');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

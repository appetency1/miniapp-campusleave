/* ============================================================
   pending.js —— 待审批（主从）：请假 / 续假两个 tab
   左列表固定 448，右详情复用 detail.js
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  function groupByDay(items, keyFn) {
    var groups = [];
    var map = {};
    items.forEach(function (it) {
      var t = ui.parse(keyFn(it));
      var label = ui.dayWord(t);
      if (!map[label]) {
        map[label] = { label: label, items: [] };
        groups.push(map[label]);
      }
      map[label].items.push(it);
    });
    return groups;
  }

  ADMIN.pages.pending = function (page, ctx) {
    var isExt = ctx.path === '/pending/ext';
    var tab = isExt ? 'ext' : 'leave';
    var paramId = ctx.params && ctx.params.id;

    page.className = 'page';
    ADMIN.shell.crumbs([]);

    /* ---------- 数据 ---------- */
    var leaveItems = ADMIN.store.pending();
    var extItems = ADMIN.store.extensions();
    var counts = { leave: leaveItems.length, ext: extItems.length };

    var local = {
      list: (tab === 'ext' ? extItems : leaveItems).slice(),
      shown: null,
      receipt: null,
      sel: null
    };
    local.shown = local.list[0] || null;

    if (paramId && tab === 'leave') {
      var found = null;
      for (var i = 0; i < local.list.length; i++) {
        if (String(local.list[i].id) === String(paramId)) { found = local.list[i]; break; }
      }
      if (found) local.shown = found;
      else {
        var app = ADMIN.store.appById(paramId);
        if (app) local.shown = app;
      }
    }
    local.sel = local.shown ? keyOf(local.shown) : null;

    function keyOf(item) {
      return tab === 'ext' ? 'ext' + item.id : String(item.id);
    }

    /* ---------- 页头 ---------- */
    var tabLeaveCount = el('span', { class: 'c', text: String(counts.leave) });
    var tabExtCount = el('span', { class: 'c', text: String(counts.ext) });

    var tabs = el('div', { class: 'tabs' }, [
      el('button', { class: 'tab' + (tab === 'leave' ? ' is-on' : ''), attrs: { type: 'button' }, onClick: function () { ADMIN.router.go('/pending'); } }, [
        el('span', { text: '请假' }), tabLeaveCount
      ]),
      el('button', { class: 'tab' + (tab === 'ext' ? ' is-on' : ''), attrs: { type: 'button' }, onClick: function () { ADMIN.router.go('/pending/ext'); } }, [
        el('span', { text: '续假' }), tabExtCount
      ])
    ]);

    page.appendChild(ui.pageHead({
      title: '待审批',
      right: [tabs, el('div', { class: 'head-note', text: '按提交时间升序' })]
    }));

    /* ---------- 主从容器 ---------- */
    var listEl = el('div', { class: 'md-list' });
    var detailEl = el('div', { class: 'md-detail' });
    page.appendChild(el('div', { class: 'md' }, [listEl, detailEl]));

    /* ---------- 左列表 ---------- */
    function renderList() {
      listEl.innerHTML = '';

      if (!local.list.length) {
        listEl.appendChild(ui.empty({
          title: tab === 'ext'
            ? '没有待处理的续假申请。'
            : '负责班级没有待审批，最早一条明天 08:00 开始。',
          note: tab === 'ext'
            ? '续假申请会随主申请一起出现在这里，按提交时间排序。'
            : '新申请会出现在这里，并按提交时间排序。'
        }));
        return;
      }

      groupByDay(local.list, function (it) { return it.submittedAt; }).forEach(function (g) {
        listEl.appendChild(el('div', { class: 'lgroup-head' }, [
          el('span', { text: g.label }),
          el('span', { class: 'lg-count', text: '· ' + g.items.length + ' 条' })
        ]));

        g.items.forEach(function (item) {
          var key = keyOf(item);
          var wait = el('span', {
            class: 'li-wait ' + ui.waitTone(item.submittedAt),
            text: ui.waitLabel(item.submittedAt)
          });

          var row2;
          if (tab === 'ext') {
            row2 = el('div', { class: 'li-time' }, [
              el('span', { text: '原结束 ' + ui.hm(ui.parse(item.originEnd)) }),
              el('span', { text: ' → ' }),
              el('span', { text: '延至 ' + ui.dayWord(ui.parse(item.requestedEnd)) + ' ' + ui.hm(ui.parse(item.requestedEnd)) })
            ]);
          } else {
            row2 = el('div', { class: 'li-time', text: ui.timeRange(item.start, item.end) });
          }

          var btn = el('button', {
            class: 'li' + (local.sel === key ? ' is-on' : ''),
            attrs: { type: 'button', 'data-key': key },
            onClick: function () {
              local.sel = key;
              local.shown = item;
              local.receipt = null;
              renderList();
              renderDetail();
            }
          }, [
            el('div', { class: 'li-row' }, [
              el('span', { class: 'li-name', text: item.studentName }),
              el('span', { class: 'li-kind', text: item.scene + ' · ' + item.type }),
              wait
            ]),
            row2
          ]);
          listEl.appendChild(btn);
        });
      });
    }

    /* ---------- 右详情 ---------- */
    function renderDetail() {
      detailEl.innerHTML = '';
      if (!local.shown) {
        detailEl.appendChild(ui.empty({
          title: '左侧没有待处理的申请。',
          note: '选中任意一条即可查看详情并审批。'
        }));
        return;
      }
      if (tab === 'ext') {
        detailEl.appendChild(extDetail(local.shown));
      } else {
        detailEl.appendChild(ADMIN.detail.render(local.shown, {
          type: 'pending',
          pad: true,
          receipt: local.receipt,
          onApprove: approve,
          onReject: reject
        }));
      }
    }

    /* ---------- 审批动作 ---------- */
    function advance(decidedKey) {
      var idx = -1;
      for (var i = 0; i < local.list.length; i++) {
        if (keyOf(local.list[i]) === decidedKey) { idx = i; break; }
      }
      if (idx !== -1) local.list.splice(idx, 1);

      var next = local.list[Math.min(idx === -1 ? 0 : idx, local.list.length - 1)];
      local.sel = next ? keyOf(next) : null;

      if (tab === 'ext') counts.ext = local.list.length;
      else counts.leave = local.list.length;
      tabLeaveCount.textContent = String(counts.leave);
      tabExtCount.textContent = String(counts.ext);
      ADMIN.shell.sync();
    }

    function approve(item) {
      if (tab === 'ext') {
        ADMIN.store.decideApp('ext' + item.id, 'approved');
        local.receipt = '已批准 · 刚刚 · 已通知学生';
      } else {
        ADMIN.store.decideApp(item.id, 'approved');
        local.receipt = '已批准 · 刚刚 · 已通知学生';
      }
      advance(keyOf(item));
      renderList();
      renderDetail();
    }

    function reject(item, reason) {
      if (tab === 'ext') ADMIN.store.decideApp('ext' + item.id, 'rejected');
      else ADMIN.store.decideApp(item.id, 'rejected');
      local.receipt = '已驳回 · 刚刚 · 已通知学生';
      local.reason = reason;
      advance(keyOf(item));
      renderList();
      renderDetail();
    }

    /* ---------- 续假详情 ---------- */
    function extDetail(ext) {
      var app = ADMIN.store.appById(ext.applicationId);
      var root = el('div', { class: 'detail fade-in detail--pad' });

      // 身份行
      root.appendChild(el('div', { class: 'li-row', style: { marginBottom: '14px' } }, [
        el('span', { class: 'li-name', text: ext.studentName }),
        el('span', { class: 'li-kind', text: ext.className + ' · ' + ext.scene + ' · ' + ext.type })
      ]));

      // 对比块
      var origin = ui.parse(ext.originEnd);
      var requested = ui.parse(ext.requestedEnd);
      var start = app ? ui.parse(app.start) : null;
      var origH = start ? Math.max(0, (origin - start) / 3600000) : 0;
      var extH = Math.max(0, (requested - origin) / 3600000);
      var total = origH + extH || 1;

      var cmp = el('div', { class: 'cmp' }, [
        el('div', { class: 'cmp-row' }, [
          el('div', {}, [
            el('div', { class: 'cmp-lab', text: '原结束' }),
            el('div', { class: 'cmp-val', text: ui.hm(origin) })
          ]),
          el('span', { class: 'cmp-arrow', text: '→' }),
          el('div', {}, [
            el('div', { class: 'cmp-lab', text: '延长至' }),
            el('div', { class: 'cmp-val', text: ui.dayWord(requested) + ' ' + ui.hm(requested) })
          ])
        ]),
        el('div', { class: 'cmp-track' }, [
          el('span', { class: 'cmp-seg cmp-seg--orig', style: { width: (origH / total * 100) + '%' } }),
          el('span', { class: 'cmp-seg cmp-seg--ext', style: { width: (extH / total * 100) + '%' } }),
          el('span', { class: 'cmp-more', text: '+' + Math.round(extH) + 'h' })
        ]),
        el('div', { class: 'cmp-kv' }, [
          el('span', { text: '主申请' }),
          el('a', {
            href: '#/pending/' + ext.applicationId,
            text: app ? app.no : '—'
          }),
          el('span', { text: '·' }),
          el('span', { text: ext.scene + ' / ' + ext.type }),
          el('span', { text: '·' }),
          el('span', { text: app ? statusWord(app) : '—' }),
          el('span', { text: '→' })
        ])
      ]);
      root.appendChild(el('div', { class: 'sec' }, [cmp]));

      // 学生理由
      root.appendChild(el('div', { class: 'sec' }, [
        el('h2', { class: 'sec-title', text: '学生理由' }),
        ui.quote(ext.reason, ext.studentName + ' · ' + ui.fmtTime(ext.submittedAt, 'md') + ' ' + ui.hm(ui.parse(ext.submittedAt)) + ' 提交')
      ]));

      // 操作条
      var wrap = el('div', { class: 'action-wrap' });
      var slot = el('div');
      wrap.appendChild(slot);

      if (local.receipt) {
        wrap.appendChild(el('div', { class: 'receipt' }, [ui.icon('check'), el('span', { text: local.receipt })]));
      } else {
        var bar = el('div', { class: 'action-bar' }, [
          el('div', { class: 'action-note', text: '批准后主申请的结束时间即刻顺延，并通知学生' }),
          el('div', { class: 'action-btns' }, [
            el('button', {
              class: 'btn btn--secondary', attrs: { type: 'button' }, text: '驳回', onClick: openReject
            }),
            el('button', {
              class: 'btn btn--primary', attrs: { type: 'button' }, text: '批准',
              onClick: function () { approve(ext); }
            })
          ])
        ]);
        wrap.appendChild(bar);
      }

      var panel = null;
      function openReject() {
        if (panel) return;
        var p = ui.rejectPanel({
          onCancel: closeReject,
          onSubmit: function (reason) { closeReject(); reject(ext, reason); }
        });
        panel = p.node;
        slot.appendChild(panel);
        p.focus();
        document.addEventListener('keydown', onKey);
      }
      function closeReject() {
        if (!panel) return;
        panel.remove();
        panel = null;
        document.removeEventListener('keydown', onKey);
      }
      function onKey(e) { if (e.key === 'Escape') closeReject(); }

      root.appendChild(wrap);
      return root;
    }

    function statusWord(app) {
      var m = ui.statusOf(app);
      return m.label;
    }

    renderList();
    renderDetail();
  };
})();

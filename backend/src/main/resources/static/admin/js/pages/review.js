/* ============================================================
   review.js —— 异常核验（主从）
   判定标尺是本屏核心：0–2000m 线性轴，不画地图
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  var RADIUS_M = 100;   // 与后端 OFF_CAMPUS_CHECK_RADIUS_M 默认值一致
  var AXIS_MAX = 2000;  // 标尺量程上限，超出贴右端并标 ≫

  var CHECK_TYPE = { GPS: '定位申报', MANUAL_REVIEW: '人工申诉', ON_CAMPUS_CONFIRM: '校内确认' };

  /* ---------------- 判定标尺 ---------------- */
  function buildRuler(app) {
    var ruler = el('div', { class: 'ruler' });
    ruler.appendChild(el('div', { class: 'ruler-axis' }));

    // 0–半径：安全区底色
    ruler.appendChild(el('div', {
      class: 'ruler-safe',
      style: { width: (RADIUS_M / AXIS_MAX * 100) + '%' }
    }));

    // 刻度 0 / 500 / 1000 / 1500 / 2000
    [0, 500, 1000, 1500, 2000].forEach(function (m) {
      var pct = m / AXIS_MAX * 100;
      ruler.appendChild(el('div', { class: 'ruler-tick', style: { left: pct + '%' } }));
      ruler.appendChild(el('div', {
        class: 'ruler-lab' + (m === 0 ? ' ruler-lab--l' : m === AXIS_MAX ? ' ruler-lab--r' : ''),
        style: m === 0 ? { left: 0 } : m === AXIS_MAX ? { right: 0 } : { left: pct + '%' },
        text: String(m)
      }));
    });

    // 半径线 + 说明
    var radiusPct = RADIUS_M / AXIS_MAX * 100;
    ruler.appendChild(el('div', { class: 'ruler-radius', style: { left: radiusPct + '%' } }));
    ruler.appendChild(el('div', {
      class: 'ruler-radius-lab' + (radiusPct < 14 ? ' ruler-radius-lab--l' : ''),
      style: { left: radiusPct + '%' },
      text: '校区半径 ' + RADIUS_M + 'm'
    }));

    // 记录点：同距离合并
    var groups = [];
    (app.checkins || []).forEach(function (c) {
      var d = Math.round(c.distance || 0);
      var hit = null;
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].d === d) { hit = groups[i]; break; }
      }
      if (hit) hit.items.push(c);
      else groups.push({ d: d, items: [c] });
    });

    groups.forEach(function (g) {
      var over = g.d > AXIS_MAX;
      var pct = Math.min(g.d, AXIS_MAX) / AXIS_MAX * 100;
      var fail = g.items.some(function (c) { return c.result === 'FAILED'; });

      ruler.appendChild(el('div', {
        class: 'ruler-pt ' + (fail ? 'is-fail' : 'is-pass'),
        style: { left: pct + '%' }
      }));

      var align = pct < 8 ? ' ruler-pt-lab--l' : pct > 92 ? ' ruler-pt-lab--r' : '';
      ruler.appendChild(el('div', {
        class: 'ruler-pt-lab' + align,
        style: { left: pct + '%' },
        text: g.d + ' m' + (over ? ' ≫' : '')
      }));

      if (g.items.length > 1) {
        ruler.appendChild(el('div', {
          class: 'ruler-more',
          style: { left: pct + '%', bottom: '50px', transform: 'none', marginLeft: '8px' },
          text: g.items.length + ' 次'
        }));
      }
    });

    return ruler;
  }

  function verdictText(app) {
    var pending = (app.checkins || []).filter(function (c) { return c.review === 'PENDING_REVIEW'; });
    if (!pending.length) return null;
    var maxD = 0;
    pending.forEach(function (c) { maxD = Math.max(maxD, Math.round(c.distance || 0)); });
    var over = Math.max(0, maxD - RADIUS_M);
    var node = el('div', { class: 'ruler-verdict' });
    node.appendChild(el('span', { text: '判为失败 · 超出半径 ' }));
    node.appendChild(el('span', { class: 'mono', text: over + 'm' }));
    return node;
  }

  function buildVerdict(app) {
    var v = verdictText(app);
    if (v) return v;
    return el('div', { class: 'ruler-verdict ruler-verdict--pass', text: '记录均在校区半径内，无需干预。' });
  }

  /* ---------------- 页面 ---------------- */
  ADMIN.pages.review = function (page, ctx) {
    var paramId = ctx.params && ctx.params.id;

    page.className = 'page';
    ADMIN.shell.crumbs([]);

    var queue = ADMIN.store.reviewQueue();
    ADMIN.shell.renderNav();

    var local = {
      list: queue.slice(),
      shown: queue[0] || null,
      sel: queue[0] ? String(queue[0].app.id) : null,
      receipt: null
    };

    if (paramId) {
      for (var i = 0; i < local.list.length; i++) {
        if (String(local.list[i].app.id) === String(paramId)) {
          local.shown = local.list[i];
          local.sel = String(paramId);
          break;
        }
      }
    }

    page.appendChild(ui.pageHead({
      title: '异常核验',
      right: [el('div', { class: 'head-note', text: '按上报时间升序' })]
    }));

    var listEl = el('div', { class: 'md-list' });
    var detailEl = el('div', { class: 'md-detail' });
    page.appendChild(el('div', { class: 'md' }, [listEl, detailEl]));

    /* ---------- 左列表 ---------- */
    function renderList() {
      listEl.innerHTML = '';
      if (!local.list.length) {
        listEl.appendChild(ui.empty({
          title: '没有待核验的记录；',
          note: '自动通过的记录在申请详情里。'
        }));
        return;
      }
      local.list.forEach(function (item) {
        var app = item.app;
        var dist = Math.round(item.checkin.distance || 0);
        var key = String(app.id);
        var btn = el('button', {
          class: 'li li--tall' + (local.sel === key ? ' is-on' : ''),
          attrs: { type: 'button' },
          onClick: function () {
            local.sel = key;
            local.shown = item;
            local.receipt = null;
            renderList();
            renderDetail();
          }
        }, [
          el('div', { class: 'li-row' }, [
            el('span', { class: 'li-name', text: app.studentName }),
            el('span', { class: 'li-kind', text: app.scene + ' · ' + app.type }),
            el('span', { class: 'li-dist', text: dist + ' m' })
          ]),
          el('div', { class: 'li-time', text: ui.waitLabel(item.checkin.time) })
        ]);
        listEl.appendChild(btn);
      });
    }

    /* ---------- 右详情 ---------- */
    function renderDetail() {
      detailEl.innerHTML = '';
      if (!local.shown) {
        detailEl.appendChild(ui.empty({
          title: '左侧没有待核验的记录。',
          note: '定位失败会先进入这里，自动通过的记录在申请详情里。'
        }));
        return;
      }
      detailEl.appendChild(detailView(local.shown));
    }

    function detailView(item) {
      var app = item.app;
      var root = el('div', { class: 'detail fade-in detail--pad' });

      // ① 判定标尺
      root.appendChild(el('div', { class: 'sec' }, [
        el('h2', { class: 'sec-title' }, [
          el('span', { text: '判定标尺' }),
          el('span', { class: 'sec-aux', text: '0–' + AXIS_MAX + 'm 线性 · 半径 ' + RADIUS_M + 'm' })
        ]),
        buildRuler(app),
        buildVerdict(app)
      ]));

      // ② 学生核验理由
      var reasonText = item.checkin.note || '学生未填写说明。';
      root.appendChild(el('div', { class: 'sec' }, [
        el('h2', { class: 'sec-title', text: '学生核验说明' }),
        ui.quote(reasonText, ui.fmtTime(item.checkin.time, 'md') + ' ' + ui.hm(ui.parse(item.checkin.time)) + ' · ' + (CHECK_TYPE[item.checkin.type] || item.checkin.type))
      ]));

      // ③ 历史定位记录
      var rows = app.checkins || [];
      root.appendChild(el('div', { class: 'sec' }, [
        el('h2', { class: 'sec-title', text: '历史定位记录' }),
        ui.table({
          className: 'tbl--tight',
          cols: [
            {
              label: '时间', width: 150,
              render: function (c) {
                return el('span', { class: 'num', style: { color: 'var(--ink-2)' }, text: ui.fmtTime(c.time, 'md') + ' ' + ui.hm(ui.parse(c.time)) });
              }
            },
            { label: '类型', width: 100, render: function (c) { return CHECK_TYPE[c.type] || c.type; } },
            {
              label: '结果',
              render: function (c) {
                var tone = c.result === 'FAILED' ? 'var(--red-600)' : c.result === 'PASSED' ? 'var(--teal-600)' : 'var(--ink-2)';
                var label = c.result === 'FAILED'
                  ? (c.review === 'PENDING_REVIEW' ? '失败 · 待核验' : '失败')
                  : c.result === 'PASSED' ? '通过' : c.result;
                return el('span', { style: { color: tone, fontWeight: '500' }, text: label });
              }
            },
            {
              label: '距离', width: 96, align: 'right',
              render: function (c) {
                return el('span', { class: 'num', style: { color: 'var(--ink-2)' }, text: Math.round(c.distance || 0) + ' m' });
              }
            }
          ],
          rows: rows,
          rowKey: 'id'
        })
      ]));

      // ④ 申请摘要
      var kv = el('div', { class: 'kv kv--2' });
      [
        ['学生', app.studentName],
        ['学号', app.studentNo, true],
        ['班级', app.className],
        ['请假区间', ui.timeRange(app.start, app.end), true],
        ['场景', app.scene + ' · ' + app.type],
        ['单号', app.no, true]
      ].forEach(function (it) {
        kv.appendChild(el('div', { class: 'kv-row' }, [
          el('div', { class: 'kv-k', text: it[0] }),
          el('div', { class: 'kv-v' + (it[2] ? ' num' : ''), text: it[1] })
        ]));
      });
      root.appendChild(el('div', { class: 'sec' }, [
        el('h2', { class: 'sec-title', text: '申请摘要' }),
        kv
      ]));

      // ⑤ 操作条
      var wrap = el('div', { class: 'action-wrap' });
      var slot = el('div');
      wrap.appendChild(el('div', { class: 'action-note', style: { padding: '10px 0 0' }, text: '通过后：请假记为现在完成 · 逾期计入统计 · 待处理续假自动撤回' }));
      wrap.appendChild(slot);

      if (local.receipt) {
        wrap.appendChild(el('div', { class: 'receipt' }, [ui.icon('check'), el('span', { text: local.receipt })]));
        root.appendChild(wrap);
        return root;
      }

      var bar = el('div', { class: 'action-bar' }, [
        el('div', { class: 'action-note', text: '仍不确定时，可驳回并要求学生补交说明' }),
        el('div', { class: 'action-btns' }, [
          el('button', { class: 'btn btn--secondary', attrs: { type: 'button' }, text: '驳回', onClick: openReject }),
          el('button', { class: 'btn btn--primary', attrs: { type: 'button' }, text: '通过', onClick: function () { approve(item); } })
        ])
      ]);
      wrap.appendChild(bar);
      root.appendChild(wrap);

      var panel = null;
      function openReject() {
        if (panel) return;
        var p = ui.rejectPanel({
          onCancel: closeReject,
          onSubmit: function (reason) { closeReject(); reject(item, reason); }
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

      return root;
    }

    /* ---------- 动作 ---------- */
    function advance(appId) {
      var key = String(appId);
      var idx = -1;
      for (var i = 0; i < local.list.length; i++) {
        if (String(local.list[i].app.id) === key) { idx = i; break; }
      }
      if (idx !== -1) local.list.splice(idx, 1);
      var next = local.list[Math.min(idx === -1 ? 0 : idx, local.list.length - 1)];
      local.sel = next ? String(next.app.id) : null;
      ADMIN.shell.sync();
    }

    function approve(item) {
      ADMIN.store.decideCheckins(item.checkins.map(function (c) { return c.id; }), 'approved');
      local.receipt = '已通过 · 刚刚 · 学生已收到销假通知';
      advance(item.app.id);
      renderList();
      renderDetail();
    }

    function reject(item, reason) {
      ADMIN.store.decideCheckins(item.checkins.map(function (c) { return c.id; }), 'rejected');
      local.receipt = '已驳回 · 刚刚 · 已通知学生';
      advance(item.app.id);
      renderList();
      renderDetail();
    }

    renderList();
    renderDetail();
  };
})();

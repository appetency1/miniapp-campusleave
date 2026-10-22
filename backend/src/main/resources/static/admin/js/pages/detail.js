/* ============================================================
   detail.js —— 申请详情（待审批与台账共用）
   单列，内容列 max-width:720，操作条 sticky
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  var CHECK_TYPE = { GPS: '定位申报', MANUAL_REVIEW: '人工申诉', ON_CAMPUS_CONFIRM: '校内确认' };

  function isImage(name) { return /\.(png|jpe?g|webp|gif)$/i.test(name || ''); }

  /* ---------------- 1 学生信息 ---------------- */
  function secStudent(app) {
    var items = [
      ['姓名', app.studentName],
      ['学号', app.studentNo, true],
      ['班级', app.className],
      ['电话', app.phone, true],
      ['紧急联系人', app.emergencyContact, true]
    ];
    var grid = el('div', { class: 'kv kv--2' });
    items.forEach(function (it) {
      grid.appendChild(el('div', { class: 'kv-row' }, [
        el('div', { class: 'kv-k', text: it[0] }),
        el('div', { class: 'kv-v' + (it[2] ? ' num' : ''), text: it[1] })
      ]));
    });
    return section('学生信息', [grid]);
  }

  /* ---------------- 2 申请内容 ---------------- */
  function secApply(app) {
    var body = [];
    body.push(el('div', { class: 'apply-scene', text: app.scene + ' · ' + app.type }));
    body.push(el('div', { class: 'range-row' }, [
      el('div', {}, [
        el('span', { class: 'rb-lab', text: '开始' }),
        el('span', { class: 'rb-val', text: ui.fmtTime(app.start, 'md') + ' ' + ui.hm(ui.parse(app.start)) })
      ]),
      el('span', { class: 'rb-dash', text: '—' }),
      el('div', {}, [
        el('span', { class: 'rb-lab', text: '结束' }),
        el('span', { class: 'rb-val', text: ui.fmtTime(app.end, 'md') + ' ' + ui.hm(ui.parse(app.end)) })
      ])
    ]));
    body.push(el('div', { class: 'kv-row', style: { alignItems: 'flex-start' } }, [
      el('div', { class: 'kv-k', text: '理由' }),
      el('div', { class: 'kv-v reason-text', text: app.reason || '—' })
    ]));
    if (app.scene === '离校') {
      body.push(el('div', { class: 'kv-row' }, [
        el('div', { class: 'kv-k', text: '去向' }),
        el('div', { class: 'kv-v', text: app.destination || '—' })
      ]));
    }
    body.push(el('div', { class: 'apply-meta' }, [
      el('span', { text: '单号 ' + app.no }),
      el('span', { text: '提交 ' + ui.fmtTime(app.submittedAt, 'md') + ' ' + ui.hm(ui.parse(app.submittedAt)) })
    ]));
    return section('申请内容', body);
  }

  /* ---------------- 3 材料 ---------------- */
  function secMaterials(app) {
    var mats = app.materials || [];
    var body = [];
    var images = [];

    if (!mats.length) {
      body.push(el('div', { class: 'mats-note', text: '—' }));
      return section('材料', body);
    }

    var imgRow = el('div', { class: 'mats' });

    mats.forEach(function (m) {
      if (isImage(m.name)) {
        var src = ui.docImage(m.name, m.type + ' · ' + m.size);
        var idx = images.length;
        images.push({ src: src, label: m.name });
        var thumb = el('button', { class: 'mat-thumb', attrs: { type: 'button', 'aria-label': '查看 ' + m.name } }, [
          el('img', { attrs: { src: src, alt: m.name } })
        ]);
        thumb.addEventListener('click', function () { ui.lightbox(images, idx); });
        imgRow.appendChild(el('div', { class: 'mat-item' }, [
          thumb,
          el('div', { class: 'mat-name', text: m.name })
        ]));
      } else {
        var open = el('a', {
          class: 'link',
          attrs: { href: '#', target: '_blank', rel: 'noopener' },
          text: '新标签打开'
        }, [ui.icon('external')]);
        var row = el('div', { class: 'mat-file' }, [
          ui.icon('file'),
          el('span', { class: 'mat-fname', text: m.name }),
          el('span', { style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-4)' }, text: m.size }),
          open
        ]);
        open.addEventListener('click', function (e) {
          e.preventDefault();
          var t = e.currentTarget;
          t.textContent = '演示环境无附件';
          t.style.pointerEvents = 'none';
          t.style.borderBottom = '0';
        });
        body.push(row);
      }
    });

    if (imgRow.childNodes.length) body.unshift(imgRow);
    body.push(el('div', { class: 'mats-note', style: { marginTop: '10px' }, text: mats.length + ' 份材料 · 由学生上传，仅供审批参考' }));
    return section('材料', body);
  }

  /* ---------------- 4 时间轴 ---------------- */
  function timelineNodes(app) {
    var nodes = [];
    nodes.push({ title: '提交申请', time: app.submittedAt, state: 'done' });

    if (app.status === 'PENDING') {
      nodes.push({ title: '教师审批', time: '', state: 'now', hint: '待处理' });
    } else if (app.status === 'REJECTED') {
      nodes.push({ title: '教师审批', tag: '已驳回', time: '', state: 'done' });
    } else if (app.status === 'WITHDRAWN') {
      nodes.push({ title: '教师审批', tag: '学生已撤回', time: '', state: 'todo' });
    } else if (app.status === 'CANCELLED') {
      nodes.push({ title: '教师审批', tag: '已通过 · 后取消', time: app.approvedAt, state: 'done' });
    } else {
      nodes.push({ title: '教师审批', tag: '已通过', time: app.approvedAt, state: 'done' });
    }

    var passed = (app.checkins || []).filter(function (c) { return c.result === 'PASSED'; });
    var pendingReview = (app.checkins || []).filter(function (c) { return c.review === 'PENDING_REVIEW'; });

    if (passed.length) {
      nodes.push({ title: '销假', tag: '定位通过', time: passed[passed.length - 1].time, state: 'done' });
    } else if (pendingReview.length) {
      nodes.push({ title: '销假', tag: '待核验', time: pendingReview[pendingReview.length - 1].time, state: 'now' });
    } else {
      nodes.push({ title: '销假', time: '', state: 'todo' });
    }

    if (app.status === 'COMPLETED') {
      nodes.push({ title: '完成', time: app.actualEnd || app.end, state: 'done' });
    } else if (app.status === 'CANCELLED') {
      nodes.push({ title: '完成', tag: '已取消', time: '', state: 'done' });
    } else if (app.status === 'REJECTED' || app.status === 'WITHDRAWN') {
      nodes.push({ title: '完成', time: '', state: 'todo' });
    } else if (app.effective === 'OVERDUE') {
      nodes.push({ title: '完成', tag: '逾期未销假', time: '', state: 'now' });
    } else {
      nodes.push({ title: '完成', time: '', state: 'todo' });
    }
    return nodes;
  }

  function secTimeline(app) {
    var tl = el('div', { class: 'tl' });
    timelineNodes(app).forEach(function (n) {
      var timeText = n.time
        ? ui.fmtTime(n.time, 'md') + ' ' + ui.hm(ui.parse(n.time))
        : (n.state === 'now' ? '进行中' : '未开始');
      tl.appendChild(el('div', { class: 'tl-row' }, [
        el('div', { class: 'tl-dot tl-dot--' + (n.state === 'done' ? 'done' : n.state === 'now' ? 'now' : 'todo') }),
        el('div', { class: 'tl-title' }, [
          el('span', { text: n.title }),
          n.tag ? el('span', { class: 'tl-tag', text: n.tag }) : null
        ]),
        el('div', { class: 'tl-time' + (n.state === 'todo' ? ' tl-time--todo' : ''), text: timeText })
      ]));
    });
    return section('审批时间轴', [tl]);
  }

  /* ---------------- 5 销假记录 ---------------- */
  function secCheckins(app) {
    var rows = app.checkins || [];
    if (!rows.length) return section('销假记录', [el('div', { class: 'mats-note', text: '—' })]);

    var tbl = ui.table({
      className: 'tbl--tight',
      cols: [
        {
          label: '时间',
          width: 160,
          render: function (c) {
            return el('span', { class: 'num', style: { color: 'var(--ink-2)' }, text: ui.fmtTime(c.time, 'md') + ' ' + ui.hm(ui.parse(c.time)) });
          }
        },
        {
          label: '类型',
          width: 110,
          render: function (c) { return CHECK_TYPE[c.type] || c.type; }
        },
        {
          label: '结果',
          render: function (c) {
            var tone = c.result === 'FAILED' ? 'var(--red-600)' : c.result === 'PASSED' ? 'var(--teal-600)' : 'var(--ink-2)';
            var label = c.result === 'FAILED'
              ? (c.review === 'PENDING_REVIEW' ? '失败 · 待核验' : '失败')
              : c.result === 'PASSED' ? '通过' : c.result;
            var dist = typeof c.distance === 'number' ? Math.round(c.distance) + ' m' : '—';
            return el('span', {}, [
              el('span', { style: { color: tone, fontWeight: '500' }, text: label }),
              el('span', { style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', marginLeft: '10px' }, text: '距离 ' + dist })
            ]);
          }
        }
      ],
      rows: rows,
      rowKey: 'id'
    });
    return section('销假记录', [tbl]);
  }

  /* ---------------- 6 续假记录 ---------------- */
  function secExtension(app) {
    var ext = (window.STORE.extensions || []).filter(function (e) { return e.applicationId === app.id; })[0];
    if (!ext) return section('续假记录', [el('div', { class: 'mats-note', text: '—' })]);

    var label = ext.status === 'PENDING' ? '待审批' : ext.status === 'APPROVED' ? '已通过' : '已驳回';
    var line = el('div', { class: 'kv-line' }, [
      el('span', { text: '申请延长至 ' + ui.fmtTime(ext.requestedEnd, 'md') + ' ' + ui.hm(ui.parse(ext.requestedEnd)) }),
      el('span', { class: 'dash', text: '·' }),
      el('span', { style: { color: 'var(--ink-3)' }, text: label })
    ]);
    var nodes = [line];
    if (ext.comment) {
      nodes.push(el('div', { class: 'quote', style: { marginTop: '10px' }, text: ext.comment }));
    }
    return section('续假记录', nodes);
  }

  function section(title, children, aux) {
    return el('div', { class: 'sec' }, [
      el('h2', { class: 'sec-title' }, [
        el('span', { text: title }),
        aux ? el('span', { class: 'sec-aux', text: aux }) : null
      ])
    ].concat(children));
  }

  /* ---------------- 7 操作条 ---------------- */
  function actionBar(app, opts) {
    var wrap = el('div', { class: 'action-wrap' });
    var slot = el('div');
    wrap.appendChild(slot);

    if (opts.receipt) {
      wrap.appendChild(el('div', { class: 'receipt' }, [
        ui.icon('check'),
        el('span', { text: opts.receipt })
      ]));
      return wrap;
    }

    var note = el('div', { class: 'action-note', text: opts.note || '批准后学生首页立即变化，并收到通知' });
    var bar = el('div', { class: 'action-bar' }, [
      note,
      el('div', { class: 'action-btns' }, [
        el('button', {
          class: 'btn btn--secondary',
          attrs: { type: 'button' },
          text: '驳回',
          onClick: openReject
        }),
        el('button', {
          class: 'btn btn--primary',
          attrs: { type: 'button' },
          text: '批准',
          onClick: function () { opts.onApprove && opts.onApprove(app); }
        })
      ])
    ]);

    var panel = null;
    function openReject() {
      if (panel) return;
      var p = ui.rejectPanel({
        onCancel: closeReject,
        onSubmit: function (reason) { closeReject(); opts.onReject && opts.onReject(app, reason); }
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

    wrap.appendChild(bar);
    return wrap;
  }

  /* ---------------- 组装 ---------------- */
  function render(app, opts) {
    opts = opts || {};
    var root = el('div', { class: 'detail fade-in' + (opts.pad ? ' detail--pad' : '') });
    root.appendChild(secStudent(app));
    root.appendChild(secApply(app));
    root.appendChild(secMaterials(app));
    root.appendChild(secTimeline(app));
    root.appendChild(secCheckins(app));
    root.appendChild(secExtension(app));

    var showBar = opts.receipt ? true
      : opts.type === 'pending' ? app.status === 'PENDING'
        : opts.type === 'records' ? false : true;
    if (showBar) root.appendChild(actionBar(app, opts));
    return root;
  }

  ADMIN.detail = { render: render };

  /* ---------------- 台账详情 / 占位页 ---------------- */
  ADMIN.pages.records = function (page, ctx) {
    var id = ctx.params && ctx.params.id;

    if (id) {
      var app = ADMIN.store.appById(id);
      page.className = 'page page--scroll';
      if (!app) {
        page.appendChild(ui.pageHead({ title: '申请详情' }));
        page.appendChild(ui.empty({ title: '这条申请不在当前数据里。', note: '可能已被撤回或超出班级范围。' }));
        return;
      }
      ADMIN.shell.crumbs([
        { label: '申请记录', href: '#/records' },
        { label: app.studentName + ' · ' + app.type }
      ]);
      page.appendChild(ui.pageHead({ title: app.studentName + ' · ' + app.type, meta: app.no }));
      page.appendChild(render(app, { type: 'records' }));
      return;
    }

    // 其余路由：留空实现，保持可点通
    page.className = 'page page--scroll';
    var map = {
      '/records': {
        title: '申请记录',
        meta: '筛选、排序与批量导出于下一阶段实现',
        empty: { title: '这一步先不铺表格。', note: '申请记录与学生档案在下一阶段的 pass 里实现，详情页已可单独打开。' }
      },
      '/students': {
        title: '学生',
        meta: '计算机2301 / 2302 · 8 人',
        empty: { title: '学生档案还没接上。', note: '这一屏留给下一阶段：请假次数、当前状态与最近记录。' }
      },
      '/profile': {
        title: '个人信息',
        meta: '张明远 · 计算机学院',
        empty: { title: '个人信息与通知设置未在本阶段展开。', note: '如需调整班级范围，请使用顶栏右侧的班级范围切换。' }
      }
    };
    var conf = map[ctx.path] || map['/records'];
    page.appendChild(ui.pageHead({ title: conf.title, meta: conf.meta }));
    page.appendChild(ui.empty(conf.empty));
  };
})();

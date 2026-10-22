/* ============================================================
   pages/admin.js —— 管理端 4 个页面（账号 / 班级 / 辅导员绑定 / 系统配置）

   为什么四页放一个文件：它们共用同一套"表格 + 抽屉表单"骨架，
   拆成四个文件会有四份重复的 field/drawer/refresh 代码。
   路由器上仍是四个独立路由（#/admin/users 等），互不影响。

   数据来源：window.STORE.admin（由 api.loadAdminStore 一次拉齐）。
   写操作成功后统一调 ADMIN.api.refresh() 再重绘当前页——不做局部改内存，
   避免"界面显示改了、后端其实失败"。
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;
  var api = ADMIN.api;

  /* ================= 通用：字段与抽屉表单 ================= */

  function field(label, input, hint) {
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: label }),
      input,
      hint ? el('div', { class: 'field-hint', text: hint }) : null
    ]);
  }

  function textInput(placeholder, value, type) {
    return el('input', {
      class: 'input',
      attrs: {
        type: type || 'text',
        placeholder: placeholder || '',
        value: value == null ? '' : value,
        autocomplete: 'off'
      }
    });
  }

  function selectInput(options, value) {
    var s = el('select', { class: 'input' });
    options.forEach(function (o) {
      var opt = el('option', { attrs: { value: String(o.value) }, text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      s.appendChild(opt);
    });
    return s;
  }

  /**
   * 打开一个抽屉表单。
   * @param {string} title
   * @param {Array}  fields  [{key, label, type, options, placeholder, hint, value}]
   * @param {string} submitText
   * @param {Function} onSubmit (values) => Promise
   */
  function openForm(title, fields, submitText, onSubmit) {
    var inputs = {};
    var nodes = fields.map(function (f) {
      var input;
      if (f.type === 'select') input = selectInput(f.options, f.value);
      else input = textInput(f.placeholder, f.value, f.type === 'password' ? 'password' : 'text');
      input.id = 'f-' + f.key;
      inputs[f.key] = input;
      return field(f.label, input, f.hint);
    });

    var err = el('div', { class: 'form-err' });
    var submit = el('button', { class: 'btn btn--primary', attrs: { type: 'submit' }, text: submitText });
    var cancel = el('button', { class: 'btn btn--secondary', attrs: { type: 'button' }, text: '取消' });

    var form = el('form', { class: 'drawer-form' }, [
      el('div', { class: 'drawer-title', text: title })
    ].concat(nodes).concat([
      err,
      el('div', { class: 'drawer-actions' }, [cancel, submit])
    ]));

    var d = ui.drawer(form);
    cancel.addEventListener('click', d.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var values = {};
      fields.forEach(function (f) { values[f.key] = (inputs[f.key].value || '').trim(); });
      submit.disabled = true;
      submit.textContent = '提交中…';
      Promise.resolve(onSubmit(values)).then(function () {
        d.close();
      }).catch(function (ex) {
        submit.disabled = false;
        submit.textContent = submitText;
        err.textContent = (ex && ex.message) || '操作失败';
      });
    });

    setTimeout(function () { if (fields.length) inputs[fields[0].key].focus(); }, 60);
  }

  /** 写操作统一出口：成功后刷新 STORE 并重绘当前页 */
  function act(promise, okText) {
    return promise.then(function () {
      return api.refresh();
    }).then(function () {
      if (okText) toast(okText);
      ADMIN.shell.rerender();
    });
  }

  function toast(text) {
    var t = el('div', { class: 'toast', text: text });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 1600);
    setTimeout(function () { t.remove(); }, 2100);
  }

  /** 页头右侧的动作按钮 */
  function headBtn(text, onClick) {
    return el('button', { class: 'btn btn--primary btn--sm', attrs: { type: 'button' }, text: text, onClick: onClick });
  }

  /** 统计条：一行四个数字，让表格页顶部立得住 */
  function statStrip(cells) {
    return el('div', { class: 'stat-strip' }, cells.map(function (c) {
      return el('div', { class: 'stat-cell' }, [
        el('span', { class: 'stat-k', text: c.label }),
        el('span', { class: 'stat-v' + (c.warn ? ' stat-v--warn' : ''), text: String(c.value) })
      ]);
    }));
  }

  /* ================= 0. 概览（管理员首页） ================= */

  function greetWord() {
    var h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function num(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /** 折线图：7 天两条线（离校 / 校内），带网格与面积渐变 */
  function trendSvg(trend) {
    var W = 420, H = 190, padL = 32, padR = 12, padT = 14, padB = 26;
    var iw = W - padL - padR, ih = H - padT - padB;
    var n = trend.length || 1;
    var max = 10;
    trend.forEach(function (t) { max = Math.max(max, t.off || 0, t.on || 0); });
    max = Math.ceil(max / 10) * 10;

    function xAt(i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
    function yAt(v) { return padT + ih - ih * (v || 0) / max; }

    function path(key) {
      return trend.map(function (t, i) {
        return (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(t[key]).toFixed(1);
      }).join(' ');
    }
    function areaPath(key) {
      return path(key)
        + ' L' + xAt(n - 1).toFixed(1) + ' ' + (padT + ih)
        + ' L' + xAt(0).toFixed(1) + ' ' + (padT + ih) + ' Z';
    }

    var grid = '';
    for (var g = 0; g <= 5; g++) {
      var v = max * g / 5;
      var y = yAt(v);
      grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#E6EBE0" stroke-width="1"/>';
      grid += '<text x="' + (padL - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#9AA49D">' + Math.round(v) + '</text>';
    }

    var labels = trend.map(function (t, i) {
      return '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="#9AA49D">' + t.date + '</text>';
    }).join('');

    var dots = function (key, color) {
      return trend.map(function (t, i) {
        return '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(t[key]).toFixed(1) + '" r="2.6" fill="#fff" stroke="' + color + '" stroke-width="1.6"/>';
      }).join('');
    };

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ah-svg" preserveAspectRatio="xMidYMid meet">'
      + '<defs>'
      + '<linearGradient id="gOff" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4A7C59" stop-opacity=".18"/><stop offset="100%" stop-color="#4A7C59" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="gOn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C9A227" stop-opacity=".16"/><stop offset="100%" stop-color="#C9A227" stop-opacity="0"/></linearGradient>'
      + '</defs>'
      + grid
      + '<path d="' + areaPath('off') + '" fill="url(#gOff)"/>'
      + '<path d="' + areaPath('on') + '" fill="url(#gOn)"/>'
      + '<path d="' + path('off') + '" fill="none" stroke="#4A7C59" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + '<path d="' + path('on') + '" fill="none" stroke="#C9A227" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + dots('off', '#4A7C59')
      + dots('on', '#C9A227')
      + labels
      + '</svg>';
  }

  /** 环形图：类型分布，中间显示总数 */
  function donutSvg(types, total) {
    var size = 132, cx = size / 2, cy = size / 2, R = 56, r = 39;
    var colors = ['#2F6B45', '#C9A227', '#A8B5A0', '#D9DED6'];
    var sum = types.reduce(function (a, t) { return a + (t.value || 0); }, 0);

    if (!sum) {
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="ah-donut-svg">'
        + '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r) / 2) + '" fill="none" stroke="#E6EBE0" stroke-width="' + (R - r) + '"/>'
        + '</svg>';
    }

    var acc = 0;
    var paths = types.map(function (t, i) {
      var a0 = acc / sum * Math.PI * 2 - Math.PI / 2;
      acc += t.value || 0;
      var a1 = acc / sum * Math.PI * 2 - Math.PI / 2;
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
      var x3 = cx + r * Math.cos(a0), y3 = cy + r * Math.sin(a0);
      var d = 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2)
        + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2)
        + ' L' + x2.toFixed(2) + ' ' + y2.toFixed(2)
        + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x3.toFixed(2) + ' ' + y3.toFixed(2) + ' Z';
      return '<path d="' + d + '" fill="' + colors[i % colors.length] + '"/>';
    }).join('');

    return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="ah-donut-svg">'
      + paths
      + '<text x="' + cx + '" y="' + (cy - 7) + '" text-anchor="middle" font-size="9" fill="#7C877F">总计</text>'
      + '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" font-size="18" font-weight="700" fill="#1F2A24">' + num(total) + '</text>'
      + '</svg>';
  }

  ADMIN.pages.adminHome = function (page) {
    page.className = 'page page--scroll';

    var ov = (STORE.admin && STORE.admin.overview) || {};
    var st = ov.stats || {};
    var dl = ov.deltas || {};
    var trend = ov.trend || [];
    var types = ov.types || [];
    var recent = ov.recent || [];
    var alerts = ov.alerts || [];
    var todo = ov.todo || {};

    var now = new Date();
    var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    var root = el('div', { class: 'wb' });
    var main = el('div', { class: 'wb-main' });
    var side = el('div', { class: 'wb-side' });
    root.appendChild(main);
    root.appendChild(side);
    page.appendChild(root);

    /* ---------- 问候 + 手写标语 ---------- */
    main.appendChild(el('div', { class: 'ah-head' }, [
      el('div', {}, [
        el('h1', { class: 'ah-title', text: greetWord() + '，' + (STORE.teacher.name || '管理员') }),
        el('div', { class: 'ah-date', text: (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEK[now.getDay()] })
      ]),
      el('div', { class: 'ah-slogan', text: '用心管理  保障每一份请假' })
    ]));

    /* ---------- 四个统计卡 ---------- */
    var STATS = [
      { icon: 'stat-student', label: '学生总数', value: st.studentTotal, delta: dl.studentTotal, unit: '较上月' },
      { icon: 'stat-apply', label: '今日申请', value: st.todayApplications, delta: dl.todayApplications, unit: '较昨日' },
      { icon: 'stat-active', label: '请假中', value: st.inProgress, delta: dl.inProgress, unit: '较昨日' },
      { icon: 'stat-pending', label: '待处理', value: st.pending, delta: dl.pending, unit: '较昨日' }
    ];
    var statRow = el('div', { class: 'ah-stats' });
    STATS.forEach(function (s) {
      var d = s.delta || 0;
      var tone = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
      var deltaText = d === 0 ? '持平' : (d > 0 ? '↑ ' : '↓ ') + Math.abs(d) + ' ' + s.unit;
      statRow.appendChild(el('div', { class: 'ah-stat' }, [
        el('span', { class: 'ah-stat-ico' }, [ui.pngIcon(s.icon, 26)]),
        el('div', { class: 'ah-stat-body' }, [
          el('span', { class: 'ah-stat-label', text: s.label }),
          el('span', { class: 'ah-stat-value', text: num(s.value) }),
          el('span', { class: 'ah-stat-delta ah-stat-delta--' + tone, text: deltaText })
        ])
      ]));
    });
    main.appendChild(statRow);

    /* ---------- 图表行 ---------- */
    var charts = el('div', { class: 'ah-charts' });

    var trendCard = el('div', { class: 'wb-card ah-chart' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '请假概况' }),
        el('span', { class: 'ah-legend-inline' }, [
          el('i', { class: 'ah-dot ah-dot--off' }), el('span', { text: '离校请假' }),
          el('i', { class: 'ah-dot ah-dot--on' }), el('span', { text: '校内请假' })
        ])
      ])
    ]);
    var trendBox = el('div', { class: 'ah-svg-box' });
    trendBox.innerHTML = trendSvg(trend);
    trendCard.appendChild(trendBox);
    charts.appendChild(trendCard);

    var donutCard = el('div', { class: 'wb-card ah-chart ah-chart--donut' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '请假类型分布' })
      ])
    ]);
    var donutWrap = el('div', { class: 'ah-donut' });
    var donutBox = el('div', { class: 'ah-donut-box' });
    donutBox.innerHTML = donutSvg(types, ov.typeTotal || 0);
    donutWrap.appendChild(donutBox);

    var legend = el('div', { class: 'ah-donut-legend' });
    var COLORS = ['#2F6B45', '#C9A227', '#A8B5A0', '#D9DED6'];
    if (types.length) {
      types.forEach(function (t, i) {
        legend.appendChild(el('div', { class: 'ah-legend-row' }, [
          el('i', { class: 'ah-dot', style: { background: COLORS[i % COLORS.length] } }),
          el('span', { class: 'ah-legend-name', text: t.name }),
          el('span', { class: 'ah-legend-val', text: String(t.value) }),
          el('span', { class: 'ah-legend-pct', text: t.pct + '%' })
        ]));
      });
    } else {
      legend.appendChild(el('div', { class: 'ah-legend-empty', text: '近 7 天没有申请记录' }));
    }
    donutWrap.appendChild(legend);
    donutCard.appendChild(donutWrap);
    charts.appendChild(donutCard);
    main.appendChild(charts);

    /* ---------- 最近申请动态 ---------- */
    var recentCard = el('div', { class: 'wb-card wb-recent' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '最近申请动态' }),
        el('a', { class: 'wb-card-more', href: '#/admin/users', text: '全部 ›' })
      ])
    ]);
    if (recent.length) {
      recentCard.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          {
            label: '提交', width: 82, render: function (a) {
              return el('span', { class: 'wb-time', text: String(a.submittedAt || '').slice(11, 16) });
            }
          },
          {
            label: '学生', width: 176, render: function (a) {
              return el('span', { class: 'cell-2' }, [
                el('span', { text: a.studentName }),
                el('span', { class: 'cell-sub', text: a.className || '—' })
              ]);
            }
          },
          { label: '类型 · 场景', width: 126, render: function (a) { return a.type + ' · ' + a.scene; } },
          { label: '请假区间', render: function (a) { return el('span', { class: 'wb-time', text: adminRange(a.start, a.end) }); } },
          {
            label: '状态', width: 94, render: function (a) {
              return el('span', { class: 'pill ' + adminPill(a.status, a.effective), text: adminPillText(a.status, a.effective) });
            }
          }
        ],
        rows: recent
      }));
    } else {
      recentCard.appendChild(ui.empty({ art: 'assets/asset-stationery.png', title: '还没有申请记录。', note: '学生提交后会出现在这里。' }));
    }
    main.appendChild(recentCard);

    /* ---------- 右栏 ---------- */
    side.appendChild(el('div', { class: 'ah-status' }, [
      el('div', { class: 'ah-status-text' }, [
        el('div', { class: 'ah-status-title' }, [
          el('span', { class: 'ah-status-dot' }),
          el('span', { text: '系统运行正常' })
        ]),
        el('div', { class: 'ah-status-note', text: '请假管理系统各项功能正常' })
      ]),
      el('div', { class: 'ah-status-art' })
    ]));

    var todoCard = el('div', { class: 'wb-card side-card' }, [
      el('div', { class: 'wb-card-head ah-side-head' }, [
        el('span', { class: 'wb-card-title', text: '待处理事项' }),
        el('a', { class: 'wb-card-more', href: '#/admin/users', text: '全部 ›' })
      ])
    ]);
    [
      { icon: 'nav-checklist', label: '待审批申请', value: todo.pending || 0, tone: 'amber', href: '#/admin/users' },
      { icon: 'nav-shield', label: '异常核验', value: todo.pendingReview || 0, tone: 'red', href: '#/admin/users' },
      { icon: 'nav-doc', label: '待处理续假', value: todo.pendingExtension || 0, tone: 'blue', href: '#/admin/users' }
    ].forEach(function (t) {
      todoCard.appendChild(el('a', { class: 'ah-todo-row', href: t.href }, [
        ui.pngIcon(t.icon, 17),
        el('span', { class: 'ah-todo-label', text: t.label }),
        el('span', { class: 'ah-badge ah-badge--' + t.tone, text: String(t.value) })
      ]));
    });
    side.appendChild(todoCard);

    var alertCard = el('div', { class: 'wb-card side-card' }, [
      el('div', { class: 'wb-card-head ah-side-head' }, [
        el('span', { class: 'wb-card-title', text: '系统提醒' })
      ])
    ]);
    (alerts.length ? alerts : [{ tone: 'info', text: '暂无提醒', note: '', time: '' }]).forEach(function (a) {
      alertCard.appendChild(el('div', { class: 'ah-alert-row' }, [
        el('span', { class: 'ah-alert-dot ah-alert-dot--' + (a.tone || 'info') }),
        el('div', { class: 'ah-alert-body' }, [
          el('div', { class: 'ah-alert-text', text: a.text }),
          el('div', { class: 'ah-alert-time', text: a.time || '' })
        ])
      ]));
    });
    side.appendChild(alertCard);

    side.appendChild(el('div', { class: 'ah-promo' }, [
      el('div', { class: 'ah-promo-title', text: '守护校园的每一份请假' }),
      el('div', { class: 'ah-promo-note', text: '让管理更简单，让关怀更近一步' }),
      el('div', { class: 'ah-promo-art' })
    ]));
  };

  function adminRange(s0, e0) {
    var s = String(s0 || ''), e = String(e0 || '');
    if (!s || !e) return '';
    return s.slice(5, 16) + ' — ' + e.slice(11, 16);
  }

  function adminPillText(status, eff) {
    if (status === 'PENDING') return '待审批';
    if (status === 'REJECTED') return '已取回';
    if (status === 'WITHDRAWN') return '已撤回';
    if (status === 'CANCELLED') return '已取消';
    if (status === 'COMPLETED' || eff === 'COMPLETED') return '已销假';
    if (eff === 'IN_PROGRESS') return '请假中';
    if (eff === 'OVERDUE') return '逾期';
    return '已通过';
  }

  function adminPill(status, eff) {
    if (status === 'PENDING') return 'pill--amber';
    if (status === 'REJECTED' || status === 'CANCELLED') return 'pill--red';
    if (status === 'COMPLETED' || eff === 'COMPLETED') return 'pill--gray';
    if (eff === 'IN_PROGRESS') return 'pill--blue';
    return 'pill--green';
  }


  /* ================= 占位页 ================= */
  ADMIN.pages.soon = function (page) {
    page.className = 'page page--scroll';
    page.appendChild(ui.pageHead({ title: '开发中' }));
    page.appendChild(el('div', { class: 'wb-card' }, [
      ui.empty({
        art: 'assets/asset-stationery.png',
        title: '这个页面还没做',
        note: '管理员端的业务数据视图（全校请假申请 / 记录 / 核验 / 请假规则）还没实现，先用「概览」看统计，或切到教师账号看明细。'
      })
    ]));
  };

  /* ================= 3.6 申请列表（请假申请 / 请假记录 / 异常核验共用） ================= */

  /** 三个菜单共用一套列表，靠 URL 判断取哪一份数据 */
  function appsMode() {
    var p = (ADMIN.router && ADMIN.router.current()) || '';
    if (p.indexOf('/admin/records') === 0) return 'records';
    if (p.indexOf('/admin/review') === 0) return 'review';
    return 'pending';
  }

  var APPS_META = {
    pending: { title: '请假申请', scope: 'pending', note: '按提交时间倒序 · 全校口径' },
    records: { title: '请假记录', scope: 'all', note: '全部状态 · 按提交时间倒序' },
    review: { title: '异常核验', scope: 'all', review: 'PENDING_REVIEW', note: '定位失败的申请，需要人工核验' }
  };

  function appPillText(r) {
    if (r.status === 'PENDING') return '待审批';
    if (r.status === 'REJECTED') return '已取回';
    if (r.status === 'WITHDRAWN') return '已撤回';
    if (r.status === 'CANCELLED') return '已取消';
    if (r.status === 'COMPLETED' || r.effective === 'COMPLETED') return '已销假';
    if (r.effective === 'IN_PROGRESS') return '请假中';
    if (r.effective === 'OVERDUE') return '逾期';
    if (r.needReview) return '待核验';
    return '已通过';
  }

  function appPill(r) {
    if (r.needReview) return 'pill--red';
    if (r.status === 'PENDING') return 'pill--amber';
    if (r.status === 'REJECTED' || r.status === 'CANCELLED') return 'pill--red';
    if (r.status === 'COMPLETED' || r.effective === 'COMPLETED') return 'pill--gray';
    if (r.effective === 'IN_PROGRESS') return 'pill--blue';
    return 'pill--green';
  }

  /** 申请详情抽屉：管理员只读，不做审批动作 */
  function openAppDetail(r) {
    var inner = el('div', { class: 'app-detail' }, [
      el('div', { class: 'drawer-title', text: r.studentName + ' · ' + r.type + ' · ' + r.scene }),
      el('div', { class: 'app-detail-sub' }, [
        el('span', { class: 'mono', text: r.applicationNo || '' }),
        el('span', { class: 'pill ' + appPill(r), text: appPillText(r) })
      ])
    ]);
    ui.drawer(inner);
    var rows = [
      ['学生', r.studentName + '（' + (r.studentNo || '—') + '）'],
      ['班级', r.className || '—'],
      ['类型 · 场景', r.type + ' · ' + r.scene],
      ['请假区间', (r.start || '') + ' → ' + (r.end || '')],
      ['提交时间', r.submittedAt || '—'],
      ['请假原因', r.reason || '—']
    ];
    if (r.sceneCode === 'OFF_CAMPUS') rows.push(['离校去向', r.destination || '—']);
    if (r.contactPhone) rows.push(['联系电话', r.contactPhone]);
    if (r.approvedByName) {
      rows.push(['审批人', r.approvedByName + (r.approvedAt ? ' · ' + r.approvedAt : '')]);
    }
    if (r.cancelReason) rows.push(['取消原因', r.cancelReason]);
    if (r.needReview) rows.push(['核验状态', '学生定位失败，等待人工核验']);

    var list = el('div', { class: 'app-detail-list' });
    rows.forEach(function (kv) {
      list.appendChild(el('div', { class: 'app-detail-row' }, [
        el('span', { class: 'app-detail-k', text: kv[0] }),
        el('span', { class: 'app-detail-v', text: kv[1] })
      ]));
    });
    inner.appendChild(list);
  }

  ADMIN.pages.adminApps = function (page) {
    page.className = 'page page--scroll';

    var mode = appsMode();
    var meta = APPS_META[mode];
    var state = { kw: '', status: '' };

    page.appendChild(ui.pageHead({
      title: meta.title,
      right: [el('div', { class: 'page-meta', text: meta.note })]
    }));

    var statBox = el('div', {});
    page.appendChild(statBox);

    var bar = el('div', { class: 'tbl-toolbar' });
    if (mode === 'records') {
      var seg = el('div', { class: 'seg' });
      [
        { key: '', label: '全部' },
        { key: 'PENDING', label: '待审批' },
        { key: 'APPROVED', label: '已通过' },
        { key: 'COMPLETED', label: '已销假' },
        { key: 'REJECTED', label: '已驳回' }
      ].forEach(function (f) {
        seg.appendChild(el('button', {
          class: 'seg-item' + (f.key === '' ? ' is-on' : ''),
          attrs: { type: 'button' },
          dataset: { key: f.key },
          text: f.label,
          onClick: function () {
            state.status = f.key;
            Array.prototype.forEach.call(seg.children, function (n) {
              n.classList.toggle('is-on', n.dataset.key === f.key);
            });
            load();
          }
        }));
      });
      bar.appendChild(seg);
    }
    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索姓名 / 学号 / 班级', autocomplete: 'off' },
      onInput: function (e) {
        state.kw = e.target.value.trim();
        clearTimeout(bar._t);
        bar._t = setTimeout(load, 260);
      }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);
    box.appendChild(ui.empty({ title: '加载中…', note: '' }));

    function load() {
      var qs = ['size=200'];
      if (meta.scope) qs.push('scope=' + meta.scope);
      if (meta.review) qs.push('review=' + meta.review);
      if (state.kw) qs.push('keyword=' + encodeURIComponent(state.kw));

      api.get('/admin/applications?' + qs.join('&')).then(function (res) {
        var list = (res && res.list) || [];
        if (state.status) {
          list = list.filter(function (r) { return r.status === state.status; });
        }

        statBox.innerHTML = '';
        statBox.appendChild(statStrip([
          { label: '当前列表', value: list.length },
          { label: '待审批', value: list.filter(function (r) { return r.status === 'PENDING'; }).length },
          { label: '请假中', value: list.filter(function (r) { return r.effective === 'IN_PROGRESS'; }).length },
          { label: '待核验', value: list.filter(function (r) { return r.needReview; }).length, warn: list.some(function (r) { return r.needReview; }) }
        ]));

        box.innerHTML = '';
        if (!list.length) {
          box.appendChild(ui.empty({
            art: 'assets/asset-stationery.png',
            title: mode === 'review' ? '没有待核验的申请。' : '没有匹配的申请。',
            note: mode === 'review' ? '学生位置校验失败后才会进入这里。' : '换个关键词或筛选条件试试。'
          }));
          return;
        }

        box.appendChild(ui.table({
          rowKey: 'id',
          cols: [
            {
              label: '学生', width: 172, render: function (r) {
                return el('span', { class: 'cell-2' }, [
                  el('span', { text: r.studentName }),
                  el('span', { class: 'cell-sub', text: r.className || '—' })
                ]);
              }
            },
            { label: '类型 · 场景', width: 118, render: function (r) { return r.type + ' · ' + r.scene; } },
            {
              label: '请假区间', render: function (r) {
                return el('span', { class: 'wb-time', text: adminRange(r.start, r.end) });
              }
            },
            {
              label: '提交', width: 116, render: function (r) {
                return el('span', { class: 'wb-time', text: String(r.submittedAt || '').slice(5, 16) });
              }
            },
            {
              label: '状态', width: 92, render: function (r) {
                return el('span', { class: 'pill ' + appPill(r), text: appPillText(r) });
              }
            },
            {
              label: '操作', width: 76, align: 'right', render: function (r) {
                return el('button', {
                  class: 'link-btn', attrs: { type: 'button' }, text: '查看',
                  onClick: function (e) { e.stopPropagation(); openAppDetail(r); }
                });
              }
            }
          ],
          rows: list
        }));
      }).catch(function (e) {
        box.innerHTML = '';
        box.appendChild(ui.empty({ title: '加载失败', note: e.message || '' }));
      });
    }

    load();
  };

  /* ================= 1. 账号 ================= */

  ADMIN.pages.adminUsers = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.users) || [];
    var state = { role: '', kw: '' };

    page.appendChild(ui.pageHead({
      title: '账号',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 个' }),
        headBtn('新建账号', function () { openCreateUser(); })
      ]
    }));

    page.appendChild(statStrip([
      { label: '账号总数', value: all.length },
      { label: '学生', value: all.filter(function (u) { return u.role === 'STUDENT'; }).length },
      { label: '教师', value: all.filter(function (u) { return u.role === 'TEACHER'; }).length },
      { label: '已停用', value: all.filter(function (u) { return u.status !== 'ACTIVE'; }).length, warn: true }
    ]));

    var bar = el('div', { class: 'tbl-toolbar' });
    var seg = el('div', { class: 'seg' });
    [
      { key: '', label: '全部' },
      { key: 'STUDENT', label: '学生' },
      { key: 'TEACHER', label: '教师' },
      { key: 'ADMIN', label: '管理员' }
    ].forEach(function (f) {
      seg.appendChild(el('button', {
        class: 'seg-item' + (f.key === state.role ? ' is-on' : ''),
        attrs: { type: 'button' },
        dataset: { key: f.key },
        text: f.label,
        onClick: function (e) {
          state.role = f.key;
          Array.prototype.forEach.call(seg.children, function (n) {
            n.classList.toggle('is-on', n.dataset.key === f.key);
          });
          paint();
        }
      }));
    });
    bar.appendChild(seg);
    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索账号 / 姓名', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    function paint() {
      var rows = all.filter(function (u) {
        if (state.role && u.role !== state.role) return false;
        if (!state.kw) return true;
        return (u.username || '').indexOf(state.kw) >= 0 || (u.realName || '').indexOf(state.kw) >= 0;
      });
      box.innerHTML = '';
      if (!rows.length) {
        box.appendChild(ui.empty({ title: '没有匹配的账号。', note: '换个关键词，或切换角色筛选。' }));
        return;
      }
      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '账号', width: 140, render: function (u) { return el('span', { class: 'mono', text: u.username }); } },
          { label: '姓名', width: 100, key: 'realName' },
          { label: '角色', width: 90, render: function (u) { return roleLabel(u.role); } },
          {
            label: '归属', width: 220, render: function (u) {
              // 账号列已经是学号/工号了，这里只给班级或院系，别重复
              if (u.role === 'STUDENT') return u.className || '未分班';
              if (u.role === 'TEACHER') return u.department || '—';
              return '—';
            }
          },
          {
            label: '手机', width: 130, render: function (u) {
              return el('span', { class: 'mono', text: u.phone || '—' });
            }
          },
          {
            label: '状态', width: 80, render: function (u) {
              return el('span', { class: 'tag ' + (u.status === 'ACTIVE' ? 'tag--ok' : 'tag--quiet'), text: u.status === 'ACTIVE' ? '正常' : '已停用' });
            }
          },
          {
            label: '操作', width: 170, align: 'right', render: function (u) {
              var wrap = el('div', { class: 'row-acts' });
              wrap.appendChild(el('button', {
                class: 'link-btn', attrs: { type: 'button' }, text: '重置密码',
                onClick: function (e) {
                  e.stopPropagation();
                  openResetPwd(u);
                }
              }));
              wrap.appendChild(el('button', {
                class: 'link-btn ' + (u.status === 'ACTIVE' ? 'link-btn--danger' : ''),
                attrs: { type: 'button' },
                text: u.status === 'ACTIVE' ? '停用' : '启用',
                onClick: function (e) {
                  e.stopPropagation();
                  toggleUser(u);
                }
              }));
              return wrap;
            }
          }
        ],
        rows: rows
      }));
    }

    function roleLabel(r) {
      return r === 'STUDENT' ? '学生' : r === 'TEACHER' ? '教师' : '管理员';
    }

    function toggleUser(u) {
      var next = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      act(api.put('/admin/users/' + u.id + '/status', { status: next }),
        next === 'ACTIVE' ? '已启用' : '已停用');
    }

    function openResetPwd(u) {
      openForm('重置密码 · ' + u.realName, [
        { key: 'newPassword', label: '新密码', type: 'password', placeholder: '至少 6 位', hint: '重置后请当面告知本人，系统不会发送短信' }
      ], '确认重置', function (v) {
        if ((v.newPassword || '').length < 6) throw new Error('密码至少 6 位');
        return act(api.put('/admin/users/' + u.id + '/password', { newPassword: v.newPassword }), '密码已重置');
      });
    }

    function openCreateUser() {
      var classes = (STORE.admin.classes || []).filter(function (c) { return c.status === 'ACTIVE'; });
      openForm('新建账号', [
        { key: 'role', label: '角色', type: 'select', options: [
          { value: 'STUDENT', label: '学生' },
          { value: 'TEACHER', label: '教师' },
          { value: 'ADMIN', label: '管理员' }
        ] },
        { key: 'username', label: '账号（学号 / 工号）', placeholder: '如 2023001001' },
        { key: 'realName', label: '姓名', placeholder: '真实姓名' },
        { key: 'phone', label: '手机号', placeholder: '选填' },
        { key: 'classId', label: '所属班级（学生必填）', type: 'select',
          options: [{ value: '', label: '— 非学生可留空 —' }].concat(classes.map(function (c) {
            return { value: c.id, label: c.className };
          })) },
        { key: 'teacherNo', label: '工号（教师必填）', placeholder: '如 T2023003' },
        { key: 'department', label: '院系（教师）', placeholder: '如 计算机学院' },
        { key: 'initialPassword', label: '初始密码', placeholder: '默认 123456' }
      ], '创建', function (v) {
        if (!v.username || !v.realName) throw new Error('账号与姓名必填');
        var body = {
          username: v.username, realName: v.realName, role: v.role,
          phone: v.phone, initialPassword: v.initialPassword || '123456'
        };
        if (v.role === 'STUDENT') {
          if (!v.classId) throw new Error('学生必须选择班级');
          body.classId = Number(v.classId);
          body.studentNo = v.username;
        }
        if (v.role === 'TEACHER') {
          if (!v.teacherNo) throw new Error('教师必须填工号');
          body.teacherNo = v.teacherNo;
          body.department = v.department;
        }
        return act(api.post('/admin/users', body), '账号已创建');
      });
    }

    paint();
  };

  /* ================= 1.5 学生管理 ================= */

  ADMIN.pages.adminStudents = function (page) {
    page.className = 'page page--scroll';

    var all = (STORE.admin.users || []).filter(function (u) { return u.role === 'STUDENT'; });
    var classes = (STORE.admin.classes || []).filter(function (c) { return c.status === 'ACTIVE'; });
    var state = { cls: '', kw: '' };

    page.appendChild(ui.pageHead({
      title: '学生管理',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 名学生' }),
        headBtn('新建学生', function () { openCreateStudent(); })
      ]
    }));

    function uniqClasses() {
      var m = {};
      all.forEach(function (u) { if (u.className) m[u.className] = 1; });
      return Object.keys(m);
    }

    page.appendChild(statStrip([
      { label: '学生总数', value: all.length },
      { label: '覆盖班级', value: uniqClasses().length },
      { label: '正常账号', value: all.filter(function (u) { return u.status === 'ACTIVE'; }).length },
      { label: '已停用', value: all.filter(function (u) { return u.status !== 'ACTIVE'; }).length, warn: all.some(function (u) { return u.status !== 'ACTIVE'; }) }
    ]));

    var bar = el('div', { class: 'tbl-toolbar' });
    var sel = el('select', { class: 'input input--filter' });
    sel.appendChild(el('option', { attrs: { value: '' }, text: '全部班级' }));
    uniqClasses().forEach(function (name) {
      sel.appendChild(el('option', { attrs: { value: name }, text: name }));
    });
    sel.addEventListener('change', function () { state.cls = sel.value; paint(); });
    bar.appendChild(sel);

    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索学号 / 姓名', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    function rows() {
      return all.filter(function (u) {
        if (state.cls && u.className !== state.cls) return false;
        if (!state.kw) return true;
        return (u.studentNo || u.username || '').indexOf(state.kw) >= 0 || (u.realName || '').indexOf(state.kw) >= 0;
      });
    }

    function paint() {
      var list = rows();
      box.innerHTML = '';
      if (!list.length) {
        box.appendChild(ui.empty({ art: 'assets/asset-stationery.png', title: '没有匹配的学生。', note: '换个班级或关键词试试。' }));
        return;
      }
      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '学号', width: 140, render: function (u) { return el('span', { class: 'mono', text: u.studentNo || u.username }); } },
          { label: '姓名', width: 110, key: 'realName' },
          { label: '班级', render: function (u) { return u.className || el('span', { class: 'cell-sub', text: '未分班' }); } },
          { label: '手机', width: 136, render: function (u) { return el('span', { class: 'mono cell-sub', text: u.phone || '—' }); } },
          {
            label: '状态', width: 86, render: function (u) {
              return el('span', { class: 'tag ' + (u.status === 'ACTIVE' ? 'tag--ok' : 'tag--quiet'), text: u.status === 'ACTIVE' ? '正常' : '已停用' });
            }
          },
          {
            label: '操作', width: 168, align: 'right', render: function (u) {
              var wrap = el('div', { class: 'row-acts' });
              wrap.appendChild(el('button', {
                class: 'link-btn', attrs: { type: 'button' }, text: '重置密码',
                onClick: function (e) {
                  e.stopPropagation();
                  openForm('重置密码 · ' + u.realName, [
                    { key: 'newPassword', label: '新密码', type: 'password', placeholder: '至少 6 位', hint: '重置后请当面告知本人' }
                  ], '确认重置', function (v) {
                    if ((v.newPassword || '').length < 6) throw new Error('密码至少 6 位');
                    return act(api.put('/admin/users/' + u.id + '/password', { newPassword: v.newPassword }), '密码已重置');
                  });
                }
              }));
              wrap.appendChild(el('button', {
                class: 'link-btn ' + (u.status === 'ACTIVE' ? 'link-btn--danger' : ''),
                attrs: { type: 'button' },
                text: u.status === 'ACTIVE' ? '停用' : '启用',
                onClick: function (e) {
                  e.stopPropagation();
                  act(api.put('/admin/users/' + u.id + '/status', { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
                    u.status === 'ACTIVE' ? '已停用' : '已启用');
                }
              }));
              return wrap;
            }
          }
        ],
        rows: list
      }));
    }

    function openCreateStudent() {
      openForm('新建学生', [
        { key: 'username', label: '学号', placeholder: '如 2023001005' },
        { key: 'realName', label: '姓名' },
        { key: 'classId', label: '班级', type: 'select', options: classes.map(function (c) {
          return { value: c.id, label: c.className };
        }) },
        { key: 'phone', label: '手机号', placeholder: '选填' },
        { key: 'initialPassword', label: '初始密码', placeholder: '默认 123456' }
      ], '创建', function (v) {
        if (!v.username || !v.realName) throw new Error('学号与姓名必填');
        if (!v.classId) throw new Error('必须选择班级');
        return act(api.post('/admin/users', {
          username: v.username, realName: v.realName, role: 'STUDENT',
          studentNo: v.username, classId: Number(v.classId),
          phone: v.phone, initialPassword: v.initialPassword || '123456'
        }), '学生已创建');
      });
    }

    paint();
  };

  /* ================= 1.6 教师管理 ================= */

  ADMIN.pages.adminTeachers = function (page) {
    page.className = 'page page--scroll';

    var all = (STORE.admin.users || []).filter(function (u) { return u.role === 'TEACHER'; });
    var bindings = STORE.admin.bindings || [];
    var classes = (STORE.admin.classes || []).filter(function (c) { return c.status === 'ACTIVE'; });
    var state = { kw: '' };

    /* 注意：teacher-classes 的 teacherId 是 teacher_profile.id，
       users 列表的 id 是 user.id，两者不是一套主键，不能直接比。
       用工号（teacher_no，唯一）对齐最稳。 */
    function classesOf(u) {
      if (!u.teacherNo) return [];
      return bindings.filter(function (b) { return b.teacherNo === u.teacherNo; });
    }

    page.appendChild(ui.pageHead({
      title: '教师管理',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 名教师' }),
        headBtn('新建教师', function () { openCreateTeacher(); })
      ]
    }));

    var noClass = all.filter(function (t) { return classesOf(t).length === 0; }).length;
    page.appendChild(statStrip([
      { label: '教师总数', value: all.length },
      { label: '已带班', value: all.length - noClass },
      { label: '未带班', value: noClass, warn: noClass > 0 },
      { label: '绑定关系', value: bindings.length }
    ]));

    var bar = el('div', { class: 'tbl-toolbar' });
    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索工号 / 姓名 / 院系', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    function paint() {
      var list = all.filter(function (u) {
        if (!state.kw) return true;
        return [u.teacherNo, u.realName, u.department].some(function (x) {
          return (x || '').indexOf(state.kw) >= 0;
        });
      });
      box.innerHTML = '';
      if (!list.length) {
        box.appendChild(ui.empty({ art: 'assets/asset-stationery.png', title: '没有匹配的教师。', note: '换个关键词试试。' }));
        return;
      }
      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '工号', width: 130, render: function (u) { return el('span', { class: 'mono', text: u.teacherNo || u.username }); } },
          { label: '姓名', width: 110, key: 'realName' },
          { label: '院系', width: 170, render: function (u) { return u.department || '—'; } },
          {
            label: '负责班级', render: function (u) {
              var bs = classesOf(u);
              if (!bs.length) return el('span', { class: 'cell-sub', text: '未绑定班级' });
              return el('span', { class: 'cell-2' }, bs.map(function (b) {
                return el('span', { class: 'chk-chip', text: b.className });
              }));
            }
          },
          { label: '手机', width: 136, render: function (u) { return el('span', { class: 'mono cell-sub', text: u.phone || '—' }); } },
          {
            label: '操作', width: 168, align: 'right', render: function (u) {
              var wrap = el('div', { class: 'row-acts' });
              wrap.appendChild(el('button', {
                class: 'link-btn', attrs: { type: 'button' }, text: '重置密码',
                onClick: function (e) {
                  e.stopPropagation();
                  openForm('重置密码 · ' + u.realName, [
                    { key: 'newPassword', label: '新密码', type: 'password', placeholder: '至少 6 位' }
                  ], '确认重置', function (v) {
                    if ((v.newPassword || '').length < 6) throw new Error('密码至少 6 位');
                    return act(api.put('/admin/users/' + u.id + '/password', { newPassword: v.newPassword }), '密码已重置');
                  });
                }
              }));
              wrap.appendChild(el('button', {
                class: 'link-btn ' + (u.status === 'ACTIVE' ? 'link-btn--danger' : ''),
                attrs: { type: 'button' },
                text: u.status === 'ACTIVE' ? '停用' : '启用',
                onClick: function (e) {
                  e.stopPropagation();
                  act(api.put('/admin/users/' + u.id + '/status', { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
                    u.status === 'ACTIVE' ? '已停用' : '已启用');
                }
              }));
              return wrap;
            }
          }
        ],
        rows: list
      }));
    }

    function openCreateTeacher() {
      openForm('新建教师', [
        { key: 'teacherNo', label: '工号', placeholder: '如 T2023005' },
        { key: 'realName', label: '姓名' },
        { key: 'department', label: '院系', placeholder: '如 计算机学院' },
        { key: 'phone', label: '手机号', placeholder: '选填' },
        { key: 'initialPassword', label: '初始密码', placeholder: '默认 123456' }
      ], '创建', function (v) {
        if (!v.teacherNo || !v.realName) throw new Error('工号与姓名必填');
        return act(api.post('/admin/users', {
          username: v.teacherNo, realName: v.realName, role: 'TEACHER',
          teacherNo: v.teacherNo, department: v.department,
          phone: v.phone, initialPassword: v.initialPassword || '123456'
        }), '教师已创建');
      });
    }

    paint();
  };

  /* ================= 2. 班级 ================= */

  ADMIN.pages.adminClasses = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.classes) || [];

    page.appendChild(ui.pageHead({
      title: '班级',
      right: [
        el('div', { class: 'page-meta', text: '共 ' + all.length + ' 个' }),
        headBtn('新建班级', function () {
          openForm('新建班级', [
            { key: 'className', label: '班级名称', placeholder: '如 计算机科学与技术3班' },
            { key: 'classCode', label: '班级编码', placeholder: '如 CS2303，唯一' },
            { key: 'major', label: '专业', placeholder: '选填' },
            { key: 'grade', label: '年级', placeholder: '如 2023' }
          ], '创建', function (v) {
            if (!v.className || !v.classCode) throw new Error('名称与编码必填');
            return act(api.post('/admin/classes', v), '班级已创建');
          });
        })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({ title: '还没有班级。', note: '先建班级，再给学生开户并绑定辅导员。' }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'id',
      cols: [
        { label: '班级', render: function (c) { return c.className; } },
        { label: '编码', width: 110, render: function (c) { return el('span', { class: 'mono', text: c.classCode }); } },
        { label: '专业', width: 160, render: function (c) { return c.major || '—'; } },
        { label: '年级', width: 80, render: function (c) { return c.grade || '—'; } },
        {
          label: '学生数', width: 90, align: 'right', render: function (c) {
            return el('span', { class: 'mono', text: String(c.studentCount) });
          }
        },
        {
          label: '辅导员', width: 150, render: function (c) {
            return c.teacherName ? c.teacherName : el('span', { class: 'cell-sub', text: '未绑定' });
          }
        },
        {
          label: '状态', width: 80, render: function (c) {
            return el('span', {
              class: 'tag ' + (c.status === 'ACTIVE' ? 'tag--ok' : 'tag--quiet'),
              text: c.status === 'ACTIVE' ? '启用' : '停用'
            });
          }
        },
        {
          label: '操作', width: 100, align: 'right', render: function (c) {
            return el('button', {
              class: 'link-btn link-btn--danger', attrs: { type: 'button' }, text: '停用',
              onClick: function (e) {
                e.stopPropagation();
                if (!confirm('停用后该班级不再出现在开户列表里。班上有学生时会被拒绝。确认停用？')) return;
                act(api.del('/admin/classes/' + c.id), '已停用');
              }
            });
          }
        }
      ],
      rows: all
    }));
  };

  /* ================= 3. 辅导员绑定 ================= */

  ADMIN.pages.adminBindings = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.bindings) || [];
    var classes = (STORE.admin && STORE.admin.classes) || [];
    var teachers = ((STORE.admin && STORE.admin.users) || []).filter(function (u) { return u.role === 'TEACHER'; });
    var unbound = classes.filter(function (c) {
      return !all.some(function (b) { return b.classId === c.id; });
    });

    page.appendChild(ui.pageHead({
      title: '辅导员绑定',
      right: [
        el('div', { class: 'page-meta', text: all.length + ' 条绑定 · ' + unbound.length + ' 个班级未绑定' }),
        headBtn('新增绑定', function () {
          if (!unbound.length) { toast('所有班级都已绑定辅导员'); return; }
          openForm('绑定辅导员', [
            { key: 'teacherId', label: '教师', type: 'select', options: teachers.map(function (t) {
              return { value: t.id, label: t.realName + '（' + (t.teacherNo || t.username) + '）' };
            }) },
            { key: 'classId', label: '班级', type: 'select', options: unbound.map(function (c) {
              return { value: c.id, label: c.className };
            }) },
          ], '绑定', function (v) {
            if (!v.teacherId || !v.classId) throw new Error('教师与班级都要选');
            return act(api.post('/admin/teacher-classes', {
              teacherId: Number(v.teacherId), classId: Number(v.classId)
            }), '已绑定');
          });
        })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({
        title: '还没有绑定关系。',
        note: '班级没有辅导员时，该班学生提交请假会被直接拒绝（42204）。'
      }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'id',
      cols: [
        { label: '教师', render: function (b) { return b.teacherName; } },
        { label: '工号', width: 120, render: function (b) { return el('span', { class: 'mono', text: b.teacherNo || '—' }); } },
        { label: '负责班级', render: function (b) { return b.className; } },
        {
          label: '绑定时间', width: 150, render: function (b) {
            return el('span', { class: 'mono cell-sub', text: b.createdAt || '—' });
          }
        },
        {
          label: '操作', width: 100, align: 'right', render: function (b) {
            return el('button', {
              class: 'link-btn link-btn--danger', attrs: { type: 'button' }, text: '解绑',
              onClick: function (e) {
                e.stopPropagation();
                if (!confirm('解绑后 ' + b.className + ' 的学生将无法提交申请，确认？')) return;
                act(api.del('/admin/teacher-classes/' + b.id), '已解绑');
              }
            });
          }
        }
      ],
      rows: all
    }));
  };

  /* ================= 3.5 请假规则 ================= */

  ADMIN.pages.adminRules = function (page) {
    page.className = 'page page--scroll';

    var configs = (STORE.admin && STORE.admin.configs) || [];

    page.appendChild(ui.pageHead({
      title: '请假规则',
      right: [el('div', { class: 'page-meta', text: '改完立即生效 · 数值写错会影响销假判定' })]
    }));

    /* 按用途分组：销假判定相关的参数单独一组，避免和演示开关混在一起 */
    var GROUPS = [
      {
        title: '定位与销假',
        desc: '离校请假销假时会用校区坐标 + 半径判定是否在校外，改错会导致销假一律失败。',
        keys: ['CAMPUS_CENTER_LAT', 'CAMPUS_CENTER_LNG', 'OFF_CAMPUS_CHECK_RADIUS_M']
      },
      {
        title: '提醒与超时',
        desc: '控制请假开始前的提醒时机、逾期判定的宽限窗口。',
        keys: ['START_REMINDER_WINDOW_MINUTES', 'OVERDUE_GRACE_MINUTES', 'EXTENSION_MAX_COUNT']
      },
      {
        title: '演示开关',
        desc: '仅供答辩演示使用，正式使用请保持关闭。',
        keys: ['MOCK_LOCATION']
      }
    ];

    var used = {};
    GROUPS.forEach(function (g) { g.keys.forEach(function (k) { used[k] = 1; }); });
    var rest = configs.filter(function (c) { return !used[c.key]; });
    if (rest.length) {
      GROUPS.push({ title: '其他', desc: '未归类的配置项。', keys: rest.map(function (c) { return c.key; }) });
    }

    var byKey = {};
    configs.forEach(function (c) { byKey[c.key] = c; });

    GROUPS.forEach(function (g) {
      var items = g.keys.map(function (k) { return byKey[k]; }).filter(Boolean);
      if (!items.length) return;

      var card = el('div', { class: 'wb-card ah-rule-card' }, [
        el('div', { class: 'wb-card-head' }, [
          el('span', { class: 'wb-card-title', text: g.title })
        ]),
        el('div', { class: 'ah-rule-desc', text: g.desc })
      ]);

      items.forEach(function (c) {
        var input = el('input', {
          class: 'input input--inline',
          attrs: { value: c.value, autocomplete: 'off' }
        });
        var save = function () {
          var v = (input.value || '').trim();
          if (v === c.value) return;
          input.classList.add('is-saving');
          api.put('/admin/configs/' + encodeURIComponent(c.key), { configValue: v })
            .then(function () {
              input.classList.remove('is-saving');
              input.classList.add('is-saved');
              c.value = v;
              setTimeout(function () { input.classList.remove('is-saved'); }, 900);
            })
            .catch(function (e) {
              input.classList.remove('is-saving');
              input.classList.add('is-err');
              alert('保存失败：' + (e.message || ''));
              input.value = c.value;
              setTimeout(function () { input.classList.remove('is-err'); }, 900);
            });
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        });

        card.appendChild(el('div', { class: 'ah-rule-row' }, [
          el('div', { class: 'ah-rule-key' }, [
            el('span', { class: 'mono cfg-key', text: c.key }),
            el('span', { class: 'ah-rule-label', text: c.description || '' })
          ]),
          input
        ]));
      });

      page.appendChild(card);
    });

    if (!configs.length) {
      page.appendChild(el('div', { class: 'wb-card' }, [
        ui.empty({ art: 'assets/asset-stationery.png', title: '没有配置项。', note: '检查 system_config 表是否已初始化。' })
      ]));
    }
  };

  /* ================= 4. 系统配置 ================= */

  ADMIN.pages.adminConfigs = function (page) {
    page.className = 'page page--scroll';
    var all = (STORE.admin && STORE.admin.configs) || [];

    page.appendChild(ui.pageHead({
      title: '系统配置',
      right: [
        el('div', { class: 'page-meta', text: '改完立即生效 · 数值型配置写错会直接影响销假判定' })
      ]
    }));

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    if (!all.length) {
      box.appendChild(ui.empty({ title: '没有配置项。', note: '检查 system_config 表是否已初始化。' }));
      return;
    }

    box.appendChild(ui.table({
      rowKey: 'key',
      cols: [
        { label: '配置项', width: 296, render: function (c) { return el('span', { class: 'mono cfg-key', text: c.key }); } },
        { label: '说明', render: function (c) { return c.description || '—'; } },
        { label: '类型', width: 104, render: function (c) { return c.type || '—'; } },
        {
          label: '值', width: 200, render: function (c) {
            var input = el('input', {
              class: 'input input--inline',
              attrs: { value: c.value, autocomplete: 'off' },
              dataset: { key: c.key }
            });
            var save = function () {
              var v = (input.value || '').trim();
              if (v === c.value) return;
              input.classList.add('is-saving');
              api.put('/admin/configs/' + encodeURIComponent(c.key), { configValue: v })
                .then(function () {
                  input.classList.remove('is-saving');
                  input.classList.add('is-saved');
                  c.value = v;
                  setTimeout(function () { input.classList.remove('is-saved'); }, 900);
                })
                .catch(function (e) {
                  input.classList.remove('is-saving');
                  input.classList.add('is-err');
                  alert('保存失败：' + (e.message || ''));
                  input.value = c.value;
                  setTimeout(function () { input.classList.remove('is-err'); }, 900);
                });
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });
            return input;
          }
        },
        {
          label: '更新时间', width: 140, render: function (c) {
            return el('span', { class: 'mono cell-sub', text: c.updatedAt || '—' });
          }
        }
      ],
      rows: all
    }));
  };
})();

/* ============================================================
   pages/workbench.js —— 教师工作台（对照设计稿逐项复刻）

   结构（和设计稿一致）：
   ┌ 左主区 ──────────────────────────────┐ ┌ 右栏 ──────┐
   │ 问候                                  │ │ 欢迎卡     │
   │ 待办横幅                              │ │ 快捷统计   │
   │ ┌ 白卡：tab + 待办列表（细线分隔）  ┐ │ │ 今日概况   │
   │ └────────────────────────────────────┘ │ └───────────┘
   │ ┌ 白卡：最近处理 ───────────────────┐ │
   └───────────────────────────────────────┘
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;
  var icon = ui.icon;

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function parseDT(s) {
    if (!s) return null;
    var d = new Date(String(s).replace(' ', 'T') + ':00');
    return isNaN(d.getTime()) ? null : d;
  }

  function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function dayLabel(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  /** 设计稿两端都写日期：10月22日 11:30 — 10月22日 12:30 */
  function rangeText(start, end) {
    var s = parseDT(start), e = parseDT(end);
    if (!s || !e) return '';
    return dayLabel(s) + ' ' + hm(s) + ' — ' + dayLabel(e) + ' ' + hm(e);
  }

  /** 最近处理用紧凑写法：10.21 08:00 — 18:00 */
  function recentTime(start, end) {
    var s = parseDT(start), e = parseDT(end);
    if (!s || !e) return '';
    var d = function (x) { return pad2(x.getMonth() + 1) + '.' + pad2(x.getDate()); };
    if (s.toDateString() === e.toDateString()) {
      return d(s) + ' ' + hm(s) + ' — ' + hm(e);
    }
    return d(s) + ' ' + hm(s) + ' — ' + d(e) + ' ' + hm(e);
  }

  function waitText(from) {
    var t = parseDT(from);
    if (!t) return '';
    var mins = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
    if (mins < 1) return '刚刚提交';
    if (mins < 60) return '已等待 ' + mins + ' 分钟';
    if (mins < 1440) return '已等待 ' + Math.floor(mins / 60) + ' 小时';
    return '已等待 ' + Math.floor(mins / 1440) + ' 天';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /** 头像：优先 assets/avatar-{n}.png，加载失败回退姓名首字 */
  function avatarOf(name, seed) {
    var box = el('span', { class: 'todo-avatar' }, [
      el('span', { text: (name || '?').slice(0, 1) })
    ]);
    var n = (Math.abs(seed || 1) % 4) + 1;
    var img = el('img', { attrs: { src: 'assets/avatar-' + n + '.png', alt: '' } });
    img.addEventListener('error', function () { img.remove(); });
    box.appendChild(img);
    return box;
  }

  function pillLabel(status) {
    var map = {
      APPROVED: '已通过', COMPLETED: '已销假', REJECTED: '已驳回',
      CANCELLED: '已取消', WITHDRAWN: '已撤回', PENDING: '待审批'
    };
    return map[status] || status;
  }

  function pillTone(status) {
    if (status === 'COMPLETED' || status === 'APPROVED') return 'pill--green';
    if (status === 'REJECTED') return 'pill--red';
    if (status === 'PENDING') return 'pill--amber';
    return 'pill--gray';
  }


  /* ================= 个人信息 ================= */
  ADMIN.pages.profile = function (page) {
    page.className = 'page page--scroll';

    var t = STORE.teacher || {};
    var st = STORE.stats || {};
    var cls = t.classList || [];

    page.appendChild(ui.pageHead({
      title: '个人信息',
      right: [el('div', { class: 'page-meta', text: '账号与带班信息由管理员维护' })]
    }));

    var root = el('div', { class: 'pf' });

    /* 资料卡 */
    var card = el('div', { class: 'wb-card pf-card' });
    var head = el('div', { class: 'pf-head' });
    var av = el('span', { class: 'pf-avatar' }, [el('span', { text: (t.name || '?').slice(0, 1) })]);
    var avImg = el('img', { attrs: { src: 'assets/avatar-teacher.png', alt: '' } });
    avImg.addEventListener('error', function () { avImg.remove(); });
    av.appendChild(avImg);
    head.appendChild(av);
    head.appendChild(el('div', {}, [
      el('div', { class: 'pf-name', text: t.name || '—' }),
      el('div', { class: 'pf-sub', text: (t.no || '—') + ' · ' + (t.department || '未填写院系') })
    ]));
    card.appendChild(head);

    [
      ['工号', t.no || '—'],
      ['姓名', t.name || '—'],
      ['院系', t.department || '—'],
      ['手机', t.phone || '—']
    ].forEach(function (kv) {
      card.appendChild(el('div', { class: 'pf-row' }, [
        el('span', { class: 'pf-k', text: kv[0] }),
        el('span', { class: 'pf-v', text: kv[1] })
      ]));
    });
    root.appendChild(card);

    /* 带班 */
    var clsCard = el('div', { class: 'wb-card pf-card' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '负责班级' }),
        el('span', { class: 'wb-card-more', text: cls.length + ' 个' })
      ])
    ]);
    if (cls.length) {
      var chips = el('div', { class: 'pf-chips' });
      cls.forEach(function (c) {
        chips.appendChild(el('span', { class: 'chk-chip', text: c.name }));
      });
      clsCard.appendChild(chips);
    } else {
      clsCard.appendChild(el('div', { class: 'pf-empty', text: '还没有绑定班级，请联系管理员分配。' }));
    }
    root.appendChild(clsCard);

    /* 数据概览 */
    var statCard = el('div', { class: 'wb-card pf-card' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '我的数据' }),
        el('a', { class: 'wb-card-more', href: '#/records', text: '去记录页 ›' })
      ])
    ]);
    [
      { label: '累计申请', value: st.totalApplications || 0, cls: '' },
      { label: '已批准', value: st.approved || 0, cls: 'ok' },
      { label: '已完成', value: st.completed || 0, cls: '' },
      { label: '当前逾期', value: st.overdue || 0, cls: 'bad' }
    ].forEach(function (s2) {
      statCard.appendChild(el('div', { class: 'stat-line' }, [
        el('span', { text: s2.label }),
        el('b', { class: s2.cls, text: String(s2.value) })
      ]));
    });
    root.appendChild(statCard);

    page.appendChild(root);
  };

  ADMIN.pages.workbench = function (page) {
    page.className = 'page page--scroll';

    var wb = STORE.workbench || {};
    var apps = STORE.apps || [];

    var pendingApps = apps.filter(function (a) { return a.status === 'PENDING'; });
    var reviewApps = apps.filter(function (a) {
      return (a.checkins || []).some(function (c) { return c.review === 'PENDING_REVIEW'; });
    });
    var soonApps = apps.filter(function (a) { return a.effective === 'WAITING_START'; });

    var state = { tab: 'pending' };

    var root = el('div', { class: 'wb' });
    var main = el('div', { class: 'wb-main' });
    var side = el('div', { class: 'wb-side' });
    root.appendChild(main);
    root.appendChild(side);
    page.appendChild(root);

    /* ---------- 问候 ---------- */
    var now = new Date();
    main.appendChild(el('div', { class: 'wb-greet' }, [
      el('h1', { text: greeting() + '，' + (STORE.teacher.name || '老师') }),
      el('div', {
        class: 'wb-date',
        text: (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEK[now.getDay()]
      })
    ]));

    /* ---------- 待办横幅 ---------- */
    main.appendChild(el('div', { class: 'wb-banner' }, [
      el('span', { class: 'wb-banner-icon' }, [icon('clipboard')]),
      el('div', { class: 'wb-banner-text' }, [
        el('div', { class: 'wb-banner-title' }, [
          el('span', { text: '今天有 ' }),
          el('b', { text: String(pendingApps.length) }),
          el('span', { text: ' 条申请需要你处理' })
        ]),
        el('div', { class: 'wb-banner-sub', text: '请及时查看并完成审批' })
      ]),
      el('button', {
        class: 'btn btn--primary btn--sm',
        attrs: { type: 'button' },
        text: '查看全部 ›',
        onClick: function () { location.hash = '#/pending'; }
      })
    ]));

    /* ---------- 白卡：tab + 待办列表 ---------- */
    var panel = el('div', { class: 'wb-card wb-panel' });

    var TABS = [
      { key: 'pending', label: '待审批', count: pendingApps.length },
      { key: 'review', label: '异常核验', count: reviewApps.length },
      { key: 'soon', label: '近期关注', count: 0 }
    ];
    var tabs = el('div', { class: 'wb-tabs' });
    TABS.forEach(function (t) {
      tabs.appendChild(el('button', {
        class: 'wb-tab' + (t.key === state.tab ? ' is-on' : ''),
        attrs: { type: 'button' },
        dataset: { key: t.key },
        onClick: function () {
          state.tab = t.key;
          Array.prototype.forEach.call(tabs.children, function (n) {
            n.classList.toggle('is-on', n.dataset.key === t.key);
          });
          paintList();
        }
      }, [
        el('span', { text: t.label }),
        t.count ? el('em', { text: String(t.count) }) : null
      ]));
    });
    panel.appendChild(tabs);

    var listBox = el('div', { class: 'wb-list' });
    panel.appendChild(listBox);
    main.appendChild(panel);

    /* ---------- 待办行：头像 | 人 | 时间 | 状态 | 按钮 ---------- */
    function todoRow(a, isReview) {
      return el('div', { class: 'todo' }, [
        avatarOf(a.studentName, a.studentId || a.id),
        el('div', { class: 'todo-who' }, [
          el('div', { class: 'todo-name-row' }, [
            el('span', { class: 'todo-name', text: a.studentName }),
            el('span', { class: 'todo-type', text: a.scene + ' · ' + a.type })
          ]),
          el('div', { class: 'todo-cls', text: a.className || '' }),
          el('div', {
            class: 'todo-sub',
            text: '提交于 ' + String(a.submittedAt || '').slice(11, 16)
          })
        ]),
        el('div', { class: 'todo-time', text: rangeText(a.start, a.end) }),
        el('div', { class: 'todo-state' }, [
          isReview
            ? el('span', { class: 'pill pill--red', text: '异常核验' })
            : el('span', { class: 'pill pill--amber', text: '待审批' }),
          el('div', {
            class: 'todo-wait',
            text: isReview ? '需核验定位信息' : waitText(a.submittedAt)
          })
        ]),
        el('div', { class: 'todo-acts' }, [
          el('button', {
            class: 'btn btn--ghost btn--sm',
            attrs: { type: 'button' },
            text: '查看',
            onClick: function () { location.hash = '#/pending/' + a.id; }
          }),
          el('button', {
            class: 'btn btn--primary btn--sm',
            attrs: { type: 'button' },
            text: isReview ? '处理' : '审批',
            onClick: function () { location.hash = (isReview ? '#/review/' : '#/pending/') + a.id; }
          })
        ])
      ]);
    }

    function paintList() {
      listBox.innerHTML = '';
      var isReview = state.tab === 'review';
      var rows = isReview ? reviewApps : state.tab === 'soon' ? soonApps : pendingApps;

      if (!rows.length) {
        listBox.appendChild(ui.empty({
          art: 'assets/asset-stationery.png',
          title: state.tab === 'pending' ? '没有待审批的申请。' : '这一栏目前是空的。',
          note: state.tab === 'pending'
            ? '新的申请提交后会出现在这里。'
            : '切到「待审批」看看还有没有要处理的。'
        }));
        return;
      }
      rows.slice(0, 6).forEach(function (a) { listBox.appendChild(todoRow(a, isReview)); });
    }
    paintList();

    /* ---------- 白卡：最近处理 ---------- */
    var recent = wb.recentProcessed || [];
    var recentCard = el('div', { class: 'wb-card wb-recent' }, [
      el('div', { class: 'wb-card-head' }, [
        el('span', { class: 'wb-card-title', text: '最近处理' }),
        el('a', { class: 'wb-card-more', href: '#/records', text: '查看全部 ›' })
      ])
    ]);
    if (recent.length) {
      recentCard.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '学生', width: 120, render: function (a) { return a.studentName; } },
          { label: '类型 · 场景', width: 130, render: function (a) { return a.type + ' · ' + a.scene; } },
          {
            label: '时间', width: 240, render: function (a) {
              return el('span', { class: 'wb-time', text: recentTime(a.start, a.end) });
            }
          },
          {
            label: '状态', width: 96, render: function (a) {
              return el('span', { class: 'pill ' + pillTone(a.status), text: pillLabel(a.status) });
            }
          }
        ],
        rows: recent.slice(0, 4)
      }));
    } else {
      recentCard.appendChild(ui.empty({
        art: 'assets/asset-stationery.png',
        title: '还没有处理记录。',
        note: '审批过的申请会出现在这里。'
      }));
    }
    main.appendChild(recentCard);

    /* ---------- 右栏：3 张独立卡 ---------- */
    // 现在的素材换成管理员端那只没有气泡的熊，文案改回代码渲染
    side.appendChild(el('div', { class: 'welcome-card' }, [
      el('div', { class: 'welcome-text' }, [
        el('div', { text: '辛苦了，' }),
        el('div', { text: '老师！' })
      ]),
      el('div', { class: 'welcome-art' })
    ]));

    var quick = el('div', { class: 'wb-card side-card' }, [
      el('div', { class: 'side-card-title', text: '快捷统计' })
    ]);
    [
      { label: '待审批', value: pendingApps.length, ico: 'clipboard', href: '#/pending' },
      { label: '在假', value: wb.inProgressCount || 0, ico: 'calendar-clock', href: '#/records' },
      { label: '待核验', value: reviewApps.length, ico: 'checklist', href: '#/review', warn: reviewApps.length > 0 },
      { label: '待处理续假', value: wb.pendingExtensionCount || 0, ico: 'book', href: '#/pending/ext' }
    ].forEach(function (q) {
      quick.appendChild(el('a', { class: 'quick-row', href: q.href }, [
        ui.pngIcon(q.ico, 16),
        el('span', { text: q.label }),
        el('span', { class: 'q-val' + (q.warn ? ' q-val--warn' : ''), text: String(q.value) }),
        el('span', { class: 'q-arrow' }, [icon('chevron')])
      ]));
    });
    side.appendChild(quick);

    var ts = wb.todayStats || { processed: 0, approved: 0, rejected: 0, cancelled: 0 };
    var today = el('div', { class: 'wb-card side-card' }, [
      el('div', { class: 'side-card-title', text: '今日概况' })
    ]);
    [
      { label: '今日已处理', value: ts.processed, cls: '' },
      { label: '已通过', value: ts.approved, cls: 'ok' },
      { label: '已取回', value: ts.rejected, cls: 'bad' },
      { label: '已取消', value: ts.cancelled, cls: '' }
    ].forEach(function (s) {
      today.appendChild(el('div', { class: 'stat-line' }, [
        el('span', { text: s.label }),
        el('b', { class: s.cls, text: String(s.value) })
      ]));
    });
    side.appendChild(today);
  };
})();

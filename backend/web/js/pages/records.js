/* ============================================================
   pages/records.js —— 申请记录 / 学生台账

   这两屏在上一版里是占位页（"下一阶段实现"）。M4 把它们补成真表格：
   数据直接来自 window.STORE（api.loadStore 一次性拉好的），
   筛选与排序都在内存里做 —— 学院量级（几百条）完全够用，
   等到几千条再换后端分页。

   放在 detail.js 之后加载，用于覆盖那里的占位实现。
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  /* ---------------- 申请记录 ---------------- */

  var FILTERS = [
    { key: 'all', label: '全部', test: function () { return true; } },
    { key: 'pending', label: '待审批', test: function (a) { return a.status === 'PENDING'; } },
    { key: 'active', label: '在假', test: function (a) { return a.effective === 'IN_PROGRESS' || a.effective === 'WAITING_START'; } },
    { key: 'overdue', label: '逾期', test: function (a) { return a.effective === 'OVERDUE'; } },
    { key: 'closed', label: '已结束', test: function (a) { return ['COMPLETED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'].indexOf(a.status) >= 0; } }
  ];

  ADMIN.pages.records = function (page, ctx) {
    var id = ctx.params && ctx.params.id;

    // 详情子路由：复用 detail.js 的渲染器
    if (id) {
      var app = ADMIN.store.appById(id);
      page.className = 'page page--scroll';
      if (!app) {
        page.appendChild(ui.pageHead({ title: '申请详情' }));
        page.appendChild(ui.empty({
          title: '这条申请不在当前数据里。',
          note: '可能已被撤回、已删除，或不在你负责的班级范围内。'
        }));
        return;
      }
      ADMIN.shell.crumbs([
        { label: '申请记录', href: '#/records' },
        { label: app.studentName + ' · ' + app.type }
      ]);
      page.appendChild(ui.pageHead({ title: app.studentName + ' · ' + app.type, meta: app.no }));
      page.appendChild(ADMIN.detail.render(app, { type: 'records' }));
      return;
    }

    page.className = 'page page--scroll';

    var state = { filter: 'all', kw: '' };
    var all = STORE.apps || [];

    var head = ui.pageHead({ title: '申请记录', meta: '共 ' + all.length + ' 条 · 仅含你负责的班级' });
    page.appendChild(head);

    var bar = el('div', { class: 'tbl-toolbar' });
    var tabs = el('div', { class: 'seg' });
    var search = el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索学生姓名 / 学号', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    });
    bar.appendChild(tabs);
    bar.appendChild(search);
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    FILTERS.forEach(function (f) {
      tabs.appendChild(el('button', {
        class: 'seg-item' + (f.key === state.filter ? ' is-on' : ''),
        attrs: { type: 'button' },
        dataset: { key: f.key },
        text: f.label,
        onClick: function () {
          state.filter = f.key;
          Array.prototype.forEach.call(tabs.children, function (n) {
            n.classList.toggle('is-on', n.dataset.key === f.key);
          });
          paint();
        }
      }));
    });

    function paint() {
      var f = FILTERS.filter(function (x) { return x.key === state.filter; })[0] || FILTERS[0];
      var kw = state.kw;
      var rows = all.filter(function (a) {
        if (!f.test(a)) return false;
        if (!kw) return true;
        return (a.studentName || '').indexOf(kw) >= 0 || (a.studentNo || '').indexOf(kw) >= 0;
      });

      box.innerHTML = '';
      if (!rows.length) {
        box.appendChild(ui.empty({
          title: '没有符合条件的记录。',
          note: kw ? '换个关键词试试，或切回「全部」。' : '当前筛选下暂无数据。'
        }));
        return;
      }

      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '提交时间', width: 148, render: function (a) { return el('span', { class: 'mono', text: a.submittedAt || '—' }); } },
          {
            label: '学生', width: 150, render: function (a) {
              return el('div', { class: 'cell-2' }, [
                el('div', { text: a.studentName }),
                el('div', { class: 'cell-sub mono', text: a.studentNo })
              ]);
            }
          },
          { label: '班级', width: 196, key: 'className' },
          {
            label: '类型', width: 102, render: function (a) {
              return a.scene + ' · ' + a.type;
            }
          },
          {
            label: '请假区间', render: function (a) {
              // 同一天只写一次日期：'10-22 11:30 → 12:30'，否则整行太长被截断
              var s0 = a.start || '', e0 = a.end || '';
              var sameDay = s0.slice(0, 10) === e0.slice(0, 10);
              var text = sameDay
                ? s0.slice(5) + ' → ' + e0.slice(11)
                : s0.slice(5) + ' → ' + e0.slice(5);
              return el('span', { class: 'mono', text: text });
            }
          },
          {
            label: '状态', width: 96, align: 'right', render: function (a) {
              return ui.statusTag(a);
            }
          }
        ],
        rows: rows,
        onRowClick: function (a) { location.hash = '#/records/' + a.id; }
      }));
    }

    paint();
  };

  /* ---------------- 学生台账 ---------------- */

  ADMIN.pages.students = function (page) {
    page.className = 'page page--scroll';
    var all = STORE.students || [];

    page.appendChild(ui.pageHead({
      title: '学生',
      meta: '共 ' + all.length + ' 人 · ' + (STORE.teacher.classes || []).join(' / ')
    }));

    var state = { kw: '' };
    var bar = el('div', { class: 'tbl-toolbar' });
    bar.appendChild(el('input', {
      class: 'input input--search',
      attrs: { type: 'search', placeholder: '搜索姓名 / 学号', autocomplete: 'off' },
      onInput: function (e) { state.kw = e.target.value.trim(); paint(); }
    }));
    page.appendChild(bar);

    var box = el('div', { class: 'tbl-wrap' });
    page.appendChild(box);

    function paint() {
      var kw = state.kw;
      var rows = all.filter(function (s) {
        if (!kw) return true;
        return (s.name || '').indexOf(kw) >= 0 || (s.no || '').indexOf(kw) >= 0;
      });
      box.innerHTML = '';
      if (!rows.length) {
        box.appendChild(ui.empty({ title: '没有匹配的学生。', note: '检查关键词，或确认班级绑定是否完整。' }));
        return;
      }
      box.appendChild(ui.table({
        rowKey: 'id',
        cols: [
          { label: '学号', width: 140, render: function (s) { return el('span', { class: 'mono', text: s.no }); } },
          { label: '姓名', width: 110, key: 'name' },
          { label: '班级', width: 190, key: 'cls' },
          { label: '手机', width: 140, render: function (s) { return el('span', { class: 'mono', text: s.phone || '—' }); } },
          { label: '申请', width: 80, align: 'right', render: function (s) { return el('span', { class: 'mono', text: s.total }); } },
          { label: '批准', width: 80, align: 'right', render: function (s) { return el('span', { class: 'mono', text: s.approved }); } },
          { label: '完成', width: 80, align: 'right', render: function (s) { return el('span', { class: 'mono', text: s.completed }); } },
          { label: '当前', width: 110, align: 'right', render: function (s) { return el('span', { class: 'tag tag--quiet', text: s.current }); } }
        ],
        rows: rows,
        onRowClick: function (s) {
          // 没有独立的学生详情路由时，先跳到记录页并带上学生关键词，等价于"看他的全部申请"
          location.hash = '#/records';
          setTimeout(function () {
            var input = document.querySelector('.input--search');
            if (input) {
              input.value = s.no;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 60);
        }
      }));
    }

    paint();
  };
})();

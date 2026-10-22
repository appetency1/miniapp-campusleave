/* ============================================================
   workbench.js —— 工作台：指标带 / 今日请假带 / 待办表
   ============================================================ */
(function () {
  var ADMIN = window.ADMIN;
  var ui = ADMIN.ui;
  var el = ui.el;

  var DAY = 86400000;

  function weekday(n) { return '周' + '日一二三四五六'[n]; }

  function headMeta() {
    var d = new Date();
    var scope = ADMIN.state.scope === 'all' ? '计算机2301 / 2302' : ADMIN.state.scope;
    var n = ADMIN.store.pending().length;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekday(d.getDay()) + ' · ' + scope + ' · ' + n + ' 条待处理';
  }

  /* ---------------- 今日请假带 ---------------- */
  function buildBand(apps, summary) {
    var band = el('div', { class: 'band' });
    var dayStart = ui.startOfDay(new Date()).getTime();
    var dayEnd = dayStart + DAY;
    var now = new Date();
    var nowPct = (now.getHours() * 60 + now.getMinutes()) / 1440 * 100;

    // 基线
    band.appendChild(el('div', { class: 'band-base' }));

    // 刻度：每 2h 一根 6px，每 6h 一根 10px
    for (var h = 0; h <= 24; h += 2) {
      var major = h % 6 === 0;
      band.appendChild(el('div', {
        class: 'band-tick' + (major ? ' band-tick--major' : ''),
        style: { left: (h / 24 * 100) + '%', height: major ? '10px' : '6px' }
      }));
    }

    // 轴标 00 06 12 18 24
    [0, 6, 12, 18, 24].forEach(function (h) {
      var style;
      if (h === 0) style = { left: '0' };
      else if (h === 24) style = { right: '0' };
      else style = { left: (h / 24 * 100) + '%' };
      band.appendChild(el('div', {
        class: 'band-lab' + (h === 0 || h === 24 ? '' : ' band-lab--mid'),
        style: style,
        text: ui.pad2(h)
      }));
    });

    // 泳道：最多 8 条，按 start 升序自上而下
    var shown = apps.slice(0, 8);
    var n = shown.length;

    shown.forEach(function (app, i) {
      var s = Math.max(ui.parse(app.start).getTime(), dayStart);
      var e = Math.min(ui.parse(app.end).getTime(), dayEnd - 60000);
      if (e <= s) return;

      var left = (s - dayStart) / DAY * 100;
      var width = Math.max((e - s) / DAY * 100, 0.6);
      var bottom = 18 + (n - 1 - i) * 7;

      var lane = el('div', { class: 'band-lane', style: { bottom: bottom + 'px' } });
      var live = ADMIN.store.liveState(app);
      var tone = 'is-done';
      if (app.status === 'PENDING') tone = 'is-pending';
      else if (live === 'IN_PROGRESS') tone = 'is-live';
      else if (live === 'OVERDUE') tone = 'is-over';

      var bar = el('div', {
        class: 'band-bar ' + tone,
        dataset: { id: String(app.id) },
        style: { left: left + '%', width: width + '%' }
      });

      // 跨天裁剪：被裁的一端画 2px 竖线
      if (ui.parse(app.start).getTime() < dayStart) bar.appendChild(el('div', { class: 'band-cap band-cap--l' }));
      if (ui.parse(app.end).getTime() > dayEnd) bar.appendChild(el('div', { class: 'band-cap band-cap--r' }));
      if (tone === 'is-over') bar.appendChild(el('div', { class: 'band-flag' }));

      lane.appendChild(bar);
      band.appendChild(lane);

      // hover 标签
      var midPct = left + width / 2;
      var endDate = ui.parse(app.end);
      var endLabel = ui.dayWord(endDate) === '今天' ? ui.hm(endDate) : ui.dayWord(endDate) + ' ' + ui.hm(endDate);
      var tip = el('div', {
        class: 'band-tip' + (midPct < 20 ? ' band-tip--l' : midPct > 80 ? ' band-tip--r' : ''),
        style: { left: midPct + '%' },
        text: app.studentName + ' · ' + app.scene + '·' + app.type + ' · 至 ' + endLabel
      });
      tip.style.display = 'none';
      band.appendChild(tip);

      bar.addEventListener('mouseenter', function () {
        bar.classList.add('is-hot');
        tip.style.display = 'block';
      });
      bar.addEventListener('mouseleave', function () {
        bar.classList.remove('is-hot');
        tip.style.display = 'none';
      });
    });

    // 第 9 条起
    if (apps.length > 8) {
      band.appendChild(el('div', {
        class: 'band-over',
        text: '+' + (apps.length - 8) + ' 条'
      }));
    }

    // 现在线
    band.appendChild(el('div', { class: 'band-now', style: { left: nowPct + '%' } }));
    band.appendChild(el('div', { class: 'band-now-sq', style: { left: nowPct + '%' } }));
    band.appendChild(el('div', {
      class: 'band-now-lab' + (nowPct > 88 ? ' band-now-lab--r' : ''),
      style: { left: nowPct + '%' },
      text: '现在 ' + ui.hm(now)
    }));

    // 常驻读数
    band.appendChild(el('div', {
      class: 'band-read' + (nowPct > 80 ? ' band-read--l' : ''),
      text: summary.live.length + ' 人在假 · ' + summary.overdue.length + ' 逾期'
    }));

    return band;
  }

  /* ---------------- 页面 ---------------- */
  ADMIN.pages.workbench = function (page) {
    page.className = 'page page--scroll';
    ADMIN.shell.crumbs([]);

    var summary = ADMIN.store.summary();
    var pending = summary.pending;

    page.appendChild(ui.pageHead({ title: '工作台', meta: headMeta() }));

    /* 指标带 */
    var band = el('div', { class: 'stat-band' }, [
      ui.stat({
        label: '待审批',
        value: pending.length,
        sub: pending.length ? '最早已等 ' + Math.floor(ui.waitHours(pending[0].submittedAt)) + ' 小时' : '没有积压',
        onClick: function () { ADMIN.router.go('/pending'); }
      }),
      ui.stat({
        label: '在假',
        value: summary.live.length,
        sub: '含逾期 ' + summary.overdue.length,
        onClick: function () { ADMIN.router.go('/records?eff=IN_PROGRESS'); }
      }),
      ui.stat({
        label: '待核验',
        value: summary.review.length,
        sub: summary.review.length ? '最久已等 ' + Math.floor(ui.waitHours(summary.review[0].checkin.time)) + ' 小时' : '没有待核验',
        onClick: function () { ADMIN.router.go('/review'); }
      }),
      ui.stat({
        label: '待处理续假',
        value: summary.extensions.length,
        sub: summary.extensions.length ? '申请延长 ' + summary.extHours + ' 小时' : '没有待处理',
        onClick: function () { ADMIN.router.go('/pending/ext'); }
      })
    ]);
    page.appendChild(band);

    /* 今日请假带 */
    var today = ADMIN.store.todayApps();
    page.appendChild(buildBand(today, summary));

    /* 待办表 */
    if (!pending.length) {
      page.appendChild(ui.empty({
        title: '今天没有待办，最近一次审批在昨天 15:32。',
        note: '新申请会出现在左侧「待审批」，并按提交时间排序。'
      }));
      return;
    }

    var rows = pending.slice(0, 2);
    var wrap = el('div');
    var barById = {};

    var tbl = ui.table({
      cols: [
        { label: '类型', width: 96, render: function (a) { return a.scene + '·' + a.type; } },
        { label: '学生', width: 120, render: function (a) { return a.studentName; } },
        {
          label: '摘要',
          render: function (a) {
            return el('span', {
              style: { color: 'var(--ink-2)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              text: a.reason
            });
          }
        },
        {
          label: '时间',
          width: 200,
          align: 'right',
          render: function (a) {
            return el('span', { class: 'num', style: { color: 'var(--ink-2)' }, text: ui.fmtTime(a.submittedAt, 'md') + ' ' + ui.hm(ui.parse(a.submittedAt)) });
          }
        }
      ],
      rows: rows,
      rowKey: 'id',
      onRowClick: function (a) { ADMIN.router.go('/pending/' + a.id); },
      onRowHover: function (a, tr, on) {
        var b = page.querySelector('.band-bar[data-id="' + a.id + '"]');
        if (b) b.classList.toggle('is-hot', on);
      }
    });
    wrap.appendChild(tbl);

    if (pending.length > 2) {
      var foot = el('div', { class: 'tbl-foot' }, [
        el('span', { text: '还有 ' + (pending.length - 2) + ' 条 ·' }),
        el('a', { class: 'link', href: '#/pending', text: '查看全部 →' })
      ]);
      wrap.appendChild(foot);
    }
    page.appendChild(wrap);
  };
})();

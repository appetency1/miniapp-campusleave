/* ============================================================
   ui.js —— 纯函数渲染工具（无框架、无依赖）
   全部挂 window.ADMIN.ui，页面只做数据 → 节点
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});
  ADMIN.pages = ADMIN.pages || {};

  /* ---------------- DOM ---------------- */
  function append(node, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) append(node, children[i]);
      return;
    }
    if (children instanceof Node) { node.appendChild(children); return; }
    node.appendChild(document.createTextNode(String(children)));
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') { node.className = v; return; }
        if (k === 'text') { node.textContent = v; return; }
        if (k === 'html') { node.innerHTML = v; return; }
        if (k === 'dataset') { Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; }); return; }
        if (k === 'style' && typeof v === 'object') { Object.assign(node.style, v); return; }
        if (k === 'attrs') { Object.keys(v).forEach(function (a) { node.setAttribute(a, v[a]); }); return; }
        if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
          return;
        }
        if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    append(node, children);
    return node;
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    append(f, children);
    return f;
  }

  /* ---------------- 图标（手写 16×16，全站共用 8 枚） ---------------- */
  var ICONS = {
    chevron: '<path d="M4 6.5l4 4 4-4"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.1 10.1L13.6 13.6"/>',
    close: '<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    check: '<path d="M3.4 8.4l3 3 6.2-6.6"/>',
    'arrow-right': '<path d="M3.2 8h8.6"/><path d="M8.4 4.6L12.4 8l-4 3.4"/>',
    clock: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.3 1.5"/>',
    file: '<path d="M4.2 2.6h4.4L11.8 5.8v7.6H4.2z"/><path d="M8.4 2.6v3.4h3.4"/>',
    external: '<path d="M9.2 3.4h3.4V6.8"/><path d="M12.6 3.4L7.8 8.2"/><path d="M11.4 9.6v2.6H4v-7h2.4"/>'
  };

  function icon(name) {
    var span = el('span', { class: 'icon', attrs: { 'aria-hidden': 'true' } });
    span.innerHTML = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' + (ICONS[name] || '') + '</svg>';
    return span;
  }

  /* ---------------- 时间 ---------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }

  function parse(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(str));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dayDiff(d) {
    var t = startOfDay(new Date()).getTime();
    return Math.round((startOfDay(d).getTime() - t) / 86400000);
  }

  function dayWord(d) {
    var n = dayDiff(d);
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === -1) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  /* mode: md | hm | range | dayHm | dayMd | rel */
  function fmtTime(str, mode) {
    if (!str) return '—';
    var d = parse(str);
    if (!d) return String(str);
    if (mode === 'hm') return hm(d);
    if (mode === 'md') return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (mode === 'dayHm') return dayWord(d) + ' ' + hm(d);
    if (mode === 'dayMd') return dayWord(d) + ' ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (mode === 'rel') return waitLabel(str);
    if (mode === 'range') return timeRange(str, arguments[2]);
    return String(str);
  }

  function timeRange(a, b) {
    var s = parse(a), e = parse(b);
    if (!s || !e) return '—';
    var sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
    if (sameDay) return (s.getMonth() + 1) + '月' + s.getDate() + '日 ' + hm(s) + ' — ' + hm(e);
    return (s.getMonth() + 1) + '月' + s.getDate() + '日 ' + hm(s) + ' — ' + (e.getMonth() + 1) + '月' + e.getDate() + '日 ' + hm(e);
  }

  function waitHours(str) {
    var d = parse(str);
    if (!d) return 0;
    return Math.max(0, (Date.now() - d.getTime()) / 3600000);
  }

  function waitLabel(str) {
    var h = waitHours(str);
    var mins = Math.round(h * 60);
    if (mins < 60) return '已等 ' + mins + ' 分钟';
    if (h < 48) return '已等 ' + Math.floor(h) + ' 小时';
    return '已等 ' + Math.floor(h / 24) + ' 天';
  }

  function waitTone(str) {
    var h = waitHours(str);
    if (h > 24) return 'is-red';
    if (h > 4) return 'is-amber';
    return '';
  }

  function minutesInDay(str) {
    var d = parse(str);
    if (!d) return 0;
    return d.getHours() * 60 + d.getMinutes();
  }

  /* ---------------- 状态 ---------------- */
  function statusOf(app) {
    var st = app.status, eff = app.effective;
    var end = parse(app.end);
    if (st === 'PENDING') return { tone: 'amber', solid: true, label: '待审批' };
    if (st === 'APPROVED') {
      if (end && Date.now() > end.getTime() && eff !== 'COMPLETED') return { tone: 'red', solid: true, label: '逾期' };
      if (eff === 'WAITING_START') return { tone: 'blue', solid: false, label: '待开始' };
      if (eff === 'OVERDUE') return { tone: 'red', solid: true, label: '逾期' };
      if (eff === 'COMPLETED') return { tone: 'ink', solid: false, label: '已完成' };
      return { tone: 'teal', solid: true, label: '请假中' };
    }
    if (st === 'REJECTED') return { tone: 'ink', solid: false, label: '已驳回' };
    if (st === 'WITHDRAWN') return { tone: 'ink', solid: false, label: '已撤回' };
    if (st === 'CANCELLED') return { tone: 'ink', solid: false, label: '已取消' };
    if (st === 'COMPLETED') return { tone: 'ink', solid: false, label: '已完成' };
    return { tone: 'ink', solid: false, label: String(st || '—') };
  }

  function statusTag(app) {
    var m = statusOf(app);
    return el('span', { class: 'status', dataset: { tone: m.tone, solid: m.solid ? '1' : '0' } }, [
      el('i'),
      m.label
    ]);
  }

  /* ---------------- 表格 ---------------- */
  function table(o) {
    o = o || {};
    var cols = o.cols || [];
    var rows = o.rows || [];
    var t = el('table', { class: 'tbl ' + (o.className || '') });

    var cg = el('colgroup');
    cols.forEach(function (c) {
      if (c.width == null) cg.appendChild(el('col'));
      else cg.appendChild(el('col', { style: { width: typeof c.width === 'number' ? c.width + 'px' : c.width } }));
    });
    t.appendChild(cg);

    var thead = el('thead');
    var htr = el('tr');
    cols.forEach(function (c) {
      htr.appendChild(el('th', {
        class: c.align === 'right' ? 'ta-r' : c.align === 'center' ? 'ta-c' : ''
      }, c.label));
    });
    thead.appendChild(htr);
    t.appendChild(thead);

    var tb = el('tbody');
    rows.forEach(function (row, i) {
      var key = typeof o.rowKey === 'function' ? o.rowKey(row, i) : (o.rowKey ? row[o.rowKey] : i);
      var tr = el('tr', { dataset: { key: String(key) } });
      if (o.selectedId != null && String(o.selectedId) === String(key)) tr.classList.add('is-selected');
      cols.forEach(function (c) {
        var td = el('td', { class: c.align === 'right' ? 'ta-r' : c.align === 'center' ? 'ta-c' : '' });
        var v = c.render ? c.render(row, i) : row[c.key];
        append(td, v == null ? '' : v);
        tr.appendChild(td);
      });
      if (o.onRowClick) {
        tr.classList.add('is-hover');
        tr.addEventListener('click', function () { o.onRowClick(row, i, tr); });
      }
      if (o.onRowHover) {
        tr.addEventListener('mouseenter', function () { o.onRowHover(row, tr, true); });
        tr.addEventListener('mouseleave', function () { o.onRowHover(row, tr, false); });
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  /* ---------------- 空态 / 骨架 ---------------- */
  function empty(o) {
    o = o || {};
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-title', text: o.title || '—' }),
      o.note ? el('div', { class: 'empty-note', text: o.note }) : null
    ]);
  }

  function skeletonRows(n) {
    var box = el('div', { class: 'sk' });
    for (var i = 0; i < (n || 3); i++) {
      box.appendChild(el('div', { class: 'sk-row' }, [
        el('div', { class: 'sk-bar sk-bar--w1' }),
        el('div', { class: 'sk-bar sk-bar--w2' }),
        el('div', { class: 'sk-bar sk-bar--w3' })
      ]));
    }
    return box;
  }

  /* ---------------- 指标 ---------------- */
  function stat(o) {
    var b = el('button', { class: 'stat', attrs: { type: 'button' }, onClick: o.onClick || null });
    b.appendChild(el('span', { class: 'stat-label', text: o.label }));
    b.appendChild(el('span', { class: 'stat-value' }, [
      el('span', { text: String(o.value) }),
      el('span', { class: 'stat-arrow', text: '→' })
    ]));
    b.appendChild(el('span', { class: 'stat-sub', text: o.sub || '' }));
    return b;
  }

  /* ---------------- 引文 ---------------- */
  function quote(text, src) {
    return el('div', { class: 'quote' }, [
      el('span', { text: text }),
      src ? el('span', { class: 'quote-src', text: src }) : null
    ]);
  }

  /* ---------------- 驳回面板 ---------------- */
  function rejectPanel(o) {
    o = o || {};
    var ta = el('textarea', {
      class: 'input input--area',
      attrs: { rows: '3', placeholder: o.placeholder || '说明不通过的原因，这段话会推送给学生' }
    });
    var confirm = el('button', { class: 'btn btn--danger btn--sm', attrs: { type: 'button' }, text: o.confirmText || '确认驳回' });
    confirm.disabled = true;
    var cancel = el('button', { class: 'btn btn--secondary btn--sm', attrs: { type: 'button' }, text: '取消' });

    ta.addEventListener('input', function () { confirm.disabled = !ta.value.trim(); });
    cancel.addEventListener('click', function () { o.onCancel && o.onCancel(); });
    confirm.addEventListener('click', function () {
      var v = ta.value.trim();
      if (v) o.onSubmit && o.onSubmit(v);
    });

    var node = el('div', { class: 'reject-panel' }, [
      ta,
      el('div', { class: 'reject-side' }, [
        el('div', { class: 'reject-note', text: '会推送给学生' }),
        el('div', { class: 'reject-btns' }, [cancel, confirm])
      ])
    ]);

    node.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); o.onCancel && o.onCancel(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        var v = ta.value.trim();
        if (v) o.onSubmit && o.onSubmit(v);
      }
    });

    return {
      node: node,
      focus: function () { setTimeout(function () { ta.focus(); }, 0); }
    };
  }

  /* ---------------- 抽屉 ---------------- */
  function drawer(node) {
    var open = true;
    var scrim = el('div', { class: 'scrim' });
    var panel = el('div', { class: 'drawer', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
      el('div', { class: 'drawer-body' }, node)
    ]);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    requestAnimationFrame(function () {
      scrim.classList.add('is-open');
      panel.classList.add('is-open');
    });

    function close() {
      if (!open) return;
      open = false;
      scrim.classList.remove('is-open');
      panel.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () {
        scrim.remove();
        panel.remove();
      }, 260);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    return { panel: panel, close: close };
  }

  /* ---------------- lightbox ---------------- */
  function lightbox(images, start) {
    var list = images || [];
    if (!list.length) return { close: function () {} };
    var idx = Math.min(Math.max(start || 0, 0), list.length - 1);

    var img = el('img', { class: 'lb-img', attrs: { alt: list[idx].label || '' }, src: list[idx].src });
    var count = el('div', { class: 'lb-count', text: (idx + 1) + ' / ' + list.length });
    var caption = el('div', { text: '' });

    var box = el('div', { class: 'lb' }, [
      img,
      count,
      el('button', { class: 'lb-close', attrs: { type: 'button', 'aria-label': '关闭' }, onClick: function () { close(); } }, icon('close')),
      el('div', { class: 'lb-nav' }, [
        el('button', { attrs: { type: 'button' }, text: '← 上一张', onClick: function () { step(-1); } }),
        caption,
        el('button', { attrs: { type: 'button' }, text: '下一张 →', onClick: function () { step(1); } })
      ])
    ]);

    function paint() {
      var item = list[idx];
      img.setAttribute('src', item.src);
      img.setAttribute('alt', item.label || '');
      count.textContent = (idx + 1) + ' / ' + list.length;
      caption.textContent = item.label || '';
    }
    function step(d) {
      if (list.length < 2) return;
      idx = (idx + d + list.length) % list.length;
      paint();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      box.remove();
    }

    if (list.length < 2) {
      box.querySelector('.lb-nav').style.display = 'none';
    }
    paint();
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);

    return { close: close };
  }

  /* ---------------- 材料占位图（无外链，data URI 生成） ---------------- */
  function docImage(title, type) {
    var line = function (y, w) {
      return '<rect x="28" y="' + y + '" width="' + w + '" height="3" fill="#D8D3C6"/>';
    };
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="620" viewBox="0 0 480 620">' +
      '<rect width="480" height="620" fill="#FFFFFF"/>' +
      '<rect x="20" y="20" width="440" height="580" fill="none" stroke="#D8D3C6"/>' +
      '<text x="40" y="72" font-family="sans-serif" font-size="22" fill="#15202E">' + esc(title) + '</text>' +
      '<text x="40" y="100" font-family="sans-serif" font-size="14" fill="#8E887B">' + esc(type) + '</text>' +
      '<rect x="40" y="120" width="400" height="1" fill="#D8D3C6"/>' +
      line(148, 300) + line(170, 380) + line(192, 340) + line(214, 260) +
      line(258, 380) + line(280, 320) + line(302, 360) + line(324, 200) +
      '<text x="40" y="560" font-family="monospace" font-size="12" fill="#8E887B">DEMO ATTACHMENT</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 页头 ---------------- */
  function pageHead(o) {
    o = o || {};
    var head = el('div', { class: 'page-head' }, [
      el('h1', { class: 'page-title', text: o.title })
    ]);
    if (o.right) head.appendChild(el('div', { class: 'head-right' }, o.right));
    else if (o.meta) head.appendChild(el('div', { class: 'page-meta', text: o.meta }));
    return head;
  }

  ADMIN.ui = {
    el: el,
    frag: frag,
    append: append,
    icon: icon,
    esc: esc,
    pageHead: pageHead,
    parse: parse,
    pad2: pad2,
    hm: hm,
    startOfDay: startOfDay,
    dayWord: dayWord,
    dayDiff: dayDiff,
    fmtTime: fmtTime,
    timeRange: timeRange,
    minutesInDay: minutesInDay,
    waitHours: waitHours,
    waitLabel: waitLabel,
    waitTone: waitTone,
    statusOf: statusOf,
    statusTag: statusTag,
    table: table,
    empty: empty,
    skeletonRows: skeletonRows,
    stat: stat,
    quote: quote,
    rejectPanel: rejectPanel,
    drawer: drawer,
    lightbox: lightbox,
    docImage: docImage
  };
})();

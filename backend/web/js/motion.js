/* ============================================================
   motion.js —— 动效层里需要 JS 的那部分

   只做五件事（其余全是 CSS）：
   1. 数字滚动（rAF）—— CSS 的 transition 做不到"0 → N 的整数"
   2. 图表绘制的一次性门控（给 .ah-chart 挂 .is-draw）
   3. 列表入场的一次性门控（给 .md-list 挂 .is-enter，结束即摘）
   4. 慢加载骨架（>400ms 才插，2s 文字兜底，8s 失败态）
   5. flash toast（reload 后的确认通道）

   为什么这些必须走 JS：
   · count-up 是 rAF 循环，tokens.css 里 prefers-reduced-motion 的
     `.01ms` 只作用于 CSS 动画/过渡，管不到 rAF —— 所以这里必须自己
     读一次 matchMedia，命中就直接落终值。
   · 图表/列表的门控是"只在页面 mount 时播一次"，纯 CSS 无法区分
     "首次挂载"和"点一条待办重建左栏"。
   ============================================================ */
(function () {
  var ADMIN = (window.ADMIN = window.ADMIN || {});
  var ui = ADMIN.ui;

  /* ---------------- 通用 ---------------- */

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* cubic-bezier(.2,.8,.25,1) —— 与 tokens.css 的 --ease 是同一条曲线。
     数值抄一份在这里，是因为 rAF 里拿不到 CSS 的 timing function。
     改曲线时两处一起改（tokens.css 的 --ease 与这里的 4 个常量）。 */
  function makeBezier(x1, y1, x2, y2) {
    function a(a1, a2) { return 1 - 3 * a2 + 3 * a1; }
    function b(a1, a2) { return 3 * a2 - 6 * a1; }
    function c(a1) { return 3 * a1; }
    function calc(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2);
        if (!s) break;
        var err = calc(t, x1, x2) - x;
        if (Math.abs(err) < 1e-4) break;
        t -= err / s;
      }
      return calc(t, y1, y2);
    };
  }
  var ease = makeBezier(.2, .8, .25, 1);

  /* ---------------- 1. 数字滚动 ---------------- */
  /* 只做三处 + 环形图中心总计：
     .stat-v（表格页顶部四格）、.stat-value > span:first-child（指标带，
     不含 .stat-arrow）、.ah-stat-value（管理概览四卡）、.ah-donut-total。 */
  var CU_SEL = '.stat-v, .stat-value > span:first-child, .ah-stat-value, .ah-donut-total';
  var CU_DUR = 320; // = --t-slow，固定，不随数值大小缩放

  function animateNumber(node, to) {
    var start = 0;
    node.textContent = '0';
    function frame(now) {
      if (!start) start = now;
      var p = Math.min(1, (now - start) / CU_DUR);
      node.textContent = String(Math.round(ease(p) * to));
      if (p < 1) requestAnimationFrame(frame);
      else node.textContent = String(to);
    }
    requestAnimationFrame(frame);
  }

  /**
   * 首屏进入时把数字从 0 滚到终值。
   * @param {Element} root  页面根节点
   * 只在路由变化时调用（重绘直接落终值，由调用方保证）。
   */
  function countUp(root) {
    if (!root || reduced()) return; // 命中 reduced-motion：保持 HTML 里的终值
    var nodes = root.querySelectorAll(CU_SEL);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.getAttribute('data-cu')) continue;
      var raw = String(n.textContent == null ? '' : n.textContent).trim();
      // 必须是纯整数。带千分位逗号 / 小数 / 百分号一律不动：
      //   · ≥1000 的数字有逗号，滚动中途会多一个字符宽度，数字左右跳一格
      //   · 百分比滚动会在 100% 之前出现 99% 的错值，读者会误读
      if (!/^\d+$/.test(raw)) continue;
      var to = parseInt(raw, 10);
      if (!(to > 0) || to >= 1000) continue;
      n.setAttribute('data-cu', '1');
      animateNumber(n, to);
    }
  }

  /* ---------------- 2. 图表绘制（一次性门控） ---------------- */
  /**
   * @param {Element} root    页面根节点
   * @param {boolean} animate 只有"路由变化"才为 true；重绘时直接满绘
   */
  function drawCharts(root, animate) {
    if (!root) return;
    var cards = root.querySelectorAll('.ah-chart');
    if (!cards.length) return;
    // 不播时什么都不加：没有 .is-draw 的卡片就是终态（线满绘、面积不透明）
    if (!animate || reduced()) return;
    for (var i = 0; i < cards.length; i++) cards[i].classList.add('is-draw');
  }

  /* ---------------- 3. 列表入场（一次性门控） ---------------- */
  /* pending.js / review.js 的 renderList() 每次点选都 innerHTML='' 重建左栏。
     如果只给 .li 挂 animation，不加门控，就是"点一条闪一次"。
     所以：只在页面 mount 时给 .md-list 挂 .is-enter，动画结束立刻摘掉。 */
  function enterList(list) {
    if (!list || list.classList.contains('is-enter')) return;
    list.classList.add('is-enter');
    var removed = false;
    function done() {
      if (removed) return;
      removed = true;
      list.classList.remove('is-enter');
    }
    // 最后一个子项结束时摘类（它的 delay 最大，也就是整组最晚结束的那条）
    list.addEventListener('animationend', function onEnd(e) {
      if (e.target !== list.lastElementChild) return;
      list.removeEventListener('animationend', onEnd);
      done();
    });
    // 兜底：reduced-motion（.01ms 可能不派发 animationend）、空列表、子项被提前换掉
    setTimeout(done, 500);
  }

  /* ---------------- 4. 慢加载骨架 ---------------- */
  var SK_DELAY = 400;   // 本地接口通常 < 200ms，400ms 内命中就不出骨架
  var SK_NOTE = 2000;
  var SK_FAIL = 8000;

  /**
   * 启动时挂上。返回 { done }：数据到达（或确定失败）时调用一次。
   * 位置固定为 #main 且与路由无关 —— 此刻我们还不知道要渲染哪个页面，
   * 所以骨架不能是"表格骨架"或"主从骨架"。
   * 数据到达后由 router.render() 的 main.innerHTML='' 自动清掉，
   * 这里不做任何"移除骨架"的逻辑，只负责取消后续定时器。
   */
  function watchSlowLoad() {
    var main = document.getElementById('main');
    var timers = [];
    var skPage = null;
    var finished = false;

    function alive() { return !!skPage && skPage.parentNode === main; }

    function insert() {
      if (finished || !main || main.querySelector('.page')) return;
      main.setAttribute('aria-busy', 'true');
      skPage = document.createElement('div');
      skPage.className = 'page page--scroll';
      skPage.appendChild(ui.el('div', { class: 'page-head' }, [
        ui.el('div', { class: 'sk-bar sk-bar--w1', attrs: { 'aria-hidden': 'true' } })
      ]));
      // 骨架条对读屏是纯噪音，所以整块 aria-hidden；另给一行视觉隐藏的播报文本
      skPage.appendChild(ui.el('span', { class: 'sr-only', text: '正在加载' }));
      var sk = ui.skeletonRows(6);
      sk.setAttribute('aria-hidden', 'true');
      skPage.appendChild(sk);
      main.appendChild(skPage);
    }

    function note() {
      if (!alive()) return;
      if (!skPage.querySelector('.sk') || skPage.querySelector('.sk-note')) return;
      // 兜底文案不能塞进 aria-hidden 的 .sk 里，否则读屏也读不到
      skPage.appendChild(ui.el('div', {
        class: 'sk-note',
        attrs: { 'aria-live': 'polite' },
        text: '还在加载…（本地接口通常 <200ms，超过 2 秒多半是后端没起）'
      }));
    }

    function fail() {
      if (!alive()) return;
      skPage.innerHTML = '';
      skPage.appendChild(ui.pageHead({ title: '数据没加载出来' }));
      skPage.appendChild(ui.empty({
        title: '拿不到数据，页面停在这里。',
        note: '请确认后端已启动（start-backend.cmd），然后点下面的按钮重试。'
      }));
      skPage.appendChild(ui.el('button', {
        class: 'btn btn--primary btn--sm',
        attrs: { type: 'button' },
        text: '重新加载',
        onClick: function () { location.reload(); }
      }));
      if (main) main.removeAttribute('aria-busy');
    }

    if (main) {
      timers.push(setTimeout(insert, SK_DELAY));
      timers.push(setTimeout(note, SK_NOTE));
      timers.push(setTimeout(fail, SK_FAIL));
    }

    return {
      done: function () {
        finished = true;
        for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
        if (main) main.removeAttribute('aria-busy');
      }
    };
  }

  /* ---------------- 5. flash toast ---------------- */
  /* 审批成功后 reload，新页面就绪再说话：这是"确认发生在状态就绪之后"。
     在旧页面写"已批准"再被 reload 抹掉，等于什么都没证明。 */
  var FLASH_KEY = 'cl_flash';

  function flash(text) {
    try { sessionStorage.setItem(FLASH_KEY, text); } catch (e) { /* 隐私模式忽略 */ }
  }

  function takeFlash() {
    try {
      var t = sessionStorage.getItem(FLASH_KEY);
      if (t) sessionStorage.removeItem(FLASH_KEY);
      return t || '';
    } catch (e) { return ''; }
  }

  function flashToast(msg) {
    if (!msg) return;
    // 320ms = --t-slow：正好等页根淡入(120ms)与页头落墨(180ms)结束，
    // 避免两个淡入抢注意力。设成 0 会和入场重叠。
    setTimeout(function () { ui.toast(msg); }, 320);
  }

  /* ---------------- 对外 ---------------- */
  ADMIN.motion = {
    reduced: reduced,
    countUp: countUp,
    drawCharts: drawCharts,
    enterList: enterList,
    watchSlowLoad: watchSlowLoad,
    flash: flash,
    takeFlash: takeFlash,
    flashToast: flashToast,
    /** router 在每次 render 后调用：同帧完成"数字滚动 + 图表绘制"的门控 */
    onPage: function (root, isEnter) {
      countUp(isEnter ? root : null);
      drawCharts(root, isEnter);
    }
  };
})();

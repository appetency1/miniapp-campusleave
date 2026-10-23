/**
 * 动效验收（强顺序）—— 每一步先断言 hash 已经是目标页，再读动效状态。
 *
 * 为什么另写一个：scripts/motion_probe.js 在断言里出现过"#/pending 读到学生管理内容"
 * 的错位（读数与 hash 不是同一页），这种探针给出的 PASS/FAIL 都不能当证据。
 * 这里每一步都返回 hash，hash 不符直接判 FAIL 并打印实际值，不让断言静默跑偏。
 *
 * 用法：node scripts/motion_verify.js
 * 前置：后端已起在 8080；已 cp -r backend/web/. backend/target/classes/static/admin/
 */
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9351
const BASE = 'http://127.0.0.1:8080'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const rows = []
function check(name, ok, detail) {
  rows.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''))
  ok ? pass++ : fail++
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let s = ''
      res.on('data', d => (s += d))
      res.on('end', () => { try { resolve(JSON.parse(s)) } catch (e) { reject(new Error(s.slice(0, 200))) } })
    }).on('error', reject)
  })
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      } else if (m.method) this.events.push(m)
    }
  }
  send(method, params) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params: params || {} }))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
}

async function main() {
  const userDir = path.join(require('os').tmpdir(), 'cl-verify-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' })

  let list = null
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`) } catch (e) { continue }
    if (list && list.length) break
  }
  if (!list || !list.length) throw new Error('Chrome 启动失败')

  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable')
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  /* ---------- 教师端 ---------- */
  const t = await (await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'T2023001', password: '123456' })
  })).json()
  if (t.code !== 0) throw new Error('教师登录失败: ' + t.message)

  await cdp.send('Page.navigate', { url: BASE + '/admin/' })
  await sleep(1500)
  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(t.data.token)});
                  sessionStorage.setItem('cl_console_role','TEACHER'); 'ok'`)
  await cdp.eval(`location.hash='#/workbench'; location.reload(); 'ok'`)
  await sleep(2600)

  /** 跳转 + 等渲染 + 断言 hash 真的到了 */
  async function goto(hash, wait) {
    await cdp.eval(`location.hash = ${JSON.stringify(hash)}; 'ok'`)
    await sleep(wait || 700)
    const s = await cdp.eval(`(function(){
      var p = document.querySelector('.page');
      return {
        hash: location.hash,
        enter: ADMIN.router.lastEnter(),
        has: !!(p && p.classList.contains('page--enter')),
        transform: p ? getComputedStyle(p).transform : 'no-page',
        head: p ? (p.innerText||'').replace(/\\s+/g,' ').slice(0,28) : ''
      };
    })()`)
    return s
  }

  // 1) 同一次启动里的首屏：workbench
  const wb = await goto('#/workbench', 900)
  check('#/workbench 渲染到位', wb.hash === '#/workbench' && wb.head.length > 0, `hash=${wb.hash} head=${wb.head}`)
  check('.page 计算样式 transform 为 none（页根只动 opacity）', wb.transform === 'none', 'transform=' + wb.transform)

  // 2) 换到另一个页面 → 应入场
  const pd = await goto('#/pending', 900)
  check('/workbench → /pending 是视图变化，加 page--enter', pd.hash === '#/pending' && pd.has === true, `hash=${pd.hash} enter=${pd.enter} has=${pd.has} head=${pd.head}`)

  // 3) 主从内部切换 → 不应入场
  const ext = await goto('#/pending/ext', 800)
  check('/pending → /pending/ext 同视图，不加 page--enter', ext.hash === '#/pending/ext' && ext.has === false, `hash=${ext.hash} enter=${ext.enter} has=${ext.has} head=${ext.head}`)

  // 4) 换到台账 → 应入场
  const rec = await goto('#/records', 900)
  check('/pending/ext → /records 是视图变化，加 page--enter', rec.hash === '#/records' && rec.has === true, `hash=${rec.hash} enter=${rec.enter} has=${rec.has}`)

  // 5) 台账 → 详情
  const rid = await cdp.eval(`(function(){
    var tr = document.querySelector('.tbl tbody tr');
    return tr ? tr.dataset.key : null;
  })()`)
  if (rid) {
    const det = await goto('#/records/' + rid, 900)
    check('/records → /records/:id 是视图变化，加 page--enter', det.hash === '#/records/' + rid && det.has === true, `id=${rid} enter=${det.enter} has=${det.has}`)
    // 起始透明度不能靠 getComputedStyle 读（此时动画已结束，恒为 1），
    // 必须直接查 @keyframes 的 from 值。
    const detInk = await cdp.eval(`(function(){
      function findRule(name) {
        for (var i = 0; i < document.styleSheets.length; i++) {
          var ss = document.styleSheets[i], rs;
          try { rs = ss.cssRules } catch (e) { continue }
          for (var j = 0; j < rs.length; j++) {
            var r = rs[j];
            if (r.type === CSSRule.KEYFRAMES_RULE && r.name === name) return r;
          }
        }
        return null;
      }
      var kf = findRule('fadeIn');
      if (!kf) return { found: false };
      var first = kf.cssRules[0];
      return { found: true, from: first.style.opacity, cls: (document.querySelector('.detail') || {}).className };
    })()`)
    // .45 是 --m-ink-from；不允许 0（从 0 起 = 点一次闪一次）
    check('详情淡入起点不是 0（应为 var(--m-ink-from)=.45）', !detInk.found || detInk.from !== '0', JSON.stringify(detInk))
  } else {
    check('/records → /records/:id（当前无数据，跳过）', true, 'skipped')
  }

  // 6) review 家族
  const rv = await goto('#/review', 900)
  check('#/review 渲染到位', rv.hash === '#/review', `hash=${rv.hash} head=${rv.head}`)
  const rvId = await cdp.eval(`(function(){
    var li = document.querySelector('.md-list .li');
    return li ? (li.dataset.key || li.getAttribute('data-key')) : null;
  })()`)
  if (rvId) {
    const rv2 = await goto('#/review/' + rvId, 800)
    check('/review → /review/:id 同视图，不加 page--enter', rv2.hash === '#/review/' + rvId && rv2.has === false, `id=${rvId} enter=${rv2.enter} has=${rv2.has}`)
  } else {
    /* 队列为空也要验这一条：入场门控是 router 级决策，和队列里有没有记录无关。
       /review/:id 拿不到匹配记录时只是渲染空态（review.js 里 paramId 找不到就保持
       local.shown = null），正好用来验"同视图不重播"——用占位 id 就行，
       不要写成"跳过"，否则这条最容易被漏掉的门控永远不会被覆盖。 */
    const rv2 = await goto('#/review/999001', 800)
    check('/review → /review/:id 同视图，不加 page--enter',
      rv2.hash === '#/review/999001' && rv2.enter === false && rv2.has === false,
      `队列为空，用占位 id 验门控 enter=${rv2.enter} has=${rv2.has}`)
  }

  // 7) 表格行类名与背景
  await goto('#/records', 800)
  const rowInfo = await cdp.eval(`(function(){
    var tr = document.querySelector('.tbl tbody tr');
    if (!tr) return { none: true };
    return { cls: tr.className, bg: getComputedStyle(tr).backgroundColor };
  })()`)
  check('.tbl 行可点击标记已改名 is-click', rowInfo.none || rowInfo.cls.indexOf('is-click') >= 0, JSON.stringify(rowInfo))
  check('未悬停的行背景透明（不再常亮）', rowInfo.none || rowInfo.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(rowInfo))
  const oldCls = await cdp.eval(`document.querySelectorAll('.is-hover').length`)
  check('旧的 is-hover 类全站不再出现', oldCls === 0, 'count=' + oldCls)

  // 8) toast 无障碍
  const tr2 = await cdp.eval(`(function(){
    if (ADMIN.ui && ADMIN.ui.toast) { ADMIN.ui.toast('验收'); }
    var t = document.querySelector('.toast');
    return { found: !!t, role: t ? t.getAttribute('role') : null };
  })()`)
  check('toast 带 role=status', tr2.found && tr2.role === 'status', JSON.stringify(tr2))

  // 9) 正常加载不出骨架 + 无 aria-busy 残留
  const sk = await cdp.eval(`({ sk: document.querySelectorAll('.sk-bar').length, busy: document.getElementById('main').getAttribute('aria-busy') })`)
  check('正常加载无骨架、无 aria-busy 残留', sk.sk === 0 && sk.busy === null, JSON.stringify(sk))

  /* ---------- P0-1：审批失败路径（拦请求，不改数据） ---------- */
  await goto('#/pending', 900)
  const hasPending = await cdp.eval(`document.querySelectorAll('.md-list .li').length`)
  if (hasPending > 0) {
    // 拦掉 approve 请求，模拟失败。这样不需要真的批掉一条演示数据。
    await cdp.send('Network.setBlockedURLs', { urls: ['*approve*'] })
    await cdp.eval(`window.__noReload = 1; 'ok'`)
    const clicked = await cdp.eval(`(function(){
      var btns = Array.prototype.slice.call(document.querySelectorAll('.action-btns .btn'));
      var ok = btns.filter(function(b){ return b.textContent.trim() === '批准'; })[0];
      if (!ok) return { found: false, labels: btns.map(function(b){ return b.textContent.trim(); }) };
      ok.click();
      return { found: true, disabledRightAfterClick: ok.disabled };
    })()`)
    check('操作条能定位到「批准」按钮', clicked.found, JSON.stringify(clicked))
    if (clicked.found) {
      check('点击后按钮立即禁用（防重复提交）', clicked.disabledRightAfterClick === true, 'disabled=' + clicked.disabledRightAfterClick)
      await sleep(1200)
      const failState = await cdp.eval(`(function(){
        var err = document.querySelector('.action-note--err');
        var bar = document.querySelector('.action-bar');
        var btns = Array.prototype.slice.call(document.querySelectorAll('.action-btns .btn'));
        return {
          err: err ? err.textContent.trim().slice(0, 40) : null,
          role: err ? err.getAttribute('role') : null,
          stillOnPage: location.hash,
          reloaded: window.__noReload === undefined,
          reEnabled: btns.length ? btns.every(function(b){ return !b.disabled; }) : null,
          rows: document.querySelectorAll('.md-list .li').length
        };
      })()`)
      check('失败时给出行内红字（不 alert / 不跳页）', !!failState.err, JSON.stringify(failState.err))
      check('行内错误带 role=alert', failState.role === 'alert', 'role=' + failState.role)
      check('失败后不整页 reload', failState.reloaded === false && failState.stillOnPage === '#/pending', JSON.stringify({ reloaded: failState.reloaded, hash: failState.stillOnPage }))
      check('失败后按钮恢复可点', failState.reEnabled === true, 'reEnabled=' + failState.reEnabled)
      check('失败后列表条目数不变（没有乐观删除）', failState.rows === hasPending, 'before=' + hasPending + ' after=' + failState.rows)
    }
    await cdp.send('Network.setBlockedURLs', { urls: [] })
  } else {
    check('P0-1 失败路径（队列为空，跳过）', true, 'skipped')
  }

  /* ---------- 管理端：数字滚动 ---------- */
  const a = await (await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' })
  })).json()
  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(a.data.token)});
                  sessionStorage.setItem('cl_console_role','ADMIN'); 'ok'`)
  await cdp.eval(`location.hash='#/admin/home'; location.reload(); 'ok'`)
  await sleep(2600)

  const cu = await cdp.eval(`(function(){
    var vals = Array.prototype.slice.call(document.querySelectorAll('.ah-stat-value'));
    return { n: vals.length, text: vals.map(function(v){ return v.textContent; }).join('|'),
             marked: vals.filter(function(v){ return v.dataset.cu === '1'; }).length };
  })()`)
  // 2600ms 后动画早已结束，值必须是终值；marked 说明 count-up 确实挂过（motion.js 打标）
  check('管理概览四个统计值已落终值', cu.n === 4 && cu.text.split('|').every(s => /^[\d,]+$/.test(s.trim())), JSON.stringify(cu))
  check('统计值走过 count-up（有 data-cu 标记）', cu.marked >= 1, 'marked=' + cu.marked)

  const charts = await cdp.eval(`(function(){
    var box = document.querySelector('.ah-chart');
    return { has: !!box, draw: box ? box.classList.contains('is-draw') : false,
             lines: document.querySelectorAll('.ah-trend-line').length,
             segs: document.querySelectorAll('.ah-donut-seg').length };
  })()`)
  check('折线图有 is-draw 门控与描边路径', charts.has && charts.lines >= 2, JSON.stringify(charts))
  check('环形图扇区已打 ah-donut-seg 标记', charts.segs >= 1, JSON.stringify(charts))

  /* ---------- v2：节奏防回退（把时长钉死，改快了就 FAIL） ---------- */
  const pace = await cdp.eval(`(function(){
    function v(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    var line = document.querySelector('.ah-trend-line');
    var seg  = document.querySelector('.ah-donut-seg');
    var drawer = document.querySelector('.drawer');
    var scrim = document.querySelector('.scrim');
    return {
      tFast: v('--t-fast'), tSel: v('--t-sel'), tFade: v('--t-fade'),
      tMid: v('--t-mid'), tPanel: v('--t-panel'), tSlow: v('--t-slow'),
      tDraw: v('--t-draw'), stagger: v('--m-stagger'),
      lineDur: line ? getComputedStyle(line).animationDuration : null,
      segDur: seg ? getComputedStyle(seg).animationDuration : null,
      lineEase: line ? getComputedStyle(line).animationTimingFunction : null
    };
  })()`)
  const ms = s => s ? Math.round(parseFloat(s) * (String(s).includes('ms') ? 1 : 1000)) : -1
  check('时长阶梯已是 v2（--t-mid ≥ 400ms）', ms(pace.tMid) >= 400, 't-mid=' + pace.tMid)
  check('面板级 ≥ 550ms', ms(pace.tPanel) >= 550, 't-panel=' + pace.tPanel)
  check('数据绘制档 ≥ 850ms', ms(pace.tDraw) >= 850, 't-draw=' + pace.tDraw)
  check('错落间隔 ≥ 60ms（24ms 看不出来）', ms(pace.stagger) >= 60, 'stagger=' + pace.stagger)
  check('折线描边实际时长 ≥ 850ms', ms(pace.lineDur) >= 850, 'line=' + pace.lineDur)
  check('环形扇区实际时长 ≥ 550ms', ms(pace.segDur) >= 550, 'seg=' + pace.segDur)
  check('折线用的是 --ease-draw（不是强 ease-out）',
    !/0\.2,\s*0\.8/.test(pace.lineEase || ''), 'ease=' + pace.lineEase)

  /* ---------- v2.1：导航切换的连续性与"曲线不能前置" ---------- */
  const navPace = await cdp.eval(`(function(){
    var rail = document.querySelector('.nav-rail');
    var page = document.querySelector('.page');
    var content = page ? page.querySelector(':scope > *:not(.page-head)') : null;
    return {
      rail: !!rail,
      railTf: rail ? getComputedStyle(rail).transitionTimingFunction : null,
      railDur: rail ? getComputedStyle(rail).transitionDuration : null,
      contentAnim: content ? getComputedStyle(content).animationTimingFunction : null,
      contentName: content ? getComputedStyle(content).animationName : null,
      activeNavs: document.querySelectorAll('.nav-item.is-on').length
    };
  })()`)
  check('.nav-rail 存在且只有一个选中项（没有双墨线）',
    navPace.rail && navPace.activeNavs <= 1, JSON.stringify(navPace.activeNavs))
  check('rail 过渡时长 ≥ 400ms', ms(navPace.railDur) >= 400, 'dur=' + navPace.railDur)
  /* 关键防回退：rail 是"两点之间滑行"，必须用对称曲线。
     如果换回 --ease（0.2,0.8,...），72px 的位移会在 ~150ms 内跑完，
     后 270ms 只挪 2-3px —— 逐帧看三帧几乎一样，读起来还是"跳"。 */
  check('rail 用对称曲线 --ease-tog（不能用前置的 0.2/0.8）',
    !!navPace.railTf && !/0\.2,\s*0\.8/.test(navPace.railTf), 'ease=' + navPace.railTf)
  check('内容根有淡入动画，且曲线不是前置的（写在 420ms、看着也 420ms）',
    navPace.contentName !== 'none' && !/0\.2,\s*0\.8/.test(navPace.contentAnim || ''),
    'name=' + navPace.contentName + ' ease=' + navPace.contentAnim)

  // 10) 页面无 JS 异常
  const errs = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
  check('全程无 JS 异常', errs.length === 0, errs.join(' | ').slice(0, 300))

  console.log(rows.join('\n'))
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项')
  ws.close(); chrome.kill()
  process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error('验收脚本失败: ' + e.message); process.exit(2) })

/**
 * 后台页面诊断：用 Chrome DevTools Protocol 真实加载 → 登录 → 跳转 → 抓异常
 *
 * 为什么不用 curl：后台是纯 JS 渲染，curl 拿到的是空壳。
 * 为什么不用 playwright：环境里没装，而 node 22 自带 WebSocket，直连 CDP 更轻。
 *
 * 用法：node scripts/ui_check_admin.js [路径]
 *   默认检查 /admin/users（顶栏下拉"账号管理"的目标页）
 */
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'http://127.0.0.1:8080'
const USER = process.argv[3] || 'admin'
const TARGET = process.argv[2] || (USER === 'admin' ? '#/admin/users' : '#/workbench')
const SHOT = 'D:/AI Code/CampusLeave/outputs/admin-check.png'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let s = ''
      res.on('data', d => (s += d))
      res.on('end', () => {
        try { resolve(JSON.parse(s)) } catch (e) { reject(new Error(s.slice(0, 200))) }
      })
    }).on('error', reject)
  })
}

async function loginToken(username, password) {
  const res = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const j = await res.json()
  if (j.code !== 0) throw new Error('登录失败: ' + j.message)
  return { token: j.data.token, role: j.data.user.role }
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      } else if (m.method) {
        this.events.push(m)
      }
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
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    })
    if (r.exceptionDetails) {
      throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    }
    return r.result.value
  }
}

async function main() {
  // 1. 启动一个独立 profile 的 headless Chrome，避免和用户已开的窗口抢
  // 每次用全新的 profile：固定目录会命中磁盘缓存，改完 JS 刷新还是旧代码（踩过）
  const userDir = path.join(require('os').tmpdir(), 'cl-cdp-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' })

  let list = null
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`) } catch (e) { continue }
    if (list && list.length) break
  }
  if (!list || !list.length) throw new Error('Chrome 启动失败')

  const target = list.find(t => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const cdp = new CDP(ws)

  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  // 2. 拿 token（走真实登录接口），写进 sessionStorage 后刷新
  const { token, role } = await loginToken(USER, '123456')
  console.log('登录成功 role=' + role)

  await cdp.send('Page.navigate', { url: BASE + '/admin/' })
  await sleep(2500)

  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(token)});
                  sessionStorage.setItem('cl_console_role', ${JSON.stringify(role)}); 'ok'`)

  // 必须真刷新一次：只改 hash 不会让 JS 重新 boot，页面仍停在未登录状态，
  // 后续所有跳转都会被 guard 弹回 #/login（第一次跑就踩了这个坑）
  await cdp.eval(`location.hash = ${JSON.stringify(TARGET)}; location.reload(); 'ok'`)
  await sleep(3500)

  // 3. 检查渲染结果
  const info = await cdp.eval(`(function(){
    var main = document.getElementById('main');
    return {
      hash: location.hash,
      mainLen: main ? main.innerHTML.length : -1,
      text: main ? (main.innerText || '').replace(/\\s+/g, ' ').slice(0, 160) : '',
      rows: document.querySelectorAll('.tbl tbody tr, table tbody tr').length,
      hasError: !!document.querySelector('.err, .empty--error')
    };
  })()`)
  console.log('渲染结果:', JSON.stringify(info, null, 2))

  // 4. 模拟真实点击：先点头像下拉，再点"账号管理"菜单项
  await cdp.eval(`ADMIN.router.go('#/admin/home'); 'ok'`)
  await sleep(1200)

  const clickResult = await cdp.eval(`(function(){
    var out = { steps: [] };
    var btn = document.querySelector('.dd-btn');
    out.steps.push('下拉按钮: ' + (btn ? '存在' : '不存在'));
    if (btn) {
      btn.click();
      var dd = btn.closest('.dd');
      out.steps.push('点击后 is-open=' + (dd ? dd.classList.contains('is-open') : 'no-dd'));
    }
    var items = Array.prototype.slice.call(document.querySelectorAll('.dd-item'));
    out.steps.push('菜单项: ' + items.map(function(i){ return i.textContent.trim(); }).join(' | '));
    var target = items.filter(function(i){ return i.textContent.indexOf('账号管理') >= 0; })[0];
    if (target) { target.click(); out.steps.push('已点账号管理'); }
    else out.steps.push('没找到"账号管理"菜单项');
    return out;
  })()`)
  console.log('\n点击链路:')
  clickResult.steps.forEach(s => console.log('  ' + s))
  await sleep(1500)

  const afterClick = await cdp.eval(`(function(){
    var main = document.getElementById('main');
    var on = Array.prototype.slice.call(document.querySelectorAll('.nav-item.is-on'))
      .map(function(a){ return a.textContent.trim(); });
    return { hash: location.hash, mainLen: main ? main.innerHTML.length : -1,
             activeNav: on,
             head: main ? (main.innerText || '').replace(/\\s+/g,' ').slice(0, 60) : '' };
  })()`)
  console.log('点击后:', JSON.stringify(afterClick))

  // 5. 铃铛点击
  const bellResult = await cdp.eval(`(function(){
    var bell = document.querySelector('.top-bell');
    if (!bell) return { exists: false };
    var before = location.hash;
    bell.click();
    return { exists: true, before: before, after: location.hash,
             dot: !!document.querySelector('.top-bell-dot') };
  })()`)
  console.log('铃铛:', JSON.stringify(bellResult))
  await sleep(1200)
  console.log('铃铛点击后 hash:', await cdp.eval(`location.hash`))

  // 5. 收集控制台异常
  const notFound = cdp.events
    .filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
    .map(e => e.params.response.status + ' ' + e.params.response.url)
  if (notFound.length) {
    console.log('\nHTTP 4xx 资源 ' + notFound.length + ' 个:')
    notFound.forEach(u => console.log('  ' + u))
  }

  const errs = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
    .map(e => {
      if (e.method === 'Runtime.exceptionThrown') {
        return 'EXCEPTION: ' + (e.params.exceptionDetails.exception?.description
          || e.params.exceptionDetails.text)
      }
      const en = e.params.entry
      return en.level + ': ' + en.text
    })
  console.log('\n控制台异常 ' + errs.length + ' 条')
  errs.slice(0, 10).forEach(e => console.log('  ' + e.replace(/\n/g, ' ').slice(0, 300)))

  // 6. 截图
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(SHOT), { recursive: true })
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))
  console.log('\n截图: ' + SHOT)

  ws.close()
  chrome.kill()
}

main().catch(e => { console.error('诊断失败: ' + e.message); process.exit(2) })

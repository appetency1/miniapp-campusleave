/**
 * 导航切换取证 —— 切页瞬间按时间切片截图，证明侧栏指示条是"滑"不是"跳"。
 *
 * 为什么必须逐帧：静态截图只能看到终态（rail 已经在目标位置），
 * 看不出它是滑过去的还是瞬移过去的。必须在切换后的 100/300/600ms
 * 各拍一张，中间那张如果 rail 停在半路，就证明在滑。
 *
 * 用法：node scripts/nav_frames.js [输出目录]
 *   默认 outputs/frames-nav
 *
 * 前置：后端在 8080；已 cp -r backend/web/. backend/target/classes/static/admin/
 */
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9371
const BASE = 'http://127.0.0.1:8080'
const OUT = process.argv[2] || 'outputs/frames-nav'

const FROM = '#/admin/home'   // 概览（侧栏第一个导航项）
const TO = '#/admin/apps'     // 请假申请（隔着分组标题，跨度大，最容易看出滑没滑）

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
  const userDir = path.join(require('os').tmpdir(), 'cl-nav-' + Date.now())
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

  const a = await (await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' })
  })).json()
  if (a.code !== 0) throw new Error('登录失败: ' + a.message)

  await cdp.send('Page.navigate', { url: BASE + '/admin/' })
  await sleep(1500)
  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(a.data.token)});
                  sessionStorage.setItem('cl_console_role','ADMIN'); 'ok'`)
  await cdp.eval(`location.hash=${JSON.stringify(FROM)}; location.reload(); 'ok'`)
  await sleep(3500)   // 等首屏动画彻底结束

  fs.mkdirSync(OUT, { recursive: true })

  /** 取某元素的外接矩形，作为截图范围 */
  async function clipOf(sel) {
    return cdp.eval(`(function(){
      var e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), scale: 1 };
    })()`)
  }
  const railClip = await clipOf('.sidebar')
  const mainClip = await clipOf('.main') || await clipOf('#main')
  if (!railClip) throw new Error('找不到 .sidebar')

  async function shot(name, clip, at) {
    if (at) await sleep(at)
    const s = await cdp.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
    const f = path.join(OUT, name + '.png')
    fs.writeFileSync(f, Buffer.from(s.data, 'base64'))
    console.log('  ' + name + ' → ' + f)
    return f
  }

  // 起点：rail 在「概览」上
  console.log('切换前：')
  await shot('r0000-from', railClip)

  // 记录切页前 rail 的实际 transform，作为"是否真的移动过"的证据
  const before = await cdp.eval(`(function(){
    var r = document.querySelector('.nav-rail');
    return r ? { tf: r.style.transform, h: r.style.height, cls: r.className } : null;
  })()`)
  console.log('  rail 起点：' + JSON.stringify(before))

  // 触发导航切换（只改 hash，不 reload —— 模拟真实点击侧栏）
  await cdp.eval(`location.hash = ${JSON.stringify(TO)}; 'ok'`)

  console.log('切换后逐帧：')
  await shot('r0100', railClip, 100)
  await shot('r0300', railClip, 200)
  await shot('r0600', railClip, 300)

  const after = await cdp.eval(`(function(){
    var r = document.querySelector('.nav-rail');
    var on = document.querySelector('.nav-item.is-on');
    return {
      tf: r ? r.style.transform : null,
      h: r ? r.style.height : null,
      trans: r ? getComputedStyle(r).transitionDuration : null,
      onLabel: on ? on.textContent.trim() : null,
      activeNavs: document.querySelectorAll('.nav-item.is-on').length,
      pageTransform: getComputedStyle(document.querySelector('.page')).transform,
      err: null
    };
  })()`)
  console.log('  rail 终点：' + JSON.stringify(after))

  // 主区内容落定（用来证明内容也在淡入）
  if (mainClip) {
    console.log('主区（另跑一次切换）：')
    await cdp.eval(`location.hash = ${JSON.stringify(FROM)}; 'ok'`)
    await sleep(1200)
    await cdp.eval(`location.hash = ${JSON.stringify(TO)}; 'ok'`)
    await shot('c0100', mainClip, 100)
    await shot('c0400', mainClip, 300)
  }

  const errs = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
  console.log(errs.length ? '页面异常 ' + errs.length + ':\n  ' + errs.join('\n  ').slice(0, 400) : '页面无 JS 异常')

  ws.close(); chrome.kill()
}

main().catch(e => { console.error('失败: ' + e.message); process.exit(2) })

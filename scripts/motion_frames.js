/**
 * 动效逐帧取证 —— 把"画"这个过程按时间切片拍下来。
 *
 * 用途：动效的快慢没法靠看最终截图判断（最终态永远一样）。必须把动画
 * 中间帧拍出来，才知道"用户到底看见了什么"。这份脚本输出的一串帧就是
 * "改长了吗"的证据，不是感觉。
 *
 * 用法：node scripts/motion_frames.js [输出目录]
 *   默认 outputs/frames
 *
 * 做法：
 *   1. 登录管理端，进 /admin/home，等页面完全稳定（此时图表是满绘终态）
 *   2. 手动把门控拆掉（去掉 .is-draw / data-cu），强制 reflow，再重新触发
 *      motion.onPage(page, true) —— 等于"再放一次动画"
 *   3. 按 120 / 320 / 560 / 820 / 1200ms 逐帧截图，只截图表区域
 *
 * 用法：node scripts/motion_frames.js [输出目录] [hash] [选择器]
 *   默认 outputs/frames '#/admin/home' '.ah-chart'
 *   选择器传 '' 表示截整个视口（看页面入场 / 列表错落用）
 */
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9361
const BASE = 'http://127.0.0.1:8080'
const OUT = process.argv[2] || 'outputs/frames'
const HASH = process.argv[3] || '#/admin/home'
const SEL = process.argv[4] === undefined ? '.ah-chart' : process.argv[4]
const USER = process.argv[5] || 'admin'
const STAMPS = [120, 320, 560, 820, 1200]

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
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
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
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
}

async function main() {
  const userDir = path.join(require('os').tmpdir(), 'cl-frames-' + Date.now())
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
    body: JSON.stringify({ username: USER, password: '123456' })
  })).json()
  if (a.code !== 0) throw new Error('登录失败: ' + a.message)

  await cdp.send('Page.navigate', { url: BASE + '/admin/' })
  await sleep(1500)
  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(a.data.token)});
                  sessionStorage.setItem('cl_console_role', ${JSON.stringify(a.data.user.role)}); 'ok'`)
  await cdp.eval(`location.hash=${JSON.stringify(HASH)}; location.reload(); 'ok'`)
  await sleep(3200)   // 等首屏那一轮动画彻底结束，页面处于满绘终态

  // 截图范围：选择器为空则截整个视口
  const clip = SEL ? await cdp.eval(`(function(){
    var cs = document.querySelectorAll(${JSON.stringify(SEL)});
    if (!cs.length) return null;
    var r = cs[0].getBoundingClientRect();
    var x = r.left, y = r.top, w = r.width, h = r.height;
    for (var i = 1; i < cs.length; i++) {
      var q = cs[i].getBoundingClientRect();
      var x2 = Math.max(x + w, q.right), y2 = Math.max(y + h, q.bottom);
      x = Math.min(x, q.left); y = Math.min(y, q.top);
      w = x2 - x; h = y2 - y;
    }
    return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), scale: 1 };
  })()`) : null
  if (SEL && !clip) throw new Error('页面里找不到 ' + SEL)

  fs.mkdirSync(OUT, { recursive: true })

  // 拆门控 → 强制 reflow → 重新触发一次入场/绘制
  await cdp.eval(`(function(){
    var page = document.querySelector('.page');
    if (page) page.classList.remove('page--enter');
    var list = document.querySelector('.md-list');
    if (list) list.classList.remove('is-enter');
    var cs = document.querySelectorAll('.ah-chart');
    for (var i = 0; i < cs.length; i++) cs[i].classList.remove('is-draw');
    var ns = document.querySelectorAll('.ah-stat-value, .ah-donut-total');
    for (var j = 0; j < ns.length; j++) ns[j].removeAttribute('data-cu');
    void document.body.offsetWidth;
    if (page) page.classList.add('page--enter');
    ADMIN.motion.onPage(page, true);
    if (list) ADMIN.motion.enterList(list);
    return 'restarted';
  })()`)

  let prev = 0
  for (const t of STAMPS) {
    await sleep(t - prev)
    prev = t
    const shot = await cdp.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
    const file = path.join(OUT, 'f' + String(t).padStart(4, '0') + '.png')
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log('帧 ' + t + 'ms → ' + file)
  }

  // 附带一张终态
  await sleep(600)
  const shot = await cdp.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
  fs.writeFileSync(path.join(OUT, 'final.png'), Buffer.from(shot.data, 'base64'))
  console.log('终态 → ' + path.join(OUT, 'final.png'))

  ws.close(); chrome.kill()
}

main().catch(e => { console.error('失败: ' + e.message); process.exit(2) })

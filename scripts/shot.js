/**
 * 通用截图：登录 → 跳到指定 hash → 等渲染 → 存 PNG
 *
 * 用法：
 *   node scripts/shot.js <hash> [账号] [输出文件] [额外等待ms]
 *   node scripts/shot.js '#/admin/home' admin outputs/admin-home.png 2200
 *
 * 为什么要单独一个脚本：ui_check_admin.js 是"诊断链路 + 截图"混在一起的，
 * 里面写死了点铃铛/点下拉的副作用，截图时机会被带偏。验证视觉必须能指定停在哪一页。
 *
 * 注意：Git Bash 里传 '#/workbench' 会被 MSYS 当成路径改写，
 * 命令行前面要加 MSYS_NO_PATHCONV=1。
 */
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9341
const BASE = 'http://127.0.0.1:8080'

const HASH = process.argv[2] || '#/workbench'
const USER = process.argv[3] || 'T2023001'
const OUT = process.argv[4] || 'outputs/shot.png'
const EXTRA = Number(process.argv[5] || 0)

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
  const userDir = path.join(require('os').tmpdir(), 'cl-shot-' + Date.now())
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

  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const cdp = new CDP(ws)

  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  /* 第一个参数直接给完整 URL 时，跳过登录/改写 hash，只当一次普通页面截图用
     （动效预览页这种静态页不需要 token）。 */
  if (/^https?:/.test(HASH)) {
    /* 静态长页：把视口拉高，一屏截完整，省得拼图 */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 3450, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: HASH })
    await sleep(1200 + EXTRA)
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, Buffer.from(shot2.data, 'base64'))
    console.log('截图: ' + OUT + '  (' + HASH + ')')
    ws.close(); chrome.kill()
    return
  }

  const res = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: '123456' })
  })
  const j = await res.json()
  if (j.code !== 0) throw new Error('登录失败: ' + j.message)

  await cdp.send('Page.navigate', { url: BASE + '/admin/' })
  await sleep(2000)
  await cdp.eval(`sessionStorage.setItem('cl_admin_token', ${JSON.stringify(j.data.token)});
                  sessionStorage.setItem('cl_console_role', ${JSON.stringify(j.data.user.role)}); 'ok'`)
  await cdp.eval(`location.hash = ${JSON.stringify(HASH)}; location.reload(); 'ok'`)
  await sleep(3000 + EXTRA)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))

  const errs = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
  console.log('截图: ' + OUT + '  (' + HASH + ' / ' + USER + ')')
  if (errs.length) console.log('页面异常 ' + errs.length + ':\n  ' + errs.join('\n  ').slice(0, 600))

  ws.close()
  chrome.kill()
}

main().catch(e => { console.error('失败: ' + e.message); process.exit(2) })

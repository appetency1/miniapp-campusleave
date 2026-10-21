/**
 * 小程序自动化验证脚本（开发期工具）
 *
 * 用途：连上微信开发者工具的自动化端口，进入指定页面 → 读页面状态 → 抓控制台异常 → 截图。
 *
 * 前置：
 *   1. 微信开发者工具 → 设置 → 安全设置 → 服务端口（已开，端口见 .ide 文件）
 *   2. 启动自动化：cli.bat auto --project <项目路径> --auto-port 9420
 *   3. 安装客户端：npm i miniprogram-automator
 *   4. 后端在 8080 上跑着（脚本会先用 API 登录拿 token）
 *
 * 用法：
 *   NODE_PATH=<automator 所在 node_modules> node scripts/verify-miniapp.js <页面路径> [截图名]
 *
 * ⚠️ 已知坑（都是踩过的，别再改回去）：
 *   - 导航必须用 mp.callWxMethod('switchTab'|'navigateTo'|'reLaunch', {url})，
 *     mp.switchTab() 封装在这个 IDE 版本上会报 "Uncaught [object Object]"；
 *     在 mp.evaluate 里调 wx.* 也可以，但 evaluate 传的字符串参数会被当路径解析，url 会被拼坏。
 *   - url 必须带前导斜杠，否则被当成相对路径拼到当前页后面。
 *   - 页面里若有 password="{{true}}" 的输入框，IDE 的 captureScreenshot 会挂住（安全输入层），
 *     登录页因此截不了图 —— 用开发者工具窗口肉眼核对。
 *   - 注入 token 后要 reLaunch 首页重置页面栈，否则栈顶还是登录页。
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const WS = process.env.AUTO_WS || 'ws://127.0.0.1:9420'
const OUT = process.env.SHOT_DIR || path.resolve(__dirname, '../outputs')
const API = process.env.API || 'http://localhost:8080/api/v1'

const target = process.argv[2] || '/pages/student/home/home'
const shotName = process.argv[3] || 'shot'

const logs = []
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function describe(e) {
  if (!e) return 'unknown'
  if (typeof e === 'string') return e
  try { return JSON.stringify(e, Object.getOwnPropertyNames(e)) } catch (x) { return String(e) }
}

/** 调后端登录拿 token（避免 UI 填表，automator 的 input()/callMethod 容易挂） */
async function apiLogin() {
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '2023001001', password: '123456' })
  })
  const body = await res.json()
  if (body.code !== 0) throw new Error('login failed: ' + JSON.stringify(body))
  return body.data
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const auth = await apiLogin()
  console.log('api login ok, role=' + auth.user.role)

  const mp = await automator.connect({ wsEndpoint: WS })
  console.log('connected')

  mp.on('console', (msg) => {
    const text = (msg.args || []).map((a) => {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a) } catch (e) { return String(a) }
    }).join(' ')
    logs.push('[' + msg.type + '] ' + text)
  })
  mp.on('exception', (e) => errors.push('exception: ' + describe(e)))

  try {
    // 注入登录态
    await mp.evaluate((t, u) => {
      wx.setStorageSync('cl_token', t)
      wx.setStorageSync('cl_user', u)
    }, auth.token, auth.user)
    console.log('token injected')

    // reLaunch 首页重置页面栈（app.js 在无 token 时已把栈换成登录页）
    try { await mp.callWxMethod('reLaunch', { url: '/pages/student/home/home' }) } catch (e) {}
    await sleep(2200)

    // 跳目标页
    const wantRoute = target.replace(/^\//, '').split('?')[0]
    const readRoute = () => mp.evaluate(() => {
      const p = getCurrentPages(); return p[p.length - 1].route
    })
    for (let i = 0; i < 2; i++) {
      try {
        await mp.callWxMethod('switchTab', { url: target })
      } catch (e) {
        try { await mp.callWxMethod('navigateTo', { url: target }) } catch (e2) {}
      }
      await sleep(2200)
      const route = await readRoute()
      console.log('navigate[' + i + '] -> route=' + route)
      if (route === wantRoute) break
    }
    await sleep(1200)

    // 读页面状态
    try {
      const info = await mp.evaluate(() => {
        const p = getCurrentPages()
        const cur = p[p.length - 1]
        const d = (cur && cur.data) ? cur.data : {}
        const out = { route: cur ? cur.route : null, dataKeys: Object.keys(d).length }
        if (d.hasHero !== undefined) {
          out.stateWord = d.stateWord; out.bigText = d.bigText
          out.rulerPercent = d.rulerPercent; out.greeting = d.greeting
          out.dateLine = d.dateLine; out.error = d.error; out.loading = d.loading
        }
        if (d.list) out.listLen = d.list.length
        if (d.filters) out.filters = d.filters.map((f) => f.label)
        if (d.unread !== undefined) out.unread = d.unread
        if (d.stats) out.stats = d.stats
        return out
      })
      console.log('page: ' + JSON.stringify(info))
    } catch (e) {
      console.log('evaluate failed: ' + describe(e).slice(0, 200))
    }

    // 截图
    try {
      await mp.screenshot({ path: path.join(OUT, shotName + '.png') })
      console.log('screenshot: ' + path.join(OUT, shotName + '.png'))
    } catch (e) {
      console.log('screenshot failed: ' + describe(e).slice(0, 120))
    }
  } finally {
    console.log('--- console (' + logs.length + ') ---')
    logs.slice(0, 30).forEach((l) => console.log('  ' + l))
    if (errors.length) {
      console.log('--- EXCEPTIONS (' + errors.length + ') ---')
      errors.forEach((e) => console.log('  ' + e.slice(0, 600)))
    }
    try { await mp.disconnect() } catch (e) {}
  }
  if (errors.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('FAILED: ' + describe(e).slice(0, 400))
  process.exit(2)
})

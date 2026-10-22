/**
 * 小程序 UI 自动化走查（miniprogram-automator）
 *
 * 为什么要有这一层：接口探针只能证明"数据对"，证明不了"页面渲染对"。
 * 字段有了但 WXML 条件写错、列表渲染成空、tab 角标不更新，接口测试全都发现不了。
 *
 * 前置（缺一不可）：
 *   1. IDE 以自动化模式启动：
 *      "E:\微信web开发者工具\cli.bat" auto --project "D:/AI Code/CampusLeave" --auto-port 9420
 *   2. 后端在 8080 跑着（页面要用真数据）
 *
 * ⚠️ 2026-10-22 实测：本机沙箱把 reg.exe / wmic.exe 列入黑名单，IDE 启动子进程时被拦，
 *    自动化端口 9420 起不来（cli auto 会打印 √ auto 但端口不监听，14 秒后进程退出）。
 *    这不是脚本问题 —— 换到没这层限制的机器上可直接跑。
 *    当前替代方案：cli preview 编译校验 + 人工按清单走查。
 *
 * 运行：
 *   NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules \
 *   node scripts/ui_probe.js
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const WS = 'ws://127.0.0.1:9420'
const SHOT_DIR = 'D:/AI Code/CampusLeave/outputs/ui'
const results = []

function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`)
}

async function textOf(page, selector) {
  try {
    const el = await page.$(selector)
    return el ? (await el.text()) : null
  } catch (e) {
    return null
  }
}

async function exists(page, selector) {
  try {
    return !!(await page.$(selector))
  } catch (e) {
    return false
  }
}

async function shot(mp, name) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    await mp.screenshot({ path: path.join(SHOT_DIR, name + '.png') })
    return true
  } catch (e) {
    console.log('  截图失败: ' + e.message)
    return false
  }
}

async function main() {
  // 先尝试连已有的自动化端口；连不上就让 automator 自己拉起 IDE。
  // 只 connect 的话很容易踩空 —— cli auto 命令结束后 IDE 窗口可能退出，
  // 端口就没了，报错信息还以为是参数问题。
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: WS })
    console.log('已连接现有 IDE 自动化端口\n')
  } catch (e) {
    console.log('连接失败，改为启动 IDE（约 30~60 秒）…')
    mp = await automator.launch({
      cliPath: 'E:/微信web开发者工具/cli.bat',
      projectPath: 'D:/AI Code/CampusLeave',
      port: 9420,
      timeout: 120000
    })
    console.log('IDE 已启动并连接\n')
  }

  // ---------- 0. 清登录态，从登录页开始 ----------
  await mp.callWxMethod('clearStorage')
  let page = await mp.reLaunch('/pages/login/login')
  await page.waitFor(1200)
  check('登录页已打开', page.path === 'pages/login/login', page.path)
  check('登录页渲染骨架', await exists(page, '.ttl'), '标题元素')
  check('账号输入框存在', await exists(page, '.field__in'), '')

  // ---------- 1. 真实登录流程 ----------
  const inputs = await page.$$('.field__in')
  check('两个输入框（账号 + 密码）', inputs.length === 2, '实际 ' + inputs.length + ' 个')
  if (inputs.length >= 2) {
    await inputs[0].input('2023001001')
    await inputs[1].input('123456')
    await page.waitFor(300)
    await shot(mp, '01-login')

    const btn = await page.$('.login-btn')
    check('登录按钮存在', !!btn, '')
    if (btn) await btn.tap()
    await page.waitFor(2500)
  }

  // ---------- 2. 首页 ----------
  page = await mp.currentPage()
  check('登录后跳转首页', page.path === 'pages/student/home/home', page.path)

  const home = await page.data()
  check('首页 loading 已结束', home.loading === false, 'loading=' + home.loading)
  check('首页无报错提示', !home.error, home.error || '')
  check('首页主卡片有数据', home.hasHero === true, 'hasHero=' + home.hasHero)
  check('首页状态词非空', !!home.stateMain, 'stateMain=' + home.stateMain)
  check('首页大数字非空', !!home.bigText, 'bigText=' + home.bigText)
  check('刻度尺已渲染（请假中应有）', home.showRuler !== false, 'showRuler=' + home.showRuler)
  check('最近记录有数据', (home.recent || []).length > 0, (home.recent || []).length + ' 条')
  check('首页 .hero 元素存在', await exists(page, '.hero'), '')
  check('首页状态文本正确渲染', !!(await textOf(page, '.hero__status')),
    await textOf(page, '.hero__status'))
  await shot(mp, '02-home')

  // ---------- 3. 记录页 ----------
  await mp.switchTab('/pages/student/records/records')
  await page.waitFor(1800)
  page = await mp.currentPage()
  check('记录页已打开', page.path === 'pages/student/records/records', page.path)
  const rec = await page.data()
  check('记录页列表有数据', (rec.list || []).length > 0, (rec.list || []).length + ' 条')
  check('记录页卡片已渲染', await exists(page, '.card'), '')
  check('记录页筛选档位数', (rec.filters || []).length === 6, (rec.filters || []).length + ' 个')
  await shot(mp, '03-records')

  // 切一个筛选档，验证后端 filter 生效
  const tabs = await page.$$('.tabs__item, .filter__item, .tab')
  if (tabs.length > 2) {
    await tabs[2].tap()
    await page.waitFor(1500)
    const filtered = await page.data()
    check('切换筛选档后仍有数据或正确空态',
      filtered.loading === false && (filtered.list || []).length >= 0,
      'active=' + filtered.active + ' 条数=' + (filtered.list || []).length)
  } else {
    console.log('  （未找到筛选元素，跳过筛选断言）')
  }

  // ---------- 4. 消息页 ----------
  await mp.switchTab('/pages/student/messages/messages')
  await page.waitFor(1500)
  page = await mp.currentPage()
  check('消息页已打开', page.path === 'pages/student/messages/messages', page.path)
  const msg = await page.data()
  check('消息页有数据', (msg.list || []).length > 0, (msg.list || []).length + ' 条')
  check('消息页未读数与列表一致', msg.unread === (msg.list || []).filter(m => !m.isRead).length,
    'unread=' + msg.unread)
  await shot(mp, '04-messages')

  // ---------- 5. 我的 ----------
  await mp.switchTab('/pages/student/profile/profile')
  await page.waitFor(1500)
  page = await mp.currentPage()
  check('我的页已打开', page.path === 'pages/student/profile/profile', page.path)
  const prof = await page.data()
  check('我的页显示姓名', !!prof.realName, prof.realName || '(空)')
  check('我的页显示学号', !!prof.studentNo, prof.studentNo || '(空)')
  check('我的页显示辅导员', !!prof.counselorName, prof.counselorName || '(空)')
  check('我的页统计有值', !!prof.stats && prof.stats.totalApplications >= 0,
    JSON.stringify(prof.stats || {}))
  await shot(mp, '05-profile')

  // ---------- 6. 详情页 ----------
  await mp.switchTab('/pages/student/records/records')
  await page.waitFor(1200)
  page = await mp.currentPage()
  const cards = await page.$$('.card')
  check('记录页可点击卡片数', cards.length > 0, cards.length + ' 个')
  if (cards.length > 0) {
    await cards[0].tap()
    await page.waitFor(1800)
    page = await mp.currentPage()
    check('进入详情页', page.path === 'pages/student/detail/detail', page.path)
    const det = await page.data()
    check('详情页拿到申请数据', !!det.id, 'id=' + det.id)
    check('详情页时间轴有节点', (det.timeline || []).length >= 3, (det.timeline || []).length + ' 个')
    check('详情页状态词非空', !!det.statusLabel, det.statusLabel || '(空)')
    await shot(mp, '06-detail')
    await mp.navigateBack()
    await page.waitFor(800)
  }

  // ---------- 7. 申请页（只打开不提交） ----------
  page = await mp.navigateTo('/pages/student/apply/apply?scene=ON_CAMPUS')
  await page.waitFor(1500)
  check('申请页已打开', page.path === 'pages/student/apply/apply', page.path)
  const app = await page.data()
  check('申请页预选了校内场景', app.form && app.form.scene === 'ON_CAMPUS',
    app.form ? app.form.scene : '(无 form)')
  check('申请页初始无校验错误', !app.err || Object.keys(app.err).length === 0,
    JSON.stringify(app.err || {}))
  await shot(mp, '07-apply')

  // ---------- 8. 销假页 ----------
  // 从首页主卡片进：需要一条进行中的离校申请
  await mp.switchTab('/pages/student/home/home')
  await page.waitFor(1500)
  page = await mp.currentPage()
  const home2 = await page.data()
  if (home2.currentRaw && home2.currentRaw.leaveScene === 'OFF_CAMPUS') {
    page = await mp.navigateTo('/pages/student/checkin/checkin?id=' + home2.currentRaw.applicationId)
    await page.waitFor(2500)
    check('销假页已打开', page.path === 'pages/student/checkin/checkin', page.path)
    const ck = await page.data()
    check('销假页拿到申请 id', !!ck.appId, 'appId=' + ck.appId)
    check('销假页有定位状态', !!ck.state, 'state=' + ck.state)
    await shot(mp, '08-checkin')
  } else {
    console.log('  （当前主卡片不是离校申请，跳过销假页）')
  }

  // ---------- 汇总 ----------
  const pass = results.filter(r => r.ok).length
  const fail = results.length - pass
  console.log(`\n==== 汇总：${pass} 通过 / ${fail} 失败 ====`)
  results.filter(r => !r.ok).forEach(r => console.log('  失败：' + r.name + '  ' + r.detail))

  await mp.disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('运行失败：' + e.message)
  console.error(e.stack)
  process.exit(2)
})

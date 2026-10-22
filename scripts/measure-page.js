/**
 * 用 CDP 量页面布局，确认「能否向下滚动」这类问题。
 *
 * 用法：
 *   1. 先起一个带调试端口的 Edge：
 *      msedge --headless=new --remote-debugging-port=9333 "http://127.0.0.1:8080/admin/?demo=1#/workbench"
 *   2. node scripts/measure-page.js [端口]
 *
 * 判据：scrollHeight 明显大于 innerHeight 就说明页面能滚（不该滚的页面就是 bug）。
 */
const PORT = process.argv[2] || 9333

async function main() {
  const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json())
  const page = list.find(t => t.type === 'page')
  if (!page) throw new Error('没有找到可调试的页面，Edge 起来了吗？')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })

  await new Promise((res) => ws.addEventListener('open', res))

  function evaluate(expr) {
    return new Promise((resolve) => {
      const myId = ++id
      pending.set(myId, resolve)
      ws.send(JSON.stringify({
        id: myId,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true }
      }))
    })
  }

  // 等页面把数据拉完（demo 登录 + loadStore 是异步的）
  await new Promise(r => setTimeout(r, 3500))

  const expr = `JSON.stringify({
    url: location.href,
    bodyRole: document.body.dataset.role,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    loginRootH: (document.getElementById('login-root') || {offsetHeight: -1}).offsetHeight,
    appH: (document.querySelector('.app') || {offsetHeight: -1}).offsetHeight,
    mainScrollH: (document.querySelector('.main') || {scrollHeight: -1}).scrollHeight,
    mainClientH: (document.querySelector('.main') || {clientHeight: -1}).clientHeight,
    canScroll: document.documentElement.scrollHeight > window.innerHeight + 1,
    menItems: Array.from(document.querySelectorAll('.nav-label')).map(n => n.textContent)
  })`

  const r = await evaluate(expr)
  const data = JSON.parse(r.result.value)
  console.log(JSON.stringify(data, null, 2))
  console.log('\n判定：外层' + (data.canScroll ? '仍可滚动 ← 有问题' : '不可滚动 ✓'))

  ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

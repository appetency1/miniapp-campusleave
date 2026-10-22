const BASE = 'http://127.0.0.1:8081/api/v1'

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, opts)
  const text = await r.text()
  let j
  try { j = JSON.parse(text) } catch { j = text }
  return { status: r.status, body: j }
}

(async () => {
  const login = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'T2023001', password: '123456' })
  })
  console.log('login:', login.status, login.body.code, login.body.message)
  if (login.body.code !== 0) return
  const token = login.body.data.token
  const H = { headers: { Authorization: 'Bearer ' + token } }

  const paths = [
    '/teacher/profile',
    '/teacher/workbench',
    '/teacher/applications?tab=pending',
    '/teacher/applications?tab=records&size=3',
    '/teacher/extensions',
    '/teacher/checkin-logs',
    '/teacher/applications/overdue',
    '/teacher/students',
    '/teacher/stats'
  ]

  for (const p of paths) {
    const r = await call(p, H)
    const b = r.body
    const brief = b.code === 0
      ? JSON.stringify(b.data).slice(0, 260)
      : JSON.stringify(b).slice(0, 300)
    console.log('\n' + p, '->', r.status, 'code=' + b.code)
    console.log('  ', brief)
  }
})()

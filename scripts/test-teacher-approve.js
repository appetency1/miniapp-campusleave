const BASE = 'http://127.0.0.1:8081/api/v1'

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, opts)
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}

async function login(username, password) {
  const r = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (r.body.code !== 0) throw new Error('login failed: ' + JSON.stringify(r.body))
  return r.body.data.token
}

(async () => {
  const t = await login('T2023001', '123456')
  // 注意：这里必须是 headers 本身，不能是 { headers: ... } —— 否则 fetch 会丢掉
  // Content-Type，body 被当成 text/plain，后端 @RequestBody 直接 415
  const TH = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
  const AH = { Authorization: 'Bearer ' + t }

  // 1) 拿到待审批列表
  const pending = await call('/teacher/applications?tab=pending', { headers: AH })
  const list = pending.body.data.list
  console.log('待审批:', list.map(x => `${x.id}/${x.studentNo}/${x.scene}${x.type}`).join(', '))
  if (!list.length) return

  const target = list[0]
  console.log('\n--- 1. 批准', target.id, target.studentName, '---')
  const ap = await call(`/teacher/applications/${target.id}/approve`, {
    method: 'POST', headers: TH, body: JSON.stringify({ comment: '情况属实，同意' })
  })
  console.log('approve ->', ap.status, ap.body.code, ap.body.message)

  console.log('\n--- 2. 重复批准（应被 40901 / 42201 拦住）---')
  const again = await call(`/teacher/applications/${target.id}/approve`, {
    method: 'POST', headers: TH, body: JSON.stringify({ comment: '再点一次' })
  })
  console.log('again ->', again.status, again.body.code, again.body.message)

  console.log('\n--- 3. 学生端首页是否实时变化 ---')
  const s = await login(target.studentNo, '123456')
  const SH = { Authorization: 'Bearer ' + s }
  const home = await call('/student/home', { headers: SH })
  const cur = home.body.data.current
  console.log('学生', target.studentNo, '首页当前请假:',
    cur ? `${cur.applicationNo} status=${cur.status} effective=${cur.effectiveStatus}` : '无')

  // 4) 驳回另一条
  if (list.length > 1) {
    const t2 = list[1]
    console.log('\n--- 4. 驳回', t2.id, t2.studentName, '---')
    const rj = await call(`/teacher/applications/${t2.id}/reject`, {
      method: 'POST', headers: TH, body: JSON.stringify({ reason: '证明材料不足，请补充就诊记录后重新提交' })
    })
    console.log('reject ->', rj.status, rj.body.code, rj.body.message)

    const s2 = await login(t2.studentNo, '123456')
    const SH2 = { Authorization: 'Bearer ' + s2 }
    const h2 = await call('/student/home', { headers: SH2 })
    const c2 = h2.body.data.current
    console.log('学生', t2.studentNo, '首页:', c2 ? `status=${c2.status} effective=${c2.effectiveStatus}` : '无')
    const msgs = await call('/student/messages', { headers: SH2 })
    console.log('学生通知:', (msgs.body.data || []).slice(0, 2).map(m => m.title).join(' / '))
  }

  console.log('\n--- 5. 空理由驳回（应 40001）---')
  const pend2 = await call('/teacher/applications?tab=pending', { headers: AH })
  if (pend2.body.data.list.length) {
    const pid = pend2.body.data.list[0].id
    const bad = await call(`/teacher/applications/${pid}/reject`, {
      method: 'POST', headers: TH, body: JSON.stringify({})
    })
    console.log('empty reason ->', bad.status, bad.body.code, bad.body.message)
  } else {
    console.log('（无剩余待审批，跳过）')
  }
})()

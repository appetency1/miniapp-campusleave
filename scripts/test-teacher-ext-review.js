const BASE = 'http://127.0.0.1:8080/api/v1'

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, opts)
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}
async function login(u, p) {
  const r = await call('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  })
  if (r.body.code !== 0) throw new Error('login ' + u + ' failed: ' + JSON.stringify(r.body))
  return r.body.data.token
}
const pad = n => String(n).padStart(2, '0')
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`

(async () => {
  const t = await login('T2023001', '123456')
  const TH = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
  const TG = { Authorization: 'Bearer ' + t }

  const all = await call('/teacher/applications?tab=records&size=200', { headers: TG })
  const apps = all.body.data.list
  console.log('总申请', apps.length, '| 在假中:',
    apps.filter(a => a.effective === 'IN_PROGRESS').map(a => `${a.id}/${a.studentNo}/${a.scene}/${a.type}`).join(' '))

  // ============ 链路 1：续假 ============
  const forExt = apps.filter(a => a.effective === 'IN_PROGRESS' && a.status === 'APPROVED' && !a.pendingExtension)[0]
  if (!forExt) { console.log('\n没有可续假的申请，跳过链路 1'); }
  else {
    console.log(`\n===== 链路 1：续假（申请 ${forExt.id} ${forExt.studentName} 止于 ${forExt.end}）=====`)
    const s = await login(forExt.studentNo, '123456')
    const SH = { Authorization: 'Bearer ' + s, 'Content-Type': 'application/json' }
    const SG = { Authorization: 'Bearer ' + s }

    // 延后 3 小时
    const cur = new Date(forExt.end.replace(' ', 'T') + ':00')
    const next = fmt(new Date(cur.getTime() + 3 * 3600 * 1000))
    const apply = await call(`/student/applications/${forExt.id}/extensions`, {
      method: 'POST', headers: SH,
      body: JSON.stringify({ requestedEndTime: next, reason: '复诊需要，医生建议延长观察' })
    })
    console.log('学生提交续假 ->', apply.status, apply.body.code, apply.body.message)

    const extList = await call('/teacher/extensions?status=PENDING', { headers: TG })
    const ext = (extList.body.data.list || [])[0]
    console.log('教师待审续假 ->', extList.body.data.total, '条', ext ? `#${ext.id} ${ext.studentName} ${ext.originEnd} → ${ext.requestedEnd}` : '')

    if (ext) {
      const ok = await call(`/teacher/extensions/${ext.id}/approve`, {
        method: 'POST', headers: TH, body: JSON.stringify({ comment: '同意延长' })
      })
      console.log('教师批准续假 ->', ok.status, ok.body.code, ok.body.message)

      const detail = await call(`/teacher/applications/${forExt.id}`, { headers: TG })
      console.log('主申请新结束时间 ->', detail.body.data.end, '(原', forExt.end + ')')

      const dup = await call(`/teacher/extensions/${ext.id}/approve`, {
        method: 'POST', headers: TH, body: JSON.stringify({ comment: '再点一次' })
      })
      console.log('重复批准 ->', dup.status, dup.body.code, dup.body.message)
    }
  }

  // ============ 链路 2：定位失败 → 人工核验 ============
  const forChk = apps.filter(a =>
    a.effective === 'IN_PROGRESS' && a.status === 'APPROVED' && a.scene === '离校'
    && (!forExt || a.id !== forExt.id))[0]

  if (!forChk) { console.log('\n没有可核验的离校申请，跳过链路 2'); }
  else {
    console.log(`\n===== 链路 2：核验（申请 ${forChk.id} ${forChk.studentName} ${forChk.scene}）=====`)
    const s2 = await login(forChk.studentNo, '123456')
    const SH2 = { Authorization: 'Bearer ' + s2, 'Content-Type': 'application/json' }
    const SG2 = { Authorization: 'Bearer ' + s2 }

    // 故意报到校外 180 公里外，触发超距
    const gps = await call(`/student/applications/${forChk.id}/checkin/gps`, {
      method: 'POST', headers: SH2,
      body: JSON.stringify({ latitude: 31.5, longitude: 121.5, accuracy: 20 })
    })
    console.log('学生 GPS 销假（故意超距）->', gps.status, gps.body.code, gps.body.message)

    if (gps.body.code === 0) { console.log('  ⚠️ 居然通过了，校园中心配置可能异常'); }
    else {
      const mr = await call(`/student/applications/${forChk.id}/checkin/manual-review`, {
        method: 'POST', headers: SH2,
        body: JSON.stringify({ reason: '定位漂移，人已到校门口，门禁可查' })
      })
      console.log('学生申请人工核验 ->', mr.status, mr.body.code, mr.body.message)

      const list = await call('/teacher/checkin-logs?reviewStatus=PENDING_REVIEW', { headers: TG })
      const log = (list.body.data.list || []).find(x => x.applicationId === forChk.id)
      console.log('教师待核验 ->', list.body.data.total, '条', log ? `#${log.id} ${log.studentName} ${log.distance}m` : '')

      if (log) {
        const rv = await call(`/teacher/checkin-logs/${log.id}/review`, {
          method: 'POST', headers: TH,
          body: JSON.stringify({ action: 'APPROVE', comment: '门禁记录已核对，通过' })
        })
        console.log('教师核验通过 ->', rv.status, rv.body.code, rv.body.message)

        const d = await call(`/teacher/applications/${forChk.id}`, { headers: TG })
        console.log('主申请状态 ->', d.body.data.status, '| actualEnd', d.body.data.actualEnd || '—')

        const again = await call(`/teacher/checkin-logs/${log.id}/review`, {
          method: 'POST', headers: TH, body: JSON.stringify({ action: 'APPROVE' })
        })
        console.log('重复核验 ->', again.status, again.body.code, again.body.message)
      }
    }
  }
})().catch(function (e) { console.error('FAILED:', e && e.stack ? e.stack : e); process.exit(1) })

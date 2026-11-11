// verify.mjs —— 灌入后完整性核对。用法：node verify.mjs <备份文件路径>
import { readFileSync, statSync } from 'node:fs'

const STATE = 'C:/Users/Administrator/.dsh/bot/state.json'
const bakPath = process.argv[2]
if (!bakPath) {
  console.error('用法: node verify.mjs <state.json.bak-...>')
  process.exit(1)
}

const EXPECT = 'D:\\AI Code\\CampusLeave'
const cur = JSON.parse(readFileSync(STATE, 'utf8'))
const bak = JSON.parse(readFileSync(bakPath, 'utf8'))
const bad = []
const ok = []

// 1 顶层键
const ck = Object.keys(cur).sort().join(','), bk = Object.keys(bak).sort().join(',')
ck === bk ? ok.push('顶层键一致（' + Object.keys(cur).length + ' 个）') : bad.push('顶层键变了：' + bk + ' -> ' + ck)

// 2 各集合数量
const COUNT = ['bots', 'rooms', 'exchanges', 'exchangeTurns', 'works', 'requests', 'questions', 'views', 'closedCards', 'connectors']
for (const k of COUNT) {
  const a = bak[k], b = cur[k]
  const na = Array.isArray(a) ? a.length : (a ? Object.keys(a).length : 0)
  const nb = Array.isArray(b) ? b.length : (b ? Object.keys(b).length : 0)
  na === nb ? ok.push(`${k} 数量不变（${na}）`) : bad.push(`${k} 数量变了：${na} -> ${nb}`)
}

// 3 每个 bot 除 capabilities/workDir 外逐字段比对
let fieldChecks = 0
for (const id of Object.keys(bak.bots)) {
  const a = bak.bots[id], b = cur.bots[id]
  if (!b) { bad.push('bot 丢了：' + a.name); continue }
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === 'capabilities' || f === 'workDir') continue
    fieldChecks++
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) bad.push(`${a.name} 的 ${f} 变了`)
  }
}
ok.push(`${fieldChecks} 处 Bot 字段未被改动`)

// 4 content 与源文件逐字符比对
const MAP = {
  'thesis-writing': 'thesis-writing-handbook.md',
  'research-literature': 'research-literature-handbook.md',
  'chief-dispatch': 'chief-dispatch-handbook.md',
  'coder-repair': 'coder-repair-handbook.md',
}
for (const [skill, f] of Object.entries(MAP)) {
  const it = cur.capabilities.items[skill]
  if (!it) { bad.push('缺 skill：' + skill); continue }
  const src = readFileSync(f, 'utf8').trim()
  if (it.content !== src) bad.push(`${skill} 内容与源文件不一致（state ${it.content.length} vs src ${src.length}）`)
  else ok.push(`${skill} 内容与源文件逐字符一致（${src.length} 字符）`)
  if (it.kind !== 'skill') bad.push(`${skill} 的 kind 不是 skill`)
}

// 5 原有 skill
cur.capabilities.items['dsh-plugin-management']
  ? ok.push('原有 dsh-plugin-management 保留')
  : bad.push('原有 dsh-plugin-management 丢了')

// 6 挂载与 workDir
for (const [bot, skill] of [['论文', 'thesis-writing'], ['文献', 'research-literature'], ['首席', 'chief-dispatch'], ['代码', 'coder-repair']]) {
  const b = Object.values(cur.bots).find(x => x.name === bot)
  if (!b) { bad.push('找不到 bot ' + bot); continue }
  if (!(b.capabilities || []).includes(skill)) bad.push(`${bot} 没挂上 ${skill}`)
  if (b.workDir !== EXPECT) bad.push(`${bot} workDir 不对：${JSON.stringify(b.workDir)}`)
  else ok.push(`${bot} 挂载 ${skill}，workDir 正确`)
}

// 7 其余 Bot 的 capabilities 未被误改
for (const [id, a] of Object.entries(bak.bots)) {
  const b = cur.bots[id]
  if (!b) continue
  const target = ['论文', '文献', '首席', '代码'].includes(a.name)
  if (target) continue
  if (JSON.stringify(a.capabilities ?? []) !== JSON.stringify(b.capabilities ?? [])) {
    bad.push(`${a.name} 的 capabilities 被误改`)
  }
}
ok.push('其余 8 个 Bot 的 capabilities 未被改动')

// 8 文件能读、大小合理
const size = statSync(STATE).size
if (size < 130000) bad.push('文件大小异常：' + size)

console.log(`\n验证 ${STATE}\n对比 ${bakPath}\n`)
for (const s of ok) console.log('  ✓ ' + s)
if (bad.length) {
  console.log('\n未通过：')
  for (const s of bad) console.log('  ✗ ' + s)
  console.log(`\n结论：${bad.length} 项未通过`)
  process.exit(1)
}
console.log(`\n结论：全部 ${ok.length} 项通过。bots=${Object.keys(cur.bots).length}，items=${Object.keys(cur.capabilities.items).length}，revision=${cur.revision}，${size} 字节`)

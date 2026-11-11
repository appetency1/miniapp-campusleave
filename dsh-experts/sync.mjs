#!/usr/bin/env node
/**
 * sync.mjs —— 把磁盘上的手册同步进 state.json。
 *
 * 为什么需要这一步：skill 的正文存在 state.capabilities.items[<name>].content 里，
 * 不是从磁盘文件读的。Bot（或人）改了 dsh-experts/*.md 只改了工作副本，
 * 不跑这个脚本，Bot 加载到的还是旧版。
 *
 * 用法：
 *   node sync.mjs            # 看哪些文件跟 state 不一致
 *   node sync.mjs --apply    # 真写
 *
 * 安全措施跟 apply-experts.mjs 一致：活锁检测、备份、临时文件 + rename、幂等。
 */
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const STATE_PATH = join(DSH_HOME, 'bot', 'state.json')
const LOCK_PATH = join(DSH_HOME, 'bot', 'state.lock')
const STALE_MS = 60_000
const APPLY = process.argv.includes('--apply')

const MAP = {
  'thesis-writing': 'thesis-writing-handbook.md',
  'research-literature': 'research-literature-handbook.md',
  'chief-dispatch': 'chief-dispatch-handbook.md',
  'coder-repair': 'coder-repair-handbook.md',
}

function fail(msg) {
  console.error('✗ ' + msg)
  process.exit(1)
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e?.code === 'EPERM' }
}

function lockIsLive() {
  if (!existsSync(LOCK_PATH)) return { live: false }
  let h
  try { h = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) } catch { return { live: true, why: 'state.lock 读不出，按活锁处理' } }
  const age = Date.now() - statSync(LOCK_PATH).mtimeMs
  const alive = typeof h.pid === 'number' && pidAlive(h.pid)
  if (alive && age < STALE_MS) return { live: true, why: `pid ${h.pid} 仍在运行，心跳 ${Math.round(age / 1000)}s 前` }
  return { live: false, stale: true, why: `pid ${h.pid} 已不在或心跳过期，属残留锁` }
}

const lock = lockIsLive()
if (lock.live) fail(`桌面端还开着：${lock.why}\n  先完全退出 DeepSeek Harness。Bot 正在改这些文件时也不该同步。`)
if (lock.stale) console.log('· ' + lock.why + '，可以继续')

const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
let changed = 0
const report = []

for (const [skill, file] of Object.entries(MAP)) {
  const item = state.capabilities.items[skill]
  const path = join(process.cwd(), file)
  if (!item) { report.push(`- ${skill}: state 里没有这个 skill，跳过`); continue }
  if (!existsSync(path)) { report.push(`- ${file}: 磁盘上没有，跳过`); continue }

  const disk = readFileSync(path, 'utf8').trim()
  if (disk === item.content) { report.push(`  ${skill}: 已同步（${disk.length} 字符）`); continue }

  const delta = disk.length - item.content.length
  report.push(`✎ ${skill}: ${item.content.length} → ${disk.length} 字符（${delta >= 0 ? '+' : ''}${delta}）`)
  changed++

  if (APPLY) {
    item.content = disk
    item.updatedAt = Date.now()
  }
}

console.log(`\n状态文件：${STATE_PATH}\n`)
for (const line of report) console.log('  ' + line)

if (changed === 0) {
  console.log('\n磁盘与 state 一致，不用同步。\n')
  process.exit(0)
}

if (!APPLY) {
  console.log(`\n[dry-run] ${changed} 个 skill 需要同步，没有写盘。加 --apply 执行。\n`)
  process.exit(0)
}

state.revision = (state.revision ?? 0) + 1
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const bak = `${STATE_PATH}.bak-sync-${stamp}`
copyFileSync(STATE_PATH, bak)

const temp = `${STATE_PATH}.tmp-${process.pid}`
writeFileSync(temp, JSON.stringify(state), 'utf8')
renameSync(temp, STATE_PATH)

console.log(`\n已同步 ${changed} 个 skill，revision → ${state.revision}`)
console.log(`备份：${bak}`)
console.log('重启桌面端后生效。\n')

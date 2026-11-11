#!/usr/bin/env node
/**
 * apply-experts.mjs —— 把三份专家手册灌进 DS Bot 团队。
 *
 * 做的事：
 *   1. 在 state.capabilities.items 里建三个 kind=skill 的条目，content 是手册全文
 *   2. 把三个 skill 分别 attach 到 Thesis / Research / Chief
 *   3. 把 Thesis 和 Research 的 workDir 指向 CampusLeave（现在没有这个字段，跑在团队 workspace 里）
 *
 * 默认 dry-run，只打印将要改什么。加 --apply 才真正写盘。
 *
 * 安全措施：
 *   - 活锁检测：state.lock 里的 pid 还活着且心跳在 60s 内，直接拒跑
 *   - 写前备份 state.json.bak-<时间戳>
 *   - 临时文件 + rename 原子写，跟插件自身的行为一致（store.js:388）
 *   - 幂等：重复执行只更新 content，不会重复 attach
 *
 * 用法：
 *   node apply-experts.mjs            # 看要改什么
 *   node apply-experts.mjs --apply    # 真写
 */
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const BOT_DIR = join(DSH_HOME, 'bot')
const STATE_PATH = join(BOT_DIR, 'state.json')
const LOCK_PATH = join(BOT_DIR, 'state.lock')

const PROJECT = 'D:\\AI Code\\CampusLeave'
const EXPERT_DIR = join(PROJECT, 'dsh-experts')
const STALE_MS = 60_000
const APPLY = process.argv.includes('--apply')

const EXPERTS = [
  {
    skill: 'thesis-writing',
    file: 'thesis-writing-handbook.md',
    bot: ['论文', 'Thesis'],
    roles: ['写作', '论文'],
    description: '写 CampusLeave 毕业论文正文时加载：逐章给评委关注点、段落排布与起笔写法，含摘要与关键词纪律、设计取舍论证写法、交稿前五条自检、六关就绪度自评。当用户要写某章某节、改一段论文、写摘要、检查论文与代码是否对得上、或问某段该怎么动笔时使用。不用于查文献（走 research-literature），不用于审稿（走 Review 的审核口径）。',
  },
  {
    skill: 'research-literature',
    file: 'research-literature-handbook.md',
    bot: ['文献', 'Research'],
    roles: ['核查', '文献'],
    description: '为 CampusLeave 论文检索与核实参考文献时加载：检索式构造、各章该配几条、GB/T 7714-2015 准确格式、七项核实标准、三种文献造假识别法、给 Thesis 交接时的附注要求。当用户要参考文献、要核实某条文献真假、要查某个技术点的既有工作、或问引用格式怎么写时使用。硬规则：查不到就说查不到，不许编造，不许用相近文献顶替。',
  },
  {
    skill: 'chief-dispatch',
    file: 'chief-dispatch-handbook.md',
    bot: ['首席', 'Chief', '总管'],
    roles: ['调度', 'Chief of Staff'],
    description: '分派任务与验收交付时加载：团队 13 个 Bot 各自的能力边界与不该派什么、分派判决五步、派活必带的四样上下文、什么情况才建新 Bot、验收五条、何时 stop_bot、跨角色链条怎么串。当用户派活、问该让谁做、问某个交付物够不够格、或要汇总团队产出时使用。Chief 每次分派前都该先读。',
  },
  {
    skill: 'coder-repair',
    file: 'coder-repair-handbook.md',
    bot: ['代码', 'Coder'],
    roles: ['开发'],
    description: '动 CampusLeave 的代码、排后端或 Web 后台的故障时加载：动手前三查、从报错到根因的排障步骤、这个项目已知的二十多个坑（teacherId 是 teacher_profile.id、PageResult 无 of()、改 web 要 cp 到 target/classes、MOCK_LOCATION 改 yml 不生效、320ms 不能当动效上限等）、三层验证方法、不许引入的技术栈清单。改代码前先读，能省掉大半返工。',
  },
]

function fail(msg) {
  console.error('✗ ' + msg)
  process.exit(1)
}

/** 按名字候选找 Bot，都不中则按角色兜底。用户会改 Bot 名字（Coder→代码、Thesis→论文），不能写死。 */
function resolveBot(botsByName, spec) {
  for (const name of spec.bot) {
    const bot = botsByName.get(name)
    if (bot) return bot
  }
  for (const role of spec.roles ?? []) {
    for (const bot of botsByName.values()) if (bot.role === role) return bot
  }
  return undefined
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === 'EPERM'
  }
}

/** 照 home-lock.js 的判据：pid 活着 + 心跳在 staleMs 内才算活锁。 */
function lockIsLive() {
  if (!existsSync(LOCK_PATH)) return { live: false }
  let holder
  try {
    holder = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
  } catch {
    return { live: true, why: 'state.lock 存在但内容读不出（可能正在写），按活锁处理' }
  }
  const age = Date.now() - statSync(LOCK_PATH).mtimeMs
  const alive = typeof holder.pid === 'number' && pidAlive(holder.pid)
  if (alive && age < STALE_MS) {
    return { live: true, why: `pid ${holder.pid} 仍在运行，锁心跳 ${Math.round(age / 1000)}s 前` }
  }
  return { live: false, stale: true, why: `pid ${holder.pid} 已不在或心跳过期（${Math.round(age / 1000)}s），属残留锁` }
}

function main() {
  if (!existsSync(STATE_PATH)) fail(`找不到 ${STATE_PATH}，确认 DSH_HOME 是否指向 ~/.dsh`)

  const lock = lockIsLive()
  if (lock.live) {
    fail(`桌面端还开着：${lock.why}\n  先完全退出 DeepSeek Harness，再跑本脚本。`)
  }
  if (lock.stale) console.log('· ' + lock.why + '，可以继续')

  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  state.capabilities ??= { items: {} }
  state.capabilities.items ??= {}

  const botsByName = new Map()
  for (const bot of Object.values(state.bots ?? {})) botsByName.set(bot.name, bot)

  const now = Date.now()
  const report = []
  const resolved = []

  for (const e of EXPERTS) {
    const path = join(EXPERT_DIR, e.file)
    if (!existsSync(path)) fail(`缺少手册文件：${path}`)
    const content = readFileSync(path, 'utf8').trim()
    if (content.length < 1000) fail(`${e.file} 只有 ${content.length} 字符，像是被截断了，不灌`)

    const bot = resolveBot(botsByName, e)
    if (!bot) {
      const names = [...botsByName.keys()].map(n => `「${n}」`).join('、')
      fail(`找不到该给谁挂 ${e.skill}：试过名字 ${e.bot.join(' / ')} 和角色 ${e.roles.join(' / ')}。团队现有 ${names}`)
    }

    const prev = state.capabilities.items[e.skill]
    const same = prev && prev.kind === 'skill' && prev.content === content && prev.description === e.description

    state.capabilities.items[e.skill] = {
      name: e.skill,
      kind: 'skill',
      description: e.description,
      createdBy: prev?.createdBy ?? null,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      content,
    }

    bot.capabilities ??= []
    const attached = bot.capabilities.includes(e.skill)
    if (!attached) bot.capabilities.push(e.skill)

    resolved.push(bot)
    report.push(`${e.skill} → ${bot.name}（${content.length} 字符）${same ? ' [内容无变化]' : ''}${attached ? ' [已挂载]' : ' [新挂载]'}`)
  }

  for (const bot of resolved) {
    if (!existsSync(PROJECT) || !statSync(PROJECT).isDirectory()) fail(`workDir 不是有效目录：${PROJECT}`)
    const before = bot.workDir
    if (before === PROJECT) {
      report.push(`workDir ${bot.name}: 已经是 ${PROJECT}，不用改`)
      continue
    }
    bot.workDir = PROJECT
    report.push(`workDir ${bot.name}: ${before ?? '(无)'} → ${PROJECT}`)
  }

  state.revision = (state.revision ?? 0) + 1

  console.log(`\n状态文件：${STATE_PATH}`)
  console.log(`revision：${state.revision - 1} → ${state.revision}\n`)
  for (const line of report) console.log('  · ' + line)

  if (!APPLY) {
    console.log('\n[dry-run] 没有写盘。确认无误后加 --apply 执行。\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const bak = `${STATE_PATH}.bak-${stamp}`
  copyFileSync(STATE_PATH, bak)
  console.log(`\n已备份：${bak}`)

  const temp = `${STATE_PATH}.tmp-${process.pid}`
  writeFileSync(temp, JSON.stringify(state), 'utf8')
  renameSync(temp, STATE_PATH)

  console.log('已写入。启动桌面端，问「论文」这个 Bot：「你手上那份写作手册里，第 4 章要求单独加的那一节叫什么？」，答得出来就是灌进去了。\n')
}

main()

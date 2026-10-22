/**
 * 一次性脚本：把 WXSS 里的字号抬到 iOS 真机可读尺度
 * 设计稿 formal-v2 是 Web 尺度（正文 12px / 辅助 11px），搬到手机上偏小约 25%。
 * 映射保持原有字阶层级，只整体上移，不做合并。
 * custom-tab-bar 不参与（tabBar label 本来就该小，单独手工调）。
 */
const fs = require('fs')
const path = require('path')

const MAP = {
  18: 24, 20: 26, 21: 26, 22: 28, 24: 30, 26: 32, 28: 34,
  30: 34, 32: 36, 34: 38, 36: 40, 40: 44, 42: 46, 44: 48,
  48: 52, 56: 60, 92: 92
}

const ROOT = 'D:/AI Code/CampusLeave/miniprogram'

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (name === 'custom-tab-bar') continue
      walk(p, out)
    } else if (name.endsWith('.wxss')) {
      out.push(p)
    }
  }
  return out
}

const files = walk(ROOT, [])
let total = 0
const changes = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  let n = 0
  const out = src.replace(/font-size:\s*(\d+)rpx/g, (m, num) => {
    const from = Number(num)
    const to = MAP[from]
    if (!to || to === from) return m
    n++
    changes.push(`${path.relative(ROOT, f)}: ${from} -> ${to}`)
    return `font-size: ${to}rpx`
  })
  if (n > 0) {
    fs.writeFileSync(f, out, 'utf8')
    total += n
  }
}

console.log('files:', files.length, 'replaced:', total)
console.log(changes.join('\n'))

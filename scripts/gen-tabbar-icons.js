/**
 * 生成 tabBar 的线性图标（内联 SVG → base64 data URI）
 *
 * 为什么用 data URI：小程序打包体积敏感，四个图标两张色版一共不到 2KB，
 * 且不增加任何网络请求、不占独立文件（仍是"零图片资源"）。
 *
 * 输出：miniprogram/custom-tab-bar/icons.js
 */
const fs = require('fs')
const path = require('path')

const OUT = 'D:/AI Code/CampusLeave/miniprogram/custom-tab-bar/icons.js'

// 24×24 线性图标，stroke 1.6，圆头圆角，风格统一
const SHAPES = {
  // 首页：房子
  home: [
    'M4 10.8 L12 4.2 L20 10.8 V19.4 A0.6 0.6 0 0 1 19.4 20 H15 V14.4 H9 V20 H4.6 A0.6 0.6 0 0 1 4 19.4 Z'
  ],
  // 记录：文档 + 折角
  records: [
    'M6.4 3.6 H14.6 L18 7 V20.4 H6.4 Z',
    'M14.6 3.6 V7 H18',
    'M9 11.2 H15.4',
    'M9 14.8 H15.4',
    'M9 18.4 H13'
  ],
  // 消息：气泡
  messages: [
    'M4 6.2 A1.6 1.6 0 0 1 5.6 4.6 H18.4 A1.6 1.6 0 0 1 20 6.2 V14.2 A1.6 1.6 0 0 1 18.4 15.8 H9.4 L4 20 Z'
  ],
  // 我的：头像
  profile: [
    'M12 11.8 A3.6 3.6 0 1 0 12 4.6 A3.6 3.6 0 0 0 12 11.8 Z',
    'M4.8 20.2 C4.8 16.6 8 14.8 12 14.8 C16 14.8 19.2 16.6 19.2 20.2'
  ]
}

const COLORS = {
  off: '#8E887B', // --ink-4
  on: '#15202E'   // --ink
}

function svg(paths, color) {
  const body = paths.map(d => `<path d="${d}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

function dataUri(s) {
  return 'data:image/svg+xml;base64,' + Buffer.from(s, 'utf8').toString('base64')
}

const lines = []
lines.push('/**')
lines.push(' * custom-tab-bar/icons.js —— 自动生成，请勿手改')
lines.push(' * 生成脚本：scripts/gen-tabbar-icons.js')
lines.push(' *')
lines.push(' * 每个图标两版色值（未选中 #8E887B / 选中 #15202E），')
lines.push(' * 用内联 base64 SVG 而非图片文件：不增加请求、不占独立资源。')
lines.push(' */')
lines.push('')
lines.push('const ICONS = {')
for (const [name, paths] of Object.entries(SHAPES)) {
  lines.push(`  ${name}: {`)
  lines.push(`    off: '${dataUri(svg(paths, COLORS.off))}',`)
  lines.push(`    on: '${dataUri(svg(paths, COLORS.on))}'`)
  lines.push('  },')
}
lines.push('}')
lines.push('')
lines.push('module.exports = { ICONS }')
lines.push('')

fs.writeFileSync(OUT, lines.join('\n'), 'utf8')

const size = fs.statSync(OUT).size
console.log('written:', OUT, size, 'bytes')

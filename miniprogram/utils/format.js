/**
 * utils/format.js —— 时间 / 状态 格式化
 *
 * 格式化规则全部对齐定稿 formal-v2：
 *   md    → "10.20"
 *   hm    → "08:00"
 *   mdhm  → "10.20 08:00"
 *   mdCN  → "10月20日"
 *   时长  → "3:05"（小于 24 小时）/ "1天 2时"
 *
 * ⚠️ 一个必须注意的小程序坑：
 *   iOS 的 JS 引擎无法解析 "2026-10-20 08:00:00" 这种带短横线的日期字符串
 *   （安卓和开发者工具能解析，所以本地测不出来，真机白屏）。
 *   必须先把 "-" 换成 "/" 再 new Date()。下面的 parseTime 统一处理了这个问题。
 */

const pad = (n) => (n < 10 ? '0' + n : '' + n)

/**
 * 解析后端返回的时间字符串 "yyyy-MM-dd HH:mm:ss"。
 * @returns {Date} 解析失败时返回当前时间，避免整个页面因脏数据崩溃
 */
function parseTime(str) {
  if (!str) return new Date()
  if (str instanceof Date) return str
  // 关键：iOS 兼容，把 2026-10-20 换成 2026/10/20
  const safe = String(str).replace(/-/g, '/').replace('T', ' ').replace(/\.\d+$/, '')
  const d = new Date(safe)
  return isNaN(d.getTime()) ? new Date() : d
}

/** "10.20" —— 首页区间、记录列表左侧 */
function md(d) {
  const t = parseTime(d)
  return pad(t.getMonth() + 1) + '.' + pad(t.getDate())
}

/** "08:00" */
function hm(d) {
  const t = parseTime(d)
  return pad(t.getHours()) + ':' + pad(t.getMinutes())
}

/** "10.20 08:00" */
function mdhm(d) {
  return md(d) + ' ' + hm(d)
}

/** "10月20日" —— 中文场景（"10月20日 08:00 开始"） */
function mdCN(d) {
  const t = parseTime(d)
  return (t.getMonth() + 1) + '月' + t.getDate() + '日'
}

/** "周二" */
function week(d) {
  return '周' + '日一二三四五六'[parseTime(d).getDay()]
}

/**
 * 倒计时文本，用于首页大数字。
 * 小于 24 小时显示 "3:05"（时:分）；超过则 "1天 2时"。
 */
function clockText(ms) {
  ms = Math.max(0, ms || 0)
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return d + '天 ' + (h % 24) + '时'
  }
  return h + ':' + pad(m)
}

/**
 * 中文时长短语，用于首页状态辅助行："已等待 10 分钟" / "还剩 3 天 2 小时"。
 *
 * <p>为什么不复用 clockText（"0:10"）：mm:ss 这种表盘格式在首页会被读成倒计时，
 * 而它其实只是"等了多久"的描述信息，不该占据视觉重心。
 */
function durationText(ms) {
  ms = Math.max(0, ms || 0)
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return '不到 1 分钟'
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h > 0 ? d + ' 天 ' + h + ' 小时' : d + ' 天'
  if (h > 0) return m > 0 ? h + ' 小时 ' + m + ' 分钟' : h + ' 小时'
  return m + ' 分钟'
}

/**
 * 自然语言时长，用于 "已过 1 天 2 小时" / "共 10 小时"。
 */
function partsText(ms) {
  ms = Math.max(0, ms || 0)
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h > 0 ? d + ' 天 ' + h + ' 小时' : d + ' 天'
  if (h > 0) return m > 0 ? h + ' 小时 ' + m + ' 分' : h + ' 小时'
  return m + ' 分钟'
}

/**
 * 按小时给问候语（首页头部）。
 * 5-10 早上好 / 11-13 中午好 / 14-17 下午好 / 18-23 晚上好 / 其余 夜深了
 */
function greeting(now) {
  const h = parseTime(now || new Date()).getHours()
  if (h >= 5 && h < 11) return '早上好'
  if (h >= 11 && h < 14) return '中午好'
  if (h >= 14 && h < 18) return '下午好'
  if (h >= 18 && h < 24) return '晚上好'
  return '夜深了'
}

/**
 * 展示态 → { label, cls }
 * cls 对应 app.wxss 里的 .state--warn / .state--danger / .state--muted
 */
function statusChip(effectiveStatus) {
  const map = {
    PENDING:       { label: '待审批', cls: 'state--warn',  chip: 'chip--amber' },
    WAITING_START: { label: '已通过', cls: '',             chip: 'chip--blue'  },
    IN_PROGRESS:   { label: '请假中', cls: '',             chip: 'chip--blue'  },
    OVERDUE:       { label: '逾期',   cls: 'state--danger', chip: 'chip--red'  },
    COMPLETED:     { label: '已销假', cls: 'state--done',  chip: 'chip--teal'  },
    REJECTED:      { label: '已驳回', cls: 'state--danger', chip: 'chip--red'  },
    WITHDRAWN:     { label: '已撤回', cls: 'state--muted', chip: 'chip--grey'  },
    CANCELLED:     { label: '已取消', cls: 'state--muted', chip: 'chip--grey'  }
  }
  return map[effectiveStatus] || { label: '未知', cls: 'state--muted', chip: 'chip--grey' }
}

/** 请假场景中文 */
function sceneLabel(scene) {
  return scene === 'OFF_CAMPUS' ? '离校' : '校内'
}

/** 请假类型中文 */
function typeLabel(type) {
  if (type === 'SICK') return '病假'
  if (type === 'PERSONAL') return '事假'
  return '其他'
}

/** 材料类型中文 */
function materialLabel(type) {
  if (type === 'MEDICAL_PROOF') return '诊断证明'
  if (type === 'LEAVE_FORM') return '请假单'
  return '其他材料'
}

/** 文件大小 "80.4 KB" */
function fileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

module.exports = {
  parseTime,
  md, hm, mdhm, mdCN, week,
  clockText, durationText, partsText, greeting,
  statusChip, sceneLabel, typeLabel, materialLabel, fileSize
}

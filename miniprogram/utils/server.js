/**
 * utils/server.js —— 后端地址的运行时切换（开发期便利功能）
 *
 * 为什么需要它：
 *   真机调试时后端地址必须是「电脑的局域网 IP」，而这个 IP 会随网络变化
 *   （换 WiFi、连手机热点、开 VPN 都会变）。每次改代码再重新编译很烦，
 *   所以把地址做成可运行时覆盖：优先读 storage，没有则用 config.js 的默认值。
 *
 * 使用方式（登录页）：长按底部「演示账号」那一行 → 弹出地址选择/输入框。
 *
 * 注意：这是开发期工具。正式版应删掉入口，并把 config.js 的默认值改成 https 域名。
 */
const { DEFAULT_BASE_URL, DEFAULT_FILE_BASE } = require('./config')

const KEY = 'cl_base_url'

/** 取当前生效的接口前缀 */
function getBaseUrl() {
  const override = wx.getStorageSync(KEY)
  return override || DEFAULT_BASE_URL
}

/** 取文件前缀（与接口同源，只是去掉 /api/v1） */
function getFileBase() {
  const base = getBaseUrl()
  return base.replace(/\/api\/v1\/?$/, '')
}

/** 设置覆盖值（传空则清除，回到默认） */
function setBaseUrl(url) {
  if (!url) {
    wx.removeStorageSync(KEY)
    return getBaseUrl()
  }
  // 容错：允许用户只填 IP:端口，自动补全协议与路径
  let v = String(url).trim()
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v
  v = v.replace(/\/+$/, '')
  if (!/\/api\/v1$/.test(v)) v = v + '/api/v1'
  wx.setStorageSync(KEY, v)
  return v
}

/** 单个地址探活：能拿到 code=0 就算通（字典接口不需要 token） */
function pingHost(host, timeout = 900) {
  return new Promise((resolve) => {
    wx.request({
      url: 'http://' + host + ':8080/api/v1/common/dictionaries',
      method: 'GET',
      timeout,
      success: (res) => resolve(res.statusCode === 200 ? host : null),
      fail: () => resolve(null)
    })
  })
}

/**
 * 自动探测后端地址。
 *
 * <p>解决什么：真机调试时后端地址必须是「电脑的局域网 IP」，而 IP 随网络变化，
 * 手动敲很容易错。这里并发探测一批常见网段的候选地址，第一个通的就采用。
 *
 * <p><b>必须分批</b>：微信小程序同时最多 10 个 wx.request，一次发 40 个会被排队，
 * 排在后面的还没发出去就超时了。所以 8 个一批，串行推进。
 *
 * <p>候选顺序按"最可能"排：
 *   1. 当前已保存的地址（可能只是过期了，先确认）
 *   2. iPhone 个人热点：172.20.10.2（电脑通常是这个）
 *   3. Android 个人热点：192.168.43.x
 *   4. Windows 移动热点客户端：192.168.137.2
 *   5. 常见家用路由器：192.168.1.x / 192.168.0.x
 *   6. 作者本机的 WLAN 段（换网前常用）
 *
 * @returns {Promise<string|null>} 可用 host（不含 http:// 与端口），全不通返回 null
 */
function probe() {
  const currentHost = getBaseUrl().replace(/^https?:\/\//, '').replace(/:\d+.*$/, '')

  const candidates = [
    currentHost,
    '172.20.10.2', '172.20.10.3', '172.20.10.4',
    '192.168.43.2', '192.168.43.3', '192.168.43.4', '192.168.43.5',
    '192.168.43.6', '192.168.43.7', '192.168.43.8', '192.168.43.9',
    '192.168.137.2',
    '192.168.1.2', '192.168.1.3', '192.168.1.4', '192.168.1.5', '192.168.1.6',
    '192.168.0.2', '192.168.0.3', '192.168.0.4',
    '10.225.223.179'
  ].filter((v, i, a) => v && a.indexOf(v) === i)

  const BATCH = 8

  return new Promise((resolve) => {
    let settled = false
    const finish = (host) => {
      if (settled) return
      settled = true
      resolve(host)
    }

    const runBatch = (start) => {
      if (settled) return
      if (start >= candidates.length) {
        finish(null)
        return
      }
      const batch = candidates.slice(start, start + BATCH)
      let done = 0
      let hit = null

      batch.forEach((host) => {
        pingHost(host).then((ok) => {
          done++
          if (ok && !hit) hit = ok
          if (done === batch.length) {
            if (hit) finish(hit)
            else runBatch(start + BATCH)
          }
        })
      })
    }

    runBatch(0)

    // 总兜底：整个探测不超过 7 秒
    setTimeout(() => finish(null), 7000)
  })
}

module.exports = { getBaseUrl, getFileBase, setBaseUrl, probe, DEFAULT_BASE_URL, DEFAULT_FILE_BASE }

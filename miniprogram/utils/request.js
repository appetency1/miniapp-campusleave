/**
 * utils/request.js —— 统一网络请求封装
 *
 * 为什么要有这一层（答辩可讲）：
 *   1. 每个页面都写 wx.request 会重复 20 行，且错误处理各写各的，容易出现
 *      "有的页面弹 toast、有的页面白屏"。
 *   2. 后端统一响应是 { code, message, data, traceId }，需要统一拆包：
 *      code=0 才算成功，其他一律当业务错误抛出。
 *   3. 401（未登录/token 过期）需要集中处理：清登录态 + 跳登录页。
 *      如果分散在各页面，漏写一处就会出现"一直转圈"。
 *
 * 用法：
 *   const { get, post } = require('../../utils/request')
 *   const data = await get('/student/home')
 *   await post('/student/applications/12/checkin/gps', { latitude, longitude })
 *
 * 约定：resolve 的是后端 data 字段本身（已经脱掉了 code/message 外壳），
 *       reject 的是 { code, message, data } —— 页面里 catch 后取 message 展示即可。
 */
const { getBaseUrl } = require('./server')
const { getToken, clearAuth } = require('./auth')

/** 是否已经在跳登录页（防止多个请求同时 401 时重复 reLaunch） */
let redirecting = false

function goLogin() {
  if (redirecting) return
  redirecting = true
  clearAuth()
  wx.reLaunch({
    url: '/pages/login/login',
    complete: () => { redirecting = false }
  })
}

/**
 * 核心请求方法
 * @param {string} url      以 / 开头的接口路径，如 '/student/home'
 * @param {string} method   GET / POST / PUT / DELETE
 * @param {object} data     请求体（GET 时作为 query）
 * @param {object} options  额外选项：{ loading: true, header: {} }
 */
function request(url, method = 'GET', data = null, options = {}) {
  const token = getToken()

  return new Promise((resolve, reject) => {
    if (options.loading) {
      wx.showLoading({ title: '加载中', mask: true })
    }

    wx.request({
      // 每次都取一次：登录页可运行时切换后端地址（换网络后不用改代码）
      url: getBaseUrl() + url,
      method,
      data: data || {},
      timeout: 15000,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        options.header || {}
      ),
      success(res) {
        const body = res.data || {}

        // HTTP 401：未登录或 token 过期（后端 40101 / 40102）
        if (res.statusCode === 401) {
          const msg = body.message || '登录已失效，请重新登录'
          wx.showToast({ title: msg, icon: 'none' })
          goLogin()
          reject({ code: body.code || 40101, message: msg })
          return
        }

        // 业务成功
        if (body.code === 0) {
          resolve(body.data)
          return
        }

        // 业务失败：把 message 交给调用方决定怎么展示（有的场景要弹 toast，有的要显示在页面上）
        reject({
          code: body.code,
          message: body.message || '请求失败',
          data: body.data || null
        })
      },
      fail(err) {
        // 网络层失败：域名被拦、后端没启动、超时
        const hint = (err && err.errMsg && err.errMsg.indexOf('domain') >= 0)
          ? '请求域名未配置，请勾选「不校验合法域名」'
          : '网络异常，请检查后端是否已启动'
        reject({ code: -1, message: hint, detail: err })
      },
      complete() {
        if (options.loading) {
          wx.hideLoading()
        }
      }
    })
  })
}

/** GET 快捷方法 */
function get(url, data, options) {
  return request(url, 'GET', data, options)
}

/** POST 快捷方法 */
function post(url, data, options) {
  return request(url, 'POST', data, options)
}

/** PUT 快捷方法 */
function put(url, data, options) {
  return request(url, 'PUT', data, options)
}

module.exports = { request, get, post, put }

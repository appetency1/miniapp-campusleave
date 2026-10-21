/**
 * pages/student/checkin/checkin.js —— 返校销假（离校）
 *
 * 核心设计（对应 04 方案 D-07）：**模拟的是"坐标来源"，不是"距离算法"**。
 *   真实定位：wx.getLocation 拿 GCJ-02 坐标
 *   演示定位：用后端下发的校园中心坐标（校内）/ 中心 + 偏移（校外）
 *   两者都走同一个接口，后端用 Haversine 真算距离 —— 业务逻辑一行都不为演示改动。
 *
 * 流程：
 *   1. 拉字典拿 mockLocation / campusCenter
 *   2. 取坐标（真实或模拟）
 *   3. POST /checkin/gps
 *      成功 → 显示"已确认在校区内" + 距离 → 1.1s 后回首页
 *      42202 → 显示"不在校区范围内" + 距离 → 可重新定位 / 申请人工核验
 *   4. 申请核验走 POST /checkin/manual-review
 */
const { get, post } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

/** 演示"在校区外"时，从校园中心往东北偏移约 2 公里（0.02 度 ≈ 2.2km） */
const OFFSET_DEG = 0.02

Page({
  data: {
    statusBarHeight: 20,
    appId: null,
    appNo: '',
    sceneLabel: '离校',

    /** locating / ok / fail / error */
    state: 'locating',
    title: '正在定位…',
    desc: '正在获取你的当前位置，用于判断是否已回到校区',

    /** 模拟位置：0=真实定位 1=在校区内 2=在校区外 */
    showMock: false,
    mockIndex: 0,
    mockOptions: ['真实定位', '在校区内', '在校区内（模拟）', '在校区外（模拟）'],

    /** 人工核验表单 */
    reviewMode: false,
    reviewReason: '',

    /** 后端下发的校园中心与半径 */
    center: null,
    radius: 100
  },

  onLoad(options) {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: info.statusBarHeight || 20,
      appId: options.id ? Number(options.id) : null,
      appNo: options.no || ''
    })

    // 下拉选项：0 真实定位，其余为模拟档位（索引与坐标来源在这里对齐）
    this.setData({ mockOptions: ['真实定位', '在校区内（模拟）', '在校区外（模拟）'] })

    this.loadDictThenLocate()
  },

  /** 先拿字典（决定是否显示模拟下拉、校园中心在哪），再开始定位 */
  async loadDictThenLocate() {
    try {
      const d = await get('/common/dictionaries')
      this.setData({
        showMock: !!d.mockLocation,
        center: d.campusCenter || null
      })
    } catch (e) {
      // 字典拿不到也继续（真实定位不需要它）
      this.setData({ showMock: false })
    }
    this.locate()
  },

  /** 切换模拟档位后立即重新定位 */
  onMockChange(e) {
    this.setData({ mockIndex: Number(e.detail.value) })
    this.locate()
  },

  /** 主流程：取坐标 → 提交校验 */
  async locate() {
    this.setData({
      state: 'locating',
      title: '正在定位…',
      desc: '正在获取你的当前位置，用于判断是否已回到校区',
      reviewMode: false
    })

    let latitude = null
    let longitude = null

    if (this.data.mockIndex > 0) {
      // 模拟：用校园中心，校外则加偏移
      const c = this.data.center
      if (!c) {
        this.setData({
          state: 'error',
          title: '模拟定位不可用',
          desc: '没有拿到校园中心坐标，请检查后端 system_config 配置'
        })
        return
      }
      latitude = this.data.mockIndex === 1 ? c.lat : c.lat + OFFSET_DEG
      longitude = this.data.mockIndex === 1 ? c.lng : c.lng + OFFSET_DEG
    } else {
      try {
        const pos = await this.getLocation()
        latitude = pos.latitude
        longitude = pos.longitude
      } catch (e) {
        this.setData({
          state: 'error',
          title: '定位失败',
          desc: e.message || '没有拿到定位。请检查是否授权了位置权限，或改用演示档位。'
        })
        return
      }
    }

    try {
      const r = await post('/student/applications/' + this.data.appId + '/checkin/gps', {
        latitude,
        longitude,
        accuracy: 20
      })
      // 通过
      this.setData({
        state: 'ok',
        title: '已确认在校区内',
        desc: '距校区 ' + Math.round(r.distanceM || 0) + ' 米，销假已完成'
      })
      wx.showToast({ title: '销假成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/student/home/home' })
      }, 1100)
    } catch (e) {
      if (e.code === 42202) {
        // 超距：后端返回了距离与可选动作
        const d = e.data || {}
        this.setData({
          state: 'fail',
          title: '不在校区范围内',
          desc: '距校区 ' + Math.round(d.distanceM || 0) + ' 米，超出允许范围（' +
            (d.allowedRadiusM || 100) + ' 米）。请回到校区后重试，或申请人工核验。'
        })
      } else {
        this.setData({
          state: 'error',
          title: '销假未完成',
          desc: e.message || '请求失败，请稍后重试'
        })
      }
    }
  },

  /**
   * 包装 wx.getLocation 为 Promise。
   *
   * 两个必须处理的坑：
   *   1. 失败时把 errMsg 翻译成人话（用户拒绝授权 / 系统定位关闭）
   *   2. **加超时兜底**：开发者工具里如果没设模拟位置，success/fail 可能都不回调，
   *      页面会永远停在"正在定位…"。超过 8 秒按失败处理，给用户一条出路。
   */
  getLocation() {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject({ message: '定位超时。可检查定位权限，或用下方演示档位继续。' })
      }, 8000)

      wx.getLocation({
        type: 'gcj02',           // GCJ-02：与后端存的校园中心同一坐标系
        isHighAccuracy: true,
        highAccuracyExpireTime: 3000,
        success: (res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(res)
        },
        fail: (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const msg = (err && err.errMsg) || ''
          if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
            reject({ message: '你拒绝了位置授权。可到「设置」里重新允许，或用下方演示档位。' })
          } else if (msg.indexOf('system permission denied') >= 0) {
            reject({ message: '手机系统未允许微信使用定位，请在系统设置里打开。' })
          } else {
            reject({ message: '定位失败：' + msg })
          }
        }
      })
    })
  },

  // ==================== 人工核验 ====================

  onManualReview() {
    this.setData({ reviewMode: true })
  },

  onReviewInput(e) {
    this.setData({ reviewReason: e.detail.value })
  },

  cancelReview() {
    this.setData({ reviewMode: false, reviewReason: '' })
  },

  async submitReview() {
    const reason = (this.data.reviewReason || '').trim()
    if (reason.length < 5) {
      wx.showToast({ title: '请至少写 5 个字的说明', icon: 'none' })
      return
    }
    try {
      await post('/student/applications/' + this.data.appId + '/checkin/manual-review', { reason })
      wx.showToast({ title: '已提交，等待辅导员核验', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/student/home/home' })
      }, 900)
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/student/home/home' })
  }
})

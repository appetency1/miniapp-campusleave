/**
 * pages/student/apply/apply.js —— 申请请假
 *
 * 交互约定（针对实测反馈重做）：
 *   1. 从首页「离校请假 / 校内请假」进来时，**场景已确定**，页面不再让你重选；
 *      只有从"再请一次"这类通用入口进来才显示场景选择。
 *   2. 时间改成**整行点开一个多列选择器**（日期 + 时间同屏），不再"点日期改日期、
 *      点时间改时间"；快捷项（今天/明天/后天）只负责挪日期，时间保持不变。
 *   3. 离校去向用**省/市/区选择器 + 详细地址**，不允许整段自由文本。
 *   4. 联系电话**只收数字**且必须 11 位（前后端都校验）。
 *   5. 所有可点元素都有按压/过渡反馈，错误提示淡入。
 */
const { post, upload } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

const pad = (n) => (n < 10 ? '0' + n : '' + n)

/** 幂等键：同一次提交重试不会产生两条申请 */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const SCENE_TEXT = {
  OFF_CAMPUS: { label: '离校请假', sub: '返校定位销假' },
  ON_CAMPUS: { label: '校内请假', sub: '结束后自主确认' }
}

Page({
  data: {
    statusBarHeight: 20,

    /** 场景是否已确定（从首页卡片进来就是确定的） */
    sceneLocked: false,
    sceneLabel: '',
    sceneSub: '',

    types: [
      { value: 'SICK', label: '病假' },
      { value: 'PERSONAL', label: '事假' },
      { value: 'OTHER', label: '其他' }
    ],
    quickDays: ['今天', '明天', '后天'],

    /** 时间选择器：二维 range = [日期列, 时间列] */
    range: [[], []],
    dateCols: [],
    hourCols: [],
    minuteCols: [],
    startIdx: [0, 0],
    endIdx: [0, 0],
    startText: '',
    endText: '',
    dayOffset: 0,

    /** 去向：省/市/区 + 详细地址 */
    region: [],
    regionText: '',
    addressDetail: '',

    form: {
      scene: 'OFF_CAMPUS',
      leaveType: 'SICK',
      reason: '',
      contactPhone: ''
    },

    materials: [],
    uploading: false,
    submitting: false,
    err: {}
  },

  onLoad(options) {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()

    // 从首页卡片进来 → 场景已定，锁定
    const locked = options && options.scene && SCENE_TEXT[options.scene]
    const scene = locked ? options.scene : 'OFF_CAMPUS'
    const st = SCENE_TEXT[scene]

    this.setData({
      statusBarHeight: info.statusBarHeight || 20,
      sceneLocked: !!locked,
      sceneLabel: st.label,
      sceneSub: st.sub,
      'form.scene': scene
    })

    this.buildTimeColumns()
    this.initDefaultTime()
  },

  /** 生成未来 30 天 + 24 小时 + 60 分钟（三列滚轮，精确到分钟） */
  buildTimeColumns() {
    const dateCols = []
    const now = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
      dateCols.push((d.getMonth() + 1) + '月' + d.getDate() + '日 ' + F.week(d))
    }
    // 带单位，让弹窗里一眼能分清"时"和"分"
    const hourCols = []
    for (let h = 0; h < 24; h++) hourCols.push(pad(h) + ' 时')
    const minuteCols = []
    for (let m = 0; m < 60; m++) minuteCols.push(pad(m) + ' 分')
    this.setData({
      dateCols,
      hourCols,
      minuteCols,
      range: [dateCols, hourCols, minuteCols]
    })
  },

  /**
   * 默认时间：开始取「现在 +10 分钟，向上取整到 5 分钟」，结束取开始 + 4 小时。
   *
   * <p>比原来的「向上取整到半点」更贴近真实使用：学生通常是"一会儿就要走"，
   * 半点粒度会让他要么等半小时、要么填一个已经过去的时间。
   * 结束时间允许跨天（日期列独立，不再被夹在当天 23:30）。
   */
  initDefaultTime() {
    const now = new Date()
    const start = new Date(now.getTime() + 10 * 60000)
    start.setSeconds(0, 0)
    start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5)   // 进位到 60 时 Date 会自动加一小时
    const end = new Date(start.getTime() + 4 * 3600 * 1000)

    this.applyTime('start', [this.indexOfDate(start), start.getHours(), start.getMinutes()])
    this.applyTime('end', [this.indexOfDate(end), end.getHours(), end.getMinutes()])
  },

  /** 某个日期相对今天的天数偏移（0 = 今天） */
  indexOfDate(date) {
    const now = new Date()
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const b = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return Math.round((b.getTime() - a.getTime()) / 86400000)
  },

  /** 把 [日期索引, 时, 分] 写成可读文案 */
  applyTime(which, idx) {
    const day = this.data.dateCols[idx[0]]
    const text = day + ' ' + pad(idx[1]) + ':' + pad(idx[2])
    if (which === 'start') {
      this.setData({ startIdx: idx, startText: text })
    } else {
      this.setData({ endIdx: idx, endText: text })
    }
  },

  onStartChange(e) {
    this.applyTime('start', e.detail.value)
    this.setData({ 'err.time': '', dayOffset: -1 })
  },

  onEndChange(e) {
    this.applyTime('end', e.detail.value)
    this.setData({ 'err.time': '' })
  },

  /** 快捷项只挪日期，时分不动 */
  onQuickDay(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.applyTime('start', [i, this.data.startIdx[1], this.data.startIdx[2]])
    this.applyTime('end', [i, this.data.endIdx[1], this.data.endIdx[2]])
    this.setData({ dayOffset: i, 'err.time': '' })
  },

  // ==================== 其他字段 ====================

  /** 点「更改」解锁场景，露出两块选择器 */
  onUnlockScene() {
    this.setData({ sceneLocked: false })
  },

  /** 未锁定场景时才允许切换 */
  onScene(e) {
    const v = e.currentTarget.dataset.v
    const st = SCENE_TEXT[v]
    this.setData({
      'form.scene': v,
      sceneLabel: st.label,
      sceneSub: st.sub,
      'err.scene': ''
    })
  },

  onType(e) {
    this.setData({ 'form.leaveType': e.currentTarget.dataset.v })
  },

  onReason(e) {
    this.setData({ 'form.reason': e.detail.value, 'err.reason': '' })
  },

  /** 省/市/区 */
  onRegion(e) {
    const v = e.detail.value || []
    this.setData({
      region: v,
      regionText: v.join(' '),
      'err.region': ''
    })
  },

  onAddress(e) {
    this.setData({ addressDetail: e.detail.value, 'err.region': '' })
  },

  /** 电话：只保留数字，最多 11 位 */
  onPhone(e) {
    const digits = String(e.detail.value || '').replace(/\D/g, '').slice(0, 11)
    this.setData({ 'form.contactPhone': digits, 'err.phone': '' })
    return digits
  },

  // ==================== 材料 ====================

  onPickMaterial() {
    if (this.data.uploading) return
    wx.showActionSheet({
      itemList: ['拍照/相册（图片）', '从聊天记录选 PDF'],
      success: (res) => {
        if (res.tapIndex === 0) this.pickImage()
        else this.pickFile()
      }
    })
  },

  pickImage() {
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => res.tempFiles.forEach((f) => this.doUpload(f.tempFilePath, f.size))
    })
  },

  pickFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: (res) => res.tempFiles.forEach((f) => this.doUpload(f.path, f.size))
    })
  },

  async doUpload(filePath, size) {
    if (size && size > 10 * 1024 * 1024) {
      this.setData({ 'err.material': '单个文件不能超过 10MB' })
      return
    }
    this.setData({ uploading: true, 'err.material': '' })
    try {
      const r = await upload(filePath, { bizType: 'MATERIAL' })
      const materials = this.data.materials.concat([{
        materialType: 'MEDICAL_PROOF',
        fileName: r.fileName,
        fileUrl: r.fileUrl,
        fileSize: r.fileSize,
        mimeType: r.mimeType
      }])
      this.setData({ materials, uploading: false })
    } catch (e) {
      this.setData({ uploading: false, 'err.material': e.message || '上传失败' })
    }
  },

  onRemoveMaterial(e) {
    const i = Number(e.currentTarget.dataset.i)
    const materials = this.data.materials.slice()
    materials.splice(i, 1)
    this.setData({ materials })
  },

  // ==================== 提交 ====================

  /** 把 [日期索引, 时, 分] 拼成后端要的 "yyyy-MM-dd HH:mm:ss" */
  toBackendTime(idx) {
    const now = new Date()
    // 用索引直接算日期，跨年/跨月由 Date 处理，不再靠正则解析中文文案
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + idx[0])
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(idx[1]) + ':' + pad(idx[2]) + ':00'
  },

  validate() {
    const f = this.data.form
    const err = {}

    if (!f.scene) err.scene = true
    if ((f.reason || '').trim().length < 5) err.reason = true

    const startStr = this.toBackendTime(this.data.startIdx)
    const endStr = this.toBackendTime(this.data.endIdx)
    const start = F.parseTime(startStr)
    const end = F.parseTime(endStr)

    if (!(end.getTime() > start.getTime())) {
      err.time = '结束时间必须晚于开始时间'
    } else if (start.getTime() < Date.now() - 60000) {
      err.time = '开始时间不能早于当前时间'
    }

    // 离校必须选去向：省市必选，详细地址要写清
    if (f.scene === 'OFF_CAMPUS') {
      if (!this.data.region || this.data.region.length < 2) {
        err.region = '请选择离校去向（省 / 市 / 区）'
      } else if ((this.data.addressDetail || '').trim().length < 2) {
        err.region = '请填写详细地址，方便辅导员掌握去向'
      }
    }

    // 电话：11 位手机号
    if (!/^1[3-9]\d{9}$/.test(f.contactPhone || '')) {
      err.phone = '请填写 11 位手机号'
    }

    return { err, startStr, endStr }
  },

  async onSubmit() {
    if (this.data.submitting) return

    const { err, startStr, endStr } = this.validate()
    if (Object.keys(err).length) {
      this.setData({ err })
      wx.showToast({ title: '请检查标红的项', icon: 'none' })
      return
    }

    const f = this.data.form
    const destination = f.scene === 'OFF_CAMPUS'
      ? (this.data.region.join('') + ' ' + this.data.addressDetail.trim()).trim()
      : null

    this.setData({ submitting: true })
    try {
      const payload = {
        leaveScene: f.scene,
        leaveType: f.leaveType,
        startTime: startStr,
        endTime: endStr,
        reason: f.reason.trim(),
        destination,
        contactPhone: f.contactPhone,
        materials: this.data.materials.map((m) => ({
          materialType: m.materialType,
          fileName: m.fileName,
          fileUrl: m.fileUrl,
          fileSize: m.fileSize,
          mimeType: m.mimeType
        }))
      }

      const data = await post('/student/applications', payload, {
        header: { 'Idempotency-Key': uuid() }
      })

      wx.showToast({ title: '已提交，等待审批', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/student/detail/detail?id=' + data.id })
      }, 700)
    } catch (e) {
      this.setData({ submitting: false })
      const msg = e.message || '提交失败'
      if (e.code === 40903 || e.code === 42204 || e.code === 40002) {
        this.setData({ 'err.time': msg })
      }
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/student/home/home' })
  }
})

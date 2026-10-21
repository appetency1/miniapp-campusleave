/**
 * pages/student/apply/apply.js —— 申请请假
 *
 * 提交流程（对应 03_API §5.2）：
 *   前端校验 → 上传材料（可选）→ POST /student/applications（带 Idempotency-Key）→ 回详情页
 *
 * 为什么前端也要校验一遍：
 *   前端校验是为了体验（即时标红，不用等一次往返）；后端校验是为了正确性。
 *   两边都写不是冗余——前端可以被绕过，后端不能被绕过。
 *
 * 时间处理：picker 只给 "yyyy-MM-dd" 和 "HH:mm"，拼成后端要的 "yyyy-MM-dd HH:mm:ss"。
 */
const { post, upload } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const F = require('../../../utils/format')

/** 生成幂等键（同一次提交重试不会产生两条申请） */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const pad = (n) => (n < 10 ? '0' + n : '' + n)

Page({
  data: {
    statusBarHeight: 20,
    types: [
      { value: 'SICK', label: '病假' },
      { value: 'PERSONAL', label: '事假' },
      { value: 'OTHER', label: '其他' }
    ],
    quickDays: ['今天', '明天', '后天'],
    form: {
      scene: 'OFF_CAMPUS',
      leaveType: 'SICK',
      dayOffset: 0,
      startDate: '',
      startClock: '08:00',
      startDateLabel: '',
      endDate: '',
      endClock: '18:00',
      endDateLabel: '',
      reason: '',
      destination: '',
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
    this.setData({ statusBarHeight: info.statusBarHeight || 20 })

    // 从首页场景卡进来时预选场景（OFF_CAMPUS / ON_CAMPUS）
    if (options && options.scene) {
      this.setData({ 'form.scene': options.scene })
    }
    this.applyQuickDay(0)
  },

  /** 把 Date 拆成 picker 需要的两段 */
  toParts(d) {
    const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    return { date, label: (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + F.week(d) }
  },

  /** 快捷项：今天/明天/后天（同时移动开始与结束日期，时间不变） */
  applyQuickDay(offset) {
    const now = new Date()
    const start = new Date(now.getTime() + offset * 86400000)
    const end = new Date(start.getTime())
    const sp = this.toParts(start)
    const ep = this.toParts(end)

    this.setData({
      'form.dayOffset': offset,
      'form.startDate': sp.date,
      'form.startDateLabel': sp.label,
      'form.endDate': ep.date,
      'form.endDateLabel': ep.label,
      'err.time': ''
    })
  },

  onQuickDay(e) {
    this.applyQuickDay(Number(e.currentTarget.dataset.i))
  },

  onScene(e) {
    this.setData({ 'form.scene': e.currentTarget.dataset.v, 'err.scene': '' })
  },

  onType(e) {
    this.setData({ 'form.leaveType': e.currentTarget.dataset.v })
  },

  onStartDate(e) {
    const p = this.toParts(F.parseTime(e.detail.value))
    this.setData({ 'form.startDate': e.detail.value, 'form.startDateLabel': p.label, 'err.time': '' })
  },

  onEndDate(e) {
    const p = this.toParts(F.parseTime(e.detail.value))
    this.setData({ 'form.endDate': e.detail.value, 'form.endDateLabel': p.label, 'err.time': '' })
  },

  onStartClock(e) {
    this.setData({ 'form.startClock': e.detail.value, 'err.time': '' })
  },

  onEndClock(e) {
    this.setData({ 'form.endClock': e.detail.value, 'err.time': '' })
  },

  onReason(e) {
    this.setData({ 'form.reason': e.detail.value, 'err.reason': '' })
  },

  onDestination(e) {
    this.setData({ 'form.destination': e.detail.value })
  },

  onPhone(e) {
    this.setData({ 'form.contactPhone': e.detail.value })
  },

  // ==================== 材料 ====================

  /**
   * 选文件并上传。
   * 用 chooseMedia 而不是 chooseMessageFile：图片直接调相机/相册，体验更顺；
   * PDF 走 chooseMessageFile（从聊天记录里选）。
   */
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
      success: (res) => {
        res.tempFiles.forEach((f) => this.doUpload(f.tempFilePath, f.size))
      }
    })
  },

  pickFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        res.tempFiles.forEach((f) => this.doUpload(f.path, f.size))
      }
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
        mimeType: r.mimeType,
        materialLabel: '诊断证明'
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

  /**
   * 校验 + 提交。
   * 校验顺序与后端一致，错误信息逐项展示（不弹 toast，避免被键盘挡住）。
   */
  async onSubmit() {
    if (this.data.submitting) return
    const f = this.data.form
    const err = {}

    if (!f.scene) err.scene = true
    if ((f.reason || '').trim().length < 5) err.reason = true

    // 拼时间
    const startStr = f.startDate + ' ' + f.startClock + ':00'
    const endStr = f.endDate + ' ' + f.endClock + ':00'
    const start = F.parseTime(startStr)
    const end = F.parseTime(endStr)

    if (!(end.getTime() > start.getTime())) {
      err.time = '结束时间必须晚于开始时间'
    } else if (start.getTime() < Date.now() - 60000) {
      err.time = '开始时间不能早于当前时间'
    }

    if (Object.keys(err).length) {
      this.setData({ err })
      wx.showToast({ title: '请检查标红的项', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const payload = {
        leaveScene: f.scene,
        leaveType: f.leaveType,
        startTime: startStr,
        endTime: endStr,
        reason: f.reason.trim(),
        destination: f.scene === 'OFF_CAMPUS' ? f.destination : null,
        contactPhone: f.contactPhone,
        materials: this.data.materials.map((m) => ({
          materialType: m.materialType,
          fileName: m.fileName,
          fileUrl: m.fileUrl,
          fileSize: m.fileSize,
          mimeType: m.mimeType
        }))
      }

      // Idempotency-Key：同一次点击重试不会生成两条申请
      const data = await post('/student/applications', payload, {
        header: { 'Idempotency-Key': uuid() }
      })

      wx.showToast({ title: '已提交，等待审批', icon: 'success' })
      setTimeout(() => {
        // 用 redirectTo：提交页不该留在栈里（返回会回到一个已提交的表单）
        wx.redirectTo({ url: '/pages/student/detail/detail?id=' + data.id })
      }, 700)
    } catch (e) {
      this.setData({ submitting: false })
      const msg = e.message || '提交失败'
      // 时间重叠 / 未配辅导员等业务错误，直接显示在时间区下方更好定位
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

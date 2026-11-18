/**
 * pages/student/password/password.js —— 修改密码
 *
 * 对应后端 PUT /api/v1/auth/password（03_API §3.3）。
 * 校验规则与后端一致：原密码必填、新密码 ≥6 位、不能与原密码相同。
 * 前端先校验是为了少一次往返；后端仍会独立校验（不依赖前端）。
 */
const { put } = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')

Page({
  data: {
    statusBarHeight: 20,
    oldPassword: '',
    newPassword: '',
    confirm: '',
    error: '',
    submitting: false
  },

  onLoad() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: info.statusBarHeight || 20 })
  },

  onOld(e) { this.setData({ oldPassword: e.detail.value, error: '' }) },
  onNew(e) { this.setData({ newPassword: e.detail.value, error: '' }) },
  onConfirm(e) { this.setData({ confirm: e.detail.value, error: '' }) },

  async onSubmit() {
    const { oldPassword, newPassword, confirm } = this.data
    if (!oldPassword) {
      this.setData({ error: '请输入原密码' })
      return
    }
    if (!newPassword || newPassword.length < 6) {
      this.setData({ error: '新密码至少 6 位' })
      return
    }
    if (newPassword !== confirm) {
      this.setData({ error: '两次输入的新密码不一致' })
      return
    }
    if (newPassword === oldPassword) {
      this.setData({ error: '新密码不能与原密码相同' })
      return
    }

    this.setData({ submitting: true, error: '' })
    try {
      await put('/auth/password', { oldPassword, newPassword })
      // 不强制登出：JWT 无状态，旧 token 仍然有效，强制跳登录只会打断演示。
      // 给出明确提示，让用户知道下次登录要用新密码。
      wx.showToast({ title: '密码已修改', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 900)
    } catch (e) {
      this.setData({ submitting: false, error: e.message || '修改失败' })
    }
  },

  onBack() {
    wx.navigateBack()
  }
})

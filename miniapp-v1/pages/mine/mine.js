// pages/mine/mine.js —— 我的
const { DB } = require('../../utils/mock.js');

Page({
  data: {
    student: {},
    notice: { unread: 0 }
  },

  onLoad() {
    this.setData({
      student: DB.student || {},
      notice: DB.notice || { unread: 0 }
    });
  },

  onNotice() {
    wx.showToast({ title: '消息通知 · 演示桩', icon: 'none' });
  },

  onAbout() {
    wx.showToast({ title: '校园请假 v1.0 · 演示', icon: 'none' });
  },

  onLogout() {
    wx.showToast({ title: '退出登录 · 演示桩', icon: 'none' });
  }
});

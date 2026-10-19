// app.js —— 全局入口
App({
  globalData: {
    /** 演示基准时间：真实项目应由后端下发 */
    demoNow: '2026-10-18 11:32:16',
    /** 状态栏高度（自定义导航页需要） */
    statusBarHeight: 20,
    /** 胶囊按钮信息 */
    menuRect: null,
    /** 首页状态卡当前选择的场景，供申请页继承 */
    lastScene: 'OFF_CAMPUS'
  },

  onLaunch() {
    this.measureSystem();
  },

  /** 读取机型信息（自定义导航栏做安全区适配） */
  measureSystem() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
    }
    try {
      this.globalData.menuRect = wx.getMenuButtonBoundingClientRect();
    } catch (e) {
      this.globalData.menuRect = null;
    }
  }
});

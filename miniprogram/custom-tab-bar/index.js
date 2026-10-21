/**
 * custom-tab-bar/index.js —— 自定义 tabBar
 *
 * 为什么用自定义而不是原生 tabBar（答辩可讲）：
 *   原生 tabBar 的图标必须是本地图片（png），而本项目零图片资源；
 *   且原生 tabBar 无法做「细线 + 文字 + 蓝色短横线」这套纸感设计。
 *   自定义 tabBar 用纯 WXML/WXSS 实现，零资源、样式完全可控。
 *
 * 用法（每个 tab 页的 onShow 里）：
 *   if (typeof this.getTabBar === 'function' && this.getTabBar()) {
 *     this.getTabBar().setData({ selected: 0 })
 *   }
 *
 * 组件实例是每个页面独立持有的，所以 selected 必须由页面主动同步，
 * 否则会出现"在记录页但首页高亮"的错位。
 */
Component({
  data: {
    /** 当前选中项索引：0 首页 / 1 记录 / 2 消息 / 3 我的 */
    selected: 0,
    /** 消息未读数（>0 时在「消息」右上角显示小红点数字） */
    unread: 0,
    list: [
      { pagePath: '/pages/student/home/home', text: '首页' },
      { pagePath: '/pages/student/records/records', text: '记录' },
      { pagePath: '/pages/student/messages/messages', text: '消息' },
      { pagePath: '/pages/student/profile/profile', text: '我的' }
    ]
  },

  methods: {
    /**
     * 点击切换 tab。
     * 用 switchTab 而不是 navigateTo：tab 页只能用 switchTab 跳，
     * 且 switchTab 会保留各 tab 的页面实例（不会重建）。
     */
    onTap(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (index === this.data.selected) return   // 点当前 tab 不重复跳转

      wx.switchTab({
        url: item.pagePath,
        fail: () => {
          // 兜底：万一 tabBar 配置与页面路径不一致，避免静默失败
          wx.showToast({ title: '页面跳转失败', icon: 'none' })
        }
      })
    }
  }
})

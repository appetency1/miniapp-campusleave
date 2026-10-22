/**
 * custom-tab-bar/index.js —— 自定义 tabBar
 *
 * 为什么用自定义而不是原生 tabBar：
 *   原生 tabBar 的图标只认本地 png，且样式（字号/字重/选中态）完全锁死，
 *   做不了纸感体系要的细线 + 衬线数字那套。自定义版用 WXML/WXSS，
 *   图标走内联 base64 SVG（见 icons.js），仍然零图片资源、零额外请求。
 *
 * 用法（每个 tab 页的 onShow 里）：
 *   if (typeof this.getTabBar === 'function' && this.getTabBar()) {
 *     this.getTabBar().setData({ selected: 0 })
 *   }
 *
 * 组件实例是每个页面独立持有的，所以 selected 必须由页面主动同步，
 * 否则会出现"在记录页但首页高亮"的错位。
 */
const { ICONS } = require('./icons')

/**
 * 图标的 on/off 两版 URL 在模块加载时就拼好塞进 list。
 * 不写在 WXML 表达式里（ICONS[item.icon][...] 这种二级计算属性 WXML 解析不稳），
 * 也让 setData 时只传已经算好的字符串。
 */
const LIST = [
  { pagePath: '/pages/student/home/home', text: '首页', icon: 'home' },
  { pagePath: '/pages/student/records/records', text: '记录', icon: 'records' },
  { pagePath: '/pages/student/messages/messages', text: '消息', icon: 'messages' },
  { pagePath: '/pages/student/profile/profile', text: '我的', icon: 'profile' }
].map((it) => ({
  ...it,
  iconOn: ICONS[it.icon].on,
  iconOff: ICONS[it.icon].off
}))

Component({
  data: {
    /** 当前选中项索引：0 首页 / 1 记录 / 2 消息 / 3 我的 */
    selected: 0,
    /** 消息未读数（>0 时在「消息」右上角显示小红点数字） */
    unread: 0,
    list: LIST
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

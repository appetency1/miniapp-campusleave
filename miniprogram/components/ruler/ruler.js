/**
 * components/ruler/ruler.js —— 刻度尺组件
 *
 * 属性：
 *   percent  0-100，进度（"现在"落在区间的位置）
 *   danger   是否逾期态（红色）
 *   labels   刻度文字数组，一般是 7 个（区间均分 6 段）
 *   nowText  指针上方的文字，如 "现在 11:20"
 *
 * 组件本身不做时间计算 —— 由页面算好百分比传进来。
 * 这样组件保持纯展示、易复用（首页用它、销假页也用它）。
 */
Component({
  properties: {
    percent: {
      type: Number,
      value: 0
    },
    danger: {
      type: Boolean,
      value: false
    },
    labels: {
      type: Array,
      value: []
    },
    nowText: {
      type: String,
      value: ''
    }
  }
})

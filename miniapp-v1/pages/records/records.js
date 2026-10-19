// pages/records/records.js —— 请假记录
const api = require('../../utils/api.js');
const F = require('../../utils/format.js');

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'IN_PROGRESS', label: '进行中' },
  { key: 'PENDING', label: '待审批' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'ENDED', label: '已结束' }
];

/** 是否“进行中”（已通过且尚未销假：待开始 / 请假中 / 已逾期） */
function isOngoing(eff) {
  return eff === F.EFFECTIVE_TEXT.WAITING_START ||
    eff === F.EFFECTIVE_TEXT.IN_PROGRESS ||
    eff === F.EFFECTIVE_TEXT.OVERDUE;
}

function matchFilter(r, key) {
  if (key === 'ALL') return true;
  if (key === 'IN_PROGRESS') return isOngoing(r.effective);
  if (key === 'PENDING') return r.statusLabel === F.STATUS_TEXT.PENDING;
  if (key === 'COMPLETED') return r.statusLabel === F.STATUS_TEXT.COMPLETED;
  // 已结束 = 其余（已驳回 / 已撤回 / 已取消）
  return !isOngoing(r.effective) &&
    r.statusLabel !== F.STATUS_TEXT.PENDING &&
    r.statusLabel !== F.STATUS_TEXT.COMPLETED;
}

Page({
  data: {
    loading: true,
    filters: FILTERS,
    filter: 'ALL',
    kpis: [],
    list: [],
    shown: []
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (this._inited) this.load();
  },

  async load() {
    // 首帧展示骨架；切回本 tab 的刷新不再闪骨架
    this.setData({ loading: !this._inited });
    let res = null;
    try {
      res = await api.getRecords();
    } catch (e) {
      res = null;
    }
    if (!res || res.code !== 0 || !res.data) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      return;
    }
    const stats = res.data.stats || {};
    const kpis = [
      { key: 'total', label: '申请数', value: stats.total || 0 },
      { key: 'approved', label: '审批通过', value: stats.approved || 0 },
      { key: 'completed', label: '已完成', value: stats.completed || 0 },
      { key: 'overdue', label: '当前逾期', value: stats.overdue || 0, clay: true }
    ];
    this.setData({ loading: false, kpis, list: res.data.list || [] });
    this.applyFilter(this.data.filter);
    this._inited = true;
  },

  applyFilter(key) {
    const shown = (this.data.list || [])
      .filter((r) => matchFilter(r, key))
      .map((r, i) => Object.assign({}, r, { d: i * 50 + 'ms' }));
    this.setData({ filter: key, shown });
  },

  onFilter(e) {
    this.applyFilter(e.currentTarget.dataset.key);
  },

  onItem(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});

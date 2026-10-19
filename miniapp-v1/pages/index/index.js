// pages/index/index.js —— 旗舰首页
const app = getApp();
const api = require('../../utils/api.js');
const F = require('../../utils/format.js');

// 首页胶囊筛选（按计算态文案归类；演示数据下「待审批」为空，用于展示空态）
const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'IN_PROGRESS', label: '进行中' },
  { key: 'PENDING', label: '待审批' },
  { key: 'COMPLETED', label: '已完成' }
];

const ONGOING = [F.EFFECTIVE_TEXT.WAITING_START, F.EFFECTIVE_TEXT.IN_PROGRESS, F.EFFECTIVE_TEXT.OVERDUE];

function matchFilter(r, key) {
  if (key === 'ALL') return true;
  if (key === 'IN_PROGRESS') return ONGOING.indexOf(r.statusLabel) >= 0;
  if (key === 'PENDING') return r.statusLabel === F.STATUS_TEXT.PENDING;
  if (key === 'COMPLETED') return r.statusLabel === F.STATUS_TEXT.COMPLETED;
  return true;
}

Page({
  data: {
    loading: true,
    statusBarHeight: 20,
    student: {},
    meta: {},
    focus: null,
    records: [],
    shown: [],
    filters: FILTERS,
    filter: 'ALL',
    scene: 'OFF_CAMPUS',
    countdown: '-- : -- : --'
  },

  onLoad() {
    const g = app.globalData || {};
    this.setData({ statusBarHeight: g.statusBarHeight || 20 });
    this.load();
  },

  onShow() {
    // 从申请页 / 销假页返回时重新拉取
    if (this._inited) this.load();
  },

  onHide() {
    this.stopTick();
  },

  onUnload() {
    this.stopTick();
  },

  async load() {
    // 首帧展示骨架；从子页返回的刷新不再闪骨架
    this.setData({ loading: !this._inited });
    let res = null;
    try {
      res = await api.getHome();
    } catch (e) {
      res = null;
    }
    if (!res || res.code !== 0 || !res.data) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      return;
    }
    const d = res.data;
    const metaTime = F.parseTime(d.meta && d.meta.now);
    this._metaNow = metaTime ? metaTime.getTime() : Date.now();
    this._pageLoadedAt = Date.now();

    this.setData({
      loading: false,
      student: d.student || {},
      meta: d.meta || {},
      focus: d.focus || null,
      scene: this._userScene || (d.focus ? d.focus.scene : 'OFF_CAMPUS'),
      records: d.records || []
    });

    this.applyFilter(this.data.filter);
    this.startTick();
    this._inited = true;
  },

  /* ---------- 倒计时：以 mock 基准时间为原点，按真实流逝每秒推进 ---------- */
  startTick() {
    this.stopTick();
    this.updateCountdown();
    this._timer = setInterval(() => this.updateCountdown(), 1000);
  },

  stopTick() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  updateCountdown() {
    const focus = this.data.focus;
    const end = focus ? F.parseTime(focus.endTime) : null;
    if (!end) {
      this.setData({ countdown: '-- : -- : --' });
      return;
    }
    const nowSim = this._metaNow + (Date.now() - this._pageLoadedAt);
    this.setData({ countdown: F.durationText(end.getTime() - nowSim) });
  },

  /* ---------- 列表筛选 ---------- */
  applyFilter(key) {
    const shown = (this.data.records || [])
      .filter((r) => matchFilter(r, key))
      .map((r, i) => ({
        id: r.id,
        type: r.type,
        period: r.period,
        statusLabel: r.statusLabel,
        pillKind: r.pillKind,
        sceneText: F.SCENE_TEXT[r.scene] || '',
        d: i * 50 + 'ms'
      }));
    this.setData({ filter: key, shown });
  },

  onFilter(e) {
    this.applyFilter(e.currentTarget.dataset.key);
  },

  onScene(e) {
    const scene = e.currentTarget.dataset.scene;
    if (!scene || scene === this.data.scene) return;
    this._userScene = scene;
    this.setData({ scene });
  },

  onItem(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  /* ---------- 主 / 次动作 ---------- */
  onPrimary() {
    const focus = this.data.focus;
    if (!focus) return;
    if (this.data.scene === 'OFF_CAMPUS') {
      wx.navigateTo({ url: '/pages/checkin/checkin?id=' + focus.id });
      return;
    }
    wx.showLoading({ title: '处理中', mask: true });
    api.confirmCheckin(focus.id)
      .then((res) => {
        wx.hideLoading();
        if (res && res.code === 0) {
          wx.showToast({ title: '已确认结束', icon: 'success' });
          this.load();
        } else {
          wx.showToast({ title: (res && res.message) || '操作失败', icon: 'none' });
        }
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  },

  onExtend() {
    const focus = this.data.focus;
    if (!focus) return;
    wx.navigateTo({ url: '/pages/apply/apply?mode=extend&id=' + focus.id });
  }
});

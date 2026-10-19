// pages/checkin/checkin.js —— 返校定位销假（状态机：ready / locating / result / done）
const api = require('../../utils/api.js');
const F = require('../../utils/format.js');
const { DB } = require('../../utils/mock.js');

Page({
  data: {
    step: 'ready',
    mode: 'pass',
    modes: [
      { value: 'pass', label: '通过' },
      { value: 'fail', label: '超范围' }
    ],
    limit: 0,
    distText: '0',
    result: null,
    reviewed: false,
    sheet: false,
    manualReason: '',
    submitting: false,
    doneTime: '',
    doneLogs: [],
    ctxNo: '',
    ctxPeriod: ''
  },

  onLoad(options) {
    this.id = (options && options.id) || '';
    this.baseLogs = [];
    this.setData({ limit: DB.locate.radiusLimit });
    if (this.id) this.loadContext();
  },

  onUnload() {
    if (this.dTimer) clearInterval(this.dTimer);
  },

  /** 拉取当前申请上下文，用于销假完成后的时间线 */
  loadContext() {
    api.getDetail(this.id).then((res) => {
      if (res.code !== 0 || !res.data) return;
      const d = res.data.detail;
      this.baseLogs = (d.logs || []).map((x, i) => ({
        k: 'L' + i,
        label: x.label,
        atText: F.shortTime(x.at)
      }));
      this.setData({ ctxNo: d.no, ctxPeriod: d.period, doneLogs: this.baseLogs });
    }).catch(() => {});
  },

  /* ---------- ready ---------- */
  onMode(e) {
    if (this.data.step !== 'ready') return;
    this.setData({ mode: e.currentTarget.dataset.mode, reviewed: false });
  },

  /* ---------- locating ---------- */
  onStart() {
    if (this.data.step === 'locating') return;
    if (this.dTimer) clearInterval(this.dTimer);
    this.setData({ step: 'locating', result: null, reviewed: false, distText: '0' });

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.realLoc = res; // 真机才有准确坐标；本项目仅作采集，距离由后端/桩下发
        wx.showToast({ title: '已获取真实定位', icon: 'none' });
        this.check();
      },
      fail: () => {
        this.realLoc = null;
        wx.showToast({ title: '已使用模拟定位', icon: 'none' });
        this.check();
      }
    });
  },

  check() {
    api.locateCheckin({ id: this.id, mode: this.data.mode }).then((res) => {
      const d = res.data || {};
      this.setData({
        step: 'result',
        result: {
          pass: res.code === 0,
          kind: d.kind,
          unit: d.unit,
          label: d.label,
          limit: d.limit || this.data.limit
        }
      });
      this.runDistance(Number(d.distance) || 0);
    }).catch(() => {
      this.setData({ step: 'ready' });
      wx.showToast({ title: '定位校验失败，请重试', icon: 'none' });
    });
  },

  /** 距离数字滚动增长动画 */
  runDistance(target) {
    if (this.dTimer) clearInterval(this.dTimer);
    const isFloat = target % 1 !== 0;
    const fmt = (v) => (isFloat ? v.toFixed(1) : String(Math.round(v)));
    const steps = 26;
    let i = 0;
    this.setData({ distText: fmt(0) });
    this.dTimer = setInterval(() => {
      i += 1;
      const p = 1 - Math.pow(1 - i / steps, 2);
      this.setData({ distText: fmt(target * p) });
      if (i >= steps) {
        clearInterval(this.dTimer);
        this.dTimer = null;
        this.setData({ distText: fmt(target) });
      }
    }, 40);
  },

  onReLocate() {
    this.onStart();
  },

  /* ---------- 人工核验弹层 ---------- */
  onSheetOpen() {
    this.setData({ sheet: true });
  },
  onSheetClose() {
    this.setData({ sheet: false });
  },
  onManualInput(e) {
    this.setData({ manualReason: e.detail.value });
  },
  onManualSubmit() {
    if (this.data.submitting) return;
    const reason = this.data.manualReason.trim();
    if (reason.length < 4) {
      wx.showToast({ title: '请填写核验事由（不少于 4 个字）', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api.submitManualReview({ id: this.id, reason: reason }).then((res) => {
      this.setData({ submitting: false, sheet: false });
      if (res.code === 0) {
        this.setData({ reviewed: true });
        wx.showToast({ title: '已提交人工核验', icon: 'none' });
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    });
  },

  /* ---------- 确认销假 ---------- */
  onConfirm() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api.confirmCheckin(this.id).then((res) => {
      this.setData({ submitting: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '销假失败', icon: 'none' });
        return;
      }
      const at = (res.data && res.data.actualEnd) || F.shortTime(DB.meta.now);
      const r = this.data.result;
      const extra = r && r.pass && r.label ? ' · GPS ' + r.label : '';
      const logs = (this.baseLogs || []).slice();
      logs.push({ k: 'L' + logs.length, label: '返校销假' + extra, atText: at });
      this.setData({ step: 'done', doneTime: at, doneLogs: logs });
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    });
  },

  onHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});

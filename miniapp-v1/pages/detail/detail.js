// pages/detail/detail.js —— 申请详情（数据来自 utils/api.js）
const api = require('../../utils/api.js');
const F = require('../../utils/format.js');

Page({
  data: {
    loading: true,
    error: '',
    detail: null
  },

  onLoad(options) {
    this.id = (options && options.id) || '';
    if (!this.id) {
      this.setData({ loading: false, error: '缺少申请编号' });
      return;
    }
    this.load();
  },

  load() {
    if (!this.id) return;
    this.setData({ loading: true, error: '' });
    api.getDetail(this.id).then((res) => {
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false, error: res.message || '申请不存在' });
        return;
      }
      const d = res.data.detail;
      d.logs = (d.logs || []).map((x, i) => ({
        k: 'L' + i,
        label: x.label,
        atText: F.shortTime(x.at),
        by: x.by || ''
      }));
      d.breath = d.pillKind === 'live';
      // 离校 + 请假中 / 已逾期 → 可返校定位销假
      d.canCheckin = !!d.canExtend && d.sceneText === F.SCENE_TEXT.OFF_CAMPUS;
      this.setData({ loading: false, detail: d });
    }).catch(() => {
      this.setData({ loading: false, error: '网络异常，请稍后重试' });
    });
  },

  /* ---------- 操作（原型桩反馈） ---------- */
  onWithdraw() {
    this.confirmStub('撤回申请', '撤回后该申请将作废，是否继续？', '已撤回（原型演示）');
  },

  onCancel() {
    this.confirmStub('取消申请', '取消后该时段将释放，是否继续？', '已取消（原型演示）');
  },

  confirmStub(title, content, toast) {
    wx.showModal({
      title: title,
      content: content,
      confirmColor: '#1F3A2B',
      success: (r) => {
        if (r.confirm) wx.showToast({ title: toast, icon: 'none' });
      }
    });
  },

  onExtend() {
    wx.navigateTo({ url: '/pages/apply/apply?mode=extend&id=' + this.id });
  },

  onCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin?id=' + this.id });
  }
});

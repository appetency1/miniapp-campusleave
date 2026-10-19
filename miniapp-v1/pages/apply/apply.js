// pages/apply/apply.js —— 发起请假 / 续假（数据来自 utils/api.js、utils/mock.js）
const api = require('../../utils/api.js');
const F = require('../../utils/format.js');
const { DB } = require('../../utils/mock.js');

/** 拼装 'YYYY-MM-DD HH:mm' */
function combine(date, clock) {
  if (!date || !clock) return '';
  return date + ' ' + clock;
}

Page({
  data: {
    mode: 'new',
    id: '',
    radiusLimit: 0,
    scenes: [],
    sceneIndex: 0,
    isOffCampus: true,
    types: [],
    typeIndex: -1,
    typeText: '',
    startDate: '',
    startClock: '08:00',
    endDate: '',
    endClock: '12:00',
    reason: '',
    dest: '',
    phone: '',
    extendInfo: null,
    errors: {},
    submitting: false
  },

  onLoad(options) {
    const opt = options || {};
    const mode = opt.mode === 'extend' ? 'extend' : 'new';
    const scenes = DB.options.scenes;
    const types = DB.options.types;
    const today = String(DB.meta.now).slice(0, 10);
    const defScene = mode === 'new' ? (getApp().globalData.lastScene || 'OFF_CAMPUS') : '';
    let si = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (scenes[i].value === defScene) si = i;
    }

    this.setData({
      mode: mode,
      id: mode === 'extend' ? (opt.id || '') : '',
      radiusLimit: DB.locate.radiusLimit,
      scenes: scenes,
      types: types,
      sceneIndex: si,
      isOffCampus: scenes[si].value === 'OFF_CAMPUS',
      startDate: today,
      endDate: today,
      phone: DB.student.phone || ''
    });

    if (mode === 'extend') this.loadExtendContext();
  },

  /** 续假模式：拉取当前申请上下文（当前时段 / 类型 / 场景） */
  loadExtendContext() {
    if (!this.data.id) return;
    api.getDetail(this.data.id).then((res) => {
      if (res.code !== 0 || !res.data) return;
      const d = res.data.detail;
      this.setData({
        extendInfo: { no: d.no, period: d.period, type: d.type, sceneText: d.sceneText }
      });
    }).catch(() => {});
  },

  /* ---------- 字段交互 ---------- */
  clearErr(keys) {
    const errors = Object.assign({}, this.data.errors);
    for (let i = 0; i < keys.length; i++) delete errors[keys[i]];
    this.setData({ errors: errors });
  },

  onScene(e) {
    const i = Number(e.currentTarget.dataset.index);
    const s = this.data.scenes[i];
    if (!s) return;
    this.setData({ sceneIndex: i, isOffCampus: s.value === 'OFF_CAMPUS' });
    this.clearErr(['scene', 'dest']);
  },

  onType(e) {
    const i = Number(e.detail.value);
    this.setData({ typeIndex: i, typeText: this.data.types[i] || '' });
    this.clearErr(['type']);
  },

  onStartDate(e) { this.setData({ startDate: e.detail.value }); this.clearErr(['start', 'end']); },
  onStartClock(e) { this.setData({ startClock: e.detail.value }); this.clearErr(['start', 'end']); },
  onEndDate(e) { this.setData({ endDate: e.detail.value }); this.clearErr(['end']); },
  onEndClock(e) { this.setData({ endClock: e.detail.value }); this.clearErr(['end']); },
  onReason(e) { this.setData({ reason: e.detail.value }); this.clearErr(['reason']); },
  onDest(e) { this.setData({ dest: e.detail.value }); this.clearErr(['dest']); },
  onPhone(e) { this.setData({ phone: e.detail.value }); this.clearErr(['phone']); },

  /* ---------- 校验（本地先判一次时间冲突） ---------- */
  validate() {
    const d = this.data;
    const e = {};
    const start = combine(d.startDate, d.startClock);
    const end = combine(d.endDate, d.endClock);

    if (d.mode !== 'extend' && d.typeIndex < 0) e.type = '请选择请假类型';

    if (!d.endDate || !d.endClock) e.end = '请选择结束时间';

    // 开始 / 结束的先后关系仅在「新申请」模式判定（续假无开始时间）
    if (d.mode !== 'extend') {
      if (!d.startDate || !d.startClock) e.start = '请选择开始时间';
      if (!e.start && !e.end) {
        const sd = F.parseTime(start);
        const ed = F.parseTime(end);
        if (!sd || !ed) e.end = '时间格式不正确';
        else if (ed <= sd) e.end = '结束时间必须晚于开始时间';
      }
    }

    if (d.mode === 'extend') {
      const now = F.parseTime(DB.meta.now);
      const ed = F.parseTime(end);
      if (!e.end && ed && now && ed <= now) e.end = '新的结束时间必须晚于当前时间';
    }

    if (!d.reason || d.reason.trim().length < 4) e.reason = '请填写事由（不少于 4 个字）';

    if (d.mode !== 'extend' && d.isOffCampus && !d.dest.trim()) e.dest = '离校场景需填写去向';

    if (d.mode !== 'extend') {
      const phone = d.phone.trim();
      if (!phone) e.phone = '请填写联系电话';
      else if (!/^[0-9*]{6,}$/.test(phone)) e.phone = '联系电话格式不正确';
    }

    // 本地先判一次与本人有效申请（PENDING / APPROVED）的时间冲突
    if (d.mode !== 'extend' && !e.start && !e.end) {
      const clash = DB.applications
        .filter((a) => a.status === 'PENDING' || a.status === 'APPROVED')
        .find((a) => F.isOverlap(start, end, a.startTime, a.endTime));
      if (clash) e.end = '与申请 ' + clash.no + '（' + F.periodText(clash) + '）时间冲突';
    }
    return e;
  },

  /* ---------- 提交 ---------- */
  onSubmit() {
    if (this.data.submitting) return;
    const errors = this.validate();
    if (Object.keys(errors).length) {
      this.setData({ errors: errors });
      wx.showToast({ title: '请检查表单内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true, errors: {} });
    const isExtend = this.data.mode === 'extend';

    const task = isExtend
      ? api.submitExtension({
          id: this.data.id,
          requestedEndTime: combine(this.data.endDate, this.data.endClock),
          reason: this.data.reason.trim()
        })
      : api.submitApplication({
          scene: this.data.scenes[this.data.sceneIndex].value,
          type: this.data.typeText,
          startTime: combine(this.data.startDate, this.data.startClock),
          endTime: combine(this.data.endDate, this.data.endClock),
          reason: this.data.reason.trim(),
          destination: this.data.isOffCampus ? this.data.dest.trim() : '',
          phone: this.data.phone.trim()
        });

    task.then((res) => {
      this.setData({ submitting: false });
      if (res.code === 0) {
        wx.showToast({ title: isExtend ? '续假申请已提交' : '请假申请已提交', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1100);
        return;
      }
      // 后端（桩）返回冲突：code=409，落到对应字段行内提示
      if (res.code === 409) {
        const err = Object.assign({}, this.data.errors);
        err.end = res.message || '当前时间段与已有申请冲突';
        this.setData({ errors: err });
      }
      wx.showToast({ title: res.message || '提交失败', icon: 'none' });
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    });
  }
});

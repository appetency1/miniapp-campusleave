/* 演示数据：仅在未接后端时使用（GET /api/v1/teacher/* 尚未实现）。
   时间全部相对"今天"生成，答辩当天不会过期。接后端后整份删除。 */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const at = (offsetDay, hm) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDay);
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(m)}`;
  };
  const now = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const S = {
    li: { no: '2023001001', name: '李知远', cls: '计算机2301', phone: '13905710011', ec: '李建国 13805710012' },
    chen: { no: '2023001002', name: '陈嘉禾', cls: '计算机2301', phone: '13905710022', ec: '陈慧 13805710023' },
    wang: { no: '2023001003', name: '王雨桐', cls: '计算机2301', phone: '13905710033', ec: '王军 13805710034' },
    zhao: { no: '2023001004', name: '赵一鸣', cls: '计算机2301', phone: '13905710044', ec: '赵红 13805710045' },
    zhou: { no: '2023002001', name: '周斯年', cls: '计算机2302', phone: '13905720011', ec: '周敏 13805720012' },
    sun: { no: '2023002002', name: '孙悦', cls: '计算机2302', phone: '13905720022', ec: '孙立 13805720023' },
    wu: { no: '2023002003', name: '吴悠', cls: '计算机2302', phone: '13905720033', ec: '吴芳 13805720034' },
    zheng: { no: '2023002004', name: '郑书言', cls: '计算机2302', phone: '13905720044', ec: '郑伟 13805720045' }
  };

  // 一条申请：s=学生, sc=场景, tp=类型, st/et=起止, stt=持久状态, eff=展示态
  const app = (id, s, sc, tp, st, et, stt, eff, extra) =>
    Object.assign(
      {
        id,
        no: 'LA2026' + String(101000 + id),
        studentNo: s.no,
        studentName: s.name,
        className: s.cls,
        phone: s.phone,
        emergencyContact: s.ec,
        scene: sc,
        type: tp,
        start: st,
        end: et,
        status: stt,
        effective: eff,
        reason: '',
        destination: '',
        submittedAt: st,
        approvedBy: '张明远',
        approvedAt: '',
        rejectReason: '',
        actualEnd: '',
        pendingExtension: false,
        materials: [],
        checkins: []
      },
      extra || {}
    );

  const apps = [
    // 待审批 3 条
    app(1, S.li, '离校', '病假', at(1, '08:00'), at(1, '18:00'), 'PENDING', 'PENDING', {
      reason: '连续两天低烧，校医院建议到市第一人民医院做血常规检查。',
      destination: '市第一人民医院（解放路院区）',
      submittedAt: at(0, '09:12'),
      materials: [{ name: '校医院转诊单.jpg', type: '诊断证明', size: '812 KB' }]
    }),
    app(2, S.chen, '校内', '事假', at(0, '14:00'), at(0, '22:00'), 'PENDING', 'PENDING', {
      reason: '参加学院组织的数学建模竞赛集训，晚上在实验楼通宵调试。',
      submittedAt: at(0, '10:40')
    }),
    app(3, S.zhou, '离校', '事假', at(2, '08:00'), at(2, '12:00'), 'PENDING', 'PENDING', {
      reason: '回家参加姐姐的婚礼，当天下午返校。',
      destination: '本市 江干区',
      submittedAt: at(0, '11:05'),
      materials: [{ name: '家长知情同意书.pdf', type: '请假单', size: '246 KB' }]
    }),

    // 进行中 3 条（其中 1 条定位失败待核验）
    app(4, S.wang, '离校', '病假', at(0, '08:00'), at(0, '20:00'), 'APPROVED', 'IN_PROGRESS', {
      reason: '急性肠胃炎，需到市二医院门诊输液。',
      destination: '市第二人民医院',
      approvedAt: at(-1, '20:15'),
      materials: [{ name: '门诊病历.jpg', type: '诊断证明', size: '1.2 MB' }],
      checkins: [
        { id: 41, type: 'GPS', result: 'FAILED', review: 'PENDING_REVIEW', time: at(0, '18:32'), distance: 326.4, note: '不在校区范围（326 米）' }
      ],
      actions: ['REVIEW']
    }),
    app(5, S.sun, '校内', '病假', at(0, '10:00'), at(0, '18:00'), 'APPROVED', 'IN_PROGRESS', {
      reason: '感冒发热，在宿舍休息，不去教室。',
      approvedAt: at(0, '09:20')
    }),
    app(6, S.wu, '离校', '病假', at(0, '09:00'), at(0, '23:00'), 'APPROVED', 'IN_PROGRESS', {
      reason: '牙髓炎复发，预约了口腔医院下午的根管治疗。',
      destination: '市口腔医院',
      approvedAt: at(-1, '21:40'),
      pendingExtension: true,
      materials: [{ name: '预约凭证.png', type: '其他', size: '430 KB' }]
    }),

    // 逾期 2 条
    app(7, S.zhao, '校内', '病假', at(-1, '08:00'), at(-1, '12:00'), 'APPROVED', 'OVERDUE', {
      reason: '肠胃不适，在宿舍休息半天。',
      approvedAt: at(-2, '22:10')
    }),
    app(8, S.zheng, '离校', '事假', at(-1, '14:00'), at(-1, '22:00'), 'APPROVED', 'OVERDUE', {
      reason: '外出参加招聘会宣讲，原计划当晚返校。',
      destination: '浙江展览馆',
      approvedAt: at(-2, '19:30'),
      checkins: [
        { id: 81, type: 'GPS', result: 'FAILED', review: 'PENDING_REVIEW', time: at(-1, '22:14'), distance: 1840.2, note: '不在校区范围（1.8 公里）' },
        { id: 82, type: 'MANUAL_REVIEW', result: 'FAILED', review: 'PENDING_REVIEW', time: at(-1, '22:40'), distance: 1840.2, note: '学生提交：招聘会延时，正在返程' }
      ]
    }),

    // 待开始 1 条
    app(9, S.li, '离校', '其他', at(1, '20:00'), at(2, '08:00'), 'APPROVED', 'WAITING_START', {
      reason: '参加蓝桥杯省赛，当晚在赛点附近住宿。',
      destination: '杭州电子科技大学',
      approvedAt: at(0, '08:40')
    }),

    // 已终结
    app(10, S.chen, '校内', '事假', at(-3, '13:00'), at(-3, '18:00'), 'REJECTED', 'REJECTED', {
      reason: '外出取快递',
      submittedAt: at(-3, '11:20'),
      rejectReason: '校内请假不适用于外出取件，请改为课余时间自行处理。'
    }),
    app(11, S.zhou, '离校', '病假', at(-4, '08:00'), at(-4, '18:00'), 'WITHDRAWN', 'WITHDRAWN', {
      reason: '发烧就医',
      destination: '市第一人民医院',
      submittedAt: at(-4, '07:50')
    }),
    app(12, S.sun, '离校', '事假', at(-5, '08:00'), at(-5, '20:00'), 'CANCELLED', 'CANCELLED', {
      reason: '回家搬家',
      destination: '本市 拱墅区',
      submittedAt: at(-6, '21:00'),
      approvedAt: at(-6, '21:30')
    }),
    app(13, S.wang, '离校', '病假', at(-6, '08:00'), at(-6, '17:00'), 'COMPLETED', 'COMPLETED', {
      reason: '复查胃镜',
      destination: '市第二人民医院',
      approvedAt: at(-7, '18:00'),
      actualEnd: at(-6, '16:42'),
      materials: [{ name: '胃镜报告.pdf', type: '诊断证明', size: '1.8 MB' }],
      checkins: [
        { id: 131, type: 'GPS', result: 'PASSED', review: 'NONE', time: at(-6, '16:42'), distance: 18.6, note: '已回到校区（18 米）' }
      ]
    }),
    app(14, S.zhao, '校内', '病假', at(-8, '09:00'), at(-8, '17:00'), 'COMPLETED', 'COMPLETED', {
      reason: '感冒在宿舍休息',
      approvedAt: at(-9, '20:00'),
      actualEnd: at(-8, '16:10'),
      checkins: [
        { id: 141, type: 'ON_CAMPUS_CONFIRM', result: 'PASSED', review: 'NONE', time: at(-8, '16:10'), distance: 0, note: '学生自主确认结束' }
      ]
    })
  ];

  const extensions = [
    {
      id: 7,
      applicationId: 6,
      studentName: '吴悠',
      className: '计算机2302',
      scene: '离校',
      type: '病假',
      originEnd: at(0, '23:00'),
      requestedEnd: at(1, '12:00'),
      reason: '根管治疗需要分两次，医生建议明天上午复诊后观察半天。',
      submittedAt: at(0, '12:20'),
      status: 'PENDING'
    },
    {
      id: 6,
      applicationId: 13,
      studentName: '王雨桐',
      className: '计算机2301',
      scene: '离校',
      type: '病假',
      originEnd: at(-6, '17:00'),
      requestedEnd: at(-5, '17:00'),
      reason: '医生建议再休息一天。',
      submittedAt: at(-6, '15:00'),
      status: 'REJECTED',
      comment: '复查报告显示已无大碍，按原时间返校即可。'
    }
  ];

  const students = Object.values(S).map((s, i) => ({
    id: i + 1,
    no: s.no,
    name: s.name,
    cls: s.cls,
    phone: s.phone,
    total: [4, 5, 3, 2, 4, 3, 3, 1][i],
    approved: [3, 3, 3, 2, 2, 2, 2, 1][i],
    completed: [2, 2, 2, 1, 1, 1, 0, 0][i],
    current: ['待审批', '待审批', '请假中', '逾期', '待审批', '请假中', '请假中', '逾期'][i]
  }));

  window.MOCK = {
    now,
    teacher: { name: '张明远', no: 'T2023001', department: '计算机学院', classes: ['计算机2301', '计算机2302'] },
    apps,
    extensions,
    students,
    stats: { totalApplications: 46, approved: 38, completed: 33, currentOverdue: 2 }
  };
})();

/* 原型自检脚本：真实 Chromium 驱动，走关键路径 + 截图 */
const { chromium } = require('C:/Users/Administrator/.dsh/profiles/web/node_modules/playwright-core');
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL = 'file:///D:/AI%20Code/CampusLeave/prototype/index.html';
const OUT = 'D:/AI Code/CampusLeave/prototype/_shots/_test/';   // 自检过程图单独放，避免与交付截图混在一起
require('fs').mkdirSync(OUT, { recursive: true });

const log = [];
const errors = [];
function ok(name, cond, extra) { log.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(400);

  // 关掉首次引导
  const onboard = await page.locator('#onboard').isVisible();
  ok('首次引导出现', onboard);
  if (onboard) await page.click('[data-action="onboard-ok"]');
  await page.waitForTimeout(200);

  const phone = page.locator('#phone');
  const topPush = () => page.locator('#pushLayer .page').last();
  async function backToTab() {
    while (await page.locator('#pushLayer .page').count() > 0) {
      await page.locator('#pushLayer .page').last().locator('[data-action="back"]').click();
      await page.waitForTimeout(320);
    }
  }

  // ---------- S1 ----------
  ok('S1 问候文案', (await page.locator('.greet__t1').innerText()).includes('请假中'));
  ok('S1 只有 1 张申请卡', (await page.locator('#phone .page.is-active .app-card').count()) === 1);
  await phone.screenshot({ path: OUT + 'S1-home.png' });

  // ---------- S3 筛选 ----------
  await page.click('[data-action="tab"][data-id="S3"]');
  await page.waitForTimeout(300);
  ok('S3 筛选 8 项', (await page.locator('.filters__item').count()) === 8);
  ok('S3 列表卡片数 = 6', (await page.locator('#phone .page.is-active .app-card').count()) === 6);
  await page.click('[data-action="s3-filter"][data-val="APPROVED"]');
  await page.waitForTimeout(300);
  const approvedCount = await page.locator('#phone .page.is-active .app-card').count();
  const approvedBadges = await page.locator('#phone .page.is-active .app-card .badge--progress').count();
  ok('S3「已通过」不含请假中', approvedCount === 1 && approvedBadges === 0, 'count=' + approvedCount);
  await page.click('[data-action="s3-filter"][data-val="ALL"]');
  await page.waitForTimeout(250);
  await phone.screenshot({ path: OUT + 'S3-records.png' });

  // ---------- S2 全流程 ----------
  await page.click('[data-action="tab"][data-id="S1"]');
  await page.waitForTimeout(250);
  await page.click('[data-action="new-apply"]');
  await page.waitForTimeout(350);
  ok('S2 场景默认未选中', (await page.locator('input[name="scene"]:checked').count()) === 0);
  ok('S2 类型默认未选中', (await page.locator('.seg__btn.is-on').count()) === 0);
  await phone.screenshot({ path: OUT + 'S2-apply.png' });

  await page.click('[data-action="submit-apply"]');
  await page.waitForTimeout(400);
  ok('S2 未选场景提交 → 报错文案', (await page.locator('[data-err="scene"]').innerText()) === '请选择请假场景');

  await page.click('.scene-card:has(input[value="OFF_CAMPUS"])');
  await page.waitForTimeout(250);
  ok('S2 离校 → 离校信息卡出现', (await page.locator('[data-field-wrap="destination"]').count()) === 1);
  await page.click('[data-action="pick-type"][data-val="PERSONAL"]');
  await page.waitForTimeout(200);

  // 结束时间 picker
  await page.click('[data-field-wrap="end"]');
  await page.waitForTimeout(350);
  ok('S2 时间面板三列', (await page.locator('.picker__col').count()) === 3);
  await page.screenshot({ path: OUT + 'S2-picker.png', clip: { x: 0, y: 0, width: 900, height: 900 } });
  await page.click('[data-picker-ok]');
  await page.waitForTimeout(300);
  ok('S2 选完结束时间有值', !(await page.locator('[data-field-wrap="end"] .placeholder').count()));

  await page.fill('[data-input="reason"]', '家中有事需回家一趟，已与家长沟通，返校后按时完成定位销假。');
  await page.fill('[data-input="destination"]', '宁波市海曙区中山西路 210 号');
  await page.fill('[data-input="phone"]', '13800006621');
  await page.waitForTimeout(200);

  async function pickShiftForceOverlap() {
    // 开始时间回到「今天 18:30」附近（与当前请假重叠）
    await page.click('[data-field-wrap="start"]');
    await page.waitForTimeout(320);
    await page.evaluate(() => { document.querySelector('[data-col="d"]').scrollTop = 0; });
    await page.waitForTimeout(200);
    await page.click('[data-picker-ok]');
    await page.waitForTimeout(260);
  }
  // 把时间改回与当前请假记录重叠，验证冲突校验
  await pickShiftForceOverlap();
  await page.click('[data-action="submit-apply"]');
  await page.waitForTimeout(500);
  const conflictMsg = await page.locator('[data-err="end"]').innerText().catch(() => '');
  ok('S2 时间冲突校验', conflictMsg.includes('重叠'), conflictMsg);

  // 改到 10.18（避开当前请假区间）
  async function pickShift(sel, dayIndex) {
    await page.click(sel);
    await page.waitForTimeout(320);
    await page.evaluate(i => { document.querySelector('[data-col="d"]').scrollTop = i * 36; }, dayIndex);
    await page.waitForTimeout(200);
    await page.click('[data-picker-ok]');
    await page.waitForTimeout(260);
  }
  // 避开已有请假区间（10.18 12:10 → 10.19 14:10，跨 1 天）
  await pickShift('[data-field-wrap="start"]', 2);
  await pickShift('[data-field-wrap="end"]', 1);
  ok('S2 跨天时长提示', (await page.locator('.field-hint').innerText()).includes('共'),
    await page.locator('[data-field-wrap="start"] .form-row__value').innerText() + ' -> ' +
    await page.locator('[data-field-wrap="end"] .form-row__value').innerText());

  await page.click('[data-action="submit-apply"]');
  await page.waitForTimeout(250);
  ok('S2 提交进入 loading', (await page.locator('[data-action="submit-apply"].is-loading').count()) === 1);
  await page.waitForTimeout(900);
  ok('S2 提交后 replace 到 S4', (await page.locator('#pushLayer .page[data-page="S4"]').count()) === 1);
  ok('S2 提交后 S2 已不存在（replace 非 push）', (await page.locator('#pushLayer .page[data-page="S2"]').count()) === 0);
  ok('S4 结论 待审批', (await topPush().locator('.concl__text').innerText()) === '等待辅导员审批');
  ok('S4 PENDING 只有一个描边按钮', (await topPush().locator('.bar .btn').count()) === 1);
  await phone.screenshot({ path: OUT + 'S4-detail-pending.png' });

  // 返回直达 S1（F13）
  await topPush().locator('[data-action="back"]').click();
  await page.waitForTimeout(400);
  ok('F13 返回直达 S1', (await page.locator('.page.is-active').getAttribute('data-page')) === 'S1');
  await page.click('[data-action="tab"][data-id="S3"]');
  await page.waitForTimeout(300);
  ok('F13 S3 数据已更新（7 条）', (await page.locator('#phone .page.is-active .app-card').count()) === 7);
  await page.click('[data-action="s3-go-home"]').catch(() => {});
  await page.click('[data-action="tab"][data-id="S1"]');
  await page.waitForTimeout(300);

  // ---------- 演示层：请假中（离校） ----------
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  ok('演示面板 5+ 组', (await page.locator('.sheet .sheet__group').count()) >= 5);
  await page.screenshot({ path: OUT + 'D-demo-sheet.png', clip: { x: 0, y: 0, width: 900, height: 900 } });
  await page.click('[data-action="demo-status"][data-val="IN_PROGRESS_OFF"]');
  await page.waitForTimeout(500);
  ok('演示切换后 S1 问候为请假中', (await page.locator('.greet__t1').innerText()).includes('请假中'));

  await page.locator('#phone .page.is-active .app-card').first().click();
  await page.waitForTimeout(400);
  ok('S4 IN_PROGRESS 主按钮 = 返校定位并销假',
    (await topPush().locator('.bar .btn--primary').innerText()).trim() === '返校定位并销假');
  ok('S4 IN_PROGRESS 次按钮 = 申请续假',
    (await topPush().locator('.bar .btn--secondary').innerText()).trim() === '申请续假');
  await phone.screenshot({ path: OUT + 'S4-detail-progress.png' });

  // 续假
  await page.click('[data-action="s4-extend"]');
  await page.waitForTimeout(400);
  ok('S5 打开', (await page.locator('#pushLayer .page[data-page="S5"]').count()) === 1);
  await page.click('[data-field-wrap="newEnd"]');
  await page.waitForTimeout(350);
  await page.click('[data-picker-ok]');
  await page.waitForTimeout(300);
  await page.fill('[data-input="extReason"]', '返程车次延误，申请延长至次日晚间。');
  await page.click('[data-action="submit-ext"]');
  await page.waitForTimeout(1200);
  ok('S5 提交后 pop 回 S4', (await page.locator('#pushLayer .page[data-page="S5"]').count()) === 0);
  ok('S4 出现续假待审批小徽章', (await topPush().locator('.badge--ext').innerText()).includes('续假待审批'));
  ok('F8 续假待审批期间结束时间仍为原值',
    (await topPush().locator('.row:has(.row__label:text("结束时间")) .row__value').innerText()).includes('10月17日'));
  await page.click('[data-action="s4-extend"]');
  await page.waitForTimeout(400);
  ok('F7 S5 只读且按钮 disabled',
    (await topPush().locator('.bar .btn').innerText()).includes('续假待审批中') &&
    (await topPush().locator('.bar .btn').isDisabled()));
  await topPush().locator('[data-action="back"]').click();
  await page.waitForTimeout(350);

  // 演示：续假通过
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="demo-ext"][data-val="APPROVED"]');
  await page.waitForTimeout(600);
  ok('S4 续假已通过徽章', (await topPush().locator('.badge--ext').innerText()).includes('续假已通过'));
  ok('续假通过后结束时间更新为 18:00',
    (await topPush().locator('.row:has(.row__label:text("结束时间")) .row__value').innerText()).includes('18:00'));

  // 定位销假 - 成功分支
  await page.click('[data-action="s4-locate"]');
  await page.waitForTimeout(400);
  ok('S6 进入 locating', (await topPush().locator('.loc__ring--locating').count()) === 1);
  ok('P1-5 定位中「校验时间」保持 —',
    (await topPush().locator('.loc__facts .row').nth(0).locator('.row__value').innerText()) === '—');
  await phone.screenshot({ path: OUT + 'S6-locating.png' });
  await page.waitForTimeout(1600);
  ok('S6 success', (await topPush().locator('.loc__title').innerText()) === '定位校验通过');
  await phone.screenshot({ path: OUT + 'S6-success.png' });
  await page.click('[data-action="s6-back"]');
  await page.waitForTimeout(450);
  ok('S6 成功后 S4 为已销假',
    (await topPush().locator('.concl__text').innerText()).indexOf('已销假') === 0);
  ok('已销假无操作栏', (await topPush().locator('.bar').count()) === 0);

  // 失败分支
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="demo-status"][data-val="IN_PROGRESS_OFF"]');
  await page.waitForTimeout(500);
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="demo-loc"][data-val="out"]');
  await page.waitForTimeout(600);
  await topPush().locator('[data-action="s4-locate"]').click();
  await page.waitForTimeout(2000);
  ok('S6 范围外', (await topPush().locator('.loc__title').innerText()) === '当前位置不在校园范围');
  ok('S6 失败给两个出口', (await topPush().locator('.bar .btn').count()) === 2);
  const tOut = await topPush().locator('.loc__facts .row').nth(0).locator('.row__value').innerText();
  ok('P1-5 范围外显示本次校验时刻', /^\d{2}\.\d{2} \d{2}:\d{2}$/.test(tOut), tOut);
  ok('P1-5 范围外第三行为「未通过」',
    (await topPush().locator('.loc__facts .row').nth(2).locator('.row__value').innerText()) === '未通过');
  await phone.screenshot({ path: OUT + 'S6-out-of-range.png' });
  await topPush().locator('[data-action="back"]').click();
  await page.waitForTimeout(450);
  ok('F6 定位失败返回 S4 仍为请假中',
    (await topPush().locator('.concl__text').innerText()).indexOf('请假中') === 0);

  // 权限拒绝 / 定位失败子态：校验时刻同样要有值，第三行区分文案
  for (const [val, third] of [['deny', '未获得授权'], ['fail', '定位失败']]) {
    await page.click('[data-action="demo-open"]');
    await page.waitForTimeout(350);
    await page.click('[data-action="demo-loc"][data-val="' + val + '"]');
    await page.waitForTimeout(600);
    await topPush().locator('[data-action="s4-locate"]').click();
    await page.waitForTimeout(2000);
    const t = await topPush().locator('.loc__facts .row').nth(0).locator('.row__value').innerText();
    ok('P1-5 ' + val + ' 显示本次校验时刻', /^\d{2}\.\d{2} \d{2}:\d{2}$/.test(t), t);
    ok('P1-5 ' + val + ' 第三行 = ' + third,
      (await topPush().locator('.loc__facts .row').nth(2).locator('.row__value').innerText()) === third);
    await topPush().locator('[data-action="back"]').click();
    await page.waitForTimeout(450);
  }

  // 逾期矩阵
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="demo-status"][data-val="OVERDUE_OFF"]');
  await page.waitForTimeout(600);
  ok('F5 逾期提示条', (await topPush().locator('.overdue-bar').count()) === 1);
  ok('F5 描边逾期徽章', (await topPush().locator('.badge--overdue').first().isVisible()));
  ok('F5 主按钮上方两个文字按钮', (await topPush().locator('.bar__row .link-btn').count()) === 2);
  await phone.screenshot({ path: OUT + 'S4-detail-overdue.png' });

  // 校内确认结束
  await page.click('[data-action="demo-open"]');
  await page.waitForTimeout(350);
  await page.click('[data-action="demo-status"][data-val="IN_PROGRESS_ON"]');
  await page.waitForTimeout(600);
  ok('F4 校内主按钮 = 确认结束', (await topPush().locator('.bar .btn--primary').innerText()).trim() === '确认结束');
  await page.click('.bar .btn--primary');
  await page.waitForTimeout(400);
  ok('确认结束弹窗文案', (await page.locator('.dialog__body').innerText()).includes('结束时间记为当前时间'));
  await page.click('[data-dlg="cancel"]');
  await page.waitForTimeout(400);
  ok('弹窗取消后状态不变', (await topPush().locator('.concl__text').innerText()).indexOf('请假中') === 0);
  await page.click('.bar .btn--primary');
  await page.waitForTimeout(400);
  await page.click('[data-dlg="ok"]');
  await page.waitForTimeout(500);
  ok('确认结束后为已销假', (await topPush().locator('.concl__text').innerText()).indexOf('已销假') === 0);

  // 消息
  await backToTab();
  await page.click('[data-action="tab"][data-id="S7"]');
  await page.waitForTimeout(300);
  ok('S7 5 条消息', (await page.locator('#phone .msg').count()) === 5);
  ok('S7 未读 1 条', (await page.locator('.msg.is-unread').count()) === 1);
  await phone.screenshot({ path: OUT + 'S7-messages.png' });
  await page.click('.msg.is-unread');
  await page.waitForTimeout(350);
  ok('进详情即已读', (await page.locator('.msg.is-unread').count()) === 0 && (await page.locator('#msgPill').isHidden()));
  await phone.screenshot({ path: OUT + 'S8-message-detail.png' });
  await topPush().locator('[data-action="back"]').click();
  await page.waitForTimeout(300);

  // 我的
  await page.click('[data-action="tab"][data-id="S9"]');
  await page.waitForTimeout(300);
  const stats = await page.locator('.stat__n').allInnerTexts();
  await page.click('[data-action="tab"][data-id="S3"]');
  await page.waitForTimeout(300);
  const listCount = await page.locator('#phone .page.is-active .app-card').count();
  await page.click('[data-action="tab"][data-id="S9"]');
  await page.waitForTimeout(300);
  ok('S9 累计申请 = 记录列表条数', Number(stats[0]) === listCount,
    'stats=' + stats.join('/') + ' list=' + listCount);
  ok('S9 已批准 ≥ 已销假', Number(stats[1]) >= Number(stats[2]));
  await phone.screenshot({ path: OUT + 'S9-profile.png' });

  // 移动端断点
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  const box = await page.locator('#phone').boundingBox();
  ok('移动端全屏铺满', Math.round(box.width) === 375, JSON.stringify(box));
  await page.screenshot({ path: OUT + 'M-mobile.png' });

  /* ================= 第二阶段：F2 / F3 / F12 / F14 ================= */
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('page2error: ' + e.message));
  await p2.goto(URL);
  await p2.waitForTimeout(400);
  await p2.evaluate(() => localStorage.clear());
  await p2.reload();
  await p2.waitForTimeout(400);
  await p2.click('[data-action="onboard-ok"]');
  const top2 = () => p2.locator('#pushLayer .page').last();

  // F14 场景双卡：键盘方向键切换，单选
  await p2.click('[data-action="new-apply"]');
  await p2.waitForTimeout(400);
  await p2.locator('.scene-card input').first().focus();
  await p2.keyboard.press('ArrowRight');
  await p2.waitForTimeout(250);
  ok('F14 方向键切换场景且始终单选',
    (await p2.locator('input[name="scene"]:checked').count()) === 1 &&
    (await p2.locator('input[name="scene"]:checked').getAttribute('value')) === 'ON_CAMPUS');
  ok('F14 校内不显示离校信息卡', (await p2.locator('[data-field-wrap="destination"]').count()) === 0);
  await p2.keyboard.press('ArrowLeft');
  await p2.waitForTimeout(250);
  ok('F14 方向键可切回离校', (await p2.locator('[data-field-wrap="destination"]').count()) === 1);

  // F12 脏表单返回确认
  await p2.click('[data-action="back"]');
  await p2.waitForTimeout(400);
  ok('F12 有改动返回弹「放弃本次填写？」', (await p2.locator('.dialog__title').innerText()) === '放弃本次填写？');
  await p2.click('[data-dlg="cancel"]');
  await p2.waitForTimeout(400);
  ok('F12 继续填写后仍在 S2', (await p2.locator('#pushLayer .page[data-page="S2"]').count()) === 1);
  await p2.locator('.navbar__back').last().click();
  await p2.waitForTimeout(350);
  await p2.click('[data-dlg="ok"]');
  await p2.waitForTimeout(450);
  ok('F12 放弃后回到 S1', (await p2.locator('#pushLayer .page').count()) === 0);

  // 无改动直接返回
  await p2.click('[data-action="new-apply"]');
  await p2.waitForTimeout(400);
  await p2.locator('.navbar__back').last().click();
  await p2.waitForTimeout(450);
  ok('F12 无改动直接返回不弹窗', (await p2.locator('.dialog').count()) === 0);

  // F2 PENDING 撤回：取消无变化
  await p2.click('[data-action="demo-open"]');
  await p2.waitForTimeout(350);
  await p2.click('[data-action="demo-status"][data-val="PENDING"]');
  await p2.waitForTimeout(600);
  await p2.locator('#phone .page.is-active .app-card').first().click();
  await p2.waitForTimeout(450);
  await top2().locator('[data-action="s4-withdraw"]').click();
  await p2.waitForTimeout(450);
  ok('F2 撤回弹窗标题/正文',
    (await p2.locator('.dialog__title').innerText()) === '撤回申请？' &&
    (await p2.locator('.dialog__body').innerText()).includes('将关闭'));
  await p2.click('[data-dlg="cancel"]');
  await p2.waitForTimeout(400);
  ok('F2 取消后状态仍是待审批',
    (await top2().locator('.concl__text').innerText()) === '等待辅导员审批' &&
    (await top2().locator('.bar .btn').count()) === 1);

  // F3 APPROVED 取消申请
  await p2.click('[data-action="demo-open"]');
  await p2.waitForTimeout(350);
  await p2.click('[data-action="demo-status"][data-val="APPROVED"]');
  await p2.waitForTimeout(700);
  ok('F3 已通过主操作为描边危险「取消申请」',
    (await top2().locator('.bar .btn').innerText()).trim() === '取消申请' &&
    (await top2().locator('.bar .btn--danger-outline').count()) === 1);
  await top2().locator('[data-action="s4-cancel"]').click();
  await p2.waitForTimeout(450);
  ok('F3 确认文案含「不会生效」', (await p2.locator('.dialog__body').innerText()).includes('不会生效'));
  await p2.click('[data-dlg="ok"]');
  await p2.waitForTimeout(600);
  ok('F3 确认后操作栏消失且为已取消',
    (await top2().locator('.bar').count()) === 0 &&
    (await top2().locator('.concl__text').innerText()).indexOf('已取消') === 0);

  // F9 / F10 已在第一阶段覆盖；F14 筛选栏横滚 + 居中
  await p2.locator('.navbar__back').last().click();
  await p2.waitForTimeout(400);
  await p2.click('[data-action="tab"][data-id="S3"]');
  await p2.waitForTimeout(350);
  await p2.click('[data-action="s3-filter"][data-val="WITHDRAWN"]');
  await p2.waitForTimeout(500);
  const inView = await p2.evaluate(() => {
    const el = document.querySelector('.filters__item.is-on');
    const box = document.querySelector('.filters').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.left >= box.left - 1 && r.right <= box.right + 1;
  });
  ok('F14 选中筛选项自动滚入视野', inView);

  await ctx.close();

  /* ================= 第三阶段：8 处返工回归 ================= */
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p3 = await ctx3.newPage();
  p3.on('pageerror', e => errors.push('page3error: ' + e.message));
  await p3.goto(URL);
  await p3.waitForTimeout(400);
  await p3.evaluate(() => localStorage.clear());
  await p3.reload();
  await p3.waitForTimeout(400);
  await p3.click('[data-action="onboard-ok"]');
  await p3.waitForTimeout(250);
  const top3 = () => p3.locator('#pushLayer .page').last();
  const anchor = () => p3.locator('#demoAnchor');

  /* ---- P0-1 桌面：演示入口移到壳外 ---- */
  const phBox = await p3.locator('#phone').boundingBox();
  const fabBox = await anchor().boundingBox();
  ok('P0-1 桌面演示入口在壳右侧外', fabBox.x >= phBox.x + phBox.width,
    'fab.x=' + Math.round(fabBox.x) + ' phone.right=' + Math.round(phBox.x + phBox.width));
  ok('P0-1 桌面右侧间隙约 20', Math.abs((fabBox.x - (phBox.x + phBox.width)) - 20) <= 1,
    'gap=' + Math.round(fabBox.x - (phBox.x + phBox.width)));
  ok('P0-1 壳内零悬浮元素', (await p3.locator('#phone [data-action="demo-open"]').count()) === 0);
  ok('P0-1 桌面加 is-docked',
    await anchor().evaluate(el => el.classList.contains('is-docked')));
  const tabBox = await p3.locator('#tabbar').boundingBox();
  ok('P0-1 与 tabBar 垂直居中',
    Math.abs((fabBox.y + fabBox.height / 2) - (tabBox.y + tabBox.height / 2)) <= 2,
    'fabCenter=' + Math.round(fabBox.y + fabBox.height / 2) +
    ' tabCenter=' + Math.round(tabBox.y + tabBox.height / 2));

  /* ---- P0-1 窄屏：壳内悬浮、半透明、避让操作栏 ---- */
  await p3.setViewportSize({ width: 375, height: 812 });
  await p3.waitForTimeout(350);
  const mBox = await anchor().boundingBox();
  ok('P0-1 窄屏回到壳内', mBox.x + mBox.width <= 375 && mBox.y + mBox.height <= 812,
    JSON.stringify({ x: Math.round(mBox.x), y: Math.round(mBox.y) }));
  ok('P0-1 窄屏 tab 页 bottom=78', Math.abs((812 - (mBox.y + mBox.height)) - 78) <= 1,
    'gap=' + Math.round(812 - (mBox.y + mBox.height)));
  ok('P0-1 窄屏默认半透明',
    (await p3.locator('#demoFab').evaluate(el => getComputedStyle(el).opacity)) === '0.45');
  await p3.locator('#phone .page.is-active .app-card').first().click();
  await p3.waitForTimeout(450);
  const bBox = await anchor().boundingBox();
  ok('P0-1 有操作栏时 bottom=96', Math.abs((812 - (bBox.y + bBox.height)) - 96) <= 1,
    'gap=' + Math.round(812 - (bBox.y + bBox.height)));
  await top3().locator('[data-action="back"]').click();
  await p3.waitForTimeout(400);

  /* ---- P0-1 长按隐藏 → 24×24 唤回热区 ---- */
  const fb = await p3.locator('#demoFab').boundingBox();
  await p3.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await p3.mouse.down();
  await p3.waitForTimeout(950);
  await p3.mouse.up();
  await p3.waitForTimeout(250);
  ok('P0-1 长按 800ms 隐藏入口', await p3.locator('#demoFab').isHidden());
  const hotBox = await p3.locator('#demoHot').boundingBox();
  ok('P0-1 唤回热区 24×24',
    Math.round(hotBox.width) === 24 && Math.round(hotBox.height) === 24, JSON.stringify(hotBox));
  await p3.click('#demoHot');
  await p3.waitForTimeout(400);
  ok('P0-1 热区可唤回演示面板', await p3.locator('.sheet').isVisible());
  await p3.locator('[data-sheet-close]').click();
  await p3.waitForTimeout(300);

  /* ---- P0-2 S9 未读红点提醒 ---- */
  await p3.click('[data-action="tab"][data-id="S9"]');
  await p3.waitForTimeout(350);
  const fnRow = p3.locator('#phone .page.is-active .fn-row--tall');
  ok('P0-2 标题「未读红点提醒」',
    (await fnRow.locator('.fn-row__title').innerText()) === '未读红点提醒');
  ok('P0-2 副文案常驻',
    (await fnRow.locator('.fn-row__sub').innerText()) === '关闭后仍可查看消息，仅不再提示未读');
  ok('P0-2 标题 15/24·600', await fnRow.locator('.fn-row__title').evaluate(el => {
    const s = getComputedStyle(el);
    return s.fontSize === '15px' && s.lineHeight === '24px' && s.fontWeight === '600';
  }));
  ok('P0-2 副文案 13/20·400 #78849A', await fnRow.locator('.fn-row__sub').evaluate(el => {
    const s = getComputedStyle(el);
    return s.fontSize === '13px' && s.lineHeight === '20px' && s.fontWeight === '400' &&
      s.color === 'rgb(120, 132, 154)';
  }));
  const fnBox = await fnRow.boundingBox();
  ok('P0-2 行高 72', Math.round(fnBox.height) === 72, 'h=' + fnBox.height);
  const swBox = await fnRow.locator('.sw').boundingBox();
  ok('P0-2 开关垂直居中',
    Math.abs((swBox.y + swBox.height / 2) - (fnBox.y + fnBox.height / 2)) <= 1);
  ok('P0-2 默认开启', (await fnRow.locator('.sw').getAttribute('aria-checked')) === 'true');
  ok('P0-2 未读时 tabBar pill 可见', await p3.locator('#msgPill').isVisible());

  /* ---- P1-3 S7「全部已读」绝对定位在右 104 ---- */
  await p3.click('[data-action="tab"][data-id="S7"]');
  await p3.waitForTimeout(350);
  const rBtn = p3.locator('#phone .page.is-active .navbar__right');
  ok('P1-3 未读时「全部已读」可用', (await rBtn.innerText()).trim() === '全部已读');
  const rBox = await rBtn.boundingBox();
  ok('P1-3 右边缘距右 104',
    Math.abs((375 - (rBox.x + rBox.width)) - 104) <= 1,
    'gap=' + Math.round(375 - (rBox.x + rBox.width)));
  ok('P1-3 15/500', await rBtn.evaluate(el => {
    const s = getComputedStyle(el);
    return s.fontSize === '15px' && s.fontWeight === '500' && s.position === 'absolute';
  }));
  const tBox = await p3.locator('#phone .page.is-active .navbar__title').boundingBox();
  ok('P1-3 标题独立居中不与按钮同组',
    Math.abs((tBox.x + tBox.width / 2) - 187.5) <= 2 && tBox.x + tBox.width <= rBox.x,
    'titleRight=' + Math.round(tBox.x + tBox.width) + ' btnLeft=' + Math.round(rBox.x));

  /* ---- P0-2 关闭开关：pill 消失、图标不位移、S7 未读态保留 ---- */
  await p3.click('[data-action="tab"][data-id="S9"]');
  await p3.waitForTimeout(300);
  const tabIconBefore = await p3.locator('#tabbar [data-id="S7"] svg').boundingBox();
  await p3.locator('#phone .page.is-active .fn-row--tall .sw').click();
  await p3.waitForTimeout(300);
  ok('P0-2 关闭后 tabBar pill 消失', await p3.locator('#msgPill').isHidden());
  const tabIconAfter = await p3.locator('#tabbar [data-id="S7"] svg').boundingBox();
  ok('P0-2 关闭后图标不位移',
    Math.abs(tabIconBefore.x - tabIconAfter.x) <= 0.5 && Math.abs(tabIconBefore.y - tabIconAfter.y) <= 0.5);
  const setLs = await p3.evaluate(() => localStorage.getItem('cl_settings'));
  ok('P0-2 持久化 cl_settings', setLs === JSON.stringify({ badgeEnabled: false }), setLs);
  await p3.click('[data-action="tab"][data-id="S7"]');
  await p3.waitForTimeout(350);
  ok('P0-2 关闭红点不影响 S7 未读样式',
    (await p3.locator('#phone .page.is-active .msg.is-unread').count()) === 1);
  ok('P0-2 关闭红点后「全部已读」仍可用',
    (await p3.locator('#phone .page.is-active .navbar__right').innerText()).trim() === '全部已读');
  await p3.locator('#phone .page.is-active .navbar__right').click();
  await p3.waitForTimeout(400);
  ok('S7 全部已读后按钮隐藏',
    (await p3.locator('#phone .page.is-active .navbar__right').count()) === 0);
  /* 恢复开关，避免影响后续断言 */
  await p3.click('[data-action="tab"][data-id="S9"]');
  await p3.waitForTimeout(300);
  await p3.locator('#phone .page.is-active .fn-row--tall .sw').click();
  await p3.waitForTimeout(300);

  /* ---- P1-6 筛选栏方向感知渐隐 ---- */
  await p3.click('[data-action="tab"][data-id="S3"]');
  await p3.waitForTimeout(350);
  const fade = () => p3.locator('#phone .page.is-active .filters-wrap')
    .evaluate(el => el.classList.contains('can-left') + '/' + el.classList.contains('can-right'));
  ok('P1-6 起点只右端渐隐', (await fade()) === 'false/true', await fade());
  await p3.locator('#phone .page.is-active .filters').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await p3.waitForTimeout(300);
  ok('P1-6 滚到底只左端渐隐', (await fade()) === 'true/false', await fade());
  await p3.locator('#phone .page.is-active .filters').evaluate(el => { el.scrollLeft = 0; });
  await p3.waitForTimeout(300);
  ok('P1-6 回起点左端渐隐消失', (await fade()) === 'false/true', await fade());

  /* ---- P1-4 长文本上下结构 / P2-7 滚动区 padding ---- */
  await p3.setViewportSize({ width: 1440, height: 900 });
  await p3.waitForTimeout(350);
  await p3.click('[data-action="tab"][data-id="S3"]');
  await p3.waitForTimeout(300);
  await p3.locator('#phone .page.is-active .app-card').first().click();
  await p3.waitForTimeout(450);
  const stack = top3().locator('.row--stack');
  ok('P1-4 存在上下结构行', (await stack.count()) >= 1);
  const lblBox = await stack.first().locator('.row__label').boundingBox();
  const valBox = await stack.first().locator('.row__value').boundingBox();
  ok('P1-4 label 在上 value 在下', valBox.y >= lblBox.y + lblBox.height - 1);
  ok('P1-4 左对齐同起点', Math.abs(lblBox.x - valBox.x) <= 1,
    'lbl=' + Math.round(lblBox.x) + ' val=' + Math.round(valBox.x));
  ok('P1-4 label 13 / value 15 左对齐', await stack.first().evaluate(el =>
    getComputedStyle(el.querySelector('.row__label')).fontSize === '13px' &&
    getComputedStyle(el.querySelector('.row__value')).fontSize === '15px' &&
    getComputedStyle(el.querySelector('.row__value')).textAlign === 'left'));
  const pb = await top3().locator('.page__scroll').evaluate(el => getComputedStyle(el).paddingBottom);
  ok('P2-7 有操作栏滚动区 padding-bottom 88', pb === '88px', pb);
  await top3().locator('[data-action="back"]').click();
  await p3.waitForTimeout(400);

  /* ---- P2-8 材料组标题文案 ---- */
  await p3.click('[data-action="tab"][data-id="S1"]');
  await p3.waitForTimeout(300);
  await p3.click('[data-action="new-apply"]');
  await p3.waitForTimeout(450);
  const matTitle = await top3().locator('.grp__title').filter({ hasText: '证明材料' }).first().innerText();
  ok('P2-8 材料组标题含「病假需上传」', matTitle.indexOf('病假需上传') > 0, matTitle);
  ok('P2-8 不再出现「必传」', matTitle.indexOf('必传') < 0);

  await ctx3.close();
  await browser.close();

  console.log(log.join('\n'));
  console.log('\nFAILED: ' + log.filter(l => l.startsWith('FAIL')).length +
    ' / ' + log.length);
  console.log('JS ERRORS: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
})().catch(e => {
  console.log(log.join('\n'));
  console.log('SCRIPT ERROR', e.message);
  console.log('JS ERRORS: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  process.exit(1);
});

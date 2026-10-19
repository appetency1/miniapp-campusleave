/* 截图脚本（仅自检用，交付时可删）
   产出：10 张手机壳单屏 + 1 张桌面整体。
   每张截图前先清空 localStorage 重置演示数据，确认初始态（累计 6 / 已批准 3 / 已销假 1 / 进行中 1，消息 5 条首条未读 pill=1），
   演示控制面板必须已关闭，并等待 ≥2.2s 让入场/定位动画落定（S6 定位中除外，该态只持续 1.5s）。 */
const { chromium } = require('C:/Users/Administrator/.dsh/profiles/web/node_modules/playwright-core');
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL = 'file:///D:/AI%20Code/CampusLeave/prototype/index.html';
const OUT = 'D:/AI Code/CampusLeave/prototype/_shots/';
const SETTLE = 2300;   // 统一沉淀时间

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  /* 视口 ≥900 → 演示入口停靠到手机壳右侧外，元素截图不会带进按钮 */
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));

  const ph = () => p.locator('#phone');
  const top = () => p.locator('#pushLayer .page').last();
  const shot = async name => { await ph().screenshot({ path: OUT + name + '.png' }); };

  async function fresh() {
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.waitForTimeout(500);
    if (await p.locator('#onboard').isVisible()) await p.click('[data-action="onboard-ok"]');
    await p.waitForTimeout(SETTLE);
  }
  async function backAll() {
    while (await p.locator('#pushLayer .page').count() > 0) {
      await top().locator('[data-action="back"]').click();
      await p.waitForTimeout(380);
    }
  }
  async function demo(action, val) {
    await p.click('[data-action="demo-open"]');
    await p.waitForTimeout(420);
    await p.click('[data-action="' + action + '"]' + (val ? '[data-val="' + val + '"]' : ''));
    await p.waitForTimeout(600);            // 面板关闭 + 状态落定
  }

  await p.goto(URL);
  await fresh();

  /* ---- 初始态自证：统计 6/3/1/1，消息 5 条首条未读 ---- */
  await p.click('[data-action="tab"][data-id="S9"]');
  await p.waitForTimeout(400);
  const stats = await p.locator('#phone .page.is-active .stat__n').allInnerTexts();
  await p.click('[data-action="tab"][data-id="S7"]');
  await p.waitForTimeout(400);
  const msgCount = await p.locator('#phone .page.is-active .msg').count();
  const unread = await p.locator('#phone .page.is-active .msg.is-unread').count();
  const pill = await p.locator('#msgPill').innerText().catch(() => '(hidden)');
  console.log('初始态 统计=' + stats.join('/') + ' 消息=' + msgCount + ' 未读=' + unread + ' pill=' + pill);
  await p.click('[data-action="tab"][data-id="S1"]');
  await p.waitForTimeout(SETTLE);

  /* ---- 01 S1 首页 ---- */
  await shot('01-S1');

  /* ---- 02 S2 申请表单 ---- */
  await p.click('[data-action="new-apply"]');
  await p.waitForTimeout(SETTLE);
  await shot('02-S2');

  /* ---- 03 S2 时间滚轮展开 ---- */
  await p.locator('#pushLayer .page [data-field="start"]').click();
  await p.waitForTimeout(SETTLE);
  await shot('03-S2-picker');
  await p.locator('[data-picker-cancel]').click();
  await p.waitForTimeout(400);
  await backAll();
  await p.waitForTimeout(400);

  /* ---- 04 S3 列表（未打断筛选） ---- */
  await p.click('[data-action="tab"][data-id="S3"]');
  await p.waitForTimeout(SETTLE);
  await shot('04-S3');

  /* ---- 05 S4 请假中 ---- */
  await p.locator('#phone .page.is-active .app-card[data-id="CL20261016001"]').click();
  await p.waitForTimeout(SETTLE);
  await shot('05-S4-in-progress');

  /* ---- 06 S4 逾期 ---- */
  await demo('demo-status', 'OVERDUE_OFF');
  await p.waitForTimeout(SETTLE - 600);
  await shot('06-S4-overdue');

  /* ---- 07 S4 待审批 ---- */
  await demo('demo-status', 'PENDING');
  await p.waitForTimeout(SETTLE - 600);
  await shot('07-S4-pending');

  /* ---- 08 S6 定位中 ---- */
  await demo('demo-status', 'IN_PROGRESS_OFF');
  await p.waitForTimeout(SETTLE);          // 等「演示数据已更新」Toast 退场，避免入镜
  await top().locator('[data-action="s4-locate"]').click();
  await p.waitForTimeout(700);             // locating 仅 1.5s，不能等满 2.2s
  await shot('08-S6-locating');

  /* ---- 09 S6 范围外 ---- */
  await p.waitForTimeout(1500);           // 本轮定位收尾（默认通过 → 记录转为已销假）
  await backAll();                        // 退回 S3（本轮定位已把记录改成已销假）
  await p.waitForTimeout(400);
  await demo('demo-status', 'IN_PROGRESS_OFF');   // 恢复请假中
  await demo('demo-loc', 'out');                  // 不在 S6，仅写演示数据、不触发定位
  await p.waitForTimeout(400);
  await p.locator('#phone .page.is-active .app-card[data-id="CL20261016001"]').click();
  await p.waitForTimeout(600);
  await top().locator('[data-action="s4-locate"]').click();
  await p.waitForTimeout(SETTLE);         // 1.5s 定位 + 落定
  await shot('09-S6-out-of-range');

  /* ---- 10 S9 我的 ---- */
  await backAll();
  await p.click('[data-action="tab"][data-id="S9"]');
  await p.waitForTimeout(SETTLE);
  await shot('10-S9');

  /* ---- 11 桌面整体（演示入口停靠在壳右侧外） ---- */
  await fresh();
  await p.screenshot({ path: OUT + '11-desktop.png' });
  console.log('桌面整体：演示按钮在壳外 =', await p.evaluate(() => {
    const a = document.getElementById('demoAnchor').getBoundingClientRect();
    const ph = document.getElementById('phone').getBoundingClientRect();
    return a.left >= ph.right;
  }));

  /* ---- 持久化自检 ---- */
  await demo('demo-status', 'COMPLETED');
  await p.reload();
  await p.waitForTimeout(900);
  await p.click('[data-action="tab"][data-id="S3"]');
  await p.waitForTimeout(500);
  const badge = await p.locator('.app-card[data-id="CL20261016001"] .badge').last().innerText();
  console.log('reload 后主记录徽章 =', badge, badge === '已销假' ? '(持久化 OK)' : '(持久化 FAIL)');

  await b.close();
  console.log('shots done');
})().catch(e => { console.log('SHOT ERROR', e.message); process.exit(1); });

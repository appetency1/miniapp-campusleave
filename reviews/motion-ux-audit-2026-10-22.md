# 动效体验评审（2026-10-22）

> 评审对象：`backend/web/`（原生 JS + 原生 CSS）与视觉侧规范 `backend/web/MOTION.md`
> 评审问题：**"这条动效是否帮用户更快确认发生了什么？"** 不是"是否好看"。
> 方法：逐条读触发路径（`router.js` / `app.js` / `ui.js` / `pages/*.js`）+ 核对 CSS 现状 + 在 `MOTION.md` 的数值框架内做取舍
> 立场：**不推翻视觉侧的 3 条曲线、4 档时长、4px 位移、禁用清单。** 下文若与 `MOTION.md` 冲突，只做两件事：① 收窄触发条件；② 指出"按规范做了但用户会更难受"的地方，并给替代。

---

## 一、结论

**这套动效语言本身可用，不能直接上的原因不在动效，在反馈。**

- **批准 7 条**（可直接按 `MOTION.md` 落地）：路由转场（收窄条件后）、抽屉 240ms、toast 进出、hover/焦点状态切换、`.form-err` 显影、禁用态透明度、骨架呼吸（收窄阈值后）。
- **否决 4 条**：`.empty` 淡入、表格行逐行 stagger（视觉侧也已否决，此处补上否决理由的量化依据）、`.detail` 每次点选从 `opacity:0` 起、nav 指示器"每次渲染重播"的默认接受方案。
- **必须收窄 3 条**：骨架屏出现条件、`.page--enter` 的判定规则、`prefers-reduced-motion` 对 JS 数字滚动与 infinite 骨架的覆盖。
- **动效前置的反馈缺陷 6 个**（P0×2），其中两个是"现在就在骗用户"，不修的话任何入场动画都只是在修饰一个错误的状态。

### 最严重的 3 个反馈缺口

| # | 缺口 | 一句话 |
|---|---|---|
| 1 | **审批回执是乐观伪造的** | `pending.js:197` 在接口返回之前就把"已批准 · 刚刚 · 已通知学生"写到屏幕上，`app.js:120` 失败只弹 `alert` 且不回滚 → **失败时界面显示的是一份假回执**，然后被 `location.reload()` 抹掉。这是全站唯一"说谎"的反馈。 |
| 2 | **F5 后必然闪一次"假空态"** | `app.js:538` 的 `router.start()` 在 `loadStore()` 的 Promise 还没 resolve 时就同步渲染了一次，`STORE.apps` 此时是 `[]`（`api.js:30`）→ 用户先看到"负责班级没有待审批，最早一条明天 08:00 开始"，再被真实数据替换。**不是白屏，是假消息**，比如实为空更难判断。 |
| 3 | **点击到响应之间是真空** | 批准/驳回点击后没有任何视觉变化（`detail.js:274-279` 无 disabled、无文案变化），`location.reload()` 前最长的一段就是接口往返。接口慢时唯一能看到的反馈是"页面卡住了"。**这也是误操作放大器**：用户会重复点，而按钮没有禁用 → 重复 POST。 |

### 一条流程上的判断

```
点击「批准」
  ├─ 现在：无变化 ──(200ms~3s 真空)──> location.reload() ──> 整页重建，焦点归 body
  │                                    ↑ 中间这一段，用户唯一的判断依据是"我点到了吗"
  └─ 应该：按钮 disabled(opacity .38) + 左侧 action-note 换文案「正在提交…」
             │
             ├─ 失败 → 行内红字「批准失败：xxx」+ 按钮恢复（不跳页、不 alert）
             └─ 成功 → sessionStorage 存 flash → reload → 新页面就绪 320ms 后 toast「已通过 · 张明远」
```

**为什么不是"成功先给 240ms 的'已通过'再刷新"**：那要把 `location.reload()` 从 `decideApp` 里挪出来并延迟 240ms，等于用 240ms 的等待换 240ms 的确认，而且那份"已通过"在 reload 后同样消失 —— 它证明不了任何事（现在的假回执已经证明了这一点）。**确认应该发生在"新状态已经就绪"之后**，用 flash → reload → toast。这同时解决"刷新后不知道刚才那步成没成"。

---

## 〇、三件优先事项 · 最小改法速览

> 详细论证见 §3 第 1 / 6 / 3 条。这里只给"改哪个函数、加什么、别加什么"。

| # | 事项 | 最小改法 | 明确不加 |
|---|---|---|---|
| A | 审批/核验点击 → reload 之间零反馈 | ① `app.js:116-123` / `:139-146`：删掉内部 `location.reload()` 与 `alert`，失败 `throw e`，让 Promise 回到调用方；② `pending.js:194-215`、`review.js:327-343`：**删掉乐观回执与同步 `advance()`**，改 `then(→ 存 flash + reload)` / `catch(→ 行内红字 + 恢复按钮)`；③ 同步阶段：`busy` 标志位 + 两个按钮 `disabled`（`.btn:disabled` 已有 `opacity:.38`）+ **把 `detail.js:264` 的 `.action-note` 文案换成「正在提交…」**（note 在 flex 剩余空间，换字不推动按钮，零布局跳动）；④ `components.css:19` 给 `.btn` 的 transition 补 `opacity`（否则禁用态是硬切）；⑤ reload 后 `boot()` 读 flash，320ms 后 `ui.toast()` | 转圈（= 无限循环动画，违反 `MOTION.md` §5）、成功前的 240ms"已通过"预览（会被 reload 抹掉，证明不了任何事）、抖动/红闪、原生 `alert` |
| B | `ui.drawer()` 无焦点管理 | `ui.js:354-383`：打开时记 `returnFocus = document.activeElement`，`rAF` 加 `.is-open` 后聚焦面板内首个可聚焦元素；关闭时**先** `returnFocus.focus()` 再 `remove()`；`keydown` 里加 Tab 首尾环绕（~12 行）；`panel` 补 `aria-label`（或取 `.drawer-title` 文本做 `aria-labelledby`）。滚动穿透**不是锁 body**（`.app` 已 `height:100vh;overflow:hidden`，body 本来不滚）：`layout.css:467` 加一行 `.drawer-body { overscroll-behavior: contain }` | 锁 `body{overflow:hidden}`（无效且容易忘了解锁）、抽屉内容区二次淡入、`will-change` 预置、阴影动画 |
| C | 搜索/筛选逐键整表重建 | 保持现状的"零动效"（**这是正确的，不是还没做**）；只统一去抖：`records.js:74` 补 180ms（`admin.js:580` 已有 260ms，改成 180ms 对齐）。服务端搜索（`admin.js:589`）往返 >400ms 时在 `.tbl-wrap` 上方插一行 12px「正在查询…」，旧表格保留不动 | 表格淡入、逐行 stagger、空态淡入、结果行数 count-up、"聚焦时表格淡出/位移"。**理由（量化）**：打字间隔 80–150ms < 最短一档 120ms（列表项是 180ms）→ 每次重建都在动画中途打断，透明度永远到不了 1，读起来是"表格一直半透明、字在发灰"，不是"表格在动" |

---

## 二、10 个交互点总表

| # | 交互点 | 现状反馈 | 结论 |
|---|---|---|---|
| 1 | 审批通过/驳回 | 无（点击到 reload 之间真空，失败 `alert`，回执是乐观伪造） | **先修 P0**，再加"文案替换式进度"，**不加转圈**、**不加成功前预览** |
| 2 | 首次进站/刷新加载 | 主区空白 + 双次渲染导致的假空态 | **先修 P0**；骨架只在 >400ms 出现，位置 `#main`；2s/8s 两级兜底 |
| 3 | 筛选/搜索 `paint()` | 逐键整表重建，**零动效是正确的**（不是"还没做"） | **明确否决一切入场动效**，附量化理由；只修去抖不一致 |
| 4 | 路由切换 | 整块替换，无过渡 | **批准**（120ms 页根 opacity + 180ms 页头 4px），但判定规则要改成"视图级"而非"路径级" |
| 5 | 空态 `ui.empty` | 瞬时替换 | **否决 `.empty` 淡入**；空态必须瞬时 |
| 6 | 抽屉 `ui.drawer` | 有 240ms 进出，**无焦点管理** | 动效**批准**；焦点/键盘/滚动穿透是**可用性缺陷，不属于动效**，必须补 |
| 7 | 表格行可点击 | 常亮底色 bug；行不可键盘到达 | **不加箭头/不加抬升**；加 `cursor` + 修 bug + **补键盘入口**（这是重点） |
| 8 | 表单校验 | `form-err` 有 `min-height` 占位，无动效 | **批准 120ms opacity**；先补 `role="alert"` |
| 9 | 危险操作（驳回） | 要求填原因 + 按钮初始 disabled + Ctrl/⌘+Enter | 确认成本**足够，不加二次确认**；动效边界 = 不加抖动/红闪（同意视觉侧） |
| 10 | 键盘/无障碍 | `:focus-visible` 2px 蓝环已存在且未动画（好） | `reduced-motion` 有 3 个洞；`aria-live` 全站为 0 处，必须补 |

---

## 三、逐项结论

### 1. 审批通过 / 驳回

**现状证据**

- `app.js:104-124` `decideApp`：`post → refresh() → location.reload()`；失败走 `alert('操作失败：' + ...)`（`app.js:121`）。
- `app.js:127-147` `decideCheckins`：同样的结构，多条时串行 POST，失败同样 `alert`（`app.js:144`）。
- `pending.js:194-205` `approve()`：**没有等 Promise**，先 `local.receipt = '已批准 · 刚刚 · 已通知学生'`，再 `advance()` 把这条从本地列表删掉、选中下一条，然后重建左右两栏。`review.js:327-343` 完全一样。
- `detail.js:265-281` 操作条两个按钮 **没有 disabled、没有文案变化**；`.btn` 的 transition 只覆盖 `background` / `border-color`（`components.css:19`），`opacity` 不在其中。
- 唯一的既有"正确样例"是抽屉表单：`admin.js:85-86` `submit.disabled = true; submit.textContent = '提交中…'`，失败回填 `.form-err`（`admin.js:92`）。**同一套交互，全站有两种做法。**

**判断**

1. 回执是**乐观伪造**，而且它只会在失败时被人看见（成功时被 reload 抹掉）—— 也就是说这个 UI 元素的唯一实际作用是"在失败时骗人"。**这是本次评审要否决的第一件事，优先级高于任何动效。**
2. 点击 → reload 之间零反馈，且按钮不禁用 → 可重复 POST。`advance()` 虽然删掉了节点，但同一次点击事件队列里的第二次 click 仍会落在已脱离文档的节点上触发一次 `decideApp`。重复批准同一单，后端返回错误，再 `alert`，再 reload —— 演示现场会连锁出丑。
3. `alert()` 必须换掉：阻塞主线程、不可样式化、带 `localhost:8080 说：` 前缀、遮住上下文。答辩演示里这是最出戏的一处。

**应该加什么（具体到触发时机与方式）**

| 时机 | 做法 | 不加什么 |
|---|---|---|
| click 同步阶段 | ① `busy` 标志位挡住重入；② 两个按钮 `disabled = true`（`.btn:disabled` 已有 `opacity:.38`，只需给 `.btn` 的 transition 补上 `opacity`）；③ **把左侧 `.action-note` 的文案换成"正在提交…"**（`detail.js:264` 的 note 位于 flex 剩余空间，换字**不推动按钮**，零布局跳动）。多条核验时写成"正在提交 2/3…" | **不转圈**：转圈=无限旋转动画，直接违反 `MOTION.md` §5"无限循环装饰动效"禁令；内网 200ms 内返回，转圈只会闪一帧；而且 `.action-btns` 里插一个 loader 会推挤相邻按钮 |
| Promise resolve | `sessionStorage.setItem('cl_flash', '已通过 · ' + 学生姓名)` → `location.reload()` | **不在旧页面做"已通过"预览**（见 §一 的流程判断） |
| Promise reject | `.action-note` 原地换成红字"批准失败：xxx"（复用 `.form-err` 的颜色变量 `--red-600`，加 `role="alert"`）+ 按钮恢复。**不跳页、不 reload、不 alert** | 不加抖动、不加红闪、不加边框脉冲（`MOTION.md` §4.11 已否决，我同意，理由更强：`--red-600` 在本产品专指"逾期"，闪一次就把它降级成装饰） |
| reload 之后 | `boot()` 里读 flash → 320ms 后 `ui.toast(...)`。320ms 是 `--t-slow`，正好等页面入场结束，避免两个淡入抢注意力 | 不要把 toast 设在 0ms —— 会和页根淡入重叠 |

**落地位置**

- `app.js:116-123` / `app.js:139-146`：删掉内部 `location.reload()` 与 `alert`，改为 `return` 出去的 Promise（失败 `throw e`）。
- `pending.js:194-215` / `review.js:327-343`：删掉 `local.receipt = ...` 与 `advance(...)` 的**同步**调用；`approve()` 改为 `then(→flash+reload)` / `catch(→行内错误+恢复按钮)`。`advance()` 保留但只在"将来去掉 reload"时才用。
- `components.css:19`：`transition` 补 `opacity`（120ms `--ease-tog`）。
- 新增 4 行 flash 工具（放 `ui.js` 或 `api.js`，`try/catch` 包住因隐私模式下 sessionStorage 可能抛）。

**不修会怎样**：答辩时演示驳回，老师问"如果这里失败了呢"，你点一次断网 —— 屏幕写着"已驳回·已通知学生"，然后弹出一个原生 alert。这比没有回执糟糕得多。

---

### 2. 首次进站 / 刷新的数据加载

**现状证据**

- `app.js:499-515`：有 token 时先 `document.body.dataset.role='app'`（外壳可见）→ `loadStore()` 异步 → `.then` 里才 `renderNav()` / `renderTop()` / `router.go(deepLink)`。
- **`app.js:538` 的 `router.start()` 是同步执行的**，此时 `loadStore()` 还在飞。`router.start` 内 `render()`（`router.js:113`）→ `guard` 通过（`state.loggedIn` 已在 `app.js:500` 置 true）→ **用空 STORE 渲染了一次真实页面**。
- 空 STORE 里 `apps: []`（`api.js:30`）→ `records.js:109-114` 渲染"没有符合条件的记录。"、`pending.js:90-100` 渲染"负责班级没有待审批，最早一条明天 08:00 开始。"。数据到达后 `router.go(deepLink)` 再渲染一次 → 整块换掉。
- 加载失败（`app.js:508-514`）：`console.error` + 清 token + 踢回 `/login`，**界面上一个字都没有**。
- `ui.skeletonRows` 全站 0 调用（`ui.js:280-290`）；`.sk-bar` 无任何 animation（`components.css:723`）。

**判断**

1. **这不是"空白期间"，是"错误的空态期间"。** 假空态比骨架屏的"白块闪一下"严重一个量级：白块只说明"还没到"，"没有待审批"说明"到了，且是零"。教师看到"负责班级没有待审批"会直接关页面。
2. 骨架屏放在**页面里**是错的（`MOTION.md` §4.9 只说"插入 `ui.skeletonRows()`"，没说插哪）。此时我们**还不知道要渲染哪个页面**，所以骨架必须是**路由无关**的：`#main` 里一个 `page-head` 占位 + N 行 `sk-row`。
3. 双眼看不见空白的另一个角度：外壳（侧栏品牌、顶栏）已经在了，所以 400ms 内的空白读作"纸还没印"，可接受。**这就是为什么 400ms 阈值在 boot 场景仍然成立**——它防的不是"白块"，是"白块闪一下"。

**应该加什么**

| 时机 | 做法 |
|---|---|
| 立刻（同步） | 修 P0-2：把 `router.start(...)` 从 `app.js:538` 挪进 `loadStore().then()` 内（以及 `catch` 与"无 token"分支）。**先让首次渲染发生在数据就绪之后**，双次渲染消失，假空态消失。这一个改动本身比骨架屏重要得多。 |
| 0~400ms | **什么都不显示**（外壳已在）。这 400ms 里页面是空的，但用户刚按 F5，没有"内容被拿走"的错觉 |
| >400ms | `setTimeout(insertSkeleton, 400)`，插入 `#main`：`<div class="page page--scroll" aria-busy="true">` + `page-head` 占位 + `ui.skeletonRows(6)`。数据到达后 `router.render()` 的 `main.innerHTML=''`（`router.js:79`）会**自动清掉**，不需要额外的"移除骨架"逻辑 —— 这是零成本接入点 |
| >2s | 骨架下方追加一行 `aria-live="polite"` 的"还在加载…（本地接口通常 < 200ms，超过 2 秒多半是后端没起）"。**文字兜底是必要的**：无上限呼吸的骨架在长时间等待下会被读成"卡死"，而文字给出可执行的解释 |
| >8s | 换成 `ui.empty({ title: '数据没加载出来', note: msg })` + 一个"重新加载"按钮（`location.reload()`）。此时页面已无意义，给出口比继续呼吸强 |
| 失败 | `sessionStorage.cl_flash = '数据加载失败：' + msg`，踢回 `/login` 后由登录页/toast 读出来。现在用户只会看到"我被登出了"，完全不知道为什么 |

**不加什么**

- **不加骨架→内容的交叉淡出**（`MOTION.md` §4.9 已否，我同意并补理由：交叉淡出需要两份 DOM 同时存在，`router.render()` 的结构是 `innerHTML=''` 之后立刻 append，加交叉淡出等于改 router 为两段式，还会和 `scrollMap` 的 rAF 恢复抢一帧）。
- **不加"加载中"转圈**（同上，违反无限循环禁令）。
- **不在每页各写一套骨架**（`records` 骨架是表格、`pending` 骨架是主从两栏 —— 那要在数据到来前就知道页面结构，等于把路由逻辑复制进骨架，维护成本翻倍，收益是 400ms 后的一点点精细度）。

---

### 3. 筛选 / 搜索（`records.js:99`、`admin.js:723` / `902` / `1022` 的 `paint()`）

**结论先行：这里绝对不能加任何入场动效。包括逐行 stagger、表格淡入、空态淡入、"结果更新"闪烁。**

**现状证据**

- `records.js:74`：`onInput: function(e){ state.kw = ...; paint(); }` —— **无去抖**，每个字符重建一次。
- `records.js:108`：`box.innerHTML = ''` 后整表重建；20 行 × 6 列 = 120 个 `td`。
- `admin.js:577-581`：服务端搜索，有 260ms 去抖，但 `.then` 里同样 `box.innerHTML=''`（`admin.js:609`）。
- `admin.js:723` / `902` / `1022` 三处内存过滤，逐键重建。

**判断（为什么否决要有量化依据）**

1. **打字间隔约 80–150ms，而最短一档入场是 120ms、`MOTION.md` §4.2 给列表项的是 180ms。** 动画时长 > 相邻两次重建的间隔 → 每次重建都在动画**中途**被下一次重建打断，透明度永远到不了 1。用户看到的是"表格一直是半透明、字在发灰"，而不是"表格在动"。这不是审美问题，是**可读性事故**。
2. 逐行 stagger 在 20 行上：`24×5 + 180 = 300ms`（视觉侧封顶 5 步），但**第 6 行及以后共用第 5 步**，意味着最后 15 行在同一瞬间出现 —— 花了 300ms 却没买到"逐行"的读感，还要在每次按键重播。**收益为负。**
3. 筛选是"我问了一个问题，系统给答案"。答案晚 180ms 出现 = 信息读取被延迟，`MOTION.md` §5 自己就写了"禁止延迟信息读取"。
4. 空态同理：用户把关键词打到没有任何匹配，屏幕需要**立刻**说"没有符合条件的记录"，而不是 180ms 后淡入。

**应该加什么**

- **零动效。** 这是本产品里"正确的静止"。`paint()` 保持 `innerHTML=''` + 重建，不加任何 animation。
- 真正需要改的是**去抖不一致**：`records.js:74` 无去抖，`admin.js:580` 260ms。统一到 `180ms`（客户端过滤，够快；和最短一档时长同值，好记）。这既是性能修复，也让将来任何误加的动效更容易被发现（重建次数少了，闪动会变得明显）。
- 服务端搜索（`admin.js:589 load()`）在往返期间**旧表格保留**（现在的行为是对的）。若往返 >400ms，在 `.tbl-wrap` 上方插一行 12px 的"正在查询…"，**不给表格加骨架、不把旧表格变暗** —— 旧内容还准确，把它藏起来是净损失。

**不加什么（逐条列清，避免后续被"顺手加上"）**

| 不加 | 为什么 |
|---|---|
| 表格整体淡入 | 逐键重播，恒定半透明，见上文 1 |
| 逐行 stagger | 20 行买不到逐行读感，且每次按键重播 |
| 空态淡入 | 空态是答案，不是事件 |
| 结果行数变化的 count-up（`stat-strip` 在 `paint()` 里**不**重建，所以不会滚；但不要为此把 `record.js:59` 的 statStrip 改成每次重建 + count-up） | `MOTION.md` §5 已否"数字滚动用于会变动的计数"，此处正是那个场景 |
| 搜索框聚焦时表格淡出/位移 | 焦点态只允许 `box-shadow` 静态环 |

---

### 4. 路由切换（left nav、面包屑、详情进出）

**现状证据**

- `router.js:79` `main.innerHTML = ''` → 新 `.page` 整块替换。
- `router.js:76` 存旧 `.page` 的 `scrollTop`；`:97-103` 在 `rAF` 里恢复。
- **注意：只有 `page--scroll` 的页面（`layout.css:288-293`）自己滚动。** `pending` / `review` 的 `.page` 是 flex 容器（`height:100%`），真正滚动的是 `.md-list` / `.md-detail`（`layout.css:340` / `:351`）→ **`scrollMap` 对主从页保存的永远是 0**，回到 `/pending` 时右栏回到顶部。这是现状缺陷（不是动效问题），但决定了"转场不能指望滚动恢复"。
- `app.js:547-551` `onBefore` 里每次导航都 `renderNav()`，`app.js:269` `nav.innerHTML=''` → 整个侧栏重建。

**判断**

- 120ms 页根 `opacity` + 180ms 页头 `translateY(4px)`：**批准**。它对"我点了导航"给出一次明确的、短于一次呼吸的确认，且不动内容块，不会延迟读取。
- **不做退场**：同意 `MOTION.md` §4.1。补一条更硬的理由：`router.js:79` 已经把旧 DOM 删了，做退场必须改成两段式，而两段式会和 `hashchange` 抢时序 —— 连点两次导航时，第二次的 `hashchange` 可能落在第一次的 120ms 等待窗口里，结果是"停在中间某页"。演示时最容易被抓到的 bug 类型。
- **判定规则要改**：`MOTION.md` 说"path 与上一条 path 不同就给 `.page--enter`"。但 `/pending` ↔ `/pending/ext` ↔ `/pending/:id` 这三者共享同一份 `.page` 结构（`pending.js` 重新渲染左右两栏，路由参数只影响选中项）。按路径判定 → 切 tab 会整页淡入一次，**用户会以为点了刷新**。所以要按"视图"判定：

```js
// router.js：新增，3 行
var prevPath = null;
function isSameView(a, b) {
  if (!a || !b) return false;
  return a.indexOf('/pending') === 0 && b.indexOf('/pending') === 0;  // 主从页内部切换
}
// render() 里：
var enter = prevPath && prevPath !== h.path && !isSameView(prevPath, h.path);
page.className = 'page' + (enter ? ' page--enter' : '');
prevPath = h.path;
```

`/records` → `/records/:id` **是**视图变化（真的换了整页），保留入场。

**风险点（必须写进实现注释）**

1. **`.page` 绝对不能加 `transform`**：`layout.css:277-285` 它是 `height:100%` 的 flex 容器，还承接 `scrollMap` 的 `scrollTop`。加 transform 会新建包含块，把 `.action-bar` 的 `position:sticky`（`components.css:671-681`）和内层滚动一起卷进动画。页根**只动 opacity**（同意 `MOTION.md` §3）。
2. **入场与滚动恢复同帧**：`router.js:97-103` 的恢复在 `rAF` 里，与入场首帧同帧执行。只动 opacity 时两者互不干扰；一旦有人给 `.page` 加 `translateY`，`scrollTop` 会与位移叠加，内容"跳一下"。这是我对"4px 位移"唯一的加强要求：**位移只允许在 `.page-head` 上，不许在 `.page` 上**。
3. **双次渲染**（本报告 P0-2）会让入场在"空页面"上播一次，然后真实内容直接弹出、没有入场。修 P0-2 之前不要上 `.page--enter`。

**不加什么**：不加退场、不加新旧交叉淡出、不加内容块阶梯（`MOTION.md` §4.1 已否，我同意：总时长会破 400ms，且读起来像卡片依次飞入）、不加"页面高度变化"的动画。

---

### 5. 空态（`ui.empty`）

**现状证据**

- `ui.js:267-278`：纯静态节点，无 animation。`.empty{padding:40px 0 0}`（`components.css:715`）。
- 出现路径：`records.js:109`（筛选无结果）、`admin.js:610`（服务端无结果）、`pending.js:90` / `:153`（队列空/未选中）、`workbench.js:310` / `:351`。
- `MOTION.md` §4.2 给了 `.empty` 180ms 淡入（挂在 `.md-list.is-enter` 上）。

**判断**

- **否决 `.empty` 淡入。** 理由是触发路径决定的：空态最常出现的场景是"用户在筛选/搜索/切 tab"，而这三条路径都会在每次按键或每次点选重建 DOM。挂 180ms 淡入 = 每次按键让"没有符合条件的记录"晚 180ms 出现一次。**空态是一个答案，答案要立刻出现。**
- 从"有数据"切到"空"、以及反向切回：**两者都应该瞬时**，而且需要的是**位置稳定**（空态不要换行导致列表高度骤降，`.empty` 有固定 `padding:40px 0 0`，这块已经没问题）。真要改进，是让空态的**标题文案更具体**（`records.js:112` 已经按 `kw` 分流文案，做得对），而不是让它淡入。

**应该加什么**：无动效。若一定要给一次性的"页面级空态"一个入场（`pending` 首次进入即为空），也只允许 `opacity` 从 `--m-ink-from`(.45) 起 120ms，**绝不从 0 起**，且必须用 `MOTION.md` 的一次性门控。收益很小，建议二期再说。

**不加什么**：不加淡入、不加图标动画、不加"空态插画"的漂浮/呼吸（§5 已否无限装饰动效）。

---

### 6. 抽屉（`ui.drawer`）

**现状证据**

- `ui.js:354-383`：`scrim` + `panel` 直接 `createElement` 到 `document.body`（`:360-361`），下一帧加 `.is-open` 触发过渡（`:362-366`）。
- `panel` 有 `role="dialog"` `aria-modal="true"`（`:357`），但**没有 `aria-label` / `aria-labelledby`**，也**没有任何焦点操作**：
  - 打开时焦点**留在触发按钮**上，不进入抽屉；
  - 关闭后焦点**不归还**（节点被 `.remove()`，焦点落到 `body`）；
  - 无焦点陷阱 —— `aria-modal="true"` 承诺了"模态"，但 Tab 键会走到遮罩后面的侧栏和顶栏（键盘用户能一路 Tab 到抽屉外，而身后的东西他说不清是什么）。
- `.drawer-body` 有独立滚动（`layout.css:467` `overflow-y:auto`），但**滚动会穿透**：滚到抽屉底部后继续滚，桌面 Chromium 会把滚动链交给父级（`body` 不滚，但 `#app` 内的 `.main` 不在这条链上，所以真正的问题是**滚轮在抽屉上继续滚动会滚到页面下层**——在 `admin` 表格页可以复现）。
- 关闭时序：`setTimeout(remove, 260)` 给 240ms 留 20ms 余量（`MOTION.md` §4.4 已核对，正确）。
- 唯一做过焦点的地方是 `admin.js:96`：`setTimeout(() => inputs[first].focus(), 60)` —— **有人已经踩过这个坑，但只在一个调用点修了**。

**判断**

- **动效：批准 240ms 保留**。理由同意 `MOTION.md`（全站唯一大位移、唯一现有实现即可用）。遮罩从 `--ease` 改 `--ease-tog` 也批准。
- **焦点 / 键盘 / 滚动：这是可用性缺陷，不是动效问题，但它比抽屉的动效重要十倍。** 而且**不需要动效就能修**，成本约 20 行。

**应该加什么（`ui.js:354-383`）**

1. **打开时**：记录 `document.activeElement` 为 `returnFocus`；在 `rAF` 加 `.is-open` 的同一帧后，`panel.querySelector('input,textarea,select,button,a[href]')` 聚焦；找不到就 `panel.tabIndex = -1` + `panel.focus()`。
2. **关闭时**：`returnFocus && returnFocus.focus && returnFocus.focus()`，放在 `remove()` **之前**（节点还在的时候归还，否则焦点会先掉到 body）。`admin.js:96` 那次 `setTimeout(60)` 可以删掉（由 `ui.drawer` 统一处理）。
3. **焦点陷阱**：`keydown` 里监听 Tab，用 `panel.querySelectorAll('可聚焦')` 首尾环绕。约 12 行。
4. **`aria-label`**：`ui.drawer(node, { label: '编辑账号' })`，或从 `.drawer-title` 的文本自动取 `aria-labelledby`。
5. **滚动穿透**：**不要**去锁 `body`（`layout.css:7` `.app{height:100vh;overflow:hidden}`，`body` 本来就不滚，锁它没有任何效果，还会在关闭后忘了解锁）。正确做法是一行 CSS：`.drawer-body { overscroll-behavior: contain; }`。
6. **`will-change`**：`MOTION.md` §3 说"由 JS 临时加、`transitionend` 后移除"。**建议这次不做**：9 个页面 × 每次开关抽屉加删 `will-change` 会在 style 上产生额外失效，收益在 240ms/480px 的量级上不可测。这是我对视觉侧唯一"降级"的建议，理由是维护成本 > 收益（和 `MOTION.md` 自己的"不预置 will-change"逻辑一致）。

**不加什么**：抽屉内容区**不做二次入场**（同意 §4.4 三条理由，尤其第 3 条：`.drawer-body` 常是表单，二次淡入会让刚聚焦的输入框焦点环跟着闪）。不加遮罩的 `backdrop-filter`、不加抽屉阴影动画、不加"从右侧弹一下"的 overshoot。

---

### 7. 表格行可点击（`ui.table` 的 `onRowClick`）

**现状证据**

- `ui.js:252-255`：有 `onRowClick` 就给**每一行**加 `is-hover` 类，并挂 click。
- `components.css:135`：`.tbl tbody tr.is-hover { background: var(--hover); cursor: pointer; }` —— **类名没有 `:hover` 伪类**，所以整表行底色常亮（视觉侧已记录为 bug）。副作用：`cursor:pointer` 也因此**常亮**，所以"可点击"其实有一个唯一的指针提示，只是它和"整行涂色"这个错误视觉捆在一起。
- 行**不可键盘到达**：`<tr>` 无 `tabindex`、无 `role`、无 Enter/Space 处理。
- 对比 `admin.js:647-652`：管理端申请表的末列有一个 `.link-btn` "查看"，`e.stopPropagation()`。**同一个产品，两种做法** —— 教师端台账（`records.js:117-154`）没有这个"查看"入口，键盘用户**完全无法打开申请详情**。

**判断**

- 指针提示**要**加，但不要在"常亮底色"上做重命名以外的事；也不要加箭头列。
- **真正的缺口不是视觉可供性，是键盘可达性。** 鼠标用户至少有 `cursor:pointer`，键盘用户是 0。
- 加箭头列的代价：`records.js` 表格已经 6 列、`students` 8 列（`records.js:210-219`），最窄档一屏排得很紧，再加一列会挤压"请假区间"（那是本表信息密度最高的一列）。

**应该加什么**

1. **修 bug + 改名**（`ui.js:253` + `components.css:135`）：
   ```css
   .tbl tbody tr.is-click { cursor: pointer; }
   .tbl tbody tr.is-click:hover { background: var(--hover); }
   ```
   `ui.js` 里 `tr.classList.add('is-hover')` → `'is-click'`。改名是为了让"这是可点击标记"和"这是悬停态"分开，避免以后再有人把状态类当交互类用。
2. **补键盘入口（推荐做法，不加 tabindex）**：在 `records.js` 表格末列加 `{ label: '操作', width: 76, align: 'right', render: ... }` 里的 `.link-btn` "查看"，`onClick` 里 `e.stopPropagation()` 后 `location.hash = '#/records/' + a.id` —— **直接照抄 `admin.js:647-652`**。理由：给 `<tr>` 加 `tabindex="0"` 会让 20 行变成 20 个 Tab 停靠点，破坏"Tab 走控件、方向键走内容"的惯例；而一个真链接既给了键盘路径，也给了视觉可供性（右侧"查看"是可预期的）。
3. `students.js` 那行点击（`records.js:221-231`）的副作用要写进注释：跳 `/records` 之后 `setTimeout(60)` 去 `document.querySelector('.input--search')` 填值 —— 这是个 60ms 的时序赌注（默认 183 行数据渲染可能超 60ms）。这不是动效问题，但**如果给 `/records` 加了 `.page--enter` 的 120ms 淡入，这 60ms 的窗口会变得更不可靠吗？不会**（DOM 在 `render()` 同步阶段就建好了，动画只影响 opacity）。已核对，无冲突。

**不加什么**：不加 hover 抬升/阴影、不加行末 `→` 箭头图标、不加"点击时整行闪一下"、不加 `.is-hover` 底色过渡（`ui.js` 每次 `paint()` 重建 `<tr>`，新节点上没有"上一个值"，`transition` 不执行 —— 视觉侧 §4.3 已指出，我确认：**写了就是死代码**）。

---

### 8. 表单校验（`rejectPanel` 的 disabled 按钮、`.form-err`）

**现状证据**

- `ui.js:319-323`：`confirm.disabled = true` 初始；`input` 事件里按 `ta.value.trim()` 切换。切换**无过渡**（`.btn` 的 transition 不含 `opacity`，`components.css:19`）。
- `ui.js:338-345`：面板内 `keydown` —— Esc 取消、`Ctrl/⌘+Enter` 提交（好设计，键盘用户不必离开输入法）。
- `.form-err`（`components.css:924-929`）：`min-height:16px` 预留行高，**这就是它能安全加动效的前提**。
- `admin.js:68` 的 `err`、`rejectPanel` **没有 `role="alert"`**，屏幕阅读器完全不知道错误出现了。

**判断**

- **批准 `.form-err` 的 120ms `opacity` 显影**（`MOTION.md` §4.4 唯一例外）。它是"新元素出现"而不是"内容被替换"，且有 `min-height` 占位不推动表单 —— 在全站"内容重绘不动画"的原则下，这是唯一站得住脚的例外。
- **批准 `:disabled` 的 120ms `opacity`**（`.38`），但必须在 `components.css:19` 给 `.btn` 的 transition 补 `opacity`，否则这条"规范已写、CSS 未接"。
- **不批准 `.reject-panel` 的高度/展开动画**，同意 §4.11（"显影，不是长出来"）。但要提醒：面板插入本身会让 `.action-bar` 位移一次（`.action-wrap{margin-top:auto}`），这个位移**必须保持瞬时**，不要试图动画它。

**应该加什么**

| 时机 | 做法 |
|---|---|
| 错误文本被写入 | 120ms `opacity 0→1`，`--ease-tog`。同时 `err.setAttribute('role','alert')`（`admin.js:68`）—— 这一行比动效重要 |
| `confirm.disabled` 变化 | `opacity .38 ↔ 1`，120ms `--ease-tog`（补 transition 属性） |
| 提交失败 | `.form-err` 文案 + 显影；按钮恢复文案 —— `admin.js:85-93` 已经是对的，**保持不动，把它当成其余审批动作的模板** |

**不加什么**：不加"错误时输入框抖动"（`MOTION.md` §5 已否，同意）；不加错误文本的 `translateY` 进入（它靠 `min-height` 占位才安全，一旦位移就会和下一行挤一下）；不加"按钮从灰变黑"的 `scale` 或色彩脉冲。

---

### 9. 危险操作（驳回）

**现状证据**

- 驳回需要**填原因**才能点（`ui.js:320-323`），原因会推送给学生（`.reject-note`，`:333`），支持 `Ctrl/⌘+Enter`，Esc 取消。
- 但**批准零确认、单点即发**（`detail.js:274-279`、`pending.js:288-291`、`review.js:285`）。布局上驳回在左（`.btn--secondary`）、批准在右（`.btn--primary`），符合"主操作在右侧"的阅读终点。
- 成功的回执是伪造的（见 §1）；失败只 `alert`。

**判断**

- **确认成本已经足够，不加二次确认。** 填一段中文原因这件事本身就是高成本动作（比"再点一次确认"高得多），再加弹窗只会让"驳回"和"批准"的成本差距大到教师倾向批准 —— 这是把可用性做成了业务偏差。批准是高频动作（`MOTION.md` 定位"低频不可逆"对驳回成立，对批准不成立），高频动作不该有确认弹窗。
- **所以危险操作真正需要的不是"更重的确认"，而是"更清楚的后果可见性"**：① 点击后立刻进入"处理中"（防重入）；② 成功后可追溯（reload 后的 flash toast 说清"已通过 · 张明远"）。这两条在 §1 已给做法。误点能被立刻发现，比误点前被拦两次更有效。
- **动效边界**：**否决**任何抖动/红闪/边框脉冲/`aria-live="assertive"` 的强制播报（后者会打断屏幕阅读器正在读的内容，在"驳回"这种已经需要谨慎的场景里只会制造焦虑）。这一条我完全同意视觉侧 §4.11，并且理由更强：`--red-600` 在本产品专指"逾期/失败"这一**状态语义**，让它闪一次就把它降级为**装饰语义** —— 之后教师看到红色会先怀疑"这是不是动画"。

**应该加什么**：只有两件事 —— 提交中的禁用态（§1）、成功后的 flash 确认（§1）。驳回成功**不要** toast"已驳回"再 reload（双份确认，且 toast 会被 reload 掐死）。

**不加什么**：不加二次确认弹窗、不加长按确认、不加"输入'驳回'二字才能提交"这类重型门槛（答辩现场演示会被认为刻意为难用户）、不加任何红色动效。

---

### 10. 键盘 / 无障碍

**现状证据**

- `tokens.css:151-156`：全局 `prefers-reduced-motion: reduce` → `animation-duration: .01ms; transition-duration: .01ms !important`。
- `tokens.css:141`：`:focus-visible { outline: 2px solid var(--blue-500); outline-offset: 2px }` —— 未参与动画，**正确**。
- 全站 `aria-live` / `role="status"` / `aria-busy`：**0 处**（`ui.js:512` 的 toast 是纯 `div`）。
- `app.js:269` `nav.innerHTML=''`：**每次路由变化都重建侧栏**（`onBefore`，`app.js:547`）→ 键盘用户按 Enter 激活的 `<a>` 在同一帧被销毁，焦点落回 `body`。
- `pending.js:88` `listEl.innerHTML=''`：点选/审批后左栏重建 → 焦点同样落到 `body`。
- `router.js:79` 整页替换 → `location.reload()` 与整页替换都会重置屏幕阅读器的虚拟光标。

**判断：`reduced-motion` 的覆盖有 3 个洞**

1. **`.01ms` 对 `infinite` 是反效果**：骨架呼吸（`MOTION.md` §4.9）若写成 `animation: sk-breath 1.8s infinite`，在 `.01ms` 下变成"以 0.01ms 为周期无限循环" —— 浏览器会尽力按帧率跑，等于把"减少动态"变成"最大化动态"。必须显式 `animation: none`（视觉侧 §4.9 已写"静态 `--paper-2`，不呼吸"，但**规范写了、CSS 规则没写**，这条要补成 `@media (prefers-reduced-motion: reduce) { .sk-bar { animation: none !important } }`）。
2. **`.01ms` 管不到 JS 驱动的动画**：`MOTION.md` §4.6 的 count-up 是 `requestAnimationFrame` 循环，`.01ms` 对它完全无效。必须在启动前读 `matchMedia('(prefers-reduced-motion: reduce)').matches`，命中则直接写终值。视觉侧 §4.6 写"现有全局 `.01ms` 规则会让它瞬间完成" —— **这句是错的**，CSS 规则不影响 rAF。这是本次评审对 `MOTION.md` 的唯一实质性纠正。
3. **`.01ms` 不处理 `scroll-behavior`**：当前全站没用到，不构成风险；若二期加了 `scrollIntoView({behavior:'smooth'})` 要一并处理。

**判断：`aria-live` 该加在哪**

| 位置 | 是否加 | 为什么 |
|---|---|---|
| `ui.toast`（`ui.js:512-517`） | **加** `role="status"`（隐含 `aria-live="polite"`） | 全站唯一的"轻确认"通道（已保存 / 已创建 / 当前没有待办）。不加的话，键盘+读屏用户对"保存成功"零感知。成本 1 个属性 |
| 审批结果 | **不加在页面上，靠 flash → toast 播报** | reload 会清空整个无障碍树，"在页面上放 live region"活不过 reload。用 §1 的 flash 机制，reload 后 toast（已带 `role=status`）就是播报 |
| `.form-err`（`admin.js:68`） | **加** `role="alert"` | 表单错误必须打断。注意只加在**错误容器**上，不要给整个表单加 |
| 骨架屏 | `#main` 加 `aria-busy="true"`；`.sk` 加 `aria-hidden="true"`；另加一个视觉隐藏的"正在加载"文本 | 骨架条的 `<div>` 对读屏是噪音；`aria-busy` 单独用多数读屏不播报，所以需要那行隐藏文本（需要一个 `.sr-only` 工具类，3 行 CSS） |
| 批准/驳回按钮的处理中态 | **不加** assertive | 见 §9，会打断当前朗读 |

**判断：焦点在哪些地方会丢**

| 场景 | 现象 | 修法（成本很低） |
|---|---|---|
| 点导航 / 面包屑 / 任何 `router.go` | `renderNav()` 重建整个 nav（`app.js:269`）→ 刚聚焦的 `<a>` 被销毁 → 焦点到 `body` | **把 `renderNav()` 从"重建"改成"打补丁"**：nav 已存在且角色未变时，只 `classList.toggle('is-on')` + 更新 `.count` 文本，不 `innerHTML=''`。约 12 行；顺带解决 `MOTION.md` §4.10 说的"nav 指示器每次审批后重播" |
| 审批后（左栏重建） | `pending.js:88` 清空 → 焦点到 body。改为"等响应再动"（§1）后，这条自然消失（成功后直接 reload） | §1 的改动顺带修掉 |
| 抽屉关闭 | 焦点到 body，键盘用户要从头 Tab | `ui.drawer` 归还 `returnFocus`（§6） |
| 表格行 | 不可达（§7） | 加"查看"链接 |
| reload 后 | 焦点回 `document` | 这是 reload 的固有行为，接受；用 flash toast 播报弥补（读屏用户会听到"已通过 · 张明远"） |

**不加什么**：不给 `:focus-visible` 加任何过渡（`MOTION.md` §4.13 已写"第一帧就完整可见"，我完全同意，这是可访问性硬要求）；不加 `outline` 的 `offset` 动画；不用 `aria-live="assertive"` 播报非错误信息。

---

## 四、我否决的动效清单（含替代）

| # | 被否的动效（来源） | 否决理由 | 替代 |
|---|---|---|---|
| V1 | `.empty` 淡入 180ms（`MOTION.md` §4.2） | 空态出现在筛选/搜索/切 tab 路径上，会被逐键重播；空态是"答案"，答案要立刻出现 | 无动效。空态靠**更具体的文案**承担确认（`records.js:112` 已按 `kw` 分流，保持） |
| V2 | `.detail` 每次点选从 `opacity:0` 起（`detail.js:310`、`pending.js:220`、`review.js:194`，现有 `.fade-in` 140ms） | 每点一条待办，右栏内容**消失 140ms 再显影**。这是"内容被拿走"而不是"内容到来"，直接违反"不延迟读取"。且与左栏重建（`pending.js:88`）叠加，读感是"点一下闪一下" | ① 起点改 `--m-ink-from: .45`（视觉侧 §6 配套改动第 5 条已提，**优先级应提到 P0**，因为它现在是负收益）；② 更彻底：`.detail` 内部切换时**完全不加 animation**，只靠左栏 `.is-on` 墨线指示选中变化 |
| V3 | 表格行逐行 stagger（`MOTION.md` §5） | 同意否决，补量化：20 行封顶 5 步 = 300ms，第 6 行之后共用第 5 步，花 300ms 买不到"逐行"读感；且筛选每次重播 | 保持瞬时 |
| V4 | nav 指示器"每次渲染重播"的默认接受（`MOTION.md` §4.10 方案 A） | `renderNav()` 在**每次路由变化**都被调用（`app.js:547`），也就是说这个 2px 发丝在每个页面切换时都会重播一次，而不是视觉侧设想的"审批后偶尔重播"。频次被低估了 | 先按 §7 把 `renderNav` 改成补丁模式（顺带修焦点丢失），指示器就只在 `activeKey` 真变化时挂类 → 才有"只播一次"的可能。若改造成本超预算，退化为纯 `opacity` 120ms 或干脆瞬时 |

---

## 五、批准但收窄条件的动效

| 动效 | 原条件 | 收窄后 |
|---|---|---|
| `.page--enter`（页根 120ms opacity + 页头 180ms/4px） | path 与上一条不同 | path 不同 **且不属于同一个 `/pending` 视图**；`/pending`↔`/pending/ext`↔`/pending/:id` 不加（见 §4 代码） |
| 骨架屏 | 加载 >400ms | 同一阈值，但**位置固定为 `#main`、路由无关**；且必须配 2s 文字兜底 + 8s 失败态（见 §2） |
| 骨架呼吸 infinite | reduced-motion 下静态 | 必须显式 `animation: none !important`，不能依赖 `.01ms`（见 §10 洞 1） |
| count-up 数字滚动 | `--t-slow` 320ms，`reduced-motion` 由全局规则接管 | 必须在 JS 里读 `matchMedia`（见 §10 洞 2）；且仅限 `|v| < 1000`（视觉侧已定位千分位宽度跳，正确） |
| `.form-err` 120ms opacity | 允许 | 允许，**但先加 `role="alert"`**。属性优先于动效 |
| `:disabled` 120ms opacity | 允许 | 允许，需在 `components.css:19` 补 `opacity` 到 transition，否则是死规则 |
| 抽屉 240ms | 保留 | 保留；**但要先补焦点管理**，否则这个漂亮的推入动画会把焦点留在遮罩后面，键盘用户看着抽屉滑进来却操作不了它 |
| toast 180ms 进出 | 允许 | 允许；但 `.toast` 还需要 `role="status"`，且 `translateX(-50%)` 必须在 keyframe 里保留（`components.css:992-993` 现有写法带 `translateX(-50%)`，视觉侧 §4.5 只写了 translateY，**实现时不能丢掉 `translateX(-50%)`，否则 toast 会跳到右侧**） |

---

## 六、动效前置的反馈缺陷（可直接派工）

| 级别 | 缺陷 | 改哪个文件哪个函数 | 验收方式 |
|---|---|---|---|
| **P0-1** | 审批回执乐观伪造 + 失败 `alert` + 无禁用导致重复提交 | `app.js:104-147`（`decideApp` / `decideCheckins` 去 reload、去 alert、失败 `throw`）；`pending.js:194-215`、`review.js:327-343`（删 `local.receipt` 与同步 `advance`，改 then/catch）；`components.css:19`（transition 补 `opacity`） | 断网后点批准 → 行内红字、列表不动、按钮恢复、无弹窗；恢复网络点批准 → 新页面 320ms 后 toast「已通过 · 张明远」 |
| **P0-2** | `router.start()` 早于 `loadStore()`，F5 必现假空态 + 双次渲染 | `app.js:495-553`：抽出 `startRouter()`，只在 `loadStore().then` / `.catch` / 无 token 分支里调用一次；`boot()` 末尾不再无条件 `router.start` | F5 后在 Network 面板节流 3G：页面只出现一次内容，绝不出现"没有符合条件的记录"再变有数据 |
| **P1-1** | 抽屉无焦点进入/归还/陷阱、无 `aria-label`、滚动穿透 | `ui.js:354-383`；`layout.css:467` 加 `overscroll-behavior: contain`；`admin.js:96` 的 `setTimeout(60)` 可删 | 只用键盘：打开抽屉 → Tab 在抽屉内环绕 → Esc → 焦点回到"新建账号"按钮 |
| **P1-2** | 表格行不可键盘到达 | `ui.js:252-255`（`is-hover` → `is-click`）；`components.css:135-136`；`records.js:117-154` 末列加"查看" `.link-btn`（抄 `admin.js:647-652`） | 键盘 Tab 能到"查看"并 Enter 打开详情 |
| **P1-3** | `renderNav()` 每次路由重建导致焦点丢失 | `app.js:266-290`，改为补丁模式 | 键盘激活"异常核验" → 焦点仍在该导航项上（能看到焦点环） |
| **P1-4** | toast 无 `role="status"`；`.form-err` 无 `role="alert"` | `ui.js:513`；`admin.js:68` | 用 NVDA/VoiceOver 验证"已保存"被播报 |
| **P2-1** | `.detail.fade-in` 从 0 起 | `components.css:753-754`（`fadeIn` 起始改 `var(--m-ink-from)`；注意页根淡入要用独立的 0→1 keyframe，别共用一个） | 连点 10 条待办，右栏正文全程可见 |
| **P2-2** | `records.js` 搜索无去抖 | `records.js:74` 加 180ms 去抖 | 连续输入不出现整表重建的闪烁 |
| **P2-3** | `loadStore` 失败无任何解释 | `app.js:508-514` 走 flash 机制 | 停后端 + 带 token 打开 → 登录页有"数据加载失败"提示 |

> P0 两条都在"加动效之前"完成。理由很直接：**在错误的状态上加入场动画，只会让错误状态出现得更优雅。**

---

## 七、无障碍清单（动效落地后逐条过）

- [ ] `prefers-reduced-motion: reduce` 下：所有页面内容完整、无位移、数字为终值、骨架静止（`animation: none`）、2 次脉动跑完停在 1。
- [ ] JS 侧：count-up、以及任何 `requestAnimationFrame` 循环，启动前检查 `matchMedia('(prefers-reduced-motion: reduce)').matches`。
- [ ] `:focus-visible` 环在任何动画期间**第一帧即可见**（不得有 `transition: outline`、不得被 `opacity` 父级压到 <1）。
- [ ] 焦点顺序：侧栏 → 顶栏 → 主区；抽屉打开后焦点在内、Tab 环绕、Esc 关闭、关闭后归还。
- [ ] 键盘可完成主任务：导航、打开申请详情、批准/驳回（含填原因）、打开抽屉表单并提交。
- [ ] 焦点不因 DOM 重建而丢失（nav 补丁模式、左栏重建前先等响应）。
- [ ] `aria-live` 覆盖：toast（`role=status`）、表单错误（`role=alert`）、加载中（`aria-busy` + 隐藏文本）。**不使用 assertive。**
- [ ] 对比度：骨架两端 `#F1F6EC` / `#E7EEDF` 仅作背景块，不承载文字；`.btn:disabled` 的 `.38` 透明度只用于**禁止交互**的按钮，不用于"正在加载但仍可读"的文案（所以"处理中"写进 `.action-note` 而不是把按钮变透明 —— 这条同时是 §1 的设计依据）。
- [ ] 触控目标 ≥ 32px：`.btn--sm` 高 28px（`components.css:21`）在触屏上偏小；若答辩用到平板演示，把 `.action-btns` 内的按钮提到 `.btn`（36px）高度。
- [ ] 不以颜色单独传达状态：`overdue` 用红色 + "逾期"文字（现状正确，保持）。

---

## 八、响应式 / 输入方式（与动效交叉的两点）

1. **`<1420` 断点（`layout.css:142-181`）侧栏收成图标条**：`MOTION.md` §4.10 的 `scaleY(.4→1)` 作用在 `.nav-item.is-on::before` 上，而这条基础规则目前**不存在**（`layout.css:162` 只有媒体查询内的 `top/bottom` 覆写）。补基础规则时注意：图标条模式下导航项是 48px 窄条，2px 墨线居中偏左，`inset-block` 要用 `6px`（媒体查询已覆写），基础值是 `8px` —— 两处都要有，否则宽屏没有指示器、窄屏有，视觉上是"换了产品"。
2. **演示设备很可能不是 1920 宽**：`.md` 主从布局在 `<1260` 会把左栏收到 380（`layout.css:470-473`）。转场动效与断点无关（只动 opacity），但**抽屉宽度 `--drawer`** 在 1366 屏上占比更大，240ms/480px 的位移速度感会明显不同 —— 不需要改时长（`MOTION.md` §2 明确"时长不随距离缩放"），只需在 1366 上实测一次"是否读作被推到位"。

---

## 九、与视觉侧的 3 处分歧（需要对齐后落 CSS）

| # | `MOTION.md` 的说法 | 我的判断 | 结论 |
|---|---|---|---|
| 1 | §4.6「`prefers-reduced-motion`：现有全局 `.01ms` 规则会让它瞬间完成」 | **不成立**。CSS 的 `animation-duration` / `transition-duration` 不影响 JS 的 rAF 循环，count-up 在减少动态模式下仍会滚动 320ms | 加 JS 侧 `matchMedia` 判断，3 行 |
| 2 | §4.9 骨架"`animation-iteration-count: infinite`" + 全局 `.01ms` | **`.01ms` + `infinite` 是反效果**（把减少动态变成最大化动态） | 显式 `@media (prefers-reduced-motion: reduce) { .sk-bar { animation: none !important } }` |
| 3 | §4.10 方案 A「接受 nav 指示器每次审批后重播」 | 频次被低估：`renderNav()` 在**每次路由变化**都执行（`app.js:547`），不是"每次审批" | 先给 `renderNav` 做补丁模式（顺带修焦点丢失），再谈指标器重播 |

其余数值（3 曲线 / 4 档 / 4px / 24ms 错落 / 禁 spring 与发光 / 2 次脉动）**全部保留，无异议**。

---

## 十、答辩演示前的 10 分钟检查

1. F5（3G 节流）：不出现假空态；只出现一次骨架；内容出现后骨架自动消失。
2. 连点 10 条待办：右栏正文不消失；左栏不重播淡入；nav 不闪。
3. 点"批准"（100ms 延迟模拟）：按钮立刻禁用 + "正在提交…"；成功后新页面 320ms 出现 toast。
4. 断网再点"批准"：行内红字、列表不动、无 `alert`、按钮恢复可点。
5. 只用键盘从头走到"驳回"并提交：焦点环全程可见，抽屉能 Tab 环绕、Esc 后焦点归位。
6. Performance 面板录一次"导航 + 审批 + 开抽屉"：单次动画 ≤320ms，Layout 次数为 0。
7. 系统开"减少动态"：所有内容完整可见、数字是终值、骨架静止不呼吸。
8. 1366×768 与 1920×1080 各过一次：页头 4px 位移后 `.action-bar` 的 sticky 不抖、`scrollMap` 恢复不跳。

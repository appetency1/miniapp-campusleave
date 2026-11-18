# 设计文档 vs 实际代码 · 一致性审计

> 审计时间：2026-11-18 ｜ 范围：全仓库
> 方法：后端 69 个 Java 文件逐文件阅读；小程序 50 个文件（关键路径逐行 + 页面字段消费）；Web 后台 18 个被引用资源；4 份契约文档 + AGENTS.md + README.md + schema + 全部 seed 脚本。
> 机械比对三组：① 注解提取接口路径 vs 03_API 总览；② 实体字段 vs schema 列名；③ 代码枚举常量 vs 文档白名单 / DB CHECK。
> 结论：**106 条记录，去重后 105 个独立问题**（G12 与 A1 是同一缺陷的前后端两面）：代码违反冻结规则 13、契约缺口 14、文档互相矛盾 13、文档过期 12、结构风险 5、小程序细节 21、Web 后台 16、配置与脚本 12。其中 **7 条 P0**。

---

## 0. 一句话结论

问题的主体不是「代码写错了」，而是**文档三份之间没有同步**：`01` 是业务权威但字段清单还停在 V1.1 之前，`02`/`03` 是技术实现但彼此在两处关键规则上给出相反要求（行锁 vs 条件更新、GPS 失败记录怎么关闭），`04` 是规划稿却从未回写实际落地结构。代码大体选了其中一边，因此**无论以哪份文档为准，都能挑出代码的错**。

---

## A 类 · 代码违反已冻结规则（13 项）

| # | 严重度 | 文档要求 | 代码实际 | 位置 |
|---|---|---|---|---|
| A1 | **P0** | `01 §4.1`：`current_time >= end_time` 即 OVERDUE，并特别注明「V1.1 中 §4.1 与 §5.2 曾分别使用 `>=` 与 `>`，V1.2 统一为 `>=`，**不允许两种写法并存**」 | `now.isAfter(endTime)` 即严格 `>`，到期那一秒仍判「请假中」。**注意：类注释（:17-18）与实现一致、但都与文档相反** —— 即文档一套、注释一套、代码跟注释；Web 端 `ui.js:196` / `app.js:32` 的 `Date.now() > end.getTime()` 同错，三处一致偏离，表现为到期那一分钟内全系统都显示「请假中」 | `student/EffectiveStatus.java:75`（注释 :17-18）；`backend/web/js/ui.js:196`；`backend/web/js/app.js:32` |
| A2 | **P0** | `02 §12.4` + schema `ck_checkin_close_reason`：`close_reason` 只允许 `SUPERSEDED_BY_SELF_CHECKIN / SUPERSEDED_BY_LATER_PASSED / MANUAL_REVIEW_COMPLETED` | 写入 `SUPERSEDED_BY_MANUAL_REVIEW`——不在白名单。一旦命中该 UPDATE，MySQL CHECK 拒绝 → 事务回滚 → 前端 500 | `teacher/TeacherCommandService.java:279`；约束在 `sql/V1.0__schema.sql:250` |
| A3 | **P0** | `01 §21`：`effective_status ∈ {IN_PROGRESS, OVERDUE}` 均可续假；`StudentCommandService.applyExtension` 也确实接受 OVERDUE | 详情页 `actions` 在 OVERDUE 分支只给 `CHECKIN` + `MANUAL_REVIEW`，**不给 `EXTENSION`** → 逾期学生在小程序里看不到「续假」按钮，后端能力无入口 | `student/StudentQueryService.java:626-629` |
| A4 | P1 | `03 §6.2`：状态筛选应精确；「进行中」= 请假中 + 逾期 | `status=ACTIVE` 编译成 `status='APPROVED' AND actual_end_time IS NULL`，把 `WAITING_START`（待开始）也算进来。代码注释写「交给内存过滤」，但后续没有任何过滤 | `teacher/TeacherQueryService.java:201-206` |
| A5 | **P0** | `03 §1.5`：size 有上限；后端 `PageQuery` 上限 100 | 前端一次性请求 `size=200`（申请/续假/学生/账号/班级 5 处），后端静默夹到 100 → 超过 100 条的班级只拿到前半段，且页面无分页可翻，数据"凭空少了" | `backend/web/js/api.js:122,123,124,145,146`；`common/PageQuery.java` MAX_SIZE=100 |
| A6 | P1 | `02 §12.3` 状态矩阵：`check_type=GPS` 时 `review_status` **只能是 `NONE`** | 销假成功时把历史 `GPS + FAILED + NONE` 记录改成 `review_status='VOID'` | `student/CheckinCompletionService.java:98-106` |
| A7 | P1 | `03 §5.7`：`GPS FAILED AND review_status=NONE` 关闭用 `SUPERSEDED_BY_LATER_PASSED` | 用 `SUPERSEDED_BY_SELF_CHECKIN`（语义是"被学生自主销假取代"，与"被后续成功销假取代"不同） | `student/CheckinCompletionService.java:101` |
| A8 | P1 | `03 §1.3`：统一响应四段，成功响应也示例了 `"traceId": "b7c1e2f0"` | `Result.ok()` 从不设置 traceId，全项目只有 `GlobalExceptionHandler` 的 6 处异常路径设置 → **成功响应 `traceId` 恒为 `null`**，也没有 `ResponseBodyAdvice` 兜底 | `common/Result.java:31-42`；`common/GlobalExceptionHandler.java` |
| A9 | P1 | `03 §1.4`：40102 = token 已过期，与 40101 区分；`01`/`03` 禁止已禁用账号继续访问 | `JwtAuthFilter` 把所有解析异常一起 `catch (Exception ignored)` → **40102 永远不会返回**，一律落到 40101；且只验签不查库，账号被 DISABLED 后旧 token 仍可用到过期 | `security/JwtAuthFilter.java:39-49` |
| A10 | P1 | `03 §3.2`：`/auth/me` 必须返回 `studentProfile{studentNo,classId,className,counselorName}` | 只返回 `id/username/role/realName/phone/avatar`，**无 `studentProfile`** | `auth/AuthService.java:82-96` |
| A11 | P1 | `04` D-07 / §3.3：销假页有「模拟位置」下拉用于演示；配置项 `MOCK_LOCATION` | 4 个 seed 脚本**都没有**插入 `MOCK_LOCATION`；`updateConfig` 对不存在的 key 直接 404，后台也加不了 → `DictService` 恒返回 `mockLocation=false`，下拉永不出现，演示路径只能靠手工 SQL 打开 | `sql/V1.0__seed.sql:13-18`（仅 4 项）；`service/DictService.java:95`；`admin/AdminService.java:410` |
| A12 | P2 | `03 §5.9`：申请人工核验入参含 `evidenceUrl` | 参数被接收后**直接丢弃**（`leave_checkin_log` 无对应列，也没落材料表） | `student/StudentCommandService.java:318-366` |
| A13 | P2 | `02 §14.1`：`dedup_key` 为 `NOT NULL` | `applicationId == null` 时 dedupKey 写 `null`，插入触发约束失败，被 `catch (Exception)` 静默吞掉，消息丢失且无日志告警 | `common/NotificationService.java:60-73` |

---

## B 类 · 契约缺口（文档有、代码无，13 项）

| # | 严重度 | 契约 | 实际情况 |
|---|---|---|---|
| B1 | P1 | `03` 总览 #4 + `§3.3`：`PUT /auth/password`（改密码，新密码 ≥8 位） | **端点不存在**。`AuthController` 只有 login/me/logout。全系统没有任何「用户自己改密码」的路径，学生/教师改密码只能找管理员重置 |
| B2 | P1 | `03` 总览 #18 + `§5.10`：`GET /student/extensions/{id}` | **端点不存在**。续假提交后前端拿到 id 却无法回查 |
| B3 | **P0** | `03 §1.6 / §5.2 / §5.10`：`Idempotency-Key` 请求头**必填**，10 分钟内同键返回首次结果，冲突 40904 | 后端 `grep -i idempotency` **零命中**；`miniprogram/utils/request.js` 也不生成该头。`ErrorCode.DUPLICATE_SUBMIT(40904)` 定义了但从未抛出 |
| B4 | P2 | `03 §4`：上传响应含 `fileId`，并说明"提交申请时把 fileId/fileUrl/fileName 放入 materials" | 响应无 `fileId`（多了一个 `bizType`）。`leave_material` 也不需要 fileId，属于文档沿用了旧设计 |
| B5 | P2 | `03 §4`：`bizType` 取值 `MATERIAL / AVATAR` | 代码只把 bizType 原样回传，**没有任何 AVATAR 分支**；`user.avatar` 字段存在但全系统无上传入口 |
| B6 | P1 | `03 §4`：单文件 ≤ 10MB | `FileStorageService` 里写了 10MB 判断，但 `application.yml` **没有** `spring.servlet.multipart.max-file-size` → Spring 默认 1MB 先拦截，超 1MB 直接 500，业务层的 10MB 判断永远走不到 |
| B7 | P1 | `03 §10`：登录 5 次/分钟/IP 限流 | 零实现（无任何计数器/过滤器） |
| B8 | P2 | `03 §5.12`：`GET /student/messages?isRead=&page=1&size=20` | 只接受 `isRead`，返回 `List` 而非分页结构，**无 page/size** |
| B9 | P2 | `03 §5.4` 详情响应含 `overdue` 布尔 | 详情无 `overdue`（首页 `current` 里有，详情没有） |
| B10 | P1 | 主键名三处不一致：`03 §5.4` 详情写 `id`、`§5.3` 列表写 `applicationId`、`§6.3` 又说教师详情「字段同学生详情」 | 实际是 **学生详情返回 `applicationId`（偏离 §5.4）**、教师详情返回 `id`（符合 §5.4，但与 §6.3 的"相同"矛盾）；`effectiveStatus` vs `effective` 同理。探针已踩过这个坑（AGENTS §10） | `StudentQueryService.java:534`；`TeacherQueryService.java:162,285` |
| B11 | P2 | `03 §1.5`：`page` 默认 1、`size` 默认 10、最大 50 | 所有 Controller `defaultValue="20"`，`PageQuery.MAX_SIZE=100` |
| B12 | P1 | `02 §18.1`：提交申请需 `SELECT student_profile ... FOR UPDATE` 后复查重叠 | 全项目 `grep "FOR UPDATE"` **零命中**。重叠检查是纯 `selectCount`，两个并发提交可同时通过 → 生成两条重叠有效申请（唯一键拦不住，因为 application_no 不同） |
| B13 | P1 | `AGENTS §5`：列表必须 DB 分页，**禁止** `selectList(null)` 再内存切片；`03 §5.3`「数据量大时不会退化」 | 学生申请列表、首页、首页统计全部 `selectList` 全量 + 内存 filter（`StudentQueryService.java:406`、`:111`、`:332`）；管理端全校申请列表是**内存切片假分页**（`AdminService.java:666,686`）。**前端注释还明确写着「筛选在后端做，因为真实数据量可能很大」，与后端实现正好相反**（`miniprogram/pages/student/records/records.js:7`） |
| B14 | P1 | `03` 接口总览共 46 条 | 代码多出 3 个端点且文档完全没有：`GET /teacher/profile`、`GET /admin/overview`、`GET /admin/applications`；Web 前端与 `web_probe.py` 均已依赖后两个（全文搜 `overview` 在 03 中零命中） | `TeacherController.java:42`；`AdminController.java:130,138` |

---

## C 类 · 文档之间自相矛盾（13 项，最需要先裁决）

> 这一类的危害：答辩被问「以哪份为准」时无法自圆；改代码时不知道听谁的。

| # | 矛盾点 | 说法 A | 说法 B | 代码选了 |
|---|---|---|---|---|
| C1 | `leave_application` 字段清单 | `01 §40` 列出 `deleted`、`cancelled_by`、`approved_by` | `02 §9.1` 明确删除 `deleted`，操作人统一为 `cancelled_by_user_id` / `approved_by_user_id` | 跟 02（schema 也没有 deleted）→ **01 字段清单已过时** |
| C2 | 系统撤回续假的 `withdrawn_by` | `01 §19`：`withdrawn_by = SYSTEM` | `02 §10.1` + schema 注释：系统撤回时写 `NULL`，用 `withdraw_reason` 标识 | 写 `NULL`（`StudentCommandService.java:459-468` 不设 withdrawnBy） |
| C3 | 通知去重键格式 | `01 §36`：`APP_{id}_{TYPE}_{yyyy-MM-dd}`，所有类型都带自然日 | `02 §14.2`：一次性事件用稳定键 `APP_10001_APPROVAL_SUCCESS`（不带日期），只有周期性提醒才用自然日桶 | 跟 01（`NotificationService.java:66`）→ **同一事件隔天会再发一条**，与 02 的「同一事件只能产生一次」冲突 |
| C4 | GPS 失败记录的关闭方式 | `01 §40.1`：被自助销假取代 = `VOID + SUPERSEDED_BY_SELF_CHECKIN` | `02 §12.3`：GPS 的 `review_status` 只能是 `NONE`；`03 §5.7`：应写 `SUPERSEDED_BY_LATER_PASSED` | 三份说法**互不相同**；代码同时违反 02 与 03（A6/A7） |
| C5 | `notification` 唯一键 | `02 §14.3` 索引清单：`UNIQUE(dedup_key)` | `02 §14.2` 正文：`UNIQUE(receiver_id, dedup_key)` | schema 用复合键（`:297`）→ **02 文档内部打架** |
| C6 | 离校 `destination` 是否必填 | `02 §9.3` + `§32` 声称是核心不变量 `OFF_CAMPUS → destination IS NOT NULL` | `03 §5.2` 校验清单第 6 条：「建议填写（**非强制**）」；schema 里**根本没有**这条 CHECK | 代码强制 ≥2 字符（`StudentCommandService.java:110-113`）→ 四处不一致，且 02 声称的"数据库保护"并不存在 |
| C7 | `NOTIFICATION_DEDUP_HOURS` | `02 §29` 初始配置表列了该项（24） | `02 §14.2` 开头声明「不再使用 24 小时滑动窗口」 | seed 里没有该项 → 配置表与设计声明自相矛盾 |
| C8 | 并发控制手段 | `01 §37`：只要求条件更新 + 检查 affected_rows，「不需要引入复杂分布式锁」 | `02 §18.1` 要求锁学生行；`03 §1.6` 要求幂等键 + `SELECT FOR UPDATE` | 跟 01。所以 B3/B12 严格说是「违反技术文档、符合业务文档」 |
| C9 | 分页 size | `03 §1.5`：默认 10、最大 50 | `03 §5.12`：示例 `size=20`；代码 20 / 100 | 三处都不同 |
| C10 | 统计响应字段 | `03 §5.1` 的 `stats`：6 个字段（含 offCampusCount/onCampusCount/averageDays） | `03 §5.13` 的 `/student/stats`：只有 4 个字段 | 代码两处都用 6+ 字段（`statsBlock`）→ §5.13 示例过时 |
| C11 | 教师端是否有「逾期」独立页 | `04 §3.3`：「教师 5 项菜单（工作台/待审批/记录/核验/**逾期**）+ 学生」 | `03 §6.12` 有 `/teacher/applications/overdue` 接口 | 前端**无逾期页面**，该接口从未被调用；逾期在 records 页用前端 `effective === 'OVERDUE'` 筛选实现 |
| C12 | 管理端页面数 | `04`「M5 界面收尾」：**9 页**（无"账号管理"） | 代码菜单 **10 项**（多"账号管理"），AGENTS §7 也写 10 项 | 代码 10 项 → 04 的清单漏了一项 |
| C13 | 学生端定稿屏数 | `formal-v2/NOTES.md` 标题：「**六屏** + 五态」 | 同文件表格列出 **7 行**（首页/记录/消息/我的/申请/详情/销假）；AGENTS 也写 7 屏 | 标题未随内容更新 |

---

## D 类 · 文档过期（描述与实现不符，12 项）

| # | 文档说法 | 实际 |
|---|---|---|
| D1 | `04 §3.1` 后端结构：`student/` 6 个 Controller、`teacher/` 6 个、`admin/` 5 个；`service/` 8 个 Service（LeaveStateService / ConflictService / ApprovalService / CheckinService / NotificationService / LogService / ScopeService / DictService）；`domain/enums/` 6 个枚举 | 实际 7 个 Controller（Student/StudentCommand/Teacher/Admin/Common/File/Auth）；Service 按端分包；`enums/` 只有 `UserRole`；上述 7 个 Service **全部不存在**，实际是 `EffectiveStatus` + `TeacherScopeService` + 各端 Command/Query |
| D2 | `04 §3.1`：`security/` 含 `@RequireRole` 注解 | **该注解不存在**；角色门禁是 `CurrentUser.requireRole("STUDENT")` 方法调用 |
| D3 | `04 §3.1`：`mapper/*.xml` 仅复杂查询 | `backend/src/main/resources/mapper/` **目录不存在**，全项目零 XML |
| D4 | `04 §3.2` 小程序：5 个组件（ruler / status-tag / timeline / sheet / empty）；utils 含 `dict.js` / `upload.js` | 只有 `ruler` 1 个组件；utils 是 `request/auth/format/config/server`，无 dict.js；上传封装在 `request.js` 里 |
| D5 | `04 §3.2` app.js 启动逻辑：读 token → `GET /auth/me` 校验 → `role ≠ STUDENT` 清 token → `wx.getUpdateManager` 静默更新 | 只判断"有没有 token"，**不校验、不查 role、无更新检查**（`app.js:18-31`） |
| D6 | `04 §3.2` request.js：POST 提交类自动带 `Idempotency-Key` | 无（同 B3） |
| D7 | `04 §3.3` 后台目录 `admin/` + 12 个页面 JS（t-workbench…a-configs） | `backend/web/` + 7 个页面 JS（workbench/pending/records/detail/review/admin/login）；页面按大类合并 |
| D8 | `04 §3.3` 布局与视觉：侧栏 220px、内容 max-width 1200、圆角 6、「直接搬 formal-v2 的 --paper/--ink/--blue/--line」 | `tokens.css`：`--d-sidebar: 208px`、`--d-maxw: 1440px`、`--r: 8px`，配色是独立绿色系（`--paper #F7F9F4` / `--blue-500 #4A7C59` 实为绿色），与 formal-v2 不同源 |
| D9 | `01`/`AGENTS §6`/`04` 设计基线：纸 `#FBFAF7`、墨 `#15202E`、蓝 `#2563C9`、线 `#E7E3D9`、圆角 6 | 小程序实际：`--paper #FAF9F6`、`--ink #182331`、`--accent-500 #536B59`（橄榄绿）、`--line #E8E6DF`，圆角三档（12/24/28rpx）。**`app.wxss` 文件头注释仍写着旧基线**（`:3-4`），注释与紧接着的变量值自相矛盾 |
| D10 | `04` 当前进度：「2 条 P0（JWT 占位密钥、`/files/**` 匿名可读）待修」 | 两条已于 2026-11-11 修复（`JwtUtil.validateSecret` + `FileUrlSigner/FileAccessFilter`），`04` 未回写；AGENTS §11 列出的 4 条 P1 也未进 `04` |
| D11 | `02 §10.4`：`leave_extension.application_id` 有外键；schema 注释提醒实体需 `@TableField(exist = false)` 标注 `pending_app_id` | schema 已放弃该外键（MySQL 9.x 生成列 + 唯一索引导致 1215），降级为应用层保证；实体**根本没有** `pendingAppId` 字段（不映射就不需要 exist=false） |
| D12 | `02 §14.1`：`notification.read_at` 字段 | `Notification` 实体无 `readAt`，`markRead` 只改 `is_read` → 该列永远为 `NULL` |

---

## E 类 · 结构与性能风险（5 项，不属文档冲突但会影响答辩）

| # | 位置 | 问题 |
|---|---|---|
| E1 | `teacher/TeacherQueryService.java:91-97` | 工作台把**全部班级的** `PENDING_REVIEW` 核验记录整表查出，再用 `all.stream().anyMatch` 双重循环过滤本班 → 数据量增长后是 O(全表 × 本班申请) |
| E2 | `teacher/TeacherScopeService.java:105-109` | `assertStudentInScope` 每次调用都重新查一遍全部学生 id 再 `contains`；教师端每个写操作至少调一次 |
| E3 | `TeacherQueryService.java:641-655` | 关键字搜索对 `student_no` 做一次全表 like、再对 `user.real_name` 全表 like、再逐个嵌套查 student_profile（N+1） |
| E4 | `admin/AdminService.java:663-687` | 全校申请列表 `selectList(null)` + 内存 filter + `subList` 假分页；`PageResult.total` 是内存计算值 |
| E5 | `StudentQueryService.java:111,332,406` | 首页、统计、列表三处都是全量 `selectList`；学生端记录页按契约不分页，但没必要每次把全部历史读进内存 |

---

## F 类 · 前端细节缺陷（小程序 50 文件全量扫描补充，21 项）

> 与 A/B/D 去重后为新增项；F1 是本次审计唯一一条「界面直接崩坏」级别的问题。

| # | 严重度 | 文档/预期 | 实际 | 位置 |
|---|---|---|---|---|
| F1 | **P0** | `AGENTS §6` 设计基线：分区只用 1rpx 细线；`04` 曾专门记录过 `.card` 同名类串样式的教训 | 全局 `.rule`（`height:1rpx` + 背景线）与首页「请假须知」行 `.rule`（flex 行）同名，页面样式只覆盖了 display/gap/padding/border，**height 与 background 仍继承全局** → 态 E 的四条须知被压成 1rpx 高、文字互相重叠 | `app.wxss:76-79` + `pages/student/home/home.wxss:369-374` + `home.wxml:176` |
| F2 | P1 | `01 §13`：请假中（IN_PROGRESS）定位失败后，可「重新定位」或「申请人工核验」；`03 §5.9` 前置只要求"存在 GPS FAILED 且无 PENDING_REVIEW" | 详情页 `actions` 的 IN_PROGRESS 分支只有 `CHECKIN` + `EXTENSION`，`MANUAL_REVIEW` 只在 OVERDUE 出现 → 请假中定位失败后详情页没有核验入口（只能进销假页的失败态绕） | `StudentQueryService.java:622-625`；消费方 `detail.js:163-171` |
| F3 | P1 | `04 §3.2`：`401/40102 → 清 token 跳登录`；**`40103 原地 toast，不清 token`** | 只判断 `res.statusCode === 401` 一刀切：清 token + `reLaunch`，并把 code 强制改写成 40101。后端 40103/40104 也是 401 → 登录页输错密码会把本页 reLaunch 掉，内联错误提示落在已销毁页面，**输入框被清空** | `utils/request.js:66-72`；对照 `pages/login/login.js:185-188` |
| F4 | P1 | 4 个 tab 是常驻角标载体，进任一 tab 都应保留未读数 | 每个 tab 页持有独立 tabBar 实例，records 页 onShow 只 `setData({selected:1})`，**不同步 unread** → 切到「记录」页消息角标消失（home/messages/profile 都同步了） | `pages/student/records/records.js:41-47`；`custom-tab-bar/index.js:40` |
| F5 | P1 | `04 §3.2`：BASE_URL 从 config.js 读，「dev/prod 两套」 | 只有单一 `DEFAULT_BASE_URL`，写死内网 IP `http://10.225.223.179:8080/api/v1`，无环境切换；实际靠 storage 覆盖 | `utils/config.js:28-31`；`utils/server.js:18-21` |
| F6 | P1 | `AGENTS §6`：请求一律走 `utils/request.js`，不裸用 `wx.request` | `server.js` 探活 `pingHost` 直接裸用 `wx.request` | `utils/server.js:47-54` |
| F7 | P1 | `03 §5.2` materials 支持 3 种 `materialType`，`§3.4` 字典下发 materialTypes | 申请页上传后 materialType **硬编码 `MEDICAL_PROOF`** → 事假/其他材料在详情页显示成「诊断证明 · xxx」 | `pages/student/apply/apply.js:248`；`detail.js:119` |
| F8 | P2 | `03 §1.8`：客户端展示时拼 BASE_URL | `getFileBase()` / `DEFAULT_FILE_BASE` 定义后从未调用，`fileUrl` 未被消费 → **上传的诊断证明在小程序内无法查看** | `utils/server.js:24-27`；`config.js:31`；`detail.js:117-121` |
| F9 | P2 | `03 §5.8`：请求体 `accuracy` 传真实精度 | 恒传 `accuracy: 20`，`wx.getLocation` 返回的真实值未使用 | `pages/student/checkin/checkin.js:130-134` |
| F10 | P1 | 申请页默认时间应可直接提交，且注释声明「结束取开始 + 4 小时」 | `initDefaultTime` 把 `startHalf`/`endHalf` 都 `Math.min(..., 47)` 夹到 23:30：23:00 后打开 → 两者相等 → **首屏即报「结束时间必须晚于开始时间」**；21:30 后打开 → 默认区间只剩不到 2 小时（与「+4 小时」不符）；23:30 后打开 → 开始时间已过 → 报「开始时间不能早于当前时间」 | `pages/student/apply/apply.js:118-129` |
| F11 | P2 | `04 §3.2`：custom-tab-bar「零图标，文字 + pill」；`AGENTS §6`：4 tab 是「首页/申请/消息/我的」 | 实际带 base64 SVG 图标、无 pill；第二个 tab 是「记录」不是「申请」 | `custom-tab-bar/index.wxml:17-27`；`app.json:26-29` |
| F12 | P2 | `NOTES §3` / `04` M2：首页五态 A–E | 实际 6 个主卡片分支，多一个 `WAITING_START`（已通过未开始：还有 X 开始 / 取消本次请假），文档未定义 | `pages/student/home/home.js:320-335` |
| F13 | P2 | `04 §3.2`：无 token 不在这里 reLaunch，「交给 pages/index 判断」 | **没有 `pages/index`**；app.js 直接 reLaunch，各页再各自兜底一次 | `app.js:31-34`；`app.json:2-11` |
| F14 | P2 | `04` D-03 登录页版式：标题 32rpx/600、副标题 20rpx、按钮高 96rpx | 标题 60rpx、副标题 28rpx；按钮沿用全局 84rpx，`.login-btn` 只写 `line-height:96rpx`（行高大于盒高） | `pages/login/login.wxss:80-93,140-146` |
| F15 | P2 | `04` D-06 / `NOTES §5`：数字用衬线族 | 主动改成系统无衬线 + `tabular-nums`（注释说明是决策），D-06 与 NOTES 未同步 | `app.wxss:53-65` |
| F16 | P2 | 设计基线 `#FBFAF7 / #E7E3D9 / #B23A28` 已被新色板替换 | 旧色值仍有残留：`app.json` 导航/tabBar、ruler 兜底色、tabbar 兜底色、3 处 `confirmColor` | `app.json:13-23`；`components/ruler/ruler.wxss:15,26,32,71,76,99,116`；`custom-tab-bar/index.wxss:25,27,62,67,82`；`profile.js:89`、`detail.js:238,280` |
| F17 | P2 | `03 §3.3` 改密码、`§5.13` `/student/stats`、`§5.12` 消息分页 | 前端**零调用**：无改密码入口；「我的」复用 `/student/home`；消息一次拉全量、未读数前端 filter | `profile.js:63`；`messages.js:48,59`；`request.js:125`（`put` 无调用方） |
| F18 | P2 | `03 §5.4` 详情响应主键叫 `id`，materials 只有 `id/fileName/fileUrl` | 后端返回 `applicationId`/`createdAt`/`cancelReason`/各类 Label/`materialType`/`fileSize`/`reviewComment`，前端已消费，文档未列 | `03 §5.4:428-437` vs `StudentQueryService.java:534-567` |
| F19 | P2 | `03 §5.1` 首页无 `othersPending` | 后端新增并在首页顶部消费「另有 N 条待处理」，文档零记录 | `StudentQueryService.java:135`；`home.js:186` |
| F20 | P2 | — | 死代码/死字段：`format.clockText`、`request.put`、`server.getFileBase`、`DEFAULT_FILE_BASE`、`globalData.baseUrl` getter、`launchAt`、`home.sceneType`、`checkin.radius`、`checkin` 里重复定义的 `mockOptions`、`app.wxss .page-pad/.row-between` | `format.js:64-74`；`request.js:125-127`；`server.js:24`；`app.js:17,37`；`home.js:40,351`；`checkin.js:19,39,47,63`；`app.wxss:70-85` |
| F21 | P2 | WXML 规范 | `ruler` 的 `wx:for` 用 `wx:key="index"`（字符串数组应为 `*this`，会触发重复 key 告警）；`detail` 的 `placeholder-class="ph"` 本页与全局均未定义 | `ruler.wxml:38`；`detail.wxml:178` |

**F 类备注（不算缺陷，但会让验收落空）**：`04` M2 验收写「首页 5 态可切换（A–E）」，但小程序端没移植 formal-v2 壳外的演示面板，只能靠真实数据造态 —— 这条验收实际不可执行。

---

## G 类 · Web 后台缺陷（18 文件全量扫描补充，16 项）

| # | 严重度 | 文档/预期 | 实际 | 位置 |
|---|---|---|---|---|
| G1 | **P0** | `02 §8`：`teacher_class.teacher_id → teacher_profile.id`；`03 §7.3` 入参 `teacherId` | 前端下拉的 `value` 取 `STORE.admin.users[].id`（**user.id**），后端 `bind()` 用 `teacherMapper.selectById(teacherId)`（**teacher_profile.id**）→ 主键错位。演示数据里张老师 `user.id=2 / teacher_profile.id=1`，**选「张老师」会静默绑到王老师**，接口返回 200、页面提示"已改派"。改派路径还是先 DELETE 再 POST，若 POST 落在不存在的 profile 上则班级变成无辅导员 → 该班学生提交申请全部 42204 | `backend/web/js/pages/admin.js:1133,1140-1157,1250,1263-1272`；`admin/AdminService.java:349-377`；`sql/V1.1__seed_demo.sql:17-23,61-67` |
| G2 | P1 | `03 §6.1` 工作台应含逾期数 | 前端读 `st.overdue`，后端返回的字段是 `currentOverdue`（另有 `overdueCount`）→ 工作台「当前逾期」**恒显示 0** | `backend/web/js/pages/workbench.js:168`；`TeacherQueryService.java:119` |
| G3 | P1 | `04 §3.3`：「材料：图片 `<img>` 直接看，**PDF `<iframe>` 或 `window.open`**（小程序做不到，这也是后台的价值）」 | 非图片材料的链接挂了 click 监听，无条件 `preventDefault()` 并把文字改成「演示环境无附件」、`pointerEvents:none` → **PDF 证明在后台永远打不开**，后台唯一的差异化能力被主动关掉，文档未记录 | `backend/web/js/pages/detail.js:92-113` |
| G4 | P1 | `04` 请假规则页应可编辑阈值配置 | 「请假规则」页硬编码 `['START_REMINDER_WINDOW_MINUTES','OVERDUE_GRACE_MINUTES','EXTENSION_MAX_COUNT']`，后两项**数据库里不存在**（4 个 seed 都没有），`items` 过滤后为空 → 该组整块不渲染；同源问题见 A11（`MOCK_LOCATION`） | `backend/web/js/pages/admin.js:1339` |
| G5 | P1 | `03 §1.5` 分页响应的 `total` 应用于翻页 | 前端**没有任何分页 UI**，`PageResult.total` 被丢弃；与 A5（`size=200` 被后端夹到 100）叠加 → 数据被截断且用户完全无感知 | `backend/web/js/`（无分页组件）；`api.js:122-146` |
| G6 | P1 | `04 §3.3`：按 role 渲染、教师端有班级范围切换 | 教师端**没有班级范围下拉**；管理员登录后反而渲染了一个空的 `classes: []` | `backend/web/js/app.js`（菜单处无范围控件）；`api.js:157-162` |
| G7 | P2 | `04 §3.3`：待审批「左列表 / 右详情，**键盘可切**」 | 键盘切换未实现 | `backend/web/js/pages/pending.js` |
| G8 | P2 | `03 §6.9 / §6.12 / §6.6` 提供了核验列表、逾期列表、续假详情 | 后端已实现，Web 端**未见调用**（按 grep：`/teacher/checkin-logs` 列表、`/teacher/applications/overdue`、`/teacher/extensions/{id}`、`/teacher/students/{id}`）；逾期靠 records 页前端 `effective === 'OVERDUE'` 筛 | `backend/web/js/`；接口在 `TeacherController.java:158,92,136,195` |
| G9 | P2 | `04 §3.3`：token 存 `localStorage` | 用 `sessionStorage` → 关掉标签页即掉登录，与文档不符（安全性其实更好，但需回写文档） | `backend/web/js/api.js`（`cl_console_token`） |
| G10 | **P1（安全）** | 没有任何文档允许免密登录 | 深链 `?demo=admin` / `?demo=1` 会用**硬编码明文口令 `123456`** 自动登录教师/管理员，任何人拼参数即得管理员令牌。演示便利可以留，但必须写进文档并在交付前关掉 | `backend/web/js/pages/login.js`（demo 分支） |
| G11 | P2 | `04` D-05：演示账号来自 `V1.1__seed_demo.sql` | 登录页把学号前缀（如 `2023`）硬编码进校验，与 seed 强耦合，换一届学生就登不进 | `backend/web/js/pages/login.js` |
| G12 | P2 | `01 §4.1` 逾期用 `>=` | （**与 A1 同一缺陷的前端侧，不重复计数**）`Date.now() > end.getTime()`，影响状态标签与工作台「在假/逾期」统计 | `backend/web/js/ui.js:196`；`backend/web/js/app.js:32` |
| G13 | P2 | `03 §5.4`：`actions` 是按钮依据 | 后端两端各产一套互不相同的 `actions`（学生端 5 种、教师端 APPROVE/REVIEW），而 `backend/web/` **零消费**该字段（唯一命中是 CSS 类名 `drawer-actions`） | `TeacherQueryService.java:299-302`；`backend/web/js/` |
| G14 | P2 | `04 §3.3`：统一 token、禁散装样式 | 页面里大量散装绿值（`#3f6b4f` / `#4a7c59` / `#dbe7d2`…）绕过变量；`tokens.css` 的 `--blue-*` 变量名承载绿色；`.stat-card.is-lead` 的大数字被画成绿块（视觉错位） | `backend/web/css/*.css`；`js/pages/admin.js` |
| G15 | P2 | — | 死代码：`ui.js` 的部分导出、`motion-preview.html` 对生产资源的重复引用、未使用的 `--d-sidebar-mini` 等 | `backend/web/js/ui.js`、`css/tokens.css` |
| G16 | P2 | `README.md` 描述仓库结构与启动方式 | 与现状不符（目录已迁移、脚本大量增删、探针数量变化），按 README 走会走不通 | `README.md` |

## H 类 · 配置、脚本与 README（12 项）

| # | 严重度 | 文档/预期 | 实际 | 位置 |
|---|---|---|---|---|
| H1 | **P0** | `README.md`「快速开始 3 步」：克隆 → 双击 `start-backend.cmd`（或 mvn）→ 打开后台 | **照文档走必然启动失败**：① 真实 `application-dev.yml` 被 gitignore，新克隆没有；② 复制 example 后 `secret` 为空串；③ `JwtUtil.validateSecret` 对空/占位/过短三种情况**直接抛异常中止启动**。而 README「不满足前置条件会看到」清单只列了 DB 超时/mvn 缺失/端口占用，**没有提密钥**；`start-backend.cmd` 也不注入 `CAMPUS_JWT_SECRET` | `README.md:24-41,57-61`；`start-backend.cmd:17`；`security/JwtUtil.java:79-83` |
| H2 | P1 | `AGENTS §10`：探针改接口/字段后必跑 | 两个探针用 `pageSize=`（后端参数名是 `size`），Spring 静默忽略 → 实际按默认 20 条返回。**待审批/核验队列超过 20 条时探针会「假红」**（断言目标在 21 条之后）。`e2e_deep.py` 的逾期用例同样受影响 | `scripts/e2e_probe.py:64`；`scripts/e2e_deep.py:120,181,202-219`；`TeacherController.java:83` |
| H3 | P1 | `AGENTS §11`：JWT 密钥改为环境变量 `CAMPUS_JWT_SECRET` 注入（已修复） | 本地 `application-dev.yml:14` 仍是**明文密钥**占位串，`start-backend.cmd` 不设置环境变量 → 本地运行时「加固」实际被绕过。敏感值未入库（这点合规），但环境注入机制只写在文档里 | `backend/src/main/resources/application-dev.yml:14`；`start-backend.cmd` 全文 |
| H4 | P1 | `03 §1.1`：时间格式统一 `yyyy-MM-dd HH:mm:ss` | 教师端/管理端 DTO 统一用 `yyyy-MM-dd HH:mm`（**无秒**），学生端用带秒格式 → 同一条申请在两个端显示不同精度；前端"同秒排序"补丁也因此只在学生端有效 | `TeacherQueryService.java:37-38`；`AdminService.java:47-48`；`StudentQueryService.java:45` |
| H5 | P1 | `AGENTS §4`：「API 探测必须带 `--noproxy '*'`（本机代理会 502）」 | `e2e_probe.py` / `e2e_deep.py` / `web_probe.py` 三个主探针**都没有禁用代理**；只有 `db_exec.py` 有 `NO_PROXY='*'`。代理开着时探针会报"后端未启动" | `scripts/e2e_probe.py`、`e2e_deep.py`、`web_probe.py`（urllib 初始化处） |
| H6 | P2 | `01 §36`：同一天重算用 `ON DUPLICATE KEY UPDATE` **更新文案**，仍只保留一条 | 实现是 `insert` + 捕获 `DuplicateKeyException` 静默忽略 → 文案**永不更新**（例如逾期时长停在第一次生成时的值） | `common/NotificationService.java:60-73` |
| H7 | P2 | `.gitignore` 应覆盖临时目录 | `.tmp_probe/`（含 ~13KB 探针产物）未被忽略，`git add -A` 会把它提交；当前工作区已出现该未跟踪目录 | `.gitignore`；`git status` |
| H8 | P2 | 微信官方约定：`project.private.config.json` 属个人配置，不进版本库 | 该文件被 git 跟踪 | `project.private.config.json` |
| H9 | P2 | 脚本应可直接运行 | `test-teacher-api.js` / `test-teacher-approve.js` 硬编码 `localhost:8081`（实际 8080），无文档提及 → 任何人跑都连不上 | 两个脚本的 BASE 常量 |
| H10 | P2 | 探针跑完应能恢复演示数据 | `e2e_deep.py` cleanup 对 `ON_CAMPUS` 申请也发 GPS 销假 → 恒定 42201，脏数据逐次累积；需靠 `reseed_demo.py` 兜底 | `scripts/e2e_deep.py` cleanup 段 |
| H11 | P2 | `README.md` 描述仓库现状 | 多处过时：① 接口数量写 20/16/14（实际 16/17/16）；② 小程序 utils 列了不存在的 `api.js`；③ 重建命令 `cp -r backend/web backend/target/classes/static/admin` 会生成 `static/admin/web/`（页面 404），正确目标是 `backend/web/.`；④ 写「10MB」实际 1MB（见 B6）；⑤ MySQL 版本表述与 schema 要求不一致 | `README.md` 全文 |
| H12 | P2 | 脚本目录应无重复职责 | 重复/失控：`verify-miniapp.js` 与 `ui_probe.js` 都在猜模块；ext-review 有 `.py` 与 `.js` 两份实现；`prep_*.py` 指向 `D:/AI/...` 等不存在路径；`upgrade-font-scale.js` / `fix_config_type.py` / `measure-page.js` 为一次性脚本；5 份文件各自内联同一套 CDP 客户端 | `scripts/` 全目录 |

---

## 修复优先级建议

### 第 1 批 · 7 个 P0（答辩前必须修）

| P0 | 问题 | 一句话修法 |
|---|---|---|
| **A2** | `close_reason` 写了 CHECK 外的枚举，命中即 500 | 改成 `MANUAL_REVIEW_COMPLETED` |
| **A1**（含 G12） | 逾期边界用 `>`，到期那一刻全系统仍显示「请假中」 | 后端改 `!now.isBefore(endTime)`，前端同步 |
| **A3** | 逾期学生没有续假入口（后端明确允许） | `actions` 的 OVERDUE 分支补 `EXTENSION` |
| **A5** | `size=200` 被后端夹到 100，数据静默截断且无分页 | 前端改 100 并补分页，或按需放宽上限 |
| **F1** | `.rule` 同名类把「请假须知」压成 1rpx，文字重叠 | 页面类改名（如 `.rule-row`），只留全局的细分隔线 |
| **G1** | 改派辅导员传 `user.id`，后端按 `teacher_profile.id` 查 → 静默绑错人 | 前端传 `teacher_profile.id`；或后端接收 user.id 并转换，二者选一 |
| **H1** | 新克隆按 README 走必然启动失败（缺 `CAMPUS_JWT_SECRET`） | README 增一步密钥说明；`start-backend.cmd` 检测并提示 |

### 第 2 批 · 契约与体验硬伤（约 12 项）

F3 登录页输错密码被 reLaunch 清空输入；G3 材料 PDF 预览被主动禁用（后台唯一差异化能力）；G2 工作台「当前逾期」恒 0；G4 规则页两项配置不存在导致整组空白；A4「进行中」把待开始也算进来；A6/A7 GPS 失败记录关闭方式；A10 `/auth/me` 缺 `studentProfile`；B1 没有改密码接口；B2 没有续假详情接口；B6 上传实际限 1MB；H2 探针 `pageSize` 假红；H3 本地未真正走环境变量密钥。

### 第 3 批 · 结构性问题（排期做，别在答辩前动）

B3 幂等键、B12 提交加锁、B13 列表 DB 分页、G5 分页 UI、E1–E5 性能、B8 消息分页、B9 详情 `overdue`。

### 第 4 批 · 只改文档（C 13 + D 12）

先裁决三处根矛盾 —— **C8**（条件更新还是行锁）、**C3**（去重键格式）、**C4**（GPS 失败记录怎么关闭），再统一回写 01/02/03；`04 §3` 的工程结构建议整节按实际重写，不要逐句打补丁。

---

## 附：本次核对确认「一致」的部分

避免误伤，以下逐条比对后**未发现问题**：

- 错误码表（`ErrorCode` 与 `03 §1.4` 17 个码逐一对应，含 HTTP 状态）
- 字典枚举（`DictService` 7 组枚举与 `03 §3.4` 完全一致）
- 时间重叠判定（`start < other.end && end > other.start` 与 `01 §27` 一致，允许首尾相接）
- 状态机主流程（提交/撤回/取消/续假/审批/核销的条件与前置，与 `01 §6-§24`、`§42` 一致）
- 数据库表结构（12 张表、列名、类型、外键、索引基本与 `02` 一致，差异仅在 C5/C6/D11/D12 与索引命名）
- 实体字段（12 个实体与 schema 列名逐一对应，无多余/缺失字段，除 D11/D12）
- 教师数据范围链路（`user → teacher_profile → teacher_class → class → student`，与 `02 §8`、`03 §6` 一致）
- 锁顺序（application → extension → log → notification，代码调用顺序与 `02 §20/§21` 一致）
- 班级软删与「有学生不得停用」（`03 §7.2` 40901，代码一致）
- 一个班级一个辅导员（`teacher_class.class_id` UNIQUE + 重复绑定 40901，一致）
- 文件上传白名单与 UUID 重命名、按 `yyyy/MM` 分目录（与 `02`/`03` 一致）
- 小程序 4 tab 结构与页面路径（与 `04 §3.2` 的 P0/P1 划分一致）
- Web 后台同域托管、hash 路由、主从布局（`03 §6`/`04 §3.3` 的核心约定一致）
- `index.html` 引用的 18 个 css/js 全部存在，无 404

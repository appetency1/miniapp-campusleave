# 变更记录 · 2026-11-18

> 本轮做了什么：按 `docs/00_仓库现状与取舍.md` 的裁决表执行 ——
> **该改文档的改文档（12 条）、该改代码的改代码（10 项）、过时与无关内容归档**。
> 验证方式：编译 + 三套探针 + 4 项针对性验证，全部通过。

---

# 一、文档迭代（01/02/03/04 + AGENTS + README + NOTES）

每份文档头部都加了**修订记录**表，写明改了什么、为什么。这样论文/答辩能解释版本演进，不会被问"为什么文档和系统不一样"。

## 1.1 `03_API接口_V1.0.md`

| 位置 | 改了什么 | 为什么 |
|---|---|---|
| 头部 | 新增「0. 修订记录」 | 留痕 |
| §1.5 | `size` 默认 10→**20**、上限 50→**100**；说明 `sort` 未实现 | 与 `PageQuery` 实现一致；`sort` 从来没做过，留着会让人传了没用 |
| §4 上传 | 去掉 `fileId`；`bizType` 标注"仅回显"；补 10MB 依赖 multipart 配置 | 实现就没有 fileId，材料是提交申请时随 `materials[]` 入库；头像（AVATAR）没有前端入口，服务端不分支 |
| §5.2 校验 | `destination` 从"建议填写（非强制）"改为**离校必填 ≥2 字符**；`contactPhone` 补手机号正则；去掉未实现的幂等键步骤 | 实现就是强制的（辅导员要知道人去哪、出事能联系） |
| §5.4 详情 | 主键 `id` → **`applicationId`** | 与 §5.3 列表一致；原来的 `id` 与列表打架 |
| §5.12 消息 | 去掉 `page/size` | 实现不分页；一人几十条一次拉完更快 |
| §6.1 工作台 | 补 `overdueCount`、`pendingExtensionCount`、`recentProcessed`、`todayStats`；说明 `abnormalCount` = 待核验（不含逾期） | 后台工作台右侧栏要用，原稿没规划 |
| §6.3 教师详情 | 从"字段同学生详情"改为**列一张对照表**（`id`/`effective`/`no`/`scene`/`type`…） | 实现是服务端直接给中文标签，与小程序"客户端映射"是两种合理设计，不该强行统一 |
| §7.6 / §7.7 | 新增管理端「概览」「全校申请列表」两个接口 | 代码有、文档没有，`web_probe` 与前端都依赖 |
| §3.3 | 改密码补全：权限、错误码、**6 位下限**、管理员重置走另一接口 | 原来只有一句"新密码 ≥8 位"，而 8 位与演示基线 `123456` 冲突 |

## 1.2 `02_数据库设计_V1.1.md`

| 位置 | 改了什么 | 为什么 |
|---|---|---|
| 头部 | 新增修订记录 | 留痕 |
| §9.3 | 删掉 `OFF_CAMPUS ⇒ destination IS NOT NULL` 这条 CHECK 声明，改为"由 Service 层把守 ≥2 字符" | schema 里从来没有这条约束；MySQL 表达不了"仅离校时必填 + 长度"这种组合，硬塞反而难维护 |
| §9.5 / §17.6 | 索引名与 schema 对齐（`idx_leave_created`），补 `idx_leave_status_created` | 原稿的 `idx_leave_student_created` 实际不存在；管理端列表缺索引会 filesort |
| §17.7 | `idx_extension_application` → `idx_extension_application_status` | 查询是 `application_id=? AND status='PENDING'`，带 status 可以只走索引 |
| §10.4 | `application_id` 外键标注"未落成"，说明 MySQL 9.x 报 1215 的原因与风险评估 | 不写清楚，以后有人会以为是漏了 |
| §12.3 | GPS 记录的 `review_status` 允许 `VOID`（被取代时） | 原稿写"只能是 NONE"，但学生重新定位成功后，那条失败记录不关掉会永远挂在"未处理" |
| §14.3 | 唯一键 `(dedup_key)` → **`(receiver_id, dedup_key)`** | 文档 §14.2 正文本来就是复合键，§14.3 写错了 |
| §29 | 配置表改成实际的 5 项，删 `NOTIFICATION_DEDUP_HOURS`，补 `MOCK_LOCATION` | 前者已废弃（改用 dedup_key 唯一键）；后者缺失会导致模拟定位永远打不开 |
| §32 | 冻结结论里删掉 destination 那条"数据库保护"，改成"由 Service 保证"清单 | 与 §9.3 一致 |

## 1.3 `01_业务规则_V1.2.md`

| 位置 | 改了什么 | 为什么 |
|---|---|---|
| §19 | `withdrawn_by = SYSTEM` → **写 NULL**，靠 `withdraw_reason` 标识 | "SYSTEM" 是魔法值：要么在 user 表造系统账号，要么在 BIGINT 列存字符串 |
| §36 | 去重键拆成两类：一次性事件用 `APP_{id}_{TYPE}`（不带日期）、提醒类用 `APP_{id}_{TYPE}_{日期}`；冲突时**刷新文案** | 原稿全类型带日期 → 同一条申请隔天会再发一条"已通过"；且提醒文案里的"已逾期 X 小时"会停在上次的值 |
| §40 | 字段清单删 `deleted`，`cancelled_by`/`approved_by` → `*_user_id` | 这张表停在 V1.1 之前，02 的修订没回写 |
| §32.1 | **不改口径**，加注记：学生端按 `created_at` + 本学期、教师/管理端按 `created_at`，与本节 `start_time` 的差异 | 改口径会让演示数据和论文数字全变，需要连论文一起调；先如实记录，答辩按实际回答 |

## 1.4 `04_开发方案_V1.0.md`

| 位置 | 改了什么 |
|---|---|
| §3.1 | **整节重写**：实际是 7 个 Controller（不是 17 个）、按端分 Command/Query（不是 8 个细碎 Service）、只有 `UserRole` 一个枚举、`CurrentUser.requireRole()` 方法（不是 `@RequireRole` 注解）、零 XML。附一张"初稿 vs 实际"对照表说明每处为什么改 |
| §3.2 | 小程序结构改成实际：1 个组件（只有 ruler）、5 个 utils（request/auth/format/config/server）、tabBar 带图标。附对照表 |
| §3.3 | Web 后台改成实际：`backend/web/`（不是 `admin/`）、7 个页面 JS、侧栏 208/最大宽 1440/圆角 8、独立绿意 tokens（不是搬 formal-v2 蓝）、教师 4 组 5 项 / 管理员 4 组 10 项。附对照表 |
| §4 表 | 管理端"9 页"→ 10 项；M5 状态更新 |
| 当前进度 | 改为 2026-11-18：补记 11-11 的两条 P0 修复、本轮三份审计报告与本变更 |

## 1.5 `AGENTS.md` / `README.md` / `formal-v2/NOTES.md`

- **AGENTS §3**：`config/` 列出实际 6 个类（没有 JacksonConfig/CORS）；`security/` 去掉不存在的 `@RequireRole`；`storage/` 补 `FileUrlSigner`/`FileAccessFilter`。
- **README**：
  - **补上「首次启动必须先设 `CAMPUS_JWT_SECRET`」**（这是原文最严重的坑：照 README 走必然启动失败）；
  - 重建命令改成 `cp -r backend/web/. ...`（原命令会复制成 `static/admin/web/`，页面 404）；
  - 补数据库四步执行顺序 + `seed_bulk` 的注意事项；
  - 接口数 20/16/14 → 16/17/16；utils 去掉不存在的 `api.js`；10MB 补"依赖 multipart 配置"。
- **NOTES.md**：标题"六屏"→"七屏"（表格本来就 7 行）；补一句"配色落地时已改为暖白+橄榄绿，以 app.wxss 为准"。

---

# 二、代码修改（10 项）

| # | 改了什么 | 文件 | 为什么 | 验证 |
|---|---|---|---|---|
| 1 | 逾期判定 `now > end` → **`now >= end`** | `EffectiveStatus.java:75` | 01 §4.1 明确要求 `>=` 且"不允许两种写法并存"；原实现到期那一刻还显示"请假中" | 探针 31 项状态断言全过 |
| 2 | 前端同口径：`Date.now() > end` → **`>=`** | `web/js/ui.js:196`、`web/js/app.js:32` | 后端改了前端不改，同一时刻两端结论会不一致 | 同上 |
| 3 | `close_reason` 非法值 → `MANUAL_REVIEW_COMPLETED` | `TeacherCommandService.java:279` | 原值 `SUPERSEDED_BY_MANUAL_REVIEW` **不在 schema 的 CHECK 白名单里**，一旦命中就是 SQL 约束违反 → 500 | 编译通过；核验链路探针通过 |
| 4 | `actions` 的 OVERDUE 分支补 **EXTENSION**；`MANUAL_REVIEW` 改为按"有 GPS 失败且无待审核验"判断 | `StudentQueryService.java:613-643` | 01 §21 允许逾期续假，但前端拿不到按钮；反过来，没有失败记录时不该给核验按钮（点了才报 42203 很蠢） | 实测逾期申请 `actions=['CHECKIN','EXTENSION']` |
| 5 | 详情补 `overdue` 布尔 | `StudentQueryService.java:547` | 03 §5.4 要这个字段，首页有、详情没有 | 实测 `overdue=true` |
| 6 | 教师列表 `status=ACTIVE` 补 `start_time <= now` | `TeacherQueryService.java:203` | 原来把"待开始"也算进"进行中"，教师会误判在校人数 | 编译通过；`web_probe` 18 项通过 |
| 7 | `/auth/me` 补 `studentProfile`（学号/班级/辅导员） | `AuthService.java` + 4 个 Mapper | 03 §3.2 明确要求；「我的」页为拿班级要多发一次请求 | 实测返回 `{studentNo, classId, className, counselorName}` |
| 8 | **新增 `PUT /auth/password`**（改自己的密码） | `AuthController.java`、`AuthService.changePassword`、`ChangePasswordRequest.java` | 全系统原来没有"用户自己改密码"的路径，只能找管理员 | 实测：错原密码 40104、改成功 0、改回 0 |
| 9 | 提交申请加 **`SELECT ... FOR UPDATE`** 锁学生行 | `StudentCommandService.java:115-122` | 只做 `selectCount` 的话，两个并发提交会同时看到 0 条、各自插入成功，产生两条重叠申请（唯一键拦不住，因为单号不同） | 探针提交/重叠拦截通过 |
| 10 | 通知去重键拆两类 + 冲突时刷新文案 | `NotificationService.java:60-95` | 与 01 §36 新规则一致；解决"同一条申请隔天再发一条已通过"和"逾期时长文案不更新" | 审批/续假/销假通知断言通过 |
| 11 | `application.yml` 补 **multipart 10MB** | `application.yml:4-11` | 不配就是 Spring 默认 1MB，超过直接 500，业务层的 10MB 判断永远走不到 | 服务正常启动 |
| 12 | seed 补 `MOCK_LOCATION` | `sql/V1.0__seed.sql:17` | 缺这条 → `DictService` 恒返回 false → 销假页「模拟位置」下拉永不出现；而改配置接口对不存在的 key 返回 404，后台也补不了 | 已补；改配置接口现有 5 项 |
| 13 | 非图片材料**放行预览**（去掉 `preventDefault`） | `web/js/pages/detail.js:92-113` | 04 §3.3 说"PDF 用 iframe/新窗口，这是后台相比小程序的价值"，代码却把链接拦成"演示环境无附件" | 手动点 PDF 链接会新标签打开 |
| 14 | 前端 `size=200` → **100** | `web/js/api.js` 5 处 | 后端上限就是 100，传 200 会静默截断，且页面无分页，用户不知道少了 | 后台探针 18 项通过 |
| 15 | 探针参数 `pageSize=` → **`size=`** | `e2e_probe.py`、`e2e_deep.py` 7 处 | 后端参数名是 `size`，`pageSize` 被 Spring 静默忽略 → 实际只回 20 条，队列超过 20 时探针会"假红" | 探针通过率 100% |

**关于密码策略（一个未采纳的改动）**：我原本按 03 §3.3 把下限提到 8 位（`ChangePasswordRequest`/`AuthService`/`AdminService` 三处），实测发现**演示基线全部是 6 位 `123456`**，8 位会导致"管理员想重置回 123456 被拒"，演示直接走不通。已回退为 **6 位**，并在 03 与 `ChangePasswordRequest` 注释里写明"生产环境应收紧到 8 位 + 加登录限流"。这是本轮唯一的"想改又撤回"，理由记在这里备查。

---

# 三、归档整理

| 原位置 | 新位置 | 处理 | 说明 |
|---|---|---|---|
| `design/home-v3.html` | `archive/obsolete-docs/design-home-v3.html` | `git mv` | 首页 V3 过程稿，已被 `miniprogram/pages/student/home/` 实现取代 |
| `design/login-variants.html` | `archive/obsolete-docs/design-login-variants.html` | `git mv` | 登录页备选方案，多数未采用 |
| `archive/docs-early/`（4 份） | `archive/obsolete-docs/docs-early/` | `git mv` | 早期总纲 / 学生端 V1.0 / 教师端 V1.0 / 首页脑暴 |
| `archive/校园请假管理系统——业务流程与状态机设计 V1.1.md` | `archive/obsolete-docs/业务流程与状态机_V1.1_已被01取代.md` | `git mv` + 改名 | 文件名直接标出"已被 01 取代" |
| `dsh-experts/`（10 文件 245K） | `_trash/dsh-experts/` | 移出 + `git rm --cached` + ignore | **与本毕设无关**：把 WorkBuddy 专家机制移植到 DS Bot 的手册与脚本 |
| `.tmp_probe/` | `_trash/tmp_probe/` | 移出 + ignore | 探针临时产物与本轮验证脚本 |
| `.gitignore` | 追加 `_trash/`、`.tmp_probe/` | 编辑 | 防止回收站与临时目录被 `git add -A` 带进仓库 |

新建 `archive/obsolete-docs/README.md`：逐份说明"是什么 / 被谁取代 / 答辩后可删还是建议留"。

**没有动的**：`formal-v2/`（视觉定稿基线，论文要用）、`reviews/`（历次审计结论，仍有参考价值）、`docs/`（工具备忘 + 现状清单）、`sql/`、`scripts/`、`outputs/`（已 ignore，15M 截图可随时删）。

---

# 四、验证结果

| 项 | 结果 |
|---|---|
| `mvn -o -DskipTests compile` | ✅ 通过 |
| `scripts/e2e_probe.py` | ✅ **20 / 20** |
| `scripts/e2e_deep.py` | ✅ **28 / 28** |
| `scripts/web_probe.py` | ✅ **18 / 18** |
| `/auth/me` 的 `studentProfile` | ✅ 返回学号/班级/辅导员 |
| 改密码往返（123456→abc123→123456） | ✅ 三次均 code=0，最终能登录 |
| 逾期申请 `actions` | ✅ `['CHECKIN','EXTENSION']`，`overdue=true` |
| 演示数据恢复 | ✅ `reseed_demo.py` 执行，128 条申请恢复原分布 |
| 服务启动 | ✅ 6 秒就绪，`/common/dictionaries` 200 |

> 探针会改脏数据；本轮跑完已执行 `reseed_demo.py` 复位。答辩前如再跑探针，记得再 reseed 一次。

---

# 五、需要你决定的事

## 5.1 建议删除（看完告诉我删不删）

| 路径 | 大小 | 是什么 | 我的建议 |
|---|---|---|---|
| `_trash/dsh-experts/` | 245K | DS Bot 专家库，与毕设无关 | **删**（或移出项目目录到 `D:/AI/`） |
| `_trash/tmp_probe/` | ~40K | 探针临时文件 + 本轮验证脚本 | **删** |
| `outputs/` | 15M / 182 文件 | 截图、逐帧验证图、论文素材草稿 | **删大部分**，答辩用的 3-5 张另存 |
| `archive/obsolete-docs/` | 140K | 7 份过时文档 | **留到答辩后**再删（论文可引） |

## 5.2 我没动、需要你拍板的三件事

1. **统计口径**（01 §32.1）：文档说按 `start_time`，代码按 `created_at` + 学生端限本学期。改口径会让演示数字和论文全部变一遍，我没动代码，只在文档里如实标注。**要统一吗？**
2. **列表真分页**：我只把前端 `size=200` 改成 100（后端上限），没有加分页 UI。要做得花半天（后端已经支持 `total`）。
3. **幂等键 / 40102 区分**：后端都没实现，文档已如实说明。毕设可以不做，但答辩问"重复提交怎么防"要答"靠时间重叠校验（40903）"。

## 5.3 下一轮建议做的

- `scripts/regress.py` 一键跑三套探针 + 自动 reseed（1 小时）
- 5 个单元测试（逾期边界、重叠判定、续假守卫、dedup 键、班级停用守卫）（半天）
- `07_测试用例.md` + `09_答辩演示脚本.md`（1 天）

---

# 六、回滚方式

本轮改动都在 git 里，按需回滚：

```bash
git log --oneline -5                         # 找到本轮提交
git revert <commit>                          # 整体回滚
git checkout <commit>~1 -- 03_API接口_V1.0.md # 只回滚单个文件
```

归档移动都是 `git mv`（历史保留），`_trash/` 只是物理移动 + 取消跟踪，随时可以 `mv` 回来。

# CampusLeave 项目规则（AGENTS.md）

> 本文件是本仓库的协作约定。任何 AI（含 DSH Bot 团队）在本项目内动手前先读这里，再读权威文档。
> 毕业设计 · 单人开发 + AI 协作 · 2026-10

---

## 1. 项目是什么

基于**微信小程序**的校园请假管理系统：学生小程序（申请 / 销假 / 续假 / 消息）+ 教师 Web 后台（审批 / 核验 / 记录）+ 管理 Web 后台（账号 / 班级 / 绑定 / 配置 / 统计）。

**技术栈（不要换）**

| 层 | 选型 |
|---|---|
| 学生端 | 微信小程序原生 WXML/WXSS/JS，glass-easel + `style: v2`，**不引** uni-app / Taro |
| 后端 | Java 17 · Spring Boot 3.2.x · MyBatis-Plus 3.5.7 · Maven |
| 数据库 | MySQL 8.0.16+（用到 CHECK 与生成列），`utf8mb4`，`Asia/Shanghai` |
| 鉴权 | JWT（jjwt 0.12.x）+ BCrypt，REST，前缀 `/api/v1` |
| 后台前端 | 单页 HTML + 原生 JS，零依赖零构建，Spring Boot 静态托管 |
| 不引 | Redis / MQ / 工作流引擎 / 微服务 / OSS / Vite / 前端框架 |

## 2. 文档权威顺序

冲突时按此裁决，**改规则必须三处同步**（业务 → 数据库/接口 → 代码/测试）：

1. `01_业务规则_V1.2.md` — 业务规则冻结稿（2266 行，业务权威）
2. `02_数据库设计_V1.1.md` — 表结构、字段、索引、字典
3. `03_API接口_V1.0.md` — 接口契约（路径、入参、出参、错误码）
4. `04_开发方案_V1.0.md` — 开发方案 + **进度唯一实时视图**（里程碑表 / 当前进度 / 下一步）
5. `reviews/` — 评审与审计报告；`formal-v2/` — 学生端视觉定稿（`NOTES.md` 记设计约定）

**契约已冻结**：不得擅自改路径、字段名、状态枚举、错误码；确需变更先说明理由并同步上述文档，等用户确认。

## 3. 目录职责

```text
backend/src/main/java/com/campusleave/
  common/    Result / PageResult / ErrorCode / BizException / GlobalExceptionHandler / TraceIdFilter
  config/    WebMvcConfig（静态映射 + CORS）/ MybatisPlusConfig / JacksonConfig
  security/  JwtUtil / JwtAuthFilter / LoginUser / CurrentUser / @RequireRole
  auth/ student/ teacher/ admin/     按端分包的 Controller + Service
  domain/    entity(12) / enums(UserRole) / mapper
             业务状态用 String 常量（无 Status 枚举类）
  service/   CommonController（字典接口）· DictService
             NotificationService 在 common/，其余业务服务在各自按端包内
  storage/   FileController · FileStorageService（本地 uploads/，路径 /yyyy/MM/uuid.ext）
backend/web/        教师 + 管理端静态资源（css/js/pages），构建时复制到 static/admin/
miniprogram/        小程序源码（pages/ components/ utils/ custom-tab-bar/）
sql/                V1.0__schema.sql · V1.0__seed.sql · V1.1__seed_demo.sql …
scripts/            探针与造数（e2e_probe.py / e2e_deep.py / web_probe.py / reseed_demo.py / seed_bulk.py）
formal-v2/          学生端定稿原型（7 屏 + 首页五态，单文件，视觉基线）
design/ docs/ outputs/ reviews/ archive/
```

**分层纪律**：Controller 只做参数校验与组装；业务状态判断只在 `service/`；Mapper 不写业务判断。改前端进 `backend/web/` 而不是 `target/classes/`（后者会被构建覆盖）。

## 4. 运行与验证

- **后端**：双击 `start-backend.cmd`（或 `cd backend && mvn -o spring-boot:run`）。控制台出现 `Started CampusLeaveApplication` 即成功。**8080 同时只能一个进程**，报端口占用先关旧窗口，别开第二个。
- **Web 后台**：<http://localhost:8080/admin/>（与 API 同域，免 CORS）。演示账号：教师 `T2023001/123456`、管理员 `admin/123456`（账号以 `V1.1__seed_demo.sql` 为准）。
- **改 `backend/web/` 后必须重建**：`mvn compile`（或 `cp -r backend/web backend/target/classes/static/admin`），否则浏览器拿旧副本。
- **数据库**：按序执行 `sql/V1.0__schema.sql` → `V1.0__seed.sql` → `V1.1__seed_demo.sql`；`application-dev.yml` 连接信息改本机（该文件被 `.gitignore` 排除，**绝不入库**）。
- **小程序**：微信开发者工具打开项目根目录；`miniprogram/utils/config.js` 的 IP 改局域网地址，真机调试；不勾「不校验合法域名」就连不上本地后端。
- **API 探测必须带 `--noproxy '*'`**（本机代理会 502）。

## 5. 后端硬约定（评审反复强调）

- 统一响应 `Result<T>{code,message,data,traceId}`，`code=0` 成功；异常统一走 `BizException(ErrorCode)` + `GlobalExceptionHandler`，业务码与 HTTP 状态同时设置。
- `effective_status`（待开始/请假中/待销假/逾期）**只能在 `student/EffectiveStatus.java` 的静态方法 `of(app, now)` 算**（纯函数，时间基准外部传入），Controller / Mapper 不得各自按时间判断。
- 写操作一律 `@Transactional`；审批/销假/续假锁序固定：`leave_application → leave_extension → log → notification`。
- 时间：JVM 与 MySQL 统一 `Asia/Shanghai`；`LocalDateTime` 序列化 `yyyy-MM-dd HH:mm:ss`。
- `leave_extension.pending_app_id` 是生成列 → 实体上 `@TableField(exist = false)`。
- 列表接口分页必须走 DB 分页（`page`/`size` 有上限），**禁止**先 `selectList(null)` 再内存过滤切片。
- 通知去重靠 `dedup_key` + `ON DUPLICATE KEY UPDATE`；日志写 `leave_approval_log`。
- 教师数据范围统一走 `TeacherScopeService`（`teacher/TeacherScopeService.java`，teacher_class → class → student），不散落 SQL。

## 6. 小程序约定

- 请求一律走 `utils/request.js`（Promise 封装 + token 注入 + 401 拦截 + Idempotency-Key），不裸用 `wx.request`。
- 页面结构：4 个 tab（首页 / 申请 / 消息 / 我的）；组件只有 `components/ruler`（刻度尺），其余状态标签 / 时间轴 / 弹层 / 空态均为各页内联类实现，不抽公共组件。
- **设计基线（定稿，别改）**：纸感体系 `#FBFAF7` 纸 / `#15202E` 墨 / `#2563C9` 蓝 / `#E7E3D9` 线；中文 Noto Sans SC，数字与编号 Noto Serif SC；圆角 6；页边距 20；主按钮墨色实心，蓝只给状态、刻度尺、tab 选中；记忆点是「把请假区间画成刻度尺」。
  **落地实况（以代码为准）**：`miniprogram/app.wxss:17-36` 实际色板是暖白 `--paper #FAF9F6` + 橄榄绿 `--accent-500 #536B59`，`#2563C9` 仅作 CSS fallback 出现且从未生效；圆角实有三档（`--r`12rpx / `--r-btn`24rpx / `--r-card`28rpx）。写论文时按**实际色板**描述，不要照抄基线四色。
- **禁用清单**（用户明确否决）：蓝色发光 CTA、大圆角、宽字距按钮、白卡+右箭头列表、照片底、自绘铃铛、深色满屏。
- 改完小程序跑一次 `cli preview` 编译校验（`E:\微信web开发者工具\cli.bat preview --project "D:/AI Code/CampusLeave"`）；WXML/WXSS 语法错只有编译能暴露。

## 7. Web 后台约定

- 同域静态托管：`backend/web/` → 运行时 `static/admin/`；访问 `/admin/`。
- hash 路由手写（约 40 行），按 role 渲染菜单（教师 4 组 5 项 / 管理员 4 组 10 项，见 `backend/web/js/app.js:177-233`），不引路由库。
- 主从布局：待审批、核验用「左列表 40% / 右详情 60%」，不跳页。
- 视觉**不**复用 `formal-v2` 的 tokens：`backend/web/css/tokens.css:13` 是 `--paper: #F7F9F4` + 橄榄绿 `--blue-500: #4A7C59`、圆角 8；`formal-v2/index.html:16-19` 是 `#FBFAF7` / `#2563C9` 蓝 / `#E7E3D9`、圆角 6，两者**不同源**，写论文不能说「复用定稿视觉」。组件统一 `components.css`；动效规范见 `backend/web/MOTION.md`，改时长必须同步 JS 兜底定时器（抽屉 620ms / 列表门控 1400ms / toast 2300ms）。
  尺寸实况：`tokens.css:48` `--d-sidebar: 208px`、`:52` `--d-maxw: 1440px`（文档旧稿写的 220/1200 不是实际值）。
- 材料：图片直看，PDF `iframe`/新窗口（小程序做不到，这是后台的价值）。

## 8. 数据库约定

- 迁移脚本只**新增** `sql/V*.sql`，已执行过的脚本不改写；字段命名 snake_case，状态用枚举字符串。
- 演示数据：`V1.1__seed_demo.sql` + `scripts/reseed_demo.py` 是答辩基线；`seed_bulk.py` 只碰学号 `2024` 段 + 班级 `BULK-` 前缀；李同学 `2023001001`、陈同学 `2023001002`、周同学 `2023002001` 是首页五态与探针依赖，**不许动**。
- 物理删除禁用于历史申请（无逻辑删除字段，业务上不允许删）。

## 9. Git 与进度纪律

**动手前先提交（用户明确要求）**：每次小修改 / 迭代**开始前**，先把当前状态 commit 并 push，确保随时可回滚；
改完再提交一次。不允许在未提交的脏工作区上开新改动。

每完成一个小进展（阶段 / 里程碑 / 子任务）：

1. `git add -A && git commit -m "<做了什么>" && git push origin master`
2. 追加当日进度到 `.workbuddy/memory/YYYY-MM-DD.md`（若该目录被忽略，改记 `04` 文档即可）
3. 更新 `04_开发方案_V1.0.md`：勾掉已完成里程碑、改「当前进度」表、「下一步」指向。

- 远端：`origin = https://github.com/appetency1/miniapp-campusleave.git`（public），分支是 **`master`**。推送前确认 `application-dev.yml`、`backend/uploads/`、`backend/target/`、`outputs/` 未被提交。
- 提交说明用中文，写清改了什么、为什么；一次提交只做一件事。

## 10. 测试与回归

- 改后端接口 / 字段后必跑：`scripts/e2e_probe.py`（主链路 20 项）、`scripts/e2e_deep.py`（销假/核验/续假 28 项）、`scripts/web_probe.py`（后台 18 项）；全绿后再跑 `scripts/reseed_demo.py` 恢复演示数据。
- 探针 FAIL 先确认断言（字段名/路径）是否过时，再判代码。已知断言坑：教师详情用 `id`/`effective`，逾期接口 `/teacher/applications/overdue`。
- 交付前自查：`mvn -q -DskipTests package` 通过 + 探针全绿 + 后端日志无异常堆栈。

## 11. 已知待修（先看这里再动手）

| 级别 | 问题 | 位置 |
|---|---|---|
| **P0** | JWT 密钥是仓库公开占位串 `campus-leave-jwt-secret-key-change-me-2026`，可自签 `role=ADMIN` 令牌 | `backend/src/main/resources/application-dev.yml:14` / `application-dev.yml.example:14`（`application.yml:5` 是 `profiles.active: dev`，不含密钥） |
| **P0** | `/files/**` 匿名可读，无 token 可拿到诊断证明 | `StaticResourceConfig.java:22` |
| P1 | `JwtAuthFilter` 只验签不查库，停用账号旧令牌仍有效 | `JwtAuthFilter.java:37-49` |
| P1 | 登录零限流 + 默认口令 `123456` | `AuthController.java:18` / `AdminService.java:122` |
| P1 | 上传实际上限 1MB（文档写 10MB），超限 500 | 缺 `spring.servlet.multipart.max-file-size` |
| P1 | 管理端假分页（内存全量切片）+ `api.js` 写死 `size=200` | `AdminService.java:663-687` / `backend/web/js/api.js` |

详情与实测命令：`reviews/security-perf-audit-2026-10-23.md`。

## 12. AI 协作规则

- **先读后写**：先读 `01/02/03` 的相关章节与现有实现，再动手；不确定就查代码或问用户，不猜。
- 不编造：不虚构接口、字段、测试结果、性能数据；引用必须能在仓库里指到文件与行。
- 小步交付：每次只解决一件事，改完自测（编译 + 探针 + 手动走一遍），报告「改了什么文件 / 怎么验证 / 还剩什么风险」。
- 不擅自动契约、不擅自加依赖、不擅自改视觉基线。
- 论文相关：代码改动要能对应到论文的模块图 / 表设计 / 接口清单；新增功能同时考虑能否写成论文素材。
- 用户是学生，术语要能听懂：汇报先说结论，再说细节。
- **汇报精简（用户明确要求）**：默认 3-5 行、短句、先结论，一眼看出「要干什么 / 结果是什么 / 下一步」；
  不复述已知背景、不铺陈过程。需要细节再展开，或用列表/表格压缩。
- **先授权后动手（用户明确要求）**：任何会改动仓库的动作（改文件、建/删、commit/push、启停服务、跑造数或 reseed）
  执行前先把「要做什么 / 动哪些文件 / 怎么验证 / 风险」报给用户，得到明确同意再开工。
  只读操作（读文档、读代码、查状态、只读命令）不需要授权。用户说「停」即立刻停止并回报已产生的副作用。
- **文献必须核实（Research 负责）**：任何参考文献在写入论文前，必须由 Research 联网检索到真实原文页并留证据
  （标题 / 全部作者 / 期刊或会议 / 年份 / 卷期页码 / DOI 或 URL），按 GB/T 7714-2015 给格式，并注明支撑论文哪一部分。
  查不到就标「未核实，不得引用」。**禁止编造文献**，也不许把相似标题改写后凑数。
- 学校论文格式要求未到之前，Thesis 只做准备（大纲、图表清单、素材收集），不写正文成稿。

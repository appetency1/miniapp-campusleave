# CampusLeave · 校园请假管理系统

微信小程序 + Spring Boot + MySQL 的毕业设计项目。单人开发，AI 协作。

---

## 现在到哪一步了

| 阶段 | 状态 |
|---|---|
| 业务规则 / 数据库 / 接口契约 | **已冻结**（01 / 02 / 03） |
| 学生端 UI 定稿 | **已完成**（`formal-v2/`，7 屏 + 首页五态，可点击） |
| 学生端小程序 | **M2 + M3 完成**（`miniprogram/`，申请 → 审批 → 销假闭环） |
| 后端 | **M1 / M3 / M4 / M5-1 完成**（学生 20 + 教师 16 + 管理 14 个接口） |
| 教师端（Web 后台） | **M4 完成**（`backend/web/`） |
| 管理端（Web 后台） | 后端已完成，**前端 4 页待做**（M5） |

详细的里程碑与实测记录见 `04_开发方案_V1.0.md` §4。

---

## 目录

> 两个 Web 端（教师端 + 管理端）的前端源码都在 **`backend/web/`**，
> 它们是同一套壳，登录后按角色渲染不同菜单。说明见 `backend/web/README.md`。

```
CampusLeave/
├─ README.md                      本文件
│
├─ 01_业务规则_V1.2.md             业务规则冻结稿（2266 行，唯一权威）
├─ 02_数据库设计_V1.1.md           表结构、索引、约束
├─ 03_API接口_V1.0.md             前后端接口契约
├─ 04_开发方案_V1.0.md             ★ 开发方案 + 里程碑进度（唯一实时视图）
│
├─ backend/                       ★ Spring Boot 后端
│  ├─ web/                        ★★ Web 端前端源码（教师端 + 管理端，原生三剑客）
│  │  ├─ README.md                结构、路由、调试方式
│  │  ├─ index.html               唯一入口
│  │  ├─ css/                     tokens / layout / components
│  │  └─ js/                      api / router / ui / app + pages/*
│  ├─ src/main/java/com/campusleave/
│  │  ├─ auth/                    登录 + JWT
│  │  ├─ student/                 学生端（查询 + 写操作 + 有效状态计算）
│  │  ├─ teacher/                 教师端（M4，16 个端点）
│  │  ├─ admin/                   管理端（M5，14 个端点）
│  │  ├─ domain/                  实体 / Mapper / 枚举
│  │  ├─ security/                UserContext / JWT 过滤器
│  │  ├─ storage/                 本地上传
│  │  └─ common/                  统一响应、异常、分页
│  ├─ src/main/resources/         application*.yml（含密码的不进库）、mapper/
│  ├─ uploads/                    上传文件落盘目录（不进库）
│  └─ pom.xml                     注意：web/ 通过 resources 映射到 classpath:static/admin
│
├─ miniprogram/                   微信小程序（DevTools 的 miniprogramRoot）
│  ├─ app.js / app.json / app.wxss  入口 + 全局纸感 token
│  ├─ custom-tab-bar/             自定义 tabBar（内联 SVG 图标）
│  ├─ components/ruler/           刻度尺组件（请假区间可视化）
│  ├─ pages/                      登录 / 首页 / 记录 / 消息 / 我的 / 申请 / 详情 / 销假
│  └─ utils/                      request / api / auth / format / server / config
│
├─ sql/
│  ├─ V1.0__schema.sql            建表脚本
│  ├─ V1.0__seed.sql              系统配置种子
│  ├─ V1.1__seed_demo.sql         演示账号 + 申请（密码 123456）
│  └─ V1.2__reseed_demo.sql       答辩前重置演示数据
│
├─ scripts/                       开发期工具（非运行时依赖）
│  ├─ gen-tabbar-icons.js         生成 tabBar 内联 SVG 图标
│  ├─ upgrade-font-scale.js       字号批量校准
│  ├─ test-teacher-*.js / .py     教师端接口实测
│  ├─ test_admin_api.py           管理端接口实测
│  └─ prep_checkin_case.py        造「核验」测试数据
│
├─ formal-v2/                     UI 定稿（历史参照，已被小程序实现取代）
├─ reviews/                       三轮评审报告
├─ docs/                          devtools-cli.md 等环境笔记
├─ outputs/                       自动化截图产物（不进库）
└─ archive/                       历史文档（不再维护）
```

---

## 技术栈

| 层 | 选型 | 出处 |
|---|---|---|
| 客户端 | **微信小程序原生**（WXML / WXSS / JS），不引 uni-app、Taro | 项目总纲 |
| 组件框架 | `glass-easel` + `style: v2`，基础库 3.17.4 | `project.private.config.json` |
| 后端 | **Java + Spring Boot 3.x** | 03_API 技术前提 |
| 鉴权 | **JWT**，`POST /api/v1/auth/login` 换 token | 03_API |
| 接口风格 | REST，统一前缀 `/api/v1`，前后端分离，小程序与学生/教师/管理员共用一套 API | 03_API |
| 数据库 | **MySQL 8.0.16+**（用到 CHECK 与生成列，低于此版本约束不生效） | 02 数据库设计 |
| 时区 / 字符集 | JVM 与 MySQL 统一 `Asia/Shanghai`；`utf8mb4` | 03_API、02 |
| ORM | **MyBatis-Plus 3.5.7**（`mybatis-plus-spring-boot3-starter`），Mapper 接口 + 少量 XML；**不做全局逻辑删除**（学生不能删历史，`deleted` 字段一期去掉） | 2026-10-20 决定 |
| 运行环境 | **JDK 17**（Spring Boot 3 最低要求，LTS） | 2026-10-20 决定 |
| 构建 | **Maven** | 2026-10-20 决定 |
| 文件存储 | 本地 `uploads/` 目录 + 静态资源映射；DB 只存相对 URL（`leave_material.file_url`）；单文件 ≤ 10MB，限 jpg/png/pdf；**不引 OSS** | 03_API §4 |
| 明确不引入 | Redis、消息队列、工作流引擎、微服务 | 总纲 |

---

## 定稿的 7 屏

首页 · 请假记录 · 消息 · 我的 · 申请请假 · 请假详情 · 返校销假

首页有五态：请假中 / 逾期 / 待审批 / 未请假（有记录）/ 未请假（零记录）。切态靠 `formal-v2/index.html` 右侧的演示面板 A–E。

---

## 设计约定（改代码前先看）

- 纸 `#FBFAF7` / 墨 `#15202E` / 蓝 `#2563C9` / 线 `#E7E3D9`，圆角 6，页边距 20px（40rpx）
- 中文 Noto Sans SC，数字与编号 Noto Serif SC + 等宽数字
- 主按钮墨色实心；蓝色只给状态、刻度尺、tab 选中
- 卡片只在记录页出现，其余靠 1px 细线分区
- 触控 ≥44px，`:focus-visible` 可见，`prefers-reduced-motion` 降级
- 不用：发光投影、大圆角、宽字距、卡片列表 + 右箭头

---

## 下一步

1. `app.json` 补齐 7 个页面路径 + tabBar（4 个）
2. 首页：五态骨架 + 刻度尺组件（定稿里最核心的视觉件）
3. 记录 / 消息 / 我的：列表与设置，无重逻辑
4. 申请 / 详情 / 返校销假：表单校验、审批时间轴、定位校验三态
5. `utils/api.js`：按 03_API 包一层，先用 mock 数据跑通
6. 后端：Spring Boot + MySQL，按 02 / 03 建表与实现

---

## 说明

- 单文件、零依赖、双击可开，是这个项目对前端产出的硬要求。
- `formal-v2/` 是 UI 的唯一依据；等 7 个页面落成 wxml/wxss 后，它和 `archive/` 可以一起删。
- 历史设计稿已清理，需要时：`git checkout e0fa8a4~1 -- <path>`。

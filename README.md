# CampusLeave · 校园请假管理系统

微信小程序 + Spring Boot + MySQL 的毕业设计项目。单人开发，AI 协作。

---

## 现在到哪一步了

| 阶段 | 状态 |
|---|---|
| 业务规则 / 数据库 / 接口契约 | **已冻结**（01 / 02 / 03） |
| 学生端 UI | **已定稿**（`formal-v2/`，7 屏 + 首页五态，可点击） |
| 学生端小程序代码 | 未开始（`pages/index` 只是占位页） |
| 后端 | 未开始 |
| 教师端 | 未开始 |

---

## 目录

```
CampusLeave/
├─ README.md                      本文件
│
├─ 01_业务规则_V1.2.md             业务规则冻结稿（2266 行，唯一权威）
├─ 02_数据库设计_V1.1.md           表结构、索引、约束
├─ 03_API接口_V1.0.md             前后端接口契约
├─ sql/
│  ├─ V1.0__schema.sql           建表脚本
│  └─ V1.0__seed.sql             种子数据
├─ reviews/                       三轮评审报告（PRD / 数据库 / 状态流）
│
├─ formal-v2/                     ★ UI 定稿
│  ├─ index.html                  7 屏 + 首页五态，单文件零依赖，双击即看
│  └─ NOTES.md                    设计约定、可跑通路径、未做清单
│
├─ archive/                       历史文档（不再维护，仅供回溯）
│  ├─ docs-early/                 早期总纲、学生端·教师端设计 V1.0、首页定位脑暴
│  └─ 校园请假管理系统——业务流程与状态机设计 V1.1.md
│
└─ —— 小程序源码（DevTools 项目根）——
   ├─ app.js / app.json / app.wxss  入口 + 全局纸感 token（--paper/--ink/--blue/--line）
   ├─ pages/index/                 占位首页，待按定稿实现
   ├─ project.config.json          appid wxa5d0a3b27a094adc
   └─ sitemap.json
```

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

# backend/web —— Web 管理后台前端（教师端 + 管理端）

原生 HTML / CSS / JS，无框架、无构建。改完文件**必须重新跑一次 `mvn compile`**
（或手动 `cp -r web target/classes/static/admin`），否则浏览器拿到的还是上一次的副本——
Spring Boot 从 classpath 读静态资源，不是读这个源码目录。

访问地址：`http://localhost:8080/admin/`

## 教师端和管理端在同一个壳里

两者共用路由、组件库和视觉 token，登录后按角色渲染不同菜单：

| 角色 | 账号（演示） | 菜单 |
|---|---|---|
| TEACHER | `T2023001` / `123456` | 工作台 / 待审批 / 异常核验 / 申请记录 / 学生 |
| ADMIN | `admin` / `123456` | （M5 待补：账号 / 班级 / 绑定 / 配置） |

所以找页面时不用分两个目录——先看 `js/app.js` 里的 `MENU` 数组，再进对应 `js/pages/*.js`。

## 结构

```
web/
├─ index.html            唯一入口，按顺序挂 9 个脚本
├─ css/
│  ├─ tokens.css         设计变量（纸感色板、字号、间距、侧栏宽度）
│  ├─ layout.css         壳：侧栏 / 顶栏 / 主从布局 / 响应式断点
│  └─ components.css     按钮、表格、标签、抽屉、表单、登录页
└─ js/
   ├─ api.js              接口封装 + loadStore() 一次性拉数据进 window.STORE
   ├─ router.js           hash 路由 + 返回位置恢复
   ├─ ui.js               组件库（el / table / drawer / statusTag / rejectPanel …）
   ├─ app.js              启动、菜单、角色范围、数据派生、审批动作
   └─ pages/
      ├─ login.js         登录（真 JWT）
      ├─ workbench.js     工作台
      ├─ pending.js       待审批（左列表右详情）+ 续假
      ├─ review.js        异常核验
      ├─ detail.js        申请详情渲染器（被 pending / review / records 复用）
      └─ records.js       申请记录 + 学生台账
```

## 路由

| hash | 页面 |
|---|---|
| `#/login` | 登录 |
| `#/workbench` | 工作台 |
| `#/pending` `#/pending/ext` `#/pending/:id` | 待审批 / 续假待审 / 指定申请 |
| `#/review` `#/review/:id` | 异常核验 |
| `#/records` `#/records/:id` | 申请记录 / 记录详情 |
| `#/students` | 学生台账 |

## 调试

- `index.html?demo=1#/workbench`：自动用 `T2023001` 登录，省一次输入（截图、答辩演示用）
- 登录态存 `sessionStorage.cl_admin_token`，关标签页即失效
- 数据全部来自 `/api/v1/teacher/*`，`window.STORE` 里能直接看到后端返回的原始结构

## 待补（M5）

管理端 4 页（账号 / 班级 / 绑定 / 配置）尚未实现，后端接口已完成
（`com.campusleave.admin`，14 个端点）。补前端时在 `js/app.js` 的 `MENU` 里按
`ADMIN.state.role` 分流，新增 `js/pages/admin-*.js`，无需新建目录。

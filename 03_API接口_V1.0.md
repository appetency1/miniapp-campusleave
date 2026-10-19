# 校园请假管理系统——API 接口设计 V1.0

> 上游依据：《业务流程与状态机设计 V1.2（冻结版）》＋《数据库设计 V1.1（技术修订版）》＋ `sql/V1.0__schema.sql`
> 技术前提：Spring Boot 3.x + MySQL 8 + JWT；前后端分离；小程序端与学生/教师/管理员共用一套 API
> 版本：V1.0（接口契约冻结稿）｜日期：2026-10-17

---

## 1. 总体约定

### 1.1 基础信息

```text
Base URL : /api/v1
协议      : HTTPS（本地调试可用 HTTP）
编码      : UTF-8
请求体    : application/json（文件上传为 multipart/form-data）
时间格式  : yyyy-MM-dd HH:mm:ss（Asia/Shanghai，UTC+08:00）
```

### 1.2 认证

```text
POST /api/v1/auth/login  → 返回 JWT
后续请求头：Authorization: Bearer <token>
Token 有效期：7 天（毕设简化，不做 refresh token）
```

- 密码使用 BCrypt 存储，接口不返回 `password_hash`。
- 账号被 `DISABLED` 时登录返回 `40103`，已签发的 token 在下一次请求校验时拒绝。

### 1.3 统一响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "traceId": "b7c1e2f0"
}
```

- `code = 0` 表示成功；非 0 为业务错误。
- HTTP 状态码与业务码同时使用：参数错误 400、未登录 401、无权限 403、不存在 404、状态冲突 409、规则不满足 422、服务异常 500。
- 业务错误示例：

```json
{
  "code": 40901,
  "message": "该申请当前状态为「已销假」，不能再次审批",
  "data": { "currentStatus": "COMPLETED" }
}
```

### 1.4 错误码

| code | HTTP | 含义 |
|---|---:|---|
| 0 | 200 | 成功 |
| 40001 | 400 | 参数缺失或格式错误 |
| 40002 | 400 | 时间格式错误 / 结束时间不晚于开始时间 |
| 40101 | 401 | 未登录或 token 无效 |
| 40102 | 401 | token 已过期 |
| 40103 | 401 | 账号已禁用 |
| 40104 | 401 | 用户名或密码错误 |
| 40301 | 403 | 越权访问（非本人 / 非负责班级） |
| 40401 | 404 | 资源不存在 |
| 40901 | 409 | 状态冲突（条件更新失败，需刷新） |
| 40902 | 409 | 已存在待审批续假 |
| 40903 | 409 | 时间与已有有效申请重叠 |
| 40904 | 409 | 重复提交（幂等键冲突） |
| 42201 | 422 | 当前 effective_status 不允许该动作 |
| 42202 | 422 | 定位校验未通过（距离超范围） |
| 42203 | 422 | 核验记录不可处理（已关闭 / 已销假取代） |
| 42204 | 422 | 班级未配置辅导员 |
| 50000 | 500 | 服务器内部错误 |

### 1.5 分页与排序

```text
请求：page（默认 1）、size（默认 10，最大 50）、sort（默认 created_at,desc）
响应：{ "list": [], "total": 0, "page": 1, "size": 10 }
```

### 1.6 幂等与并发

| 场景 | 机制 |
|---|---|
| 创建申请 / 续假 | 请求头 `Idempotency-Key: <uuid>`，服务端 10 分钟内同键返回首次结果；否则按 `(student_id, leave_scene, start_time, end_time)` 查重 |
| 审批 / 销假 / 核验 | 条件更新 `WHERE status='...'`，`affected_rows=0` → 40901 |
| 提交申请时间冲突 | 事务内 `SELECT ... FOR UPDATE` 锁学生行后复查，冲突 → 40903 |
| 续假并发 | `pending_app_id` 唯一键拦截第二条 PENDING → 40902 |

### 1.7 权限矩阵

| 资源 | STUDENT | TEACHER | ADMIN |
|---|---|---|---|
| 自己的申请 | CRUD（受状态约束） | — | — |
| 负责班级的申请 | — | 查看 / 审批 / 处理异常 | 查看（全校） |
| 续假 | 提交 / 撤回（自己的） | 审批（负责班级） | — |
| 销假 / 核验 | 发起（自己的） | 处理核验（负责班级） | — |
| 消息 | 自己的 | 自己的 | 自己的 |
| 账号 / 班级 / 辅导员关系 / 配置 | — | — | 管理 |
| 统计 | 个人 4 指标 | 负责班级 4 指标 | 全校 4 指标 |

> 所有接口在后端二次校验角色、数据范围与当前状态；前端隐藏按钮不构成权限控制。

---

## 2. 接口总览

| # | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 1 | POST | /auth/login | 公开 | 登录 |
| 2 | POST | /auth/logout | 全部 | 退出 |
| 3 | GET | /auth/me | 全部 | 当前用户 |
| 4 | PUT | /auth/password | 全部 | 修改密码 |
| 5 | GET | /common/dictionaries | 全部 | 枚举字典 |
| 6 | POST | /files | 全部 | 上传材料/头像 |
| 7 | GET | /student/home | 学生 | 首页总览 |
| 8 | POST | /student/applications | 学生 | 提交申请 |
| 9 | GET | /student/applications | 学生 | 我的申请列表 |
| 10 | GET | /student/applications/{id} | 学生 | 申请详情 |
| 11 | POST | /student/applications/{id}/withdraw | 学生 | 撤回 |
| 12 | POST | /student/applications/{id}/cancel | 学生 | 取消 |
| 13 | POST | /student/applications/{id}/checkin/on-campus | 学生 | 校内确认结束 |
| 14 | POST | /student/applications/{id}/checkin/gps | 学生 | 离校 GPS 销假 |
| 15 | POST | /student/applications/{id}/checkin/manual-review | 学生 | 申请人工核验 |
| 16 | POST | /student/applications/{id}/extensions | 学生 | 申请续假 |
| 17 | POST | /student/extensions/{id}/withdraw | 学生 | 撤回续假 |
| 18 | GET | /student/extensions/{id} | 学生 | 续假详情 |
| 19 | GET | /student/messages | 学生 | 消息列表 |
| 20 | GET | /student/messages/unread-count | 学生 | 未读数 |
| 21 | POST | /student/messages/{id}/read | 学生 | 标记已读 |
| 22 | POST | /student/messages/read-all | 学生 | 全部已读 |
| 23 | GET | /student/stats | 学生 | 个人统计 |
| 24 | GET | /teacher/workbench | 教师 | 工作台 |
| 25 | GET | /teacher/applications | 教师 | 待审批/记录列表 |
| 26 | GET | /teacher/applications/{id} | 教师 | 申请详情 |
| 27 | POST | /teacher/applications/{id}/approve | 教师 | 批准 |
| 28 | POST | /teacher/applications/{id}/reject | 教师 | 驳回 |
| 29 | GET | /teacher/extensions | 教师 | 续假待审批列表 |
| 30 | GET | /teacher/extensions/{id} | 教师 | 续假详情 |
| 31 | POST | /teacher/extensions/{id}/approve | 教师 | 续假批准 |
| 32 | POST | /teacher/extensions/{id}/reject | 教师 | 续假驳回 |
| 33 | GET | /teacher/checkin-logs | 教师 | 异常/核验列表 |
| 34 | GET | /teacher/checkin-logs/{id} | 教师 | 核验详情 |
| 35 | POST | /teacher/checkin-logs/{id}/review | 教师 | 核验通过/驳回 |
| 36 | GET | /teacher/applications/overdue | 教师 | 逾期列表 |
| 37 | GET | /teacher/students | 教师 | 学生列表 |
| 38 | GET | /teacher/students/{id} | 教师 | 学生详情 |
| 39 | GET | /teacher/stats | 教师 | 班级统计 |
| 40 | GET/POST | /admin/users | 管理员 | 账号列表 / 新建 |
| 41 | PUT | /admin/users/{id}/status | 管理员 | 启用 / 禁用 |
| 42 | PUT | /admin/users/{id}/password | 管理员 | 重置密码 |
| 43 | GET/POST/PUT/DELETE | /admin/classes | 管理员 | 班级管理 |
| 44 | GET/POST/DELETE | /admin/teacher-classes | 管理员 | 辅导员-班级绑定 |
| 45 | GET/PUT | /admin/configs | 管理员 | 系统配置 |
| 46 | GET | /admin/stats | 管理员 | 全校统计 |

---

## 3. 认证与公共

### 3.1 登录

```text
POST /api/v1/auth/login
权限：公开
```

请求：

```json
{ "username": "2023001001", "password": "******" }
```

响应：

```json
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresIn": 604800,
    "user": { "id": 3, "username": "2023001001", "role": "STUDENT", "realName": "李同学" }
  }
}
```

错误：40104（用户名或密码错误）、40103（账号禁用）。

### 3.2 当前用户

```text
GET /api/v1/auth/me
权限：已登录
```

响应 `data`：

```json
{
  "id": 3, "username": "2023001001", "role": "STUDENT", "realName": "李同学",
  "phone": "13900000001", "avatar": null,
  "studentProfile": { "studentNo": "2023001001", "classId": 1, "className": "计算机2301", "counselorName": "张老师" }
}
```

### 3.3 修改密码

```text
PUT /api/v1/auth/password
请求：{ "oldPassword": "...", "newPassword": "..." }（新密码 ≥ 8 位）
响应：code=0
```

### 3.4 字典

```text
GET /api/v1/common/dictionaries
权限：已登录
```

```json
{
  "leaveScenes": [
    { "value": "OFF_CAMPUS", "label": "离校请假" },
    { "value": "ON_CAMPUS", "label": "校内请假" }
  ],
  "leaveTypes": [
    { "value": "SICK", "label": "病假" },
    { "value": "PERSONAL", "label": "事假" },
    { "value": "OTHER", "label": "其他" }
  ],
  "applicationStatus": [
    { "value": "PENDING", "label": "待审批" },
    { "value": "APPROVED", "label": "已通过" },
    { "value": "REJECTED", "label": "已驳回" },
    { "value": "WITHDRAWN", "label": "已撤回" },
    { "value": "CANCELLED", "label": "已取消" },
    { "value": "COMPLETED", "label": "已完成" }
  ]
}
```

---

## 4. 文件上传

```text
POST /api/v1/files
权限：已登录
Content-Type: multipart/form-data
字段：file（必填）、bizType（MATERIAL / AVATAR）
限制：单文件 ≤ 10MB；MATERIAL 允许 jpg/jpeg/png/pdf
```

响应：

```json
{ "code": 0, "data": { "fileId": 101, "fileName": "诊断证明.jpg", "fileUrl": "/files/2026/10/xxx.jpg", "fileSize": 82311, "mimeType": "image/jpeg" } }
```

> 上传成功只返回文件信息；提交申请时把 `fileId/fileUrl/fileName` 放入 `materials` 数组。

---

## 5. 学生端接口

### 5.1 首页总览

```text
GET /api/v1/student/home
权限：STUDENT
```

响应：

```json
{
  "code": 0,
  "data": {
    "now": "2026-10-17 11:20:00",
    "current": {
      "applicationId": 12, "applicationNo": "LA202610170001",
      "leaveScene": "OFF_CAMPUS", "leaveType": "SICK",
      "startTime": "2026-10-17 08:00:00", "endTime": "2026-10-17 18:00:00",
      "status": "APPROVED", "effectiveStatus": "IN_PROGRESS", "overdue": false,
      "hasPendingExtension": false
    },
    "recent": [ { "applicationId": 11, "summary": "校内 · 事假", "status": "COMPLETED", "startTime": "2026-10-10 09:00:00" } ]
  }
}
```

> `effectiveStatus` 由后端按 V1.2 §4.1 计算（WAITING_START / IN_PROGRESS / OVERDUE / 其他状态原样返回）。

### 5.2 提交申请

```text
POST /api/v1/student/applications
权限：STUDENT（仅本人）
请求头：Idempotency-Key: <uuid>（必填）
```

请求：

```json
{
  "leaveScene": "OFF_CAMPUS",
  "leaveType": "SICK",
  "startTime": "2026-10-18 08:00:00",
  "endTime": "2026-10-18 18:00:00",
  "reason": "发烧就医",
  "destination": "市第一医院",
  "contactPhone": "13900000001",
  "materials": [
    { "materialType": "MEDICAL_PROOF", "fileName": "诊断证明.jpg", "fileUrl": "/files/2026/10/x.jpg", "fileSize": 82311, "mimeType": "image/jpeg" }
  ]
}
```

校验顺序（任一失败即返回）：

```text
1. 账号、角色、学生资料完整
2. 班级已配置辅导员（否则 42204）
3. startTime < endTime（40002）
4. startTime 不早于当前时间（40002，Service 层）
5. 与本人有效申请（PENDING / APPROVED）无重叠（40903）
6. 必填字段完整；OFF_CAMPUS 时 destination 建议填写（非强制）
7. 材料规则校验（首版：全部选填；如启用必传，返回 40001）
8. 幂等键 / 业务查重（40904）
```

响应：

```json
{ "code": 0, "data": { "id": 13, "applicationNo": "LA202610180001", "status": "PENDING" } }
```

### 5.3 我的申请列表

```text
GET /api/v1/student/applications?status=&page=1&size=10
权限：STUDENT（仅本人）
```

- `status` 可选：PENDING / APPROVED / REJECTED / WITHDRAWN / CANCELLED / COMPLETED；不传为全部。
- 列表项字段：id、applicationNo、leaveScene、leaveType、startTime、endTime、status、effectiveStatus、overdue、createdAt。

### 5.4 申请详情

```text
GET /api/v1/student/applications/{id}
权限：本人
```

响应 `data`：

```json
{
  "id": 12, "applicationNo": "LA202610170001",
  "leaveScene": "OFF_CAMPUS", "leaveType": "SICK",
  "startTime": "2026-10-17 08:00:00", "endTime": "2026-10-17 18:00:00",
  "actualEndTime": null, "reason": "发烧就医", "destination": "市第一医院", "contactPhone": "13900000001",
  "status": "APPROVED", "effectiveStatus": "IN_PROGRESS", "overdue": false,
  "approvedBy": "张老师", "approvedAt": "2026-10-16 17:30:00", "approvalComment": "同意",
  "materials": [ { "id": 5, "fileName": "诊断证明.jpg", "fileUrl": "/files/..." } ],
  "checkinLogs": [ { "id": 21, "checkType": "GPS", "checkResult": "FAILED", "reviewStatus": "NONE", "checkTime": "2026-10-17 17:40:00", "distanceM": 320.5 } ],
  "extension": { "id": 7, "status": "PENDING", "requestedEndTime": "2026-10-18 12:00:00" },
  "actions": ["CHECKIN", "EXTENSION"]
}
```

> `actions` 为后端按 `status + effective_status + leave_scene + 续假状态` 计算的可用动作集合，前端据此显示按钮。

### 5.5 撤回申请

```text
POST /api/v1/student/applications/{id}/withdraw
权限：本人；前置：status = PENDING
请求：{ "reason": "不需要了" }（选填）
响应：status → WITHDRAWN
错误：40901（状态已变化）、42201（非 PENDING）
```

### 5.6 取消申请

```text
POST /api/v1/student/applications/{id}/cancel
权限：本人；前置：status = APPROVED 且 effective_status = WAITING_START
请求：{ "reason": "行程取消" }
响应：status → CANCELLED；写 cancel_reason / cancelled_at / cancelled_by_user_id
错误：42201（已开始或有待审续假时不允许取消）
```

> 有待审批续假时，取消前应先撤回续假（或后端自动撤回并返回 40902 提示）。

### 5.7 校内确认结束

```text
POST /api/v1/student/applications/{id}/checkin/on-campus
权限：本人；前置：leave_scene = ON_CAMPUS 且 effective_status ∈ {IN_PROGRESS, OVERDUE}
请求：无（或 { "remark": null }）
```

响应：

```json
{ "code": 0, "data": { "status": "COMPLETED", "actualEndTime": "2026-10-18 10:12:00", "overdueAtCompletion": true, "delayMinutes": 72 } }
```

写库：单条 UPDATE 同时改 `status` + `actual_end_time`；插入 `leave_checkin_log`（ON_CAMPUS_CONFIRM / PASSED / NONE）；自动撤回 PENDING 续假；写日志与通知。

错误：42201（WAITING_START 或场景不符）、40901（已处理）。

### 5.8 离校 GPS 销假

```text
POST /api/v1/student/applications/{id}/checkin/gps
权限：本人；前置：leave_scene = OFF_CAMPUS 且 effective_status ∈ {IN_PROGRESS, OVERDUE}
```

请求：

```json
{ "latitude": 30.123456, "longitude": 120.123456, "accuracy": 25.0 }
```

服务端：

```text
distance = Haversine(点, 校园中心)
读取 system_config.OFF_CAMPUS_CHECK_RADIUS_M
```

响应（通过）：

```json
{ "code": 0, "data": { "passed": true, "distanceM": 86.4, "status": "COMPLETED", "actualEndTime": "2026-10-18 10:15:00" } }
```

响应（未通过，HTTP 422）：

```json
{
  "code": 42202,
  "message": "定位距离超出允许范围",
  "data": { "passed": false, "distanceM": 320.5, "allowedRadiusM": 100, "options": ["RETRY", "MANUAL_REVIEW"] }
}
```

> 未通过时插入 `leave_checkin_log`（GPS / FAILED / NONE，记录 distance_m），不改变主状态。

### 5.9 申请人工核验

```text
POST /api/v1/student/applications/{id}/checkin/manual-review
权限：本人；前置：最近一条 GPS 记录为 FAILED，且 review_status ∈ {NONE}
```

请求：

```json
{ "reason": "定位漂移，实际已返校", "evidenceUrl": "/files/..." }
```

响应：

```json
{ "code": 0, "data": { "checkinLogId": 22, "reviewStatus": "PENDING_REVIEW" } }
```

错误：42203（已有一条待审核验）、40901。

### 5.10 申请续假

```text
POST /api/v1/student/applications/{id}/extensions
权限：本人；前置：effective_status ∈ {IN_PROGRESS, OVERDUE}
请求头：Idempotency-Key
```

请求：

```json
{ "requestedEndTime": "2026-10-19 12:00:00", "reason": "病情未愈" }
```

校验：

```text
requestedEndTime > max(end_time, now)   （42201）
与本人其他有效申请无重叠               （40903，提交预检 + 审批复查）
同一申请无 PENDING 续假                （40902）
```

响应：`{ "id": 8, "status": "PENDING" }`。主申请 `end_time` 不变。

### 5.11 撤回续假

```text
POST /api/v1/student/extensions/{id}/withdraw
权限：本人；前置：status = PENDING
响应：status → WITHDRAWN；主申请不变
```

### 5.12 消息

```text
GET  /api/v1/student/messages?isRead=&page=1&size=20
GET  /api/v1/student/messages/unread-count
POST /api/v1/student/messages/{id}/read
POST /api/v1/student/messages/read-all
```

列表项：id、type、title、content、businessType、businessId、isRead、createdAt。
未读数响应：`{ "unread": 3 }`。

### 5.13 个人统计

```text
GET /api/v1/student/stats
```

```json
{
  "totalApplications": 12,
  "approved": 9,
  "completed": 7,
  "currentOverdue": 1
}
```

> 口径：续假不计入申请数；逾期数为当前 `effective_status = OVERDUE` 的数量。

---

## 6. 教师端接口

### 6.1 工作台

```text
GET /api/v1/teacher/workbench
权限：TEACHER
```

```json
{
  "pendingCount": 3,
  "inProgressCount": 8,
  "abnormalCount": 2,
  "todos": [ { "type": "APPLICATION", "id": 12, "studentName": "李同学", "summary": "离校 · 病假", "timeRange": "今天 10:00-20:00" } ]
}
```

### 6.2 申请列表（待审批 / 记录）

```text
GET /api/v1/teacher/applications?tab=pending|records&status=&classId=&keyword=&startDate=&endDate=&page=&size=
权限：TEACHER（仅负责班级）
```

- `tab=pending`：`status = PENDING`，按申请时间升序。
- `tab=records`：全部状态，支持学生姓名/学号、班级、场景、类型、时间范围筛选。
- 数据范围：`teacher_class → class_id → student_profile`；无辅导员关系时返回空列表。

### 6.3 申请详情

```text
GET /api/v1/teacher/applications/{id}
权限：负责班级
```

字段同学生详情，另含：学生信息（姓名/学号/班级/电话/紧急联系人）、审批记录、材料、销假记录、续假记录。

### 6.4 批准

```text
POST /api/v1/teacher/applications/{id}/approve
权限：负责班级；前置：status = PENDING
请求：{ "comment": "同意" }（选填）
```

服务端（事务）：

```text
1. SELECT ... FOR UPDATE 校验 status = PENDING 与数据范围
2. UPDATE leave_application SET status='APPROVED', approved_by_user_id=?, approved_at=NOW()
   WHERE id=? AND status='PENDING'
3. 写 leave_approval_log（APPROVE）
4. 创建通知（审批通过）
```

错误：40901（已被处理）、40301（非负责班级）、42201。

### 6.5 驳回

```text
POST /api/v1/teacher/applications/{id}/reject
权限：负责班级；前置：status = PENDING
请求：{ "reason": "理由不充分" }（必填）
```

响应：status → REJECTED；通知学生；日志 action=REJECT。

### 6.6 续假列表 / 详情

```text
GET /api/v1/teacher/extensions?status=PENDING&page=&size=
GET /api/v1/teacher/extensions/{id}
权限：负责班级
```

### 6.7 续假批准

```text
POST /api/v1/teacher/extensions/{id}/approve
权限：负责班级；前置：extension.status = PENDING 且主申请 status = APPROVED 且未 COMPLETED
请求：{ "comment": "同意延长" }
```

事务（统一锁序）：

```text
1. SELECT leave_application ... FOR UPDATE（校验 status=APPROVED 且 actual_end_time IS NULL）
2. SELECT leave_extension ... FOR UPDATE（校验 status=PENDING）
3. 复查 requested_end_time 与本人其他有效申请无重叠（40903）
4. UPDATE leave_extension SET status='APPROVED' ...
5. UPDATE leave_application SET end_time = requested_end_time ...
6. 写日志（EXTENSION_APPROVE）与通知
```

错误：40901、40902、40903、42201（主申请已 COMPLETED → 续假自动 WITHDRAWN 并返回 40901）。

### 6.8 续假驳回

```text
POST /api/v1/teacher/extensions/{id}/reject
权限：负责班级；前置：PENDING
请求：{ "reason": "..." }（必填）
响应：extension.status → REJECTED；主申请 end_time 不变
```

### 6.9 异常 / 核验列表

```text
GET /api/v1/teacher/checkin-logs?reviewStatus=PENDING_REVIEW&checkResult=FAILED&page=&size=
权限：负责班级
```

列表项：id、applicationId、studentName、checkType、checkResult、reviewStatus、distanceM、checkTime、reviewedAt。

### 6.10 核验详情

```text
GET /api/v1/teacher/checkin-logs/{id}
权限：负责班级
```

含：申请信息、定位距离、失败原因、学生核验理由、历史记录（同申请的其他 checkin 记录）。

### 6.11 核验通过 / 驳回

```text
POST /api/v1/teacher/checkin-logs/{id}/review
权限：负责班级；前置：review_status = PENDING_REVIEW
请求：{ "action": "APPROVE" | "REJECT", "comment": "..." }
```

- APPROVE：`review_status=APPROVED`、`closed_at=NOW()`；主申请单条 UPDATE → COMPLETED，`actual_end_time` = 核验通过时间；写日志（MANUAL_REVIEW）与通知。
- REJECT：`review_status=REJECTED`、`closed_at=NOW()`；主申请保持 APPROVED（effective_status 仍为 IN_PROGRESS/OVERDUE）；允许学生重新定位或再次申请核验。

错误：42203（已关闭 / 已被自助销假取代 VOID）、40901。

> 若主申请此时已 COMPLETED（学生自助销假成功），系统将该记录置 `VOID` 并返回 42203，不允许重复审批。

### 6.12 逾期列表

```text
GET /api/v1/teacher/applications/overdue?classId=&page=&size=
权限：负责班级
```

条件：`status='APPROVED' AND actual_end_time IS NULL AND end_time <= NOW()`；返回实时计算值（非持久状态）。

### 6.13 学生列表 / 详情

```text
GET /api/v1/teacher/students?keyword=&classId=&page=&size=
GET /api/v1/teacher/students/{id}
权限：负责班级
```

学生详情：基本信息、请假概况（申请数/批准数/完成数/当前状态）、最近申请。

### 6.14 班级统计

```text
GET /api/v1/teacher/stats?classId=
```

```json
{ "totalApplications": 42, "approved": 35, "completed": 30, "currentOverdue": 2 }
```

---

## 7. 管理端接口

### 7.1 账号

```text
GET  /api/v1/admin/users?role=&keyword=&page=&size=
POST /api/v1/admin/users
     { "username": "2023001001", "realName": "李同学", "role": "STUDENT", "phone": "...", "initialPassword": "..." }
PUT  /api/v1/admin/users/{id}/status     { "status": "ACTIVE" | "DISABLED" }
PUT  /api/v1/admin/users/{id}/password   { "newPassword": "..." }
```

- 新建 STUDENT：必须同时提供 `studentNo`、`classId`（一个事务内建 user + student_profile）。
- 新建 TEACHER：提供 `teacherNo`、`department`。
- username 全局唯一（40904）。

### 7.2 班级

```text
GET    /api/v1/admin/classes?keyword=&page=&size=
POST   /api/v1/admin/classes      { "className": "...", "classCode": "...", "major": "...", "grade": "..." }
PUT    /api/v1/admin/classes/{id}
DELETE /api/v1/admin/classes/{id}   （存在学生时 40901）
```

### 7.3 辅导员-班级绑定

```text
GET    /api/v1/admin/teacher-classes?teacherId=&classId=
POST   /api/v1/admin/teacher-classes   { "teacherId": 2, "classId": 3 }
DELETE /api/v1/admin/teacher-classes/{id}
```

- `class_id` 唯一（一个班级只能有一个辅导员），重复绑定 40901。
- 解绑后该班级学生提交申请会被拒绝（42204），需先重新绑定。

### 7.4 系统配置

```text
GET /api/v1/admin/configs
PUT /api/v1/admin/configs/{key}   { "configValue": "120" }
```

可配置项：`CAMPUS_CENTER_LAT`、`CAMPUS_CENTER_LNG`、`OFF_CAMPUS_CHECK_RADIUS_M`、`START_REMINDER_WINDOW_MINUTES`。

### 7.5 全校统计

```text
GET /api/v1/admin/stats?startDate=&endDate=
```

```json
{ "totalApplications": 320, "approved": 280, "completed": 250, "currentOverdue": 6 }
```

---

## 8. 状态守卫与业务规则映射

| 接口 | 前置条件（服务端强制） | 失败码 |
|---|---|---|
| 撤回申请 | `status = PENDING` 且本人 | 42201 / 40301 |
| 取消申请 | `status = APPROVED` 且 `effective_status = WAITING_START` | 42201 |
| 校内确认结束 | `leave_scene = ON_CAMPUS` 且 `effective_status ∈ {IN_PROGRESS, OVERDUE}` | 42201 |
| GPS 销假 | `leave_scene = OFF_CAMPUS` 且 `effective_status ∈ {IN_PROGRESS, OVERDUE}` | 42201 / 42202 |
| 申请核验 | 最近 GPS 记录 FAILED 且无待审核验 | 42203 |
| 申请续假 | `effective_status ∈ {IN_PROGRESS, OVERDUE}` 且 `requested_end_time > max(end_time, now)` | 42201 / 40902 / 40903 |
| 审批请假 | `status = PENDING` 且负责班级 | 40901 / 40301 |
| 审批续假 | 续假 PENDING、主申请 APPROVED 且未完成、无时间冲突 | 40901 / 40903 |
| 核验处理 | `review_status = PENDING_REVIEW` 且主申请未 COMPLETED | 42203 |
| 提交申请 | 班级有辅导员、时间合法、无重叠、无重复提交 | 42204 / 40002 / 40903 / 40904 |

> `effective_status` 一律由后端 `f(status, start_time, end_time, actual_end_time, now)` 计算，接口不可直接写入 `IN_PROGRESS / OVERDUE`。

---

## 9. 关键时序

### 9.1 提交 → 审批 → 消息

```text
学生 POST /student/applications
  → 校验（班级辅导员、时间、冲突、幂等）
  → INSERT leave_application(PENDING) + leave_material
  → 日志 SUBMIT
教师 GET /teacher/applications?tab=pending
教师 POST /teacher/applications/{id}/approve
  → 条件更新 PENDING→APPROVED
  → 日志 APPROVE + notification
学生 GET /student/applications/{id} → effective_status 计算展示
```

### 9.2 离校销假（失败 → 核验）

```text
学生 POST .../checkin/gps
  → 距离 > 半径：INSERT checkin_log(FAILED) → 42202
学生 POST .../checkin/manual-review
  → 该记录 review_status = PENDING_REVIEW
教师 GET /teacher/checkin-logs?reviewStatus=PENDING_REVIEW
教师 POST /teacher/checkin-logs/{id}/review {APPROVE}
  → 记录 APPROVED + closed_at；主申请 COMPLETED；日志 + 通知
```

### 9.3 续假并发

```text
学生提交续假 → 生成列 pending_app_id = application_id，唯一键拦截第二条 → 40902
教师批准 → 锁 application → 锁 extension → 复查冲突 → 更新 end_time
学生此时销假 → 事务内自动撤回 PENDING 续假（WITHDRAWN + 原因）
```

---

## 10. 非功能约定

- **日志**：每个请求记录 traceId；关键操作写 `leave_approval_log`。
- **审计**：审批、销假、核验、撤回、取消不可物理删除。
- **限流**：登录接口 5 次/分钟/IP；其余 60 次/分钟/用户（毕设可用内存限流）。
- **文件**：上传后返回相对 URL，服务端校验扩展名与大小；不保存 GPS 原始轨迹。
- **时区**：服务端 JVM 与 MySQL 统一 `Asia/Shanghai`。

---

## 11. 待确认 / Non-goals

**待确认**
1. 消息接口是否也提供给教师（当前仅学生有消息页）——V1.2 通知规则只定义了学生接收。
2. 撤销已批准申请是否需要管理员审批——当前只允许学生取消（未开始）。
3. 材料是否按请假类型强制（当前全部选填，接口预留校验点）。
4. 教师端是否需要"导出"（Excel）——当前 Non-goal。

**Non-goals（V1.0）**
- 多级审批、审批流引擎
- 微信订阅消息推送（仅站内消息）
- 定位轨迹、后台持续定位
- 材料在线预览 / OCR
- 管理员操作审计（仅业务日志）
- 批量操作、导入导出

# 安全与性能审计报告

**审计对象**：校园请假管理系统（后端 66 个 Java 文件 / 5 941 行，Web 后台 12 个 JS，小程序 10 个页面）
**审计日期**：2026-10-23
**审计方式**：全量源码走查 + 对运行中的 8080 实例做真实请求验证（含构造伪造令牌、越权探测、边界上传、分页压力）
**审计人**：高级开发工程师（AI 协作）

---

## 0. 结论摘要

| 等级 | 数量 | 说明 |
|---|---|---|
| **P0 严重** | 2 | 已实测可利用，影响全部数据 |
| **P1 高** | 6 | 需要在上线/答辩演示前修掉 |
| **P2 中** | 5 | 应在 M5 收尾阶段处理 |
| **性能 P1/P2** | 7 | 当前数据量（128 条申请）无感，数据量上去后线性恶化 |
| **P3 低 / 质量问题** | 5 | 顺手改 |

**最关键的一条**：`application-dev.yml` 里的 JWT 密钥是仓库中公开的占位串，任何人拿仓库即可自己签一个 `role=ADMIN` 的令牌。我用这个密钥伪造令牌，成功读到了 `系统管理员` 的账号信息和全校 128 条申请统计（见 §2.1 证据链）。这一条单独就足以让整个权限体系失效。

**代码质量的正向结论**（不是客套，是实测过的）：并发控制做得比大多数毕设扎实（`UPDATE ... WHERE status=?` 条件更新 + 影响行数判定，覆盖了审批、销假、撤回、续假全路径）；跨班越权在 Service 层有统一收口（`TeacherScopeService`）；通知幂等用唯一键而非"先查后插"；前端渲染全部走 `textContent`，12 个 JS 里没有一处把服务端数据塞进 `innerHTML`，XSS 面基本为零；数据库索引覆盖了主要查询路径。问题集中在**配置与边界**，不在业务骨架。

---

## 1. 审计范围与排除项

**覆盖**：`backend/src/main/java`（全部 66 个类）、`backend/web/**`、`miniprogram/**`、`sql/V1.0__schema.sql`、`application*.yml`、`pom.xml`、`.gitignore`。

**排除**：`backend/target`（编译产物）、`outputs/`（截图）、`scripts/`（验证脚本，不对外）。

**工具辅助**：`code-reviewer` 静态扫描 66 个 Java 文件，严重问题 0、优化建议 17、注释覆盖率 5.93%（该指标失真——本仓库是密集中文块注释，工具按 `//` 行注释统计）、华为规范评分 90.38/100。**静态工具未发现本报告的任何一条 P0**——这说明它只能查格式，查不了鉴权逻辑，下文结论全部来自人工走查 + 真实请求验证。

---

## 2. P0 严重问题（已实测可利用）

### 2.1 JWT 签名密钥是公开占位值，可伪造任意身份

**位置**
- `backend/src/main/resources/application-dev.yml:14` → `secret: campus-leave-jwt-secret-key-change-me-2026`
- `backend/src/main/resources/application-dev.yml.example:14` → **同一个字符串，且已提交进 Git**
- `application.yml:5` → `active: dev` 写死，生产也会加载这份配置

**成因**
`.example` 模板里的占位串被原样复制进了真实配置，没有替换。而这份占位串在公开仓库里（`https://github.com/appetency1/miniapp-campusleave`），等于密钥公开。JWT 是 HS256 对称签名，知道密钥就能签出任意 `sub` / `role`。

**证据链（实测）**

```bash
# 用仓库里的占位密钥手工签一个 role=ADMIN 的令牌（不经过登录接口）
python -c "import hmac,hashlib,base64,json,time; ..."   # 完整脚本见附录 A
# -> eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJUMjAyMzA...

curl -H "Authorization: Bearer <伪造令牌>" http://localhost:8080/api/v1/auth/me
# {"code":0,...,"data":{"realName":"系统管理员","role":"ADMIN","id":1,"username":"admin"}}

curl -H "Authorization: Bearer <伪造令牌>" http://localhost:8080/api/v1/admin/stats
# {"code":0,"data":{"totalApplications":128,"approved":106,"completed":84,"currentOverdue":13,"pending":3}}
```

我没有登录、没有密码，拿到了管理员身份和全校统计数据。

**影响**：伪造任意学生/教师/管理员；改别人请假状态；重置任意账号密码（`PUT /admin/users/{id}/password`）；读取全部学生手机号与紧急联系人。**这是数据全失守级别。**

**修复**

1. 密钥移到环境变量，启动时强校验不是占位值（改 `JwtUtil` 构造器）：

```java
public JwtUtil(@Value("${campus-leave.jwt.secret}") String secret,
               @Value("${campus-leave.jwt.expire-seconds}") long expireSeconds) {
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
        throw new IllegalStateException("campus-leave.jwt.secret 长度不足 32 字节，拒绝启动");
    }
    if (secret.startsWith("campus-leave-jwt-secret")) {
        throw new IllegalStateException("campus-leave.jwt.secret 仍是占位值，拒绝启动");
    }
    this.key = Keys.hmacShaKeyFor(bytes);
    this.expireSeconds = expireSeconds;
}
```

2. 配置改成 `${CAMPUS_LEAVE_JWT_SECRET}`，`.example` 里留空并写明生成方式：
   `openssl rand -base64 48`
3. `application.yml` 不要写死 `active: dev`，改成 `${SPRING_PROFILES_ACTIVE:dev}`。
4. **已经泄露过的密钥必须视为永久失效**——换掉，不要只改注释。

### 2.2 `/files/**` 完全匿名可读，诊断证明等敏感材料可被任意人下载

**位置**：`config/StaticResourceConfig.java:20-23`

```java
registry.addResourceHandler("/files/**").addResourceLocations(abs);
// 而 JwtAuthFilter 只注册在 /api/* （WebConfig.java:26）
```

**证据链（实测）**

```bash
find backend/uploads -type f | head -1
# backend/uploads/2026/10/39e28f507dee4fbe8f70f206d63fe857.png

curl -o /dev/null -w "HTTP %{http_code} size=%{size_download}\n" \
  http://localhost:8080/files/2026/10/39e28f507dee4fbe8f70f206d63fe857.png
# HTTP 200  size=6794      ← 没带任何 Authorization
```

**影响**：请假材料是病假诊断证明、请假单，属于敏感个人信息。虽然文件名是 UUID（不可枚举），但 URL 一旦出现在任何地方（截图、聊天记录、Web 后台的 `materials[].url`、浏览器历史、代理日志）就是永久可读、无需登录、无法撤回。`teacher/enrich` 把 `fileUrl` 直接返回给前端（`TeacherQueryService.java:316`），学院/宿舍共用网络时被同网段抓包即可拿到。

**修复（二选一）**

- **推荐**：材料走受控下载接口，静态映射下线。

```java
@GetMapping("/api/v1/files/{yyyy}/{MM}/{name}")
public ResponseEntity<Resource> download(@PathVariable String yyyy, @PathVariable String MM,
                                         @PathVariable String name) {
    CurrentUser.require();                 // 至少登录
    // 关键：校验这个 URL 是否真的属于当前用户可见的申请
    if (!materialMapper.existsOwnedBy(CurrentUser.requireUserId(), "/files/" + yyyy + "/" + MM + "/" + name)) {
        throw new BizException(ErrorCode.NOT_FOUND);
    }
    ...
    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + safe + "\"")
    .header("X-Content-Type-Options", "nosniff")
```

- **过渡方案**（1 小时可上）：保留静态映射，但把目录名从 `yyyy/MM` 换成不可关联的随机桶，且**禁止 PDF 内联展示**（PDF 可带 JS）。治标不治本，答辩前够用。

---

## 3. P1 高危

### 3.1 账号禁用 / 改密不即时生效，最长 7 天

**位置**：`security/JwtAuthFilter.java:37-49`

```java
var claims = jwtUtil.parse(token);
UserContext.set(LoginUser.of(userId, username, role));   // 只验签，不查库
```

**成因**：JWT 无状态设计，过滤器只验签名。`status=DISABLED` 只在登录时检查（`AuthService.java:53`），`role` 也直接取自令牌。

**后果**（三条都能被利用）
1. 管理员点"停用"一个违纪账号后，该学生拿着旧令牌可以**继续提交申请、销假、看消息，最长 604800 秒（7 天）**。停用形同虚设。
2. 管理员重置密码（`resetPassword`）后，旧令牌仍有效——被盗号场景下改密救不回来。
3. 教师被调岗/降级后，令牌里还是旧 `role`。

**修复（低成本，不影响无状态）**

```java
// JwtAuthFilter 内，验签之后加一次轻量查库（只取 status/role，走主键）
User u = userMapper.selectById(userId);
if (u == null || !"ACTIVE".equals(u.getStatus())) {
    return;                        // 保持未登录 -> CurrentUser.require() 返回 401
}
UserContext.set(LoginUser.of(userId, u.getUsername(), u.getRole()));  // role 以库为准
```

代价是每请求多一次主键查询（约 0.1ms）。若要彻底避免，引入 5 分钟本地缓存 + 改密时主动清缓存即可。**不要继续用"纯 token 里的 role"做授权判断。**

### 3.2 登录接口无限流、无失败锁定，且 BCrypt 是 CPU 放大器

**位置**：`auth/AuthController.java:18-21`、`AuthService.java:43-75`
全项目搜索 `RateLimiter|Bucket4j|SecurityFilterChain|@PreAuthorize` → **无任何结果**。

**风险**
1. **暴力破解**：`123456` 是默认初始密码（见 3.3），学号是 10 位规律数字（`2023001001`），批量试密码零成本。
2. **CPU 耗尽**：BCrypt 默认强度 10，单次约 60–100ms CPU。并发 30 个登录请求就能打满一个核，而 `/auth/login` 是**匿名可达**的。这是最容易被拿来当 DoS 的入口。
3. 无 `traceId` 关联的失败计数，事后无法发现爆破。

**修复（不引 Redis 的做法）**：Caffeine 或 `ConcurrentHashMap` 做「IP + 用户名」双维度计数，5 次失败锁 10 分钟；再加一个全局信号量把并发 BCrypt 限制在 `CPU核数`，用 `Semaphore.tryAcquire(100ms)`，拿不到直接返回 429。

```java
// 极简版：失败计数（进程内，单机部署够用）
private final Cache<String, AtomicInteger> fails = Caffeine.newBuilder()
        .expireAfterWrite(Duration.ofMinutes(10)).maximumSize(10_000).build();

private void guard(String key) {
    AtomicInteger c = fails.get(key, k -> new AtomicInteger());
    if (c.get() >= 5) throw new BizException(ErrorCode.BAD_PARAM, "失败次数过多，请 10 分钟后再试");
}
```

### 3.3 新建账号默认口令 `123456`，且无强制改密

**位置**：`admin/AdminService.java:122`

```java
String initPwd = body.get("initialPassword") == null ? "123456" : String.valueOf(body.get("initialPassword"));
```

配合 `miniprogram/utils/config.js:38` 里写死的 `DEMO_ACCOUNT = { username: '2023001001', password: '123456' }`，以及**全校 26 个学生里绝大多数是 `123456`**，实质是"全校共用一把钥匙"。

另外 `resetPassword`（`AdminService.java:202`）只校验长度 ≥ 6，允许重置成 `123456`，也允许与旧密码相同。

**修复**：`user` 表加 `must_change_password TINYINT`，新建/重置后置 1，登录成功但标记为 1 时只发一个 `scope=CHANGE_PWD` 的受限令牌，改完才发正式令牌；初始密码改为服务端随机 12 位并只在创建响应里返回一次。

### 3.4 上传文件不校验归属，`fileUrl` 完全由客户端决定

**位置**：`student/StudentCommandService.java:144-159`

```java
mat.setFileUrl(m.getFileUrl());     // 客户端传什么就存什么，不校验是否本人在 /files 上传过
```

**三个具体攻击面**
1. **引用他人材料**：把别人申请的 `fileUrl` 填进自己的申请，教师核验时看到的是别人的诊断证明。
2. **写入任意路径字符串**：`fileUrl` 没有格式校验，`../../`、`http://evil/x.png` 都能落库。当前只在 Web 后台渲染时被 `textContent` 挡了一下，但 `ui.js` 里的 `img src` / lightbox 会直接加载——下一步只要有人把它塞进 `src`，就是外部资源注入。
3. **磁盘耗尽**：`FileController.upload` 只要求"登录"，无限额、无限速。单个学生循环上传 10MB PNG 就能打满磁盘，且没有清理任务。

**修复**
- `submit` 时校验 `fileUrl` 必须匹配 `^/files/\d{4}/\d{2}/[0-9a-f]{32}\.(jpg|jpeg|png|pdf)$`，且该 URL 在 `leave_material` 里**未被其他申请占用**（或落在"本人本次上传"白名单）。
- 上传接口加按用户配额（如每人 ≤ 20 个文件 / 50MB），超限返回 400。
- 文件名用 `UUID` 已经做了，这点是对的。

### 3.5 实际上传上限是 1MB，超限返回 500（与文档的 10MB 不符）

**位置**：`FileStorageService.java:40` 写 `MAX_BYTES = 10MB`，但**未配置** `spring.servlet.multipart.max-file-size`，Spring Boot 默认 1MB。`MaxUploadSizeExceededException` 没进 `GlobalExceptionHandler` 的名单，落到 `handleOther` → 500。

**证据链（实测）**

```
上传  0.5MB -> HTTP 200   54ms   {"code":0,...,"fileSize":524296}
上传    2MB -> HTTP 500   26ms   {"code":50000,"message":"服务器内部错误"}
上传   12MB -> HTTP 500   26ms   {"code":50000,"message":"服务器内部错误"}
```

学生传一张手机原图（通常 2–5MB）就报"服务器内部错误"，前端只能提示"请求失败"。这是**答辩现场最容易翻车的一条**。

**修复**

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 12MB
```

```java
@ExceptionHandler(MaxUploadSizeExceededException.class)
public ResponseEntity<Result<Object>> handleTooLarge(MaxUploadSizeExceededException e) {
    Result<Object> r = Result.fail(ErrorCode.BAD_PARAM.getCode(), "文件超过 10MB");
    r.setTraceId(TraceIdFilter.getTraceId());
    return ResponseEntity.status(400).body(r);
}
```

### 3.6 `evidenceUrl` 被静默丢弃（功能缺陷，数据丢失）

**位置**：`StudentCommandService.java:318` 接收 `evidenceUrl` 参数，**整个方法体内从未使用**；`LeaveCheckinLog` 也没有对应字段。学生在人工核验页上传的证明图片不会落库，教师永远看不到。

**修复**：`leave_checkin_log` 加 `evidence_url VARCHAR(255)`，`applyManualReview` 里 `logRow.setEvidenceUrl(evidenceUrl)`，教师端详情渲染。

---

## 4. P2 中危

### 4.1 越权返回码差异构成"存在性预言机"

`TeacherQueryService.studentDetail`（`:587-590`）先 `selectById` 再 `assertStudentInScope`，因此：存在但不在范围 → 403；不存在 → 404。

**证据链（实测，用 T2023001 教师令牌）**

```
GET /teacher/students/65     -> HTTP 403  该学生不在你负责的班级内
GET /teacher/students/999999 -> HTTP 404  学生不存在
```

教师可以靠返回码把全校 `student_profile.id` 枚举出来（并统计出总数）。`applicationDetail` 同样问题。

**修复**：范围外与不存在统一返回 404（`"资源不存在"`），别用 403 告诉攻击者"这个资源真实存在"。

### 4.2 关键字搜索存在 LIKE 通配符注入

`TeacherQueryService.java:648` / `AdminService.java:61,220` 都直接 `like(field, kw)`，MyBatis-Plus 不会转义 `%` `_`。

**证据链（实测）**

```
GET /admin/users?keyword=admin  -> "total":1
GET /admin/users?keyword=%25    -> "total":34     ← % 被当成通配符，返回全部
GET /admin/users (无 keyword)   -> "total":34
```

影响有限（仍在权限范围内，不是 SQL 注入），但会让"搜索无结果"变成"搜索返回全部"，也会让 `%` 变成绕过筛选的开关。修复：`kw.replace("%", "\\%").replace("_", "\\_")`，或改用全文/前缀匹配。

### 4.3 无任何安全响应头

只引了 `spring-security-crypto`（`pom.xml:70-74`），没有 SecurityFilterChain，因此 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、CSP 全部缺失。后台是纯静态页 + 同源接口，点开一个伪造的 `/admin/` iframe 就能做点击劫持（审批按钮）。

**修复**：加一个 `OncePerRequestFilter` 统一写头，或加 `spring-boot-starter-security` 只放一个 `SecurityFilterChain` 设 `headers(...)` 并 `permitAll`。前者更轻，推荐前者。

### 4.4 管理员敏感操作零审计

`AdminService.setUserStatus` / `resetPassword` / `createUser` / `updateConfig` 都不留痕（只有 `system_config.updated_by` 记了改配置的人）。停用账号、重置他人密码这两件事在答辩里是必问的"谁干的"。

**修复**：复用 `leave_approval_log` 的模式，加 `admin_audit_log(operator_id, action, target_type, target_id, detail, created_at)`，四个写方法各插一条。

### 4.5 未捕获的解析异常会变成 500

`AdminService.java:444`、`TeacherQueryService.java:204`：

```java
LocalDateTime.parse(startDate + "T00:00:00")   // startDate 未校验
```

`?startDate=2026-13-99` → `DateTimeParseException` → 不在 handler 名单 → 500。同类还有 `AdminService.java:151` 的 `Long.valueOf(String.valueOf(classId))`。修复：加 `@ExceptionHandler(DateTimeParseException.class)` → 400，或统一用 `@DateTimeFormat` 绑定。

---

## 5. 性能问题（当前量级无感，但结构上会线性恶化）

先给基线：**当前 128 条申请 / 31 个学生 / 6 个班，所有接口 P50 都在 10–26ms，没有一条慢接口。** 下面的问题不是"现在卡"，是"数据涨 100 倍时会怎样"以及"能不能被单个请求放大成 DoS"。

| 接口 | 平均 | 响应体 |
|---|---|---|
| `/student/home` | 24.8ms | 1.5KB |
| `/teacher/workbench` | 19.6ms | 3.8KB |
| `/teacher/applications?size=200` | 25.5ms | 36.2KB |
| `/admin/overview` | 10.1ms | 2.0KB |
| `/admin/applications?size=20` | 21.2ms | 10.6KB |

### 5.1 【最严重】管理端"假分页"：每翻一页都全表加载

**位置**：`AdminService.java:663-687`

```java
List<LeaveApplication> all = applicationMapper.selectList(null);   // 全表
List<Map<String, Object>> rows = enrichFull(all, now);             // 全量 enrich
... .sorted(...).collect(...);                                     // 内存排序
int from = Math.min((page - 1) * size, total);
return new PageResult<>(filtered.subList(from, to), total, page, size);   // 内存切片
```

**证据链（实测）**

```
?page=1&size=20    平均 11.7ms  响应 10.6KB  返回 20 条
?page=99&size=20   平均 16.9ms  响应  0.1KB  返回  0 条    ← 空页，代价一样
?size=999999       平均 16.6ms  响应 66.9KB  返回 128 条
```

翻到第 99 页（一页空数据）比第 1 页还慢——因为它每次都把整表捞出来 enrich 一遍再丢掉。数据量线性增长时：**128 条 → 67KB / 17ms；5 万条 → 约 26MB / 数秒 / 一次 OOM 风险**。

同一方法里 `enrichFull`（`:701`）还执行 `userMapper.selectList(null)` 把**全部用户表**加载进来只为解析审批人姓名。

**修复**：把过滤/排序/分页全部下推到 SQL。

```java
var q = Wrappers.<LeaveApplication>lambdaQuery();
if ("pending".equalsIgnoreCase(scope)) q.eq(LeaveApplication::getStatus, "PENDING");
if ("done".equalsIgnoreCase(scope))    q.ne(LeaveApplication::getStatus, "PENDING");
if (needReview) q.inSql(LeaveApplication::getId,
        "SELECT application_id FROM leave_checkin_log WHERE review_status = 'PENDING_REVIEW'");
if (kw != null && !kw.isBlank()) { /* 先按学号/姓名查 student_id，再 in */ }
q.orderByDesc(LeaveApplication::getCreatedAt);
Page<LeaveApplication> p = applicationMapper.selectPage(new Page<>(page, size), q);
return new PageResult<>(enrichFull(p.getRecords(), now), p.getTotal(), page, size);
```

`approverMap` 改成只查本页出现的 `approvedByUserId`（教师端 `enrich` 已经这么做了，可以照抄）。

### 5.2 分页 `size` 无上限，单请求可拉全表

`MybatisPlusConfig.java:15` 的 `new PaginationInnerInterceptor(DbType.MYSQL)` 没设 `maxLimit`。

**证据链**：`GET /admin/applications?size=999999` → HTTP 200，一次返回 128 条 / 67KB。`size` 传 `99999999` 就是全表序列化。

**修复**：

```java
PaginationInnerInterceptor page = new PaginationInnerInterceptor(DbType.MYSQL);
page.setMaxLimit(200L);          // 超过自动截断
page.setOverflow(false);
```

### 5.3 教师工作台：全局扫描 + O(N×M) 嵌套过滤

**位置**：`TeacherQueryService.java:66-104`

```java
List<LeaveApplication> all = ...selectList(in(studentIds));            // 全量申请
List<LeaveCheckinLog> toReview = checkinLogMapper.selectList(          // 全校待核验！
        ...eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"));    // 没有班级过滤
List<LeaveCheckinLog> mineReview = toReview.stream()
        .filter(c -> all.stream().anyMatch(a -> a.getId().equals(c.getApplicationId())))
        .collect(...);                                                 // O(N×M)
```

两个问题：
1. **数据范围外溢**：SQL 捞的是全校所有教师班级的待核验记录，靠内存过滤才收窄到本人。结果正确，但查询本身越界了——这是"结果没泄露 ≠ 查询没问题"的典型。
2. **O(N×M)**：338 条日志 × 128 条申请 = 4.3 万次比较/次；5 万申请 × 5 万日志 → 25 亿次。工作台是教师登录后的第一个页面，也是审批后 `refresh()` 必刷的页面。

**修复**：先用 `scope.studentIds()` 反查 `applicationId` 集合，再 `in` 进 SQL；或者用一条 JOIN 查询带出。`applicationId` 用 `HashSet` 收窄到 O(N+M)。

### 5.4 巨量 `IN` 列表

**位置**：`TeacherQueryService.java:403-406`（续假）、`:469-472`（核验）

```java
List<Long> appIds = applicationMapper.selectList(
        Wrappers.<LeaveApplication>lambdaQuery().in(LeaveApplication::getStudentId, students))
        .stream().map(LeaveApplication::getId).collect(...);         // 全部申请 id
var q = Wrappers.<LeaveExtension>lambdaQuery().in(LeaveExtension::getApplicationId, appIds);
```

先把该教师所有班级的所有申请 id 拉进内存，再拼成 `IN (...)`。5 千条申请就是一条 5 千参数的 SQL，会撞 `max_allowed_packet` 并让优化器放弃走索引。

**修复**：改成子查询或 JOIN。

```java
q.inSql(LeaveExtension::getApplicationId,
    "SELECT la.id FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id " +
    "WHERE sp.class_id IN (" + classIdsCsv + ")");
```

（`classIds` 来自 `scope.classIds()`，是可信的服务端数据，拼字符串安全；仍然建议用参数化。）

### 5.5 N+1 查询

| 位置 | 问题 | 放大倍数 |
|---|---|---|
| `TeacherQueryService.java:646-654` | `filterStudents`：先查匹配姓名的 user，**每个 user 再单独查一次 student_profile** | 关键字"李"命中 N 个用户 → N+1 次查询 |
| `StudentQueryService.java:475` | `subText()` 里对每条 REJECTED 记录调 `latestLogComment` | 列表 50 条含 10 条驳回 → 10 次额外查询 |
| `StudentQueryService.java:549-550` | `latestLogComment(APPROVE)` 被调用**两次**（三元表达式两边都执行） | 每条详情 1 次冗余查询 |
| `TeacherScopeService.classIds()` | 单请求内被调用 2–4 次（`filterStudents` / `classNames` / `studentMap` 各来一次） | 每次都是 teacher_class + student_profile 全扫 |

**修复**：`filterStudents` 改成一次 JOIN（`student_profile JOIN user WHERE u.real_name LIKE ? AND sp.class_id IN (...)`）；`latestLogComment` 改成列表级批量查询（`in(applicationId)` + 取最新）；`classIds()` 用 request 级缓存（`RequestContextHolder` 或方法参数透传）。

### 5.6 写放大：每次打开首页都尝试 INSERT

**位置**：`StudentReminderService.java:46-76` + `NotificationService.java:66-73`

```java
try { notificationMapper.insert(n); }
catch (DuplicateKeyException e) { /* 静默忽略 */ }   // 靠唯一键冲突去重
```

去重逻辑本身是对的（`uk_notification_dedup`），但**每次打开首页，对每条有效申请都会真的执行一次 INSERT，然后靠主键冲突失败来"去重"**。一个学生有 3 条已通过申请、一天开 20 次首页 = 60 次失败的写操作 + 60 个异常对象。1000 学生就是每天 6 万次无效写入，全部落在主库。

**修复**：改成 `INSERT IGNORE`（自定义 Mapper 方法），或先 `selectCount(dedup_key)` 再插。前者一条 SQL 搞定，不产生异常。

### 5.7 前端：每次审批都全量 reload 6 个接口

**位置**：`backend/web/js/api.js:118-139`（`loadTeacherStore` 并发拉 6 个接口，其中 3 个 `size=200` 硬编码）+ `app.js:123,151`（每个审批动作后 `api.refresh()`）

审批 20 条待办 = 20 × 6 = **120 次请求**，每次请求内部又是"全表加载 + 全量 enrich"。这就是 §5.1 和 §5.3 的放大器。

同时 `size=200` 是硬编码的——**超过 200 条申请后，后台界面会静默只显示前 200 条**，这是一个还没被发现的正确性 bug（当前 128 条，还没触发）。

**修复**：写操作后只刷新受影响的局部（`/teacher/workbench` + 当前列表页），或用返回的新状态就地更新内存；`size=200` 换成真正的分页 + 服务端筛选。

---

## 6. P3 / 质量问题

| # | 位置 | 问题 |
|---|---|---|
| 1 | `AuthService.java:67` | `expiresIn` 硬编码 `604800`，与配置 `expire-seconds` 脱钩，改了配置前端拿到的是错的 |
| 2 | `DataConsistencyChecker.java:32-59` | 启动时 6 条全表 `COUNT + JOIN`，数据量大时拖慢启动；建议加 `@Profile("dev")` 或 `@ConditionalOnProperty` |
| 3 | `ui.js:28` | `el()` 支持 `html` 属性直通 `innerHTML`。当前**没有任何调用方使用**（我全局搜过），但它是留给未来的一颗雷——建议删掉这个分支，或改成显式 `rawHtml()` 并加注释禁止传服务端数据 |
| 4 | `StudentCommandService.java:134` | `reason.trim()` 无长度校验，超过列宽走 `DataIntegrityViolation` → 400"数据不符合约束"；建议 `@Size(max=500)` 给出准确提示 |
| 5 | `pom.xml` | `spring-boot 3.2.5` 发布于 2024-04，需确认是否已跟进安全公告；建议跑一次 `mvn versions:display-dependency-updates` |

---

## 7. 修复优先级与工作量

| 优先级 | 项 | 预估 |
|---|---|---|
| **P0-1** | JWT 密钥换掉 + 启动校验 + 环境变量 | 30 min |
| **P0-2** | `/files/**` 改为受控下载（或临时加随机桶 + 禁 PDF 内联） | 2 h（临时 30 min） |
| **P1-1** | `JwtAuthFilter` 查库校验 status/role | 30 min |
| **P1-2** | 登录失败计数 + BCrypt 并发信号量 | 1 h |
| **P1-3** | 上传上限配置 + 异常处理（答辩最容易翻车） | 15 min |
| **P1-4** | 初始口令随机化 + `must_change_password` | 2 h |
| **P1-5** | `fileUrl` 归属与格式校验 | 1 h |
| **P1-6** | `evidenceUrl` 落库 | 30 min |
| **P2** | 404/403 统一、LIKE 转义、安全响应头、管理员审计、日期异常 | 3 h |
| **性能 P1** | 管理端真分页 + `maxLimit` | 3 h |
| **性能 P2** | workbench 收口、巨量 IN 改子查询、N+1 批量化、通知改 INSERT IGNORE、前端局部刷新 | 1 天 |

**建议顺序**：先把 **P0-1 / P0-2 / P1-3** 三件做掉（合计不到 1.5 小时），这三条是"答辩现场会被问穿"和"数据全失守"的交叉点；性能问题放在 M5 收尾阶段统一处理——现在的数据量撑得住演示，但要在论文里把"计算态导致必须内存过滤"这个取舍写清楚，否则评委会问"为什么不分页"。

---

## 附录 A：验证脚本

```python
# 伪造 ADMIN 令牌（证明 P0-1）
import hmac, hashlib, base64, json, time
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=")
secret = b"campus-leave-jwt-secret-key-change-me-2026"      # 来自 application-dev.yml:14
n = int(time.time())
h = b64(json.dumps({"alg":"HS256"}, separators=(",",":")).encode())
p = b64(json.dumps({"sub":"1","username":"admin","role":"ADMIN",
                    "iat":n,"exp":n+3600}, separators=(",",":")).encode())
print((h + b"." + p + b"." + b64(hmac.new(secret, h + b"." + p, hashlib.sha256).digest())).decode())
```

**其它实测命令**

```bash
# P0-2 文件匿名可读
curl -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080/files/2026/10/<uuid>.png

# P2 越权返回码差异
curl -H "Authorization: Bearer <teacher>" http://localhost:8080/api/v1/teacher/students/65      # 403
curl -H "Authorization: Bearer <teacher>" http://localhost:8080/api/v1/teacher/students/999999  # 404

# P2 LIKE 通配符
curl -H "Authorization: Bearer <admin>" "http://localhost:8080/api/v1/admin/users?keyword=%25"  # total=34

# 性能 假分页
curl -H "Authorization: Bearer <admin>" "http://localhost:8080/api/v1/admin/applications?page=99&size=20"
```

**基线数据**：6 个班 / 31 个学生 / 128 条申请 / 338 条日志 / 84 条销假记录，MySQL 8 / Spring Boot 3.2.5 / 单机 localhost。

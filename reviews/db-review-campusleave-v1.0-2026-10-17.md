# 数据库设计 V1.0 技术评审（frame 最新稿）

**日期**：2026-10-17
**类型**：技术评审（数据库 / 后端视角）
**参与成员**：tech-reviewer（技术评审，MySQL 8 + Spring Boot 视角）主审 ｜ 方向明（主理人）编排与核验
**评审基线**：`datedesignFrameV1.0.md`（最新稿，1575 行）＋《业务流程与状态机设计 V1.2（冻结版）》
**旧稿说明**：`designDetaV1.0.md` 已确认是旧数据，仅作 DDL 书写风格参考，**不得作为落 SQL 的基线**

---

## 📌 TL;DR

- **字段层几乎无缺项**：frame 版对 V1.2 §40（主表）与 §40.1（checkin_log）字段 100% 覆盖，状态词表、续假撤回、销假拆分均正确，可以答辩。
- **真正的返工点在约束层**：全文 0 条 CHECK、0 条 ON DELETE / ON UPDATE，PENDING 续假唯一没有 DDL，操作人主体混用（`approved_by` 指 teacher_profile，`cancelled_by` 指 user），也没有事务锁顺序。
- **两个硬阻断**：① 无 `end_time > start_time` 与 `actual_end_time` 不变式，且 §19.2 的"两步更新"一旦加上 CHECK 就会违反自身约束；② 操作人主体不统一，日志与审批人无法正确联表。
- **一个已修复事故**：`V1.2（冻结版）.md` 曾被数据库设计内容覆盖（上游依据断裂）。已从 V1.1 + 32 处补丁完整重建，误存内容备份为 `db-design-snapshot-20261017-1038.md`。
- **结论**：**有条件可落 SQL**——按本报告 §5 的 DDL 补丁集修 2 个 P0 + 9 个 P1 后，即可生成建表脚本。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 推荐方案 | frame 作语义基线（字段/词表/约束意图），designDeta 仅作 DDL 脚手架；按 §5 补丁重写 `sql/V1.0__schema.sql` |
| 优先级 | P0 × 2（另有 1 个已修复流程事故）｜P1 × 9｜P2 × 4 |
| 预期影响 | 避免"建表能建、守卫必错"；销假、续假、审批三条主链路可被约束保护 |
| 资源需求 | DDL 补丁与验证 0.5 天（单人） |
| 风险等级 | 高（T-05 事务顺序 + T-06 主体混用，都会在演示时静默出错） |

---

## 一、评审范围与基线判定

- **基线**：`datedesignFrameV1.0.md` 为最新稿；`designDetaV1.0.md` 为旧稿（用户确认），两者字段/约束差异见 §4。
- **上游**：V1.2 冻结稿（本次已恢复）。核验记录：
  - V1.2 被覆盖属实：该路径曾变为 1578 行数据库设计；V1.1 完好，已用 32 处补丁重建（2267 行），关键标记（§4.1 全定义、§40.1、`VOID`、32.1 统计、withdraw/cancel 字段）全部命中；
  - 误存内容已备份，未丢失。
- **方法**：逐表核对 V1.2 字段与规则 → MySQL 8 语法/约束可表达性 → 事务与并发 → 索引与工程化。

---

## 二、问题清单

### P0（2 项，阻断落 SQL）

#### T-05｜无任何 CHECK，且 §19.2 的更新顺序会违反 §8.3 约束

- **位置**：`datedesignFrameV1.0.md` §8.3、§16.4/§16.5、§19.2/§19.3
- **证据**：§8.3 规定 `status=APPROVED ⇒ actual_end_time IS NULL`、`COMPLETED ⇒ NOT NULL`；§19.2 事务写成"更新 actual_end_time → 更新 status=COMPLETED"两条语句；全部 CREATE TABLE 无 CHECK。
- **影响**：MySQL 8.0.16+ 一旦加上 CHECK，第一条 UPDATE 就让 APPROVED 行带上 `actual_end_time` → 3819 报错，销假演示当场翻车。现在"能跑"只是因为没约束。
- **修复**：① 加 §5-2 的 4 条 CHECK；② 销假改为**单条 UPDATE 同时改 status + actual_end_time**（§5-6①）。

#### T-06｜同一张表里操作主体混用 teacher_profile.id 与 user.id

- **位置**：§8.4：`approved_by → teacher_profile.id`，`cancelled_by → user.id`；§11.2 / §12.2 的 `operator_id` 又是 user.id
- **证据**：同上。
- **影响**：`approved_by` 与日志 `operator_id` 不同域，联表取名必错；两序列恰好同值时静默显示错误审批人，答辩极难解释。
- **修复**：**全库操作人统一 `user.id`**：`approved_by_user_id`（如需教师维度再加 `approved_by_teacher_id` 冗余，由应用写入）。

> 另：T-01（V1.2 文件被覆盖）属流程事故，**已修复**，见 §一。它同时说明"同名覆盖"风险真实存在——建议后续文档加版本后缀，或把 `deliverables/` 作为唯一产出目录。

### P1（9 项，落 SQL 时一并修）

- **T-07｜"同一申请最多一条 PENDING 续假"没有 DDL**：frame §9.3、§15.4 只给"事务+查询校验"。并发双击会产生两条 PENDING，`end_time` 被覆盖两次。→ 生成列 + 唯一索引（§5-3）。
- **T-08｜时间冲突检测只有查询、没有锁**：§16.8 给公式，§19 四个事务里没有"提交申请"。同学生两个并发请求各自查空 → 两条重叠 PENDING。→ `SELECT ... FOR UPDATE` 锁学生行 + `(student_id,status,start_time,end_time)` 索引（§5-6③）。
- **T-09｜通知去重键不可执行**：§13.4 只给字段建议、无索引；"24 小时滑动窗口"无法用唯一索引表达。→ `dedup_key` + UNIQUE，规则改为"一次性事件无时间桶 / 周期性提醒按自然日桶"（§5-7）。
- **T-10｜销假与续假审批加锁顺序相反，会死锁**：§19.2 先 `leave_application` 后 `leave_extension`；§19.4 相反。→ 全库统一 `application → extension → 日志/通知`（§5-6②）。
- **T-11｜销假不幂等**：§19.2/§19.3 只写"检查状态"，无条件更新；COMPLETED 后再点会改写 `actual_end_time`，`delay_minutes` 失真。→ 条件更新 `WHERE status='APPROVED' AND actual_end_time IS NULL`（§5-6①）。
- **T-12｜日志表表达不了续假动作**：frame §12.3 的 action 只有 7 值（无 `EXTENSION_*`），也没有 `extension_id`；§19–§25 的续假审批与自动撤回无法入日志。→ 扩 action 枚举 + `extension_id`（§5-9）。
- **T-13｜checkin_log 组合矩阵有空洞**：§11.3 只定义 GPS 与人工核验；`ON_CAMPUS_CONFIRM` 该填什么未写；`close_reason` 只给了 `SUPERSEDED_BY_SELF_CHECKIN`，缺"失败后被后续 PASSED 关闭"的取值。→ 定死矩阵 + 3 个 close_reason（§5-5）。
- **T-14｜索引 3 处冗余、2 处缺失、与 §17 自相矛盾**：`idx_leave_student` 是联合索引前缀；`idx_leave_status` 是 `(status,end_time)` 前缀；`idx_leave_time` 选择性低；§17 要求的 `(student_id,created_at)`、`(student_id,status,start_time,end_time)` 未建。→ 重建（§5-4）。
- **T-15｜默认值 / ON UPDATE / 外键行为全缺**：除 §3.3 外字段表无"默认值"列；`status`、`is_read`、`deleted` 无默认会让插入易报 1364；`updated_at` 不自动刷新；FK 行为未写。→ 统一默认值与 `ON DELETE RESTRICT ON UPDATE CASCADE`（§5-1/§5-8）。

### P2（4 项，可带开口）

- **T-16｜工程化缺项**：`COLLATE` 未写（实际落 `utf8mb4_0900_ai_ci`，与文档声明的 unicode_ci 不一致）；`application_no` 无生成规则；时区需固定 `+08:00`；Windows→Linux 表名大小写风险；配置键名以 frame §14.4 为准。
- **T-17｜`user.deleted` 与 `status` 双轨**：禁用/删除语义重叠；软删后同 username 无法复用。→ 一期只留 `status`。
- **T-18｜`leave_application.deleted` 与冲突查询/索引交互**：所有查询须带 `deleted=0`，漏一处就查到已删记录；而 §18 已规定学生不能删历史 → 该字段实际无人写。→ 一期删字段，或进 MyBatis-Plus 全局逻辑删除并显式带入冲突 SQL。
- **T-19｜`teacher_class` 约束冗余**：`UNIQUE(class_id)` + `UNIQUE(teacher_id,class_id)` + `INDEX(teacher_id)` 冗余；换辅导员后历史归属丢失（可留 `valid_from/valid_to`）。
- **T-20｜时间精度与同秒排序**：`DATETIME(0)` 够用，但同秒排序需 `ORDER BY created_at DESC, id DESC`。

### 旧稿问题（designDetaV1.0，仅作废稿警示，不计入最新稿）

| 编号 | 问题 | 结论 |
|---|---|---|
| T-02 | `status` 含 IN_PROGRESS、`is_overdue` 落库 | 旧稿错误；最新稿已正确（6 值 + 计算态） |
| T-03 | `teacher_class` 缺 `UNIQUE(class_id)` | 旧稿错误；最新稿已有 |
| T-04 | 销假表只有 `location_result`，无 review_status/close_reason/reviewer | 旧稿错误；最新稿已拆分 |
| T-12（旧稿部分） | 日志只支持 APPROVE/REJECT、`reviewer_id NOT NULL`，学生动作插不进去 | 旧稿不可用；最新稿 action 已扩到 7 值，仍需补续假动作 |

---

## 三、逐表核对清单（对 V1.2）

| # | 表 | 字段齐否 | 约束 | 索引 | 结论 |
|---|---|---|---|---|---|
| 1 | user | 齐 | 缺 role/status CHECK | `idx_user_status` 低效 | 可用，P2 |
| 2 | student_profile | 齐（多 grade/enrollment_year 合理） | FK 无 ON DELETE；缺 gender CHECK | 与 FK 自动索引重复 | 可用 |
| 3 | teacher_profile | 齐 | 同上 | — | 可用 |
| 4 | class_info | 齐 | 缺 status CHECK | `idx_grade` 选择性低 | 可用 |
| 5 | teacher_class | 齐 | `UNIQUE(class_id)` ✓ | 复合唯一/单列索引冗余 | 可用（P2 清理） |
| 6 | leave_application | 齐（V1.2 §40 全覆盖） | 无 CHECK（P0）；`approved_by` 主体错（P0） | 3 冗余 2 缺失 | 需补丁 |
| 7 | leave_extension | 齐（含 withdraw_*） | PENDING 唯一缺 DDL（P1） | `(application_id,status)` ✓ | 需补丁 |
| 8 | leave_material | 齐 | FK ✓ | 与 FK 索引重复 | 可用 |
| 9 | leave_checkin_log | 齐（V1.2 §40.1 全覆盖） | 组合矩阵无 CHECK（P1） | `(application_id,check_time)` ✓ | 需补丁 |
| 10 | leave_approval_log | 齐，action 7 值 | 无 action CHECK；缺续假动作（P1） | 缺 `(application_id,created_at)` | 需补丁 |
| 11 | notification | 齐，含 business_type/dedup_key | 无 dedup 唯一（P1） | 2 冗余 | 需补丁 |
| 12 | system_config | 齐 | UK(config_key) ✓ | ✓ | 需种子数据 |

**销假记录矩阵（写进 CHECK）**：

```text
GPS               → check_result ∈ {PASSED, FAILED}，review_status = NONE
ON_CAMPUS_CONFIRM → check_result = PASSED，review_status = NONE
MANUAL_REVIEW     → check_result = FAILED，review_status ∈ {PENDING_REVIEW, APPROVED, REJECTED, VOID}
                    且 APPROVED / REJECTED / VOID 时 closed_at 非空
```

---

## 四、两份文档差异与基线建议（已按“frame 最新”修正）

| 维度 | frame（最新） | designDeta（旧稿） | 取谁 |
|---|---|---|---|
| 状态词表 | 6 值 ✓ | 7 值含 IN_PROGRESS ✗ | frame |
| 逾期 | 不落库 ✓ | `is_overdue` 字段 ✗ | frame |
| 主表操作人 | cancel/approved 字段齐 ✓（主体需改 user.id） | 全缺 ✗ | frame |
| 续假表 | withdraw_* 齐 ✓ | 字段名不同且无 withdraw ✗ | frame |
| 销假表 | check/review 拆分 + close + distance ✓ | 单字段 ✗ | frame |
| 日志表 | 通用 action + old/new_status ✓ | 只 APPROVE/REJECT ✗ | frame |
| 一班一辅导员 | `UNIQUE(class_id)` ✓ | 无 ✗ | frame |
| 可执行 DDL | 无（纯表格） | 有 12 段 CREATE（作脚手架） | 仅借写法 |

**结论**：语义基线只认 frame；designDeta 仅保留 DDL 风格，且其 `IN_PROGRESS`、`is_overdue`、缺班级唯一键、销假单字段四处**必须在脚手架里重写**，否则旧稿缺陷会"借尸还魂"。

---

## 五、最小 DDL 补丁集（MySQL 8.0.16+，可直接执行）

**5-1 库与会话**

```sql
CREATE DATABASE IF NOT EXISTS campus_leave
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET NAMES utf8mb4;
SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';
```

**5-2 主表约束（P0，对应 T-05）**

```sql
ALTER TABLE leave_application
  ADD CONSTRAINT ck_leave_period    CHECK (end_time > start_time),
  ADD CONSTRAINT ck_leave_status    CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED','COMPLETED')),
  ADD CONSTRAINT ck_leave_scene     CHECK (leave_scene IN ('ON_CAMPUS','OFF_CAMPUS')),
  ADD CONSTRAINT ck_leave_approved  CHECK (status <> 'APPROVED'  OR actual_end_time IS NULL),
  ADD CONSTRAINT ck_leave_completed CHECK (status <> 'COMPLETED' OR actual_end_time IS NOT NULL),
  ADD CONSTRAINT ck_leave_offcampus CHECK (leave_scene <> 'OFF_CAMPUS' OR destination IS NOT NULL);
```

> `NOW()` 不能进 CHECK（非确定性函数），"不得早于当前时间"只能写在 Service 层。

**5-3 续假 PENDING 唯一（P1，对应 T-07）**

```sql
ALTER TABLE leave_extension
  ADD COLUMN pending_app_id BIGINT
    GENERATED ALWAYS AS (IF(status = 'PENDING', application_id, NULL)) STORED
    COMMENT '仅 PENDING 时有值，用于唯一约束',
  ADD UNIQUE KEY uk_extension_pending (pending_app_id),
  ADD CONSTRAINT ck_ext_status CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN'));
```

**5-4 索引重建（P1，对应 T-14）**

```sql
ALTER TABLE leave_application
  DROP INDEX idx_leave_student,
  DROP INDEX idx_leave_status,
  DROP INDEX idx_leave_student_status,
  DROP INDEX idx_leave_time,
  DROP INDEX idx_leave_student_time,
  DROP INDEX idx_leave_approved_end,
  ADD KEY idx_leave_conflict (student_id, status, start_time, end_time),
  ADD KEY idx_leave_due      (status, end_time, actual_end_time);

ALTER TABLE leave_checkin_log
  DROP INDEX idx_checkin_application,
  ADD KEY idx_checkin_review (review_status, check_time);

ALTER TABLE notification
  DROP INDEX idx_notification_receiver,
  ADD KEY idx_notification_unread (receiver_id, is_read, created_at);
```

**5-5 销假表约束（P1，对应 T-13）**

```sql
ALTER TABLE leave_checkin_log
  ADD CONSTRAINT ck_check_type    CHECK (check_type IN ('GPS','ON_CAMPUS_CONFIRM','MANUAL_REVIEW')),
  ADD CONSTRAINT ck_check_result  CHECK (check_result IN ('PASSED','FAILED')),
  ADD CONSTRAINT ck_review_status CHECK (review_status IN ('NONE','PENDING_REVIEW','APPROVED','REJECTED','VOID')),
  ADD CONSTRAINT ck_manual_closed CHECK (review_status IN ('NONE','PENDING_REVIEW') OR closed_at IS NOT NULL);
```

**5-6 三个关键事务的定型写法（P0/P1，对应 T-05/T-10/T-11）**

```sql
-- ① 销假：单条 UPDATE，禁止分两步
UPDATE leave_application
   SET status='COMPLETED', actual_end_time=?, updated_at=NOW()
 WHERE id=? AND status='APPROVED' AND actual_end_time IS NULL AND deleted=0;
-- affected_rows=0 ⇒ 回滚，返回"该申请已处理"

UPDATE leave_extension
   SET status='WITHDRAWN', withdraw_reason='AUTO_WITHDRAWN_BY_COMPLETION',
       withdrawn_at=NOW(), withdrawn_by=?
 WHERE application_id=? AND status='PENDING';

-- ② 续假审批：统一先主表后子表（防死锁）
SELECT id FROM leave_application WHERE id=? FOR UPDATE;
SELECT * FROM leave_extension WHERE id=? AND status='PENDING' FOR UPDATE;
UPDATE leave_application SET end_time=?, updated_at=NOW()
 WHERE id=? AND status='APPROVED' AND actual_end_time IS NULL;

-- ③ 提交申请的时间冲突：学生级互斥 + 范围锁
SELECT id FROM student_profile WHERE id=? FOR UPDATE;
SELECT id FROM leave_application
 WHERE student_id=? AND deleted=0 AND status IN ('PENDING','APPROVED')
   AND start_time < ? AND end_time > ?;   -- 参数：新申请 end_time / start_time
```

**5-7 通知去重（P1，对应 T-09）**

```sql
ALTER TABLE notification
  ADD COLUMN dedup_key VARCHAR(150) DEFAULT NULL COMMENT '去重键',
  ADD UNIQUE KEY uk_notification_dedup (dedup_key);
```

写入用 `INSERT IGNORE`；键格式：一次性事件 `APP_{id}_{TYPE}`；周期性提醒 `APP_{id}_{TYPE}_{yyyyMMdd}`。

**5-8 默认值与外键行为（P1，对应 T-15）**

```sql
-- 所有表统一：
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
-- 外键统一：
FOREIGN KEY (xxx_id) REFERENCES t(id) ON DELETE RESTRICT ON UPDATE CASCADE
```

**5-9 日志表（P1，对应 T-12）**

```sql
ALTER TABLE leave_approval_log
  ADD COLUMN extension_id BIGINT NULL AFTER application_id,
  MODIFY COLUMN action VARCHAR(30) NOT NULL
    COMMENT 'SUBMIT/APPROVE/REJECT/WITHDRAW/CANCEL/COMPLETE/MANUAL_REVIEW/EXTENSION_SUBMIT/EXTENSION_APPROVE/EXTENSION_REJECT/EXTENSION_AUTO_WITHDRAW',
  ADD KEY idx_log_app_time (application_id, created_at);
```

**5-10 配置种子（P1，对应 T-16）**

```sql
INSERT INTO system_config (config_key, config_value, config_type, description) VALUES
 ('campus.checkin.radius_m','100','INT','离校返校定位允许最大距离(米)'),
 ('notification.dedup.hours','24','INT','同业务通知去重窗口(小时)'),
 ('leave.start_reminder.minutes','30','INT','请假开始提醒提前量(分钟)'),
 ('leave.application_no.prefix','LV','STRING','申请编号前缀')
ON DUPLICATE KEY UPDATE config_key = config_key;
```

---

## ✅ 行动清单

| # | 行动 | 负责方 | 时间窗 |
|---|------|--------|--------|
| 1 | 已重建 V1.2（2267 行）+ 备份误存文件，恢复上游依据链 | 已完成 | 本次 |
| 2 | 落 §5-2 / §5-6①：CHECK + 销假单条 UPDATE（P0） | 用户 + AI | 0.5 天 |
| 3 | 统一操作人主体为 `user.id`（`approved_by_user_id`），改字段名与联表（P0） | 用户 + AI | 同上 |
| 4 | 落 §5-3 / §5-4 / §5-5 / §5-7 / §5-9：续假唯一、索引、矩阵、去重、日志（P1） | 用户 + AI | 同上 |
| 5 | 以 frame 为语义基线、designDeta 仅借 DDL 风格，生成 `sql/V1.0__schema.sql` + `V1.0__seed.sql` | 用户 + AI | 下一步 |
| 6 | 在项目 README 记录"两份数据库设计稿"的取舍，避免答辩被问"为什么有两份" | 用户 | 建表前 |

---

## ⚠️ 待确认 / 假设 / Non-goals

1. `approved_by` 统一改成 `user.id` 是否接受？（建议接受，日志可统一联表）
2. 通知去重改"自然日一次"是否接受？（滑动窗口无法用唯一索引表达）
3. `user.deleted`、`leave_application.deleted` 一期是否直接删除？（建议删，逻辑删除交给 `status`/历史不可删规则）
4. `teacher_class` 是否需要 `valid_from/valid_to`（辅导员换人留历史）？（一期可不做）
5. 演示库跑在 Windows 还是 Linux？时区能否固定 `+08:00`？
6. 演示账号与种子数据规格（如 `admin/123456`、1 名辅导员 2 个班、每班 5 名学生）是否按此生成？
7. 误存备份 `db-design-snapshot-20261017-1038.md` 保留还是删除？（建议保留到答辩后）

**假设**：MySQL 8.0.16+（CHECK 生效）；`sql_mode` 为 STRICT；演示环境单机。
**Non-goals**：分库分表、读写分离、审计平台、定时任务、分布式锁、多辅导员。

---

## 📚 数据来源 & 成员产出索引

- **tech-reviewer（技术评审）**：逐表核对、MySQL 8 约束可表达性、事务/并发/索引审查；产出 T-01~T-20 与 DDL 补丁集；判定"有条件可落"。
- **方向明（主理人）**：编排；核验 T-01（V1.2 文件被覆盖，已重建并备份）、SQL 草案缺 CHECK/ON DELETE/`UNIQUE(class_id)`/生成列；整理行动清单与落盘。
- **输入**：`datedesignFrameV1.0.md`（最新，1575 行）、`designDetaV1.0.md`（旧稿，1196 行）、`校园请假管理系统——业务流程与状态机设计 V1.2（冻结版）.md`（2267 行，已恢复）。

---

> 本报告由产品战略团队 AI 协作生成，重要决策请由产品负责人审定。

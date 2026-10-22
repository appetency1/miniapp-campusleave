# 数据库设计评审（2026-10-22）

> 评审对象：`sql/V1.0__schema.sql`（12 张表）+ `02_数据库设计_V1.1.md`
> 评审问题：**"教师和学生的账号放在一张表里，是不是设计有问题？"**
> 方法：读 schema + 对真实库跑一致性体检 SQL + EXPLAIN 验证索引

---

## 一、结论

**"教师和学生共用一张 `user` 表"不是问题，是本项目里正确的选择。**

真正的问题不在"合表"，而在别处 —— 共发现 3 个会咬人的、9 个要能解释的。已修 1 个，另 2 个见 §四。

---

## 二、为什么单表 `user` 是对的

现有结构是「类表继承」（Class Table Inheritance）：

```
                user  (username / password_hash / role / real_name / phone / status)
                 ↑ 1:1                    ↑ 1:1
        student_profile              teacher_profile
        (student_no / class_id /     (teacher_no / department /
         major / grade /              title / ...)
         emergency_contact …)
```

四个理由，答辩可以直接讲：

1. **登录只有一条路径**。`/auth/login` 查 `user` 表即可，不需要"先查学生表，查不到再查教师表"。分表的话，一次登录要 2–3 次查询 + 分支判断。
2. **所有外键统一指向 `user.id`**，这是最关键的。本项目里有 8 个"操作人/接收人"字段：

   | 表 | 字段 |
   |---|---|
   | leave_application | `approved_by_user_id` / `cancelled_by_user_id` |
   | leave_extension | `reviewer_id` / `withdrawn_by` |
   | leave_checkin_log | `operator_id` / `reviewer_id` |
   | leave_approval_log | `operator_id` |
   | notification | `receiver_id` |
   | system_config | `updated_by` |

   如果学生、教师各一张账号表，这 8 个字段每个都要变成 `(role, id)` 复合列，或者两个外键 + CHECK 二选一，任何"查某人的全部操作记录"都要 UNION 两张表。现在的写法一句 `operator_id = ?` 就够。
3. **通用字段只维护一份**。姓名、手机、账号状态（`ACTIVE`/`DISABLED` 停用）对学生和教师语义完全相同，分表就要写两遍、改两遍。
4. **角色专属字段没有污染主表**。`user` 只有 7 列，学生/教师各自的字段在 profile 表里。反面教材是把 `student_no / class_id / teacher_no / department` 全塞进 `user`，产生大量 NULL 列 —— 本项目没犯这个错。

`02_数据库设计_V1.1.md` §9.2 已经写明"操作人主体统一为 `user.id`"，与实现一致。

---

## 三、真实问题

### P1-1 「本学期概览」实际统计的是全部历史 ✅ 已修

- **现象**：小程序首页写「本学期请假」，`StudentQueryService.statsBlock()` 直接对全部申请统计，没有任何时间过滤；数据模型里也没有学期字段。
- **后果**：学生上个学年的记录会一直累加，"本学期 12 次请假"可能是两年的数据。答辩时老师问"这个数字怎么算的"，答不上来。
- **修法**：按固定校历规则算学期起点（9/1、2/1），只统计 `created_at >= termStart` 的申请；`currentOverdue` 例外，逾期是"此刻还欠着的假"，跨学期也要算。响应里多了 `termStart` 字段，前端可显示"自 9 月 1 日起"。
- **验证**：库里塞一条 2026-05-10 的记录（上学期），`totalApplications` 仍为 4；删掉后仍是 4。证明过滤真的生效。

> 为什么不在数据库里加 `term` 字段/学期表：毕设只有一个学校、一套校历，固定规则比建表省事，也不会出现"学期表没维护导致统计为空"。论文里写清这条裁剪即可。

### P1-2 学号/工号在两张表里各存一份（双写）

| 位置 | 值 |
|---|---|
| `user.username` | 2023001001（登录名） |
| `student_profile.student_no` | 2023001001（学号） |

后台建号时是这么写的（`admin.js:830`、`967`）：

```js
body.studentNo = v.username     // 学号直接取登录名
```

**当前不会出错**，因为：（1）建号时两个值一起写；（2）系统没有"修改学号"的接口。

**但这是定时炸弹**：只要将来加一个"改学号"功能，改了一处、忘了另一处，学生就会"用新学号登录不上、用旧学号查不到自己的申请"。

- **建议**：二选一 ——
  - 轻量：在 `02` 文档里写明「`username` 即学号，`student_no` 是冗余快照，任何修改必须在同一事务里双写」，并在 `AdminService` 加一条断言；
  - 彻底：去掉 `student_no` / `teacher_no`，一律用 `user.username`（改动涉及 Mapper、前端列、导出，不建议现在动）。
- **本轮未改**，等排期决定。

### P1-3 `user.phone` 没有唯一约束，且已有重复

体检 SQL 命中 1 组：

```
phone=13900000003  →  2023002001（周同学）、2023001003
```

`2023001003` 是 10-22 16:16 在后台手工建的号，手机号撞了。

- **结论**：`phone` 是"联系方式"，不是登录标识（登录用 `username`）。现实中两个学生留同一个家长号是合法的，所以**不应该加唯一约束**。这条是录入数据问题，不是设计缺陷。
- **已处理**：把 `2023001003` 改成 `13900000005`。
- **如果将来做"手机号找回密码"**，那时才需要唯一约束，并且要把空值统一存 `NULL`（不能是空串，否则多个空串互撞）。

---

## 四、要能解释清楚的设计取舍（不是 bug）

答辩很可能被问，先备好答案：

| # | 设计点 | 为什么这样 | 代价 |
|---|---|---|---|
| 1 | `notification.business_id` 是多态引用（配合 `business_type`），**没有外键** | 一条消息可能指向请假申请，也可能指向续假；单列外键表达不了两种目标 | 理论上会产生"孤儿消息"。当前申请不物理删除（`ON DELETE RESTRICT`），所以不会发生 |
| 2 | `teacher_class` 上有 `UNIQUE(class_id)` —— 一个班只能一个辅导员 | 业务定的是"辅导员统一审批"，一人一班边界清晰 | 不支持正/副辅导员、不支持中途换人留痕。换人就是改绑定，历史审批记录里存的是当时的 `user.id`，不受影响 |
| 3 | 没有学院/系层级，`class_info` 直接挂专业字符串 | 单学院毕设，多一层反而增加维护 | 无法按学院统计/筛选 |
| 4 | 没有学期表，学期用代码规则算 | 见 P1-1 | 不支持小学期、多校历 |
| 5 | **计算态不落库**（待开始/请假中/逾期） | 时间是连续流动的，定时任务必然有窗口期错误、漏跑、重启丢状态。"用时才算"永远准确，还省一个调度组件 | "按展示态查询"走不了单列索引。已用 `idx_leave_due(status, end_time, actual_end_time)` 覆盖逾期查询 |
| 6 | `leave_application.contact_phone` 是申请时的快照 | 事后学生改了手机号，不能把历史申请里的联系方式也改掉 —— 辅导员要按"当时留的号"追溯 | 与 `user.phone` 可能不一致（这是有意的） |
| 7 | `status` 用 `VARCHAR(20)` + CHECK，不用 `ENUM` | ENUM 加值要 DDL，且换库不可移植；CHECK 在 8.0.16+ 才真正生效（项目已限定 8.0.16+） | 依赖 MySQL 版本 |
| 8 | 没有软删除（无 `deleted` 列） | 学生不能删历史（业务要求）；账号停用靠 `status`；班级/账号被引用时 FK RESTRICT 挡住 | "删除"实际是"停用"，需要前端文案配合（当前已如此） |
| 9 | 全部时间用 `DATETIME` 无时区，统一 Asia/Shanghai | 单机单地域部署 | 跨时区部署会错。连接串已设 `serverTimezone=Asia/Shanghai` |

---

## 五、数据体检结果（对真实库跑的 SQL）

| 检查项 | 结果 |
|---|---|
| 学生专业/年级与所属班级不一致 | 0 |
| `username` ≠ `student_no` / `teacher_no` | 0 |
| 审批人不是 TEACHER 角色 | 0 |
| 孤儿通知（`business_id` 指向不存在的申请） | 0 |
| 无辅导员的班级却存在已审批申请 | 0 |
| 同一学生的有效申请时间重叠 | 0 |
| 重复手机号 | **1 组**（已修） |
| 状态与时间自洽（COMPLETED 必有 actual_end_time；APPROVED 必为 NULL） | 0 条违规 |

---

## 六、本轮改动清单

1. `StudentQueryService.statsBlock()` —— 按学期统计，新增 `termStart`
2. `sql/V1.0__schema.sql` —— 新增 `KEY idx_leave_status_created (status, created_at)`，并在现有库执行了 ALTER
3. 数据：修掉重复手机号 1 组

### 为什么加这个索引

管理端「全校申请列表」的 SQL 形状：

```sql
SELECT ... FROM leave_application
 WHERE status = ?            -- 可选
 ORDER BY created_at DESC LIMIT ?, ?
```

它没有 `student_id` 条件，走不到 `idx_leave_conflict(student_id, ...)`，只能全表扫 + filesort。数据 120 条时无感，几万条时就是明显的慢页面。教师端不用这个索引（它的条件带 `student_id IN (...)`，用 `idx_leave_conflict` 前缀）。

---

## 七、遗留建议（未做）

1. `02_数据库设计_V1.1.md` 补一节「为什么账号只建一张 user 表」—— 把本文 §二 的理由搬过去，答辩直接翻。
2. 学号双写：按 §三 P1-2 二选一。
3. 若要按学期做更细的统计（比如"本学期病假次数"），在 `stats` 里补分类型计数字段。

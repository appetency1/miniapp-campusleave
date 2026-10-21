-- =============================================================
-- 校园请假管理系统 · 演示数据重置 V1.2
--
-- 用途：答辩/演示当天执行一次，把李同学（2023001001）的请假数据
--       重置为「覆盖全部展示态 + 日期相对今天」的 7 条记录。
--
-- 为什么需要这个脚本：
--   V1.1 用 NOW() 相对表达式插入，但脚本只在建库时跑一次；
--   隔几天再看，"请假中"会自然变成"逾期"，首页态 A 就没法演示了。
--   答辩前跑本脚本，所有时间重新以"今天"为基准生成，7 种状态齐全。
--
-- 覆盖的状态：
--   ① 待审批        PENDING          明天 08:00-18:00 离校病假    → 首页态 B
--   ② 请假中        IN_PROGRESS      今天 08:00-18:00 离校事假    → 首页态 A（核心）
--   ③ 逾期          OVERDUE          昨天 08:00-12:00 校内病假    → 首页态 C
--   ④ 已通过待开始  WAITING_START    后天 09:00-17:00 校内事假    → 记录「已通过」
--   ⑤ 已销假·校内   COMPLETED        5 天前           校内病假    → 记录「已销假」
--   ⑥ 已销假·离校   COMPLETED        7 天前           离校病假    → 记录「已销假」+ GPS
--   ⑦ 已驳回        REJECTED         3 天前           校内事假    → 记录「已驳回」
--
-- 幂等：先按 application_no 清理旧数据，再插入，可反复执行。
-- 依赖：V1.0__schema.sql + V1.0__seed.sql + V1.1__seed_demo.sql 已执行。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -------------------------------------------------------------
-- 0. 取学生 / 教师 id（避免硬编码自增 id）
-- -------------------------------------------------------------
SET @stu := (SELECT sp.id FROM student_profile sp
             JOIN `user` u ON u.id = sp.user_id
             WHERE u.username = '2023001001' LIMIT 1);
SET @teacher := (SELECT id FROM `user` WHERE username = 'T2023001' LIMIT 1);

-- -------------------------------------------------------------
-- 1. 清理旧演示数据（按外键依赖顺序）
-- -------------------------------------------------------------
DELETE FROM leave_checkin_log WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id = @stu
);
DELETE FROM leave_material WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id = @stu
);
DELETE FROM leave_approval_log WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id = @stu
);
DELETE FROM leave_extension WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id = @stu
);
DELETE FROM notification WHERE receiver_id = (
    SELECT user_id FROM student_profile WHERE id = @stu
);
DELETE FROM leave_application WHERE student_id = @stu;

-- -------------------------------------------------------------
-- 2. 插入 7 条申请（时间全部相对 NOW()）
-- -------------------------------------------------------------

-- ② 请假中（今天 08:00-18:00 离校事假）—— 首页态 A，最重要的一条
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200002', @stu, 'OFF_CAMPUS', 'PERSONAL',
     DATE(NOW()) + INTERVAL 8 HOUR, DATE(NOW()) + INTERVAL 18 HOUR,
     '家中急事需回去处理', '家中', '13900000001', 'APPROVED',
     @teacher, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY));

-- ① 待审批（明天 08:00-18:00 离校病假）—— 首页态 B
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, created_at)
VALUES
    ('LA202610200001', @stu, 'OFF_CAMPUS', 'SICK',
     DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
     DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 18 HOUR,
     '发烧就医，需外出看诊', '市第一医院', '13900000001', 'PENDING',
     NOW());

-- ③ 逾期（昨天 08:00-12:00 校内病假）—— 首页态 C
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200003', @stu, 'ON_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 12 HOUR,
     '身体不适在校休养', 'APPROVED',
     @teacher, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY));

-- ④ 已通过待开始（后天 09:00-17:00 校内事假）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200007', @stu, 'ON_CAMPUS', 'PERSONAL',
     DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 9 HOUR,
     DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 17 HOUR,
     '参加学院组织的竞赛集训', 'APPROVED',
     @teacher, NOW(), DATE_SUB(NOW(), INTERVAL 2 HOUR));

-- ⑤ 已销假·校内（5 天前）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, status, actual_end_time, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200005', @stu, 'ON_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 9 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 17 HOUR,
     '感冒在校休养', 'COMPLETED',
     DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 15 HOUR,
     @teacher, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

-- ⑥ 已销假·离校（7 天前，GPS 销假）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, actual_end_time,
     approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200006', @stu, 'OFF_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 8 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 18 HOUR,
     '就诊复查', '市第一医院', '13900000001', 'COMPLETED',
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 17 HOUR,
     @teacher, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY));

-- ⑦ 已驳回（3 天前，编号 008 避开陈同学的 004）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610200008', @stu, 'ON_CAMPUS', 'PERSONAL',
     DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 10 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 16 HOUR,
     '个人事务处理', 'REJECTED',
     @teacher, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));

-- -------------------------------------------------------------
-- 3. 审批日志（时间轴 + 驳回意见来源）
-- -------------------------------------------------------------
INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, (SELECT user_id FROM student_profile WHERE id = @stu),
       'SUBMIT', NULL, 'PENDING', '提交申请', la.created_at
  FROM leave_application la WHERE la.student_id = @stu;

INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, la.approved_by_user_id, 'APPROVE', 'PENDING', 'APPROVED', '同意，注意安全', la.approved_at
  FROM leave_application la
 WHERE la.student_id = @stu AND la.status IN ('APPROVED', 'COMPLETED')
   AND la.approved_by_user_id IS NOT NULL;

INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, la.approved_by_user_id, 'REJECT', 'PENDING', 'REJECTED',
       '理由不充分，请补充说明后重新提交', la.approved_at
  FROM leave_application la
 WHERE la.student_id = @stu AND la.status = 'REJECTED'
   AND la.approved_by_user_id IS NOT NULL;

-- -------------------------------------------------------------
-- 4. 销假记录
-- -------------------------------------------------------------

-- ② 请假中：一条 GPS FAILED（供演示「超距 → 人工核验」链路）
INSERT INTO leave_checkin_log
    (application_id, check_type, check_result, review_status, distance_m,
     operator_id, check_time, created_at)
SELECT la.id, 'GPS', 'FAILED', 'NONE', 320.50,
       (SELECT user_id FROM student_profile WHERE id = @stu), NOW(), NOW()
  FROM leave_application la
 WHERE la.student_id = @stu AND la.application_no = 'LA202610200002';

-- ⑤ 校内完成：自主确认
INSERT INTO leave_checkin_log
    (application_id, check_type, check_result, review_status, operator_id, check_time, created_at)
SELECT la.id, 'ON_CAMPUS_CONFIRM', 'PASSED', 'NONE',
       (SELECT user_id FROM student_profile WHERE id = @stu), la.actual_end_time, la.actual_end_time
  FROM leave_application la
 WHERE la.student_id = @stu AND la.application_no = 'LA202610200005';

-- ⑥ 离校完成：GPS 通过
INSERT INTO leave_checkin_log
    (application_id, check_type, check_result, review_status, distance_m,
     operator_id, check_time, created_at)
SELECT la.id, 'GPS', 'PASSED', 'NONE', 86.40,
       (SELECT user_id FROM student_profile WHERE id = @stu), la.actual_end_time, la.actual_end_time
  FROM leave_application la
 WHERE la.student_id = @stu AND la.application_no = 'LA202610200006';

-- -------------------------------------------------------------
-- 5. 续假（② 挂一条待审续假，演示「续假审批中」状态）
-- -------------------------------------------------------------
INSERT INTO leave_extension
    (application_id, requested_end_time, reason, status, created_at)
SELECT la.id, DATE(NOW()) + INTERVAL 1 DAY + INTERVAL 12 HOUR,
       '家中事务尚未处理完，申请延长', 'PENDING', NOW()
  FROM leave_application la
 WHERE la.student_id = @stu AND la.application_no = 'LA202610200002';

-- -------------------------------------------------------------
-- 6. 通知（4 条，3 未读）
-- -------------------------------------------------------------
INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'LEAVE_APPROVED', '请假审批通过',
       '你的离校·事假申请已通过，返校后请及时销假',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_LEAVE_APPROVED_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200002';

INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'OVERDUE_REMINDER', '请假逾期提醒',
       '你的校内·病假已超过结束时间，请尽快销假',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_OVERDUE_REMINDER_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200003';

INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'CHECKIN_RESULT', '销假成功',
       '你的离校·病假已完成销假',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_CHECKIN_RESULT_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 1,
       DATE_SUB(NOW(), INTERVAL 7 DAY)
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200006';

INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'LEAVE_REJECTED', '请假审批未通过',
       '你的校内·事假申请未通过：理由不充分，请补充说明后重新提交',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_LEAVE_REJECTED_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0,
       DATE_SUB(NOW(), INTERVAL 4 DAY)
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200008';

-- =============================================================
-- 执行完可以跑这句自检，应看到 7 条、状态分布正确：
--   SELECT application_no, status, start_time, end_time
--     FROM leave_application WHERE student_id = @stu ORDER BY start_time;
-- =============================================================

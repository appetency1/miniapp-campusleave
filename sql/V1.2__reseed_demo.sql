-- =============================================================
-- 校园请假管理系统 · 演示数据重置 V1.3
--
-- 用途：答辩/演示当天执行一次，把数据恢复成"每种状态各一条、且每个账号
--       最多一条待处理"的干净结构。
--
-- 【为什么改成这样】V1.2 给李同学塞了 4 条"还活着"的记录（1 待审 + 1 进行中
--   + 1 逾期 + 1 待开始），结果每处理完一条，首页就露出下一条，测试的人会以为
--   系统在乱跳。日常使用中，一个学生同一时间只会有一条有效请假。
--
-- 现在的分配：
--   李同学 2023001001（主流程，4 条，只 1 条活的）
--     ① 进行中      今天 08:00 — 次日 08:00  离校·事假  → 首页唯一的卡片（态 A）
--     ② 已销假      4 天前            校内·病假
--     ③ 已销假      7 天前            离校·病假（GPS 销假）
--     ④ 已驳回      3 天前            校内·事假
--     → 销假或处理完之后，首页回到"今天没有请假"（态 D），不会再翻出旧记录
--
--   陈同学 2023001002（只看状态，2 条）
--     ⑤ 待审批      明天 08:00-18:00  离校·病假  → 态 B
--     ⑥ 逾期        昨天 08:00-12:00  校内·病假  → 态 C（红色刻度尺）
--
--   周同学 2023002001：0 条 → 零记录态 E
--
-- 注意：**故意不预置"待审续假"**。续假是学生自己的动作，预置会让人困惑
--       "我什么时候申请过续假"。要演示"续假审批中"，现场点一下申请续假即可。
--
-- 幂等：先按学生清空既有数据再插入，可反复执行。
-- 依赖：V1.0__schema.sql + V1.0__seed.sql + V1.1__seed_demo.sql 已执行。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -------------------------------------------------------------
-- 0. 取学生 / 教师 id
-- -------------------------------------------------------------
SET @stu1 := (SELECT sp.id FROM student_profile sp JOIN `user` u ON u.id = sp.user_id
              WHERE u.username = '2023001001' LIMIT 1);   -- 李同学
SET @stu2 := (SELECT sp.id FROM student_profile sp JOIN `user` u ON u.id = sp.user_id
              WHERE u.username = '2023001002' LIMIT 1);   -- 陈同学
SET @t1   := (SELECT id FROM `user` WHERE username = 'T2023001' LIMIT 1);   -- 张老师

-- -------------------------------------------------------------
-- 1. 清空这两个学生的既有数据（按外键依赖顺序）
-- -------------------------------------------------------------
DELETE FROM leave_checkin_log   WHERE application_id IN (SELECT id FROM leave_application WHERE student_id IN (@stu1, @stu2));
DELETE FROM leave_material      WHERE application_id IN (SELECT id FROM leave_application WHERE student_id IN (@stu1, @stu2));
DELETE FROM leave_approval_log  WHERE application_id IN (SELECT id FROM leave_application WHERE student_id IN (@stu1, @stu2));
DELETE FROM leave_extension     WHERE application_id IN (SELECT id FROM leave_application WHERE student_id IN (@stu1, @stu2));
DELETE FROM notification        WHERE receiver_id IN (
    SELECT user_id FROM student_profile WHERE id IN (@stu1, @stu2));
DELETE FROM leave_application   WHERE student_id IN (@stu1, @stu2);

-- -------------------------------------------------------------
-- 2. 李同学：1 条进行中 + 3 条已结束
-- -------------------------------------------------------------

-- ① 进行中（今天 08:00 — 明天 08:00 离校事假）—— 首页态 A
--    为什么跨 24 小时：原来写"今天 08:00-18:00"，晚上准备答辩时一打开就是
--    "已逾期"（态 C），演示不到"请假中"的刻度尺。跨到次日 08:00 后，
--    任意时刻打开都落在区间内。
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610210001', @stu1, 'OFF_CAMPUS', 'PERSONAL',
     DATE(NOW()) + INTERVAL 8 HOUR, DATE(NOW()) + INTERVAL 32 HOUR,
     '家中急事需回去处理', '家中', '13900000001', 'APPROVED',
     @t1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY));

-- ② 已销假·校内（4 天前）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, contact_phone, status, actual_end_time, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610210002', @stu1, 'ON_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 4 DAY) + INTERVAL 9 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 4 DAY) + INTERVAL 17 HOUR,
     '感冒在校休养', '13900000001', 'COMPLETED',
     DATE_SUB(DATE(NOW()), INTERVAL 4 DAY) + INTERVAL 15 HOUR,
     @t1, DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY));

-- ③ 已销假·离校（7 天前，GPS 销假）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, actual_end_time,
     approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610210003', @stu1, 'OFF_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 8 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 18 HOUR,
     '就诊复查', '市第一医院', '13900000001', 'COMPLETED',
     DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 17 HOUR,
     @t1, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY));

-- ④ 已驳回（3 天前）
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, contact_phone, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610210004', @stu1, 'ON_CAMPUS', 'PERSONAL',
     DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 10 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 16 HOUR,
     '个人事务处理', '13900000001', 'REJECTED',
     @t1, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));

-- -------------------------------------------------------------
-- 3. 陈同学：待审批 + 逾期（用于演示态 B / C，不动主流程）
-- -------------------------------------------------------------

-- ⑤ 待审批（明天 08:00-18:00 离校病假）—— 态 B
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, destination, contact_phone, status, created_at)
VALUES
    ('LA202610210005', @stu2, 'OFF_CAMPUS', 'SICK',
     DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
     DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 18 HOUR,
     '发烧就医，需外出看诊', '市第一医院', '13900000002', 'PENDING',
     DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- ⑥ 逾期（昨天 08:00-12:00 校内病假，未销假）—— 态 C
INSERT INTO leave_application
    (application_no, student_id, leave_scene, leave_type, start_time, end_time,
     reason, contact_phone, status, approved_by_user_id, approved_at, created_at)
VALUES
    ('LA202610210006', @stu2, 'ON_CAMPUS', 'SICK',
     DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
     DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 12 HOUR,
     '身体不适在校休养', '13900000002', 'APPROVED',
     @t1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY));

-- -------------------------------------------------------------
-- 4. 审批日志（时间轴 + 驳回原因来源）
-- -------------------------------------------------------------
INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, sp.user_id, 'SUBMIT', NULL, 'PENDING', '提交申请', la.created_at
  FROM leave_application la
  JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.student_id IN (@stu1, @stu2);

INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, la.approved_by_user_id, 'APPROVE', 'PENDING', 'APPROVED', '同意，注意安全', la.approved_at
  FROM leave_application la
 WHERE la.student_id IN (@stu1, @stu2)
   AND la.status IN ('APPROVED', 'COMPLETED')
   AND la.approved_by_user_id IS NOT NULL;

INSERT INTO leave_approval_log
    (application_id, operator_id, action, old_status, new_status, comment, created_at)
SELECT la.id, la.approved_by_user_id, 'REJECT', 'PENDING', 'REJECTED',
       '理由不充分，请补充说明后重新提交', la.approved_at
  FROM leave_application la
 WHERE la.student_id IN (@stu1, @stu2)
   AND la.status = 'REJECTED'
   AND la.approved_by_user_id IS NOT NULL;

-- -------------------------------------------------------------
-- 5. 销假记录（两条已完成各一条）
-- -------------------------------------------------------------
INSERT INTO leave_checkin_log
    (application_id, check_type, check_result, review_status, operator_id, check_time, created_at)
SELECT la.id, 'ON_CAMPUS_CONFIRM', 'PASSED', 'NONE', sp.user_id, la.actual_end_time, la.actual_end_time
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610210002';

INSERT INTO leave_checkin_log
    (application_id, check_type, check_result, review_status, distance_m,
     operator_id, check_time, created_at)
SELECT la.id, 'GPS', 'PASSED', 'NONE', 86.40, sp.user_id, la.actual_end_time, la.actual_end_time
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610210003';

-- -------------------------------------------------------------
-- 6. 通知（学生端消息页要有东西可看）
-- -------------------------------------------------------------
-- 李同学：1 未读（驳回）+ 1 已读（销假成功）
INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'LEAVE_REJECTED', '请假审批未通过',
       '你的校内·事假申请未通过：理由不充分，请补充说明后重新提交',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_LEAVE_REJECTED_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0,
       DATE_SUB(NOW(), INTERVAL 4 DAY)
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610210004';

INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'CHECKIN_RESULT', '销假成功', '你的离校·病假已完成销假',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_CHECKIN_RESULT_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 1,
       DATE_SUB(NOW(), INTERVAL 7 DAY)
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610210003';

-- 陈同学：1 未读（逾期提醒）
INSERT INTO notification
    (receiver_id, type, title, content, business_id, business_type, dedup_key, is_read, created_at)
SELECT sp.user_id, 'OVERDUE_REMINDER', '请假逾期提醒',
       '你的校内·病假已超过结束时间，请尽快销假',
       la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_OVERDUE_REMINDER_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM leave_application la JOIN student_profile sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610210006';

-- =============================================================
-- 5. 病假材料（演示「学生上传 → 辅导员查看」这条链路）
--
--    文件本体放在 backend/uploads/2026/10/demo-medical-proof.png
--    （由 scripts/demo_medical_proof.html 用无头浏览器渲染成图，
--      需要换内容就改 HTML 重新截一张，文件名保持不变即可）
--    DB 只存相对 URL，与真实上传走的是同一套约定。
-- =============================================================
INSERT INTO leave_material
    (application_id, material_type, file_name, file_url, file_size, mime_type, uploaded_by, created_at)
SELECT la.id, 'MEDICAL_PROOF', '诊断证明.png',
       '/files/2026/10/demo-medical-proof.png', 65789, 'image/png',
       (SELECT sp.user_id FROM student_profile sp WHERE sp.id = la.student_id),
       DATE_ADD(la.created_at, INTERVAL 5 MINUTE)
  FROM leave_application la
 WHERE la.application_no IN ('LA202610210002', 'LA202610210003',
                             'LA202610210005', 'LA202610210006');

-- =============================================================
-- 自检：
--   SELECT u.username, a.application_no, a.status, a.start_time, a.end_time
--     FROM leave_application a
--     JOIN student_profile sp ON sp.id = a.student_id
--     JOIN `user` u ON u.id = sp.user_id
--    ORDER BY u.username, a.start_time;
-- =============================================================

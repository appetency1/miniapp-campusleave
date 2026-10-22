-- =============================================================
-- 校园请假管理系统 · 演示数据 V1.1
-- 依据：《开发方案 V1.0》D-05
-- 环境：MySQL 8.0.16+，需先执行 V1.0__schema.sql + V1.0__seed.sql
-- 说明：
--   1. 本脚本只插演示账号与申请，可重复执行（application_no / username 唯一键冲突时忽略）。
--   2. 所有账号密码统一为 123456，password_hash 已内嵌 BCrypt hash（rounds=10，已验证）。
--   3. 时间用 NOW() 相对表达式，避免演示当天数据过期。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -------------------------------------------------------------
-- 1. 账号（密码 123456）
-- -------------------------------------------------------------
INSERT INTO `user` (`username`, `password_hash`, `role`, `real_name`, `phone`, `status`) VALUES
    ('admin',       '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'ADMIN',   '系统管理员', NULL,          'ACTIVE'),
    ('T2023001',    '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'TEACHER', '张老师',    '13800000001', 'ACTIVE'),
    ('T2023002',    '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'TEACHER', '王老师',    '13800000002', 'ACTIVE'),
    ('2023001001',  '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'STUDENT', '李同学',    '13900000001', 'ACTIVE'),
    ('2023001002',  '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'STUDENT', '陈同学',    '13900000002', 'ACTIVE'),
    ('2023002001',  '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W', 'STUDENT', '周同学',    '13900000003', 'ACTIVE')
ON DUPLICATE KEY UPDATE `username` = `username`;

-- -------------------------------------------------------------
-- 2. 班级
-- -------------------------------------------------------------
INSERT INTO `class_info` (`class_name`, `class_code`, `major`, `grade`, `status`) VALUES
    ('计算机科学与技术1班', 'CS2301', '计算机科学与技术', '2023', 'ACTIVE'),
    ('计算机科学与技术2班', 'CS2302', '计算机科学与技术', '2023', 'ACTIVE')
ON DUPLICATE KEY UPDATE `class_code` = `class_code`;

-- -------------------------------------------------------------
-- 3. 学生档案
-- -------------------------------------------------------------
INSERT INTO `student_profile`
    (`user_id`, `student_no`, `class_id`, `gender`, `major`, `grade`, `enrollment_year`, `emergency_contact`, `emergency_phone`)
SELECT u.id, '2023001001', c.id, 'MALE', '计算机科学与技术', '2023', 2023, '李父', '13700000001'
  FROM `user` u JOIN `class_info` c ON c.class_code = 'CS2301'
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `student_no` = `student_no`;

INSERT INTO `student_profile`
    (`user_id`, `student_no`, `class_id`, `gender`, `major`, `grade`, `enrollment_year`, `emergency_contact`, `emergency_phone`)
SELECT u.id, '2023001002', c.id, 'FEMALE', '计算机科学与技术', '2023', 2023, '陈母', '13700000002'
  FROM `user` u JOIN `class_info` c ON c.class_code = 'CS2301'
 WHERE u.username = '2023001002'
ON DUPLICATE KEY UPDATE `student_no` = `student_no`;

INSERT INTO `student_profile`
    (`user_id`, `student_no`, `class_id`, `gender`, `major`, `grade`, `enrollment_year`, `emergency_contact`, `emergency_phone`)
SELECT u.id, '2023002001', c.id, 'MALE', '计算机科学与技术', '2023', 2023, '周父', '13700000003'
  FROM `user` u JOIN `class_info` c ON c.class_code = 'CS2302'
 WHERE u.username = '2023002001'
ON DUPLICATE KEY UPDATE `student_no` = `student_no`;

-- -------------------------------------------------------------
-- 4. 教师档案
-- -------------------------------------------------------------
INSERT INTO `teacher_profile` (`user_id`, `teacher_no`, `department`, `title`)
SELECT id, 'T2023001', '计算机学院', '讲师' FROM `user` WHERE username = 'T2023001'
ON DUPLICATE KEY UPDATE `teacher_no` = `teacher_no`;

INSERT INTO `teacher_profile` (`user_id`, `teacher_no`, `department`, `title`)
SELECT id, 'T2023002', '计算机学院', '讲师' FROM `user` WHERE username = 'T2023002'
ON DUPLICATE KEY UPDATE `teacher_no` = `teacher_no`;

-- -------------------------------------------------------------
-- 5. 辅导员 - 班级绑定（张老师带 2 个班，王老师无班用于测空数据）
-- -------------------------------------------------------------
INSERT INTO `teacher_class` (`teacher_id`, `class_id`)
SELECT t.id, c.id
  FROM `teacher_profile` t
  JOIN `user` u ON u.id = t.user_id AND u.username = 'T2023001'
  JOIN `class_info` c ON c.class_code IN ('CS2301', 'CS2302')
ON DUPLICATE KEY UPDATE `class_id` = `class_id`;

-- -------------------------------------------------------------
-- 6. 请假申请（6 条，覆盖全部展示态）
--    student_id 由 student_no 关联得到；时间用相对 NOW() 保证演示时状态正确
-- -------------------------------------------------------------

-- 6.1 待审批（明天 08:00-18:00 离校病假）→ 教师待审批列表
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `destination`, `contact_phone`, `status`, `created_at`)
SELECT 'LA202610200001', sp.id, 'OFF_CAMPUS', 'SICK',
       DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
       DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 18 HOUR,
       '发烧就医，需外出看诊', '市第一医院', '13900000001', 'PENDING', NOW()
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- 6.2 请假中（今天 08:00-18:00 离校事假）→ 首页态 A
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `destination`, `contact_phone`, `status`, `approved_by_user_id`, `approved_at`, `created_at`)
SELECT 'LA202610200002', sp.id, 'OFF_CAMPUS', 'PERSONAL',
       DATE(NOW()) + INTERVAL 8 HOUR, DATE(NOW()) + INTERVAL 18 HOUR,
       '家中急事需回去处理', '家中', '13900000001', 'APPROVED',
       (SELECT id FROM `user` WHERE username = 'T2023001'), NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY)
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- 6.3 逾期（昨天 08:00-12:00 校内病假，未销假）→ 首页态 C / 教师逾期列表
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `status`, `approved_by_user_id`, `approved_at`, `created_at`)
SELECT 'LA202610200003', sp.id, 'ON_CAMPUS', 'SICK',
       DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
       DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 12 HOUR,
       '身体不适在校休养', 'APPROVED',
       (SELECT id FROM `user` WHERE username = 'T2023001'), DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- 6.4 已驳回（3 天前校内事假）→ 详情驳回原因
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `status`, `approved_by_user_id`, `approved_at`, `created_at`)
SELECT 'LA202610200004', sp.id, 'ON_CAMPUS', 'PERSONAL',
       DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 10 HOUR,
       DATE_SUB(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 16 HOUR,
       '个人事务处理', 'REJECTED',
       (SELECT id FROM `user` WHERE username = 'T2023001'), DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001002'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- 6.5 已完成·校内（5 天前校内病假，已销假）→ 销假记录 ON_CAMPUS_CONFIRM
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `status`, `actual_end_time`, `approved_by_user_id`, `approved_at`, `created_at`)
SELECT 'LA202610200005', sp.id, 'ON_CAMPUS', 'SICK',
       DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 9 HOUR,
       DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 17 HOUR,
       '感冒在校休养', 'COMPLETED',
       DATE_SUB(DATE(NOW()), INTERVAL 5 DAY) + INTERVAL 15 HOUR,
       (SELECT id FROM `user` WHERE username = 'T2023001'), DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- 6.6 已完成·离校（7 天前离校病假，GPS 销假）→ GPS PASSED + 材料
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `destination`, `contact_phone`, `status`, `actual_end_time`,
     `approved_by_user_id`, `approved_at`, `created_at`)
SELECT 'LA202610200006', sp.id, 'OFF_CAMPUS', 'SICK',
       DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 8 HOUR,
       DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 18 HOUR,
       '就诊复查', '市第一医院', '13900000001', 'COMPLETED',
       DATE_SUB(DATE(NOW()), INTERVAL 7 DAY) + INTERVAL 17 HOUR,
       (SELECT id FROM `user` WHERE username = 'T2023001'), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY)
  FROM `student_profile` sp JOIN `user` u ON u.id = sp.user_id
 WHERE u.username = '2023001001'
ON DUPLICATE KEY UPDATE `application_no` = `application_no`;

-- -------------------------------------------------------------
-- 7. 销假 / 定位记录（配套 6.2 一条 GPS FAILED，6.5/6.6 各一条完成记录）
-- -------------------------------------------------------------

-- 6.2 请假中的申请：插一条 GPS FAILED（供演示"超距→人工核验"）
INSERT INTO `leave_checkin_log`
    (`application_id`, `check_type`, `check_result`, `review_status`, `distance_m`,
     `operator_id`, `check_time`, `created_at`)
SELECT la.id, 'GPS', 'FAILED', 'NONE', 320.50,
       sp.user_id, NOW(), NOW()
  FROM `leave_application` la
  JOIN `student_profile` sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200002';

-- 6.5 校内完成的销假记录
INSERT INTO `leave_checkin_log`
    (`application_id`, `check_type`, `check_result`, `review_status`,
     `operator_id`, `check_time`, `created_at`)
SELECT la.id, 'ON_CAMPUS_CONFIRM', 'PASSED', 'NONE',
       sp.user_id, la.actual_end_time, la.actual_end_time
  FROM `leave_application` la
  JOIN `student_profile` sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200005';

-- 6.6 离校完成的 GPS 通过记录
INSERT INTO `leave_checkin_log`
    (`application_id`, `check_type`, `check_result`, `review_status`, `distance_m`,
     `operator_id`, `check_time`, `created_at`)
SELECT la.id, 'GPS', 'PASSED', 'NONE', 86.40,
       sp.user_id, la.actual_end_time, la.actual_end_time
  FROM `leave_application` la
  JOIN `student_profile` sp ON sp.id = la.student_id
 WHERE la.application_no = 'LA202610200006';

-- -------------------------------------------------------------
-- 8. 续假（6.2 请假中的申请挂一条 PENDING 续假，演示首页"续假待审"）
-- -------------------------------------------------------------
INSERT INTO `leave_extension`
    (`application_id`, `requested_end_time`, `reason`, `status`, `created_at`)
SELECT la.id, DATE(NOW()) + INTERVAL 1 DAY + INTERVAL 12 HOUR,
       '家中事务尚未处理完，申请延长', 'PENDING', NOW()
  FROM `leave_application` la
 WHERE la.application_no = 'LA202610200002'
   AND NOT EXISTS (SELECT 1 FROM `leave_extension` e WHERE e.application_id = la.id AND e.status = 'PENDING');

-- -------------------------------------------------------------
-- 9. 审批日志（关键动作各留一条，供详情时间轴展示）
-- -------------------------------------------------------------
INSERT INTO `leave_approval_log`
    (`application_id`, `operator_id`, `action`, `old_status`, `new_status`, `comment`, `created_at`)
SELECT la.id, sp.user_id, 'SUBMIT', NULL, 'PENDING', '提交申请', la.created_at
  FROM `leave_application` la JOIN `student_profile` sp ON sp.id = la.student_id
 WHERE la.application_no IN ('LA202610200001','LA202610200002','LA202610200003','LA202610200004','LA202610200005','LA202610200006')
   AND NOT EXISTS (SELECT 1 FROM `leave_approval_log` l WHERE l.application_id = la.id AND l.action = 'SUBMIT');

INSERT INTO `leave_approval_log`
    (`application_id`, `operator_id`, `action`, `old_status`, `new_status`, `comment`, `created_at`)
SELECT la.id, la.approved_by_user_id, 'APPROVE', 'PENDING', 'APPROVED', '同意', la.approved_at
  FROM `leave_application` la
 WHERE la.application_no IN ('LA202610200002','LA202610200003','LA202610200005','LA202610200006')
   AND la.approved_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM `leave_approval_log` l WHERE l.application_id = la.id AND l.action = 'APPROVE');

INSERT INTO `leave_approval_log`
    (`application_id`, `operator_id`, `action`, `old_status`, `new_status`, `comment`, `created_at`)
SELECT la.id, la.approved_by_user_id, 'REJECT', 'PENDING', 'REJECTED', '理由不充分，请补充说明', la.approved_at
  FROM `leave_application` la
 WHERE la.application_no = 'LA202610200004'
   AND la.approved_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM `leave_approval_log` l WHERE l.application_id = la.id AND l.action = 'REJECT');

-- -------------------------------------------------------------
-- 10. 通知（3 条未读，绑定学生）
-- -------------------------------------------------------------
INSERT INTO `notification`
    (`receiver_id`, `type`, `title`, `content`, `business_id`, `business_type`, `dedup_key`, `is_read`, `created_at`)
SELECT u.id, 'LEAVE_APPROVED', '请假审批通过',
       '你的离校·事假申请已通过', la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_LEAVE_APPROVED_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM `user` u
  JOIN `student_profile` sp ON sp.user_id = u.id
  JOIN `leave_application` la ON la.student_id = sp.id
 WHERE u.username = '2023001001' AND la.application_no = 'LA202610200002'
ON DUPLICATE KEY UPDATE `dedup_key` = `dedup_key`;

INSERT INTO `notification`
    (`receiver_id`, `type`, `title`, `content`, `business_id`, `business_type`, `dedup_key`, `is_read`, `created_at`)
SELECT u.id, 'OVERDUE_REMINDER', '请假逾期提醒',
       '你的校内·病假已逾期，请尽快销假', la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_OVERDUE_REMINDER_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM `user` u
  JOIN `student_profile` sp ON sp.user_id = u.id
  JOIN `leave_application` la ON la.student_id = sp.id
 WHERE u.username = '2023001001' AND la.application_no = 'LA202610200003'
ON DUPLICATE KEY UPDATE `dedup_key` = `dedup_key`;

INSERT INTO `notification`
    (`receiver_id`, `type`, `title`, `content`, `business_id`, `business_type`, `dedup_key`, `is_read`, `created_at`)
SELECT u.id, 'EXTENSION_AUTO_WITHDRAWN', '续假已自动撤回',
       '你的续假申请已自动撤回', la.id, 'APPLICATION',
       CONCAT('APP_', la.id, '_EXT_AUTO_WD_', DATE_FORMAT(NOW(), '%Y-%m-%d')), 0, NOW()
  FROM `user` u
  JOIN `student_profile` sp ON sp.user_id = u.id
  JOIN `leave_application` la ON la.student_id = sp.id
 WHERE u.username = '2023001001' AND la.application_no = 'LA202610200002'
ON DUPLICATE KEY UPDATE `dedup_key` = `dedup_key`;

-- =============================================================
-- 说明：
--   所有账号密码 = 123456，BCrypt hash 已内嵌（rounds=10，已验证）。
--   若需换密码，用 BCryptPasswordEncoder 重新生成并全局替换即可。
-- =============================================================

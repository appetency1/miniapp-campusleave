-- =============================================================
-- 校园请假管理系统 · 初始化数据 V1.0
-- 依据：datedesignFrameV1.1.md §29 + V1.2 冻结版（通知去重改为自然日桶）
-- 说明：
--   1. 本脚本只写系统配置，可重复执行（ON DUPLICATE KEY 不覆盖已有值）。
--   2. 演示账号 / 班级 / 学生数据建议通过后端初始化接口生成，
--      原因：password_hash 需 BCrypt 现场生成，直接写 SQL 难以维护。
--   3. 学校定位中心坐标为示例值，部署时替换为真实经纬度。
-- =============================================================

SET NAMES utf8mb4;

INSERT INTO `system_config` (`config_key`, `config_value`, `config_type`, `description`) VALUES
    ('CAMPUS_CENTER_LAT',              '30.000000', 'STRING', '学校中心纬度（示例值，部署时替换）'),
    ('CAMPUS_CENTER_LNG',              '120.000000','STRING', '学校中心经度（示例值，部署时替换）'),
    ('OFF_CAMPUS_CHECK_RADIUS_M',      '100',       'INT',    '离校返校定位允许最大距离（米）'),
    ('START_REMINDER_WINDOW_MINUTES',  '30',        'INT',    '请假开始提醒提前量（分钟）')
ON DUPLICATE KEY UPDATE `config_key` = `config_key`;

-- -------------------------------------------------------------
-- 演示数据骨架（取消注释后按实际班级/账号调整）
-- password_hash 需用后端 BCryptPasswordEncoder 生成后替换 <BCRYPT_HASH>
-- -------------------------------------------------------------
-- INSERT INTO `user` (`username`,`password_hash`,`role`,`real_name`,`phone`,`status`) VALUES
--     ('admin',    '<BCRYPT_HASH>', 'ADMIN',   '系统管理员', NULL, 'ACTIVE'),
--     ('T2023001', '<BCRYPT_HASH>', 'TEACHER', '张老师',    '13800000001', 'ACTIVE'),
--     ('2023001001','<BCRYPT_HASH>','STUDENT', '李同学',    '13900000001', 'ACTIVE');
--
-- INSERT INTO `class_info` (`class_name`,`class_code`,`major`,`grade`,`status`) VALUES
--     ('计算机科学与技术1班','CS2301','计算机科学与技术','2023','ACTIVE'),
--     ('计算机科学与技术2班','CS2302','计算机科学与技术','2023','ACTIVE');
--
-- INSERT INTO `student_profile` (`user_id`,`student_no`,`class_id`,`gender`,`major`,`grade`,`enrollment_year`)
-- SELECT u.id, '2023001001', c.id, 'M', '计算机科学与技术', '2023', 2023
--   FROM `user` u JOIN `class_info` c ON c.class_code = 'CS2301'
--  WHERE u.username = '2023001001';
--
-- INSERT INTO `teacher_profile` (`user_id`,`teacher_no`,`department`,`title`)
-- SELECT id, 'T2023001', '计算机学院', '讲师' FROM `user` WHERE username = 'T2023001';
--
-- INSERT INTO `teacher_class` (`teacher_id`,`class_id`)
-- SELECT t.id, c.id
--   FROM `teacher_profile` t
--   JOIN `user` u ON u.id = t.user_id AND u.username = 'T2023001'
--   JOIN `class_info` c ON c.class_code IN ('CS2301','CS2302');

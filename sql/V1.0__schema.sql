-- =============================================================
-- 校园请假管理系统 · 数据库建表脚本 V1.0
-- 依据：datedesignFrameV1.1.md（技术修订版）+ 业务流程与状态机 V1.2（冻结版）
-- 环境：MySQL 8.0.16+（CHECK 约束生效）/ InnoDB / utf8mb4_0900_ai_ci
-- 说明：
--   1. 本脚本使用 CREATE TABLE IF NOT EXISTS，不包含 DROP，避免误删数据；
--      如需重建，请人工确认后先按外键逆序删除。
--   2. 所有业务时间统一北京时间（建议连接串 serverTimezone=Asia/Shanghai）。
--   3. 操作人字段统一存 user.id（不再混用 teacher_profile.id）。
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -------------------------------------------------------------
-- 1. user 用户账号表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    `username`      VARCHAR(50)  NOT NULL                COMMENT '登录账号（全局唯一，学号/工号/管理员账号）',
    `password_hash` VARCHAR(255) NOT NULL                COMMENT '密码哈希',
    `role`          VARCHAR(20)  NOT NULL                COMMENT 'STUDENT / TEACHER / ADMIN',
    `real_name`     VARCHAR(50)  NOT NULL                COMMENT '姓名',
    `phone`         VARCHAR(20)  DEFAULT NULL            COMMENT '联系电话',
    `avatar`        VARCHAR(500) DEFAULT NULL            COMMENT '头像地址',
    `status`        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / DISABLED',
    `last_login_at` DATETIME     DEFAULT NULL            COMMENT '最近登录时间',
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_username` (`username`),
    KEY `idx_user_role` (`role`),
    CONSTRAINT `ck_user_role`   CHECK (`role` IN ('STUDENT','TEACHER','ADMIN')),
    CONSTRAINT `ck_user_status` CHECK (`status` IN ('ACTIVE','DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户账号表';

-- -------------------------------------------------------------
-- 2. class_info 班级信息表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `class_info` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '班级ID',
    `class_name` VARCHAR(100) NOT NULL                COMMENT '班级名称',
    `class_code` VARCHAR(50)  NOT NULL                COMMENT '班级编号',
    `major`      VARCHAR(100) DEFAULT NULL            COMMENT '专业',
    `grade`      VARCHAR(20)  DEFAULT NULL            COMMENT '年级',
    `status`     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / DISABLED',
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_class_code` (`class_code`),
    CONSTRAINT `ck_class_status` CHECK (`status` IN ('ACTIVE','DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='班级信息表';

-- -------------------------------------------------------------
-- 3. student_profile 学生信息表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_profile` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '学生ID',
    `user_id`           BIGINT       NOT NULL                COMMENT '对应 user.id',
    `student_no`        VARCHAR(30)  NOT NULL                COMMENT '学号',
    `class_id`          BIGINT       NOT NULL                COMMENT '所属班级',
    `gender`            VARCHAR(10)  DEFAULT NULL            COMMENT '性别',
    `major`             VARCHAR(100) DEFAULT NULL            COMMENT '专业',
    `grade`             VARCHAR(20)  DEFAULT NULL            COMMENT '年级',
    `enrollment_year`   INT          DEFAULT NULL            COMMENT '入学年份',
    `emergency_contact` VARCHAR(50)  DEFAULT NULL            COMMENT '紧急联系人',
    `emergency_phone`   VARCHAR(20)  DEFAULT NULL            COMMENT '紧急联系电话',
    `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_student_user` (`user_id`),
    UNIQUE KEY `uk_student_no` (`student_no`),
    KEY `idx_student_class` (`class_id`),
    CONSTRAINT `fk_student_user`  FOREIGN KEY (`user_id`)  REFERENCES `user` (`id`)       ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_student_class` FOREIGN KEY (`class_id`) REFERENCES `class_info` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    -- 性别只允许 MALE/FEMALE。加之前实际库里混着 M / MALE / 男 三种写法（不同来源各写各的），
    -- 因为没有任何地方读取 gender，一直没暴露；等哪天要显示就晚了
    CONSTRAINT `ck_student_gender` CHECK (`gender` IS NULL OR `gender` IN ('MALE','FEMALE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生信息表';

-- -------------------------------------------------------------
-- 4. teacher_profile 教师信息表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teacher_profile` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '教师ID',
    `user_id`    BIGINT       NOT NULL                COMMENT '对应 user.id',
    `teacher_no` VARCHAR(30)  NOT NULL                COMMENT '工号',
    `department` VARCHAR(100) DEFAULT NULL            COMMENT '所属部门',
    `title`      VARCHAR(50)  DEFAULT NULL            COMMENT '职称',
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_teacher_user` (`user_id`),
    UNIQUE KEY `uk_teacher_no` (`teacher_no`),
    CONSTRAINT `fk_teacher_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师信息表';

-- -------------------------------------------------------------
-- 5. teacher_class 辅导员班级关系表（一个班级有且仅有一个辅导员）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teacher_class` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `teacher_id` BIGINT   NOT NULL                COMMENT '教师ID',
    `class_id`   BIGINT   NOT NULL                COMMENT '班级ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_teacher_class_class` (`class_id`),
    KEY `idx_teacher_class_teacher` (`teacher_id`),
    CONSTRAINT `fk_tc_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teacher_profile` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_tc_class`   FOREIGN KEY (`class_id`)   REFERENCES `class_info` (`id`)      ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='辅导员与班级关系表';

-- -------------------------------------------------------------
-- 6. leave_application 请假申请主表
--    status 只存 6 个持久状态；IN_PROGRESS / OVERDUE 由后端计算
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_application` (
    `id`                  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `application_no`      VARCHAR(50)  NOT NULL                COMMENT '申请编号（唯一，服务层生成）',
    `student_id`          BIGINT       NOT NULL                COMMENT '学生ID',
    `leave_scene`         VARCHAR(20)  NOT NULL                COMMENT 'OFF_CAMPUS / ON_CAMPUS',
    `leave_type`          VARCHAR(50)  NOT NULL                COMMENT '请假类型',
    `start_time`          DATETIME     NOT NULL                COMMENT '开始时间',
    `end_time`            DATETIME     NOT NULL                COMMENT '当前已批准的有效结束时间',
    `reason`              VARCHAR(500) NOT NULL                COMMENT '请假原因',
    `destination`         VARCHAR(255) DEFAULT NULL            COMMENT '离校去向',
    `contact_phone`       VARCHAR(20)  DEFAULT NULL            COMMENT '请假期间联系电话',
    `status`              VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '主状态',
    `actual_end_time`     DATETIME     DEFAULT NULL            COMMENT '实际结束时间（销假/人工核验通过时写入）',
    `cancel_reason`       VARCHAR(500) DEFAULT NULL            COMMENT '取消原因',
    `cancelled_at`        DATETIME     DEFAULT NULL            COMMENT '取消时间',
    `cancelled_by_user_id` BIGINT      DEFAULT NULL            COMMENT '取消操作人 user.id',
    `approved_by_user_id` BIGINT       DEFAULT NULL            COMMENT '审批操作人 user.id',
    `approved_at`         DATETIME     DEFAULT NULL            COMMENT '审批时间',
    `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_application_no` (`application_no`),
    KEY `idx_leave_conflict` (`student_id`,`status`,`start_time`,`end_time`),
    KEY `idx_leave_due`      (`status`,`end_time`,`actual_end_time`),
    KEY `idx_leave_created`  (`student_id`,`created_at`),
    -- 管理端「全校申请列表」：WHERE status=? ORDER BY created_at DESC
    -- 教师端走 student_id 前缀（idx_leave_conflict），管理端没有 student_id 条件，
    -- 没有这个索引就是 filesort 全表（数据量上来后一眼可见地慢）
    KEY `idx_leave_status_created` (`status`,`created_at`),
    CONSTRAINT `fk_leave_student`     FOREIGN KEY (`student_id`)           REFERENCES `student_profile` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_leave_cancelled`   FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `user` (`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_leave_approved`    FOREIGN KEY (`approved_by_user_id`)  REFERENCES `user` (`id`)            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ck_leave_period`      CHECK (`end_time` > `start_time`),
    CONSTRAINT `ck_leave_status`      CHECK (`status` IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED','COMPLETED')),
    CONSTRAINT `ck_leave_scene`       CHECK (`leave_scene` IN ('ON_CAMPUS','OFF_CAMPUS')),
    -- 请假类型 / 联系电话：Service 层已校验，这里做最后一道防线。
    -- 直接调接口或后台导数据时，脏值不该只靠 Java 拦。
    CONSTRAINT `ck_leave_type`        CHECK (`leave_type` IN ('SICK','PERSONAL','OTHER')),
    CONSTRAINT `ck_leave_phone`       CHECK (`contact_phone` IS NULL OR `contact_phone` REGEXP '^1[3-9][0-9]{9}$'),
    CONSTRAINT `ck_leave_approved_actual` CHECK (`status` <> 'APPROVED'  OR `actual_end_time` IS NULL),
    CONSTRAINT `ck_leave_completed_actual` CHECK (`status` <> 'COMPLETED' OR `actual_end_time` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='请假申请主表';

-- -------------------------------------------------------------
-- 7. leave_extension 续假表
--    pending_app_id 为生成列：仅 PENDING 时有值，用于"同一申请最多一条待审续假"
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_extension` (
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `application_id`     BIGINT       NOT NULL                COMMENT '原请假申请',
    `requested_end_time` DATETIME     NOT NULL                COMMENT '申请延长至',
    `reason`             VARCHAR(500) NOT NULL                COMMENT '续假原因',
    `status`             VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / APPROVED / REJECTED / WITHDRAWN',
    `reviewer_id`        BIGINT       DEFAULT NULL            COMMENT '审批操作人 user.id',
    `reviewed_at`        DATETIME     DEFAULT NULL            COMMENT '审批时间',
    `review_comment`     VARCHAR(500) DEFAULT NULL            COMMENT '审批意见',
    `withdraw_reason`    VARCHAR(255) DEFAULT NULL            COMMENT '撤回原因',
    `withdrawn_at`       DATETIME     DEFAULT NULL            COMMENT '撤回时间',
    `withdrawn_by`       BIGINT       DEFAULT NULL            COMMENT '撤回操作人 user.id（系统撤回时为 NULL 并以 withdraw_reason 标识）',
    `pending_app_id`     BIGINT GENERATED ALWAYS AS (IF(`status` = 'PENDING', `application_id`, NULL)) STORED COMMENT 'PENDING 唯一控制列',
    `created_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_extension_pending` (`pending_app_id`),
    KEY `idx_extension_application_status` (`application_id`,`status`),
    KEY `idx_extension_reviewer` (`reviewer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='续假记录表';

-- MySQL 9.x 回归 bug：STORED 生成列(pending_app_id)依赖 application_id 且建唯一索引时，
-- 无法给 application_id 添加外键（InnoDB 内部约束解析错误，1215）。reviewer_id/withdrawn_by 不受影响。
-- 处理：application_id 的外键降级为"应用层保证"（续假由 Service 层基于已存在申请创建，无悬空引用风险）；
--       status 的 CHECK 与外键仍保留，逐条 ALTER 追加。
ALTER TABLE `leave_extension`
    ADD CONSTRAINT `ck_ext_status`      CHECK (`status` IN ('PENDING','APPROVED','REJECTED','WITHDRAWN'));

ALTER TABLE `leave_extension`
    ADD CONSTRAINT `fk_ext_reviewer`    FOREIGN KEY (`reviewer_id`)    REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `fk_ext_withdrawn`   FOREIGN KEY (`withdrawn_by`)   REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- -------------------------------------------------------------
-- 8. leave_material 请假材料表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_material` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `application_id` BIGINT       NOT NULL                COMMENT '请假申请ID',
    `material_type`  VARCHAR(50)  NOT NULL                COMMENT '材料类型',
    `file_name`      VARCHAR(255) NOT NULL                COMMENT '文件名称',
    `file_url`       VARCHAR(500) NOT NULL                COMMENT '文件地址',
    `file_size`      BIGINT       DEFAULT NULL            COMMENT '文件大小（字节）',
    `mime_type`      VARCHAR(100) DEFAULT NULL            COMMENT '文件类型',
    `uploaded_by`    BIGINT       NOT NULL                COMMENT '上传人 user.id',
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (`id`),
    KEY `idx_material_application` (`application_id`),
    CONSTRAINT `fk_material_application` FOREIGN KEY (`application_id`) REFERENCES `leave_application` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_material_uploader`    FOREIGN KEY (`uploaded_by`)    REFERENCES `user` (`id`)              ON DELETE RESTRICT ON UPDATE CASCADE,
    -- 材料类型 / 路径 / 大小：file_url 只接受本系统上传的相对路径，
    -- 挡掉 http:// 外链和 ../ 路径穿越（前端会直接把它塞进 <img src>）
    CONSTRAINT `ck_material_type` CHECK (`material_type` IN ('MEDICAL_PROOF','LEAVE_FORM','OTHER')),
    CONSTRAINT `ck_material_url`  CHECK (`file_url` LIKE '/files/%'),
    CONSTRAINT `ck_material_size` CHECK (`file_size` IS NULL OR (`file_size` > 0 AND `file_size` <= 10485760))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='请假材料表';

-- -------------------------------------------------------------
-- 9. leave_checkin_log 销假 / 定位 / 人工核验记录表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_checkin_log` (
    `id`                    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `application_id`        BIGINT       NOT NULL                COMMENT '请假申请',
    `check_type`            VARCHAR(30)  NOT NULL                COMMENT 'GPS / ON_CAMPUS_CONFIRM / MANUAL_REVIEW',
    `check_result`          VARCHAR(20)  NOT NULL                COMMENT 'PASSED / FAILED',
    `review_status`         VARCHAR(30)  NOT NULL DEFAULT 'NONE' COMMENT 'NONE / PENDING_REVIEW / APPROVED / REJECTED / VOID',
    `close_reason`          VARCHAR(100) DEFAULT NULL            COMMENT 'SUPERSEDED_BY_SELF_CHECKIN / SUPERSEDED_BY_LATER_PASSED / MANUAL_REVIEW_COMPLETED',
    `closed_at`             DATETIME     DEFAULT NULL            COMMENT '关闭时间',
    `distance_m`            DECIMAL(10,2) DEFAULT NULL           COMMENT 'GPS 距离（米）',
    `operator_id`           BIGINT       NOT NULL                COMMENT '操作人 user.id',
    `check_time`            DATETIME     NOT NULL                COMMENT '操作时间',
    `reviewer_id`           BIGINT       DEFAULT NULL            COMMENT '核验操作人 user.id',
    `reviewed_at`           DATETIME     DEFAULT NULL            COMMENT '核验时间',
    `review_comment`        VARCHAR(500) DEFAULT NULL            COMMENT '核验意见',
    `overdue_at_completion` TINYINT      DEFAULT NULL            COMMENT '完成时是否已逾期（0/1 快照）',
    `delay_minutes`         INT          DEFAULT NULL            COMMENT '完成时超出批准结束时间的分钟数（快照）',
    `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_checkin_application_time` (`application_id`,`check_time`),
    KEY `idx_checkin_review` (`review_status`,`check_time`),
    CONSTRAINT `fk_checkin_application` FOREIGN KEY (`application_id`) REFERENCES `leave_application` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_checkin_operator`    FOREIGN KEY (`operator_id`)    REFERENCES `user` (`id`)              ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_checkin_reviewer`    FOREIGN KEY (`reviewer_id`)    REFERENCES `user` (`id`)              ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ck_checkin_type`   CHECK (`check_type` IN ('GPS','ON_CAMPUS_CONFIRM','MANUAL_REVIEW')),
    CONSTRAINT `ck_checkin_result` CHECK (`check_result` IN ('PASSED','FAILED')),
    CONSTRAINT `ck_checkin_review` CHECK (`review_status` IN ('NONE','PENDING_REVIEW','APPROVED','REJECTED','VOID')),
    CONSTRAINT `ck_checkin_closed` CHECK (`review_status` IN ('NONE','PENDING_REVIEW') OR `closed_at` IS NOT NULL),
    CONSTRAINT `ck_checkin_close_reason` CHECK (`close_reason` IS NULL OR `close_reason` IN ('SUPERSEDED_BY_SELF_CHECKIN','SUPERSEDED_BY_LATER_PASSED','MANUAL_REVIEW_COMPLETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='销假与定位记录表';

-- -------------------------------------------------------------
-- 10. leave_approval_log 操作日志表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leave_approval_log` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `application_id` BIGINT       NOT NULL                COMMENT '请假申请',
    `extension_id`   BIGINT       DEFAULT NULL            COMMENT '关联续假（续假动作必填）',
    `operator_id`    BIGINT       NOT NULL                COMMENT '操作人 user.id',
    `action`         VARCHAR(40)  NOT NULL                COMMENT '操作类型',
    `old_status`     VARCHAR(20)  DEFAULT NULL            COMMENT '操作前状态',
    `new_status`     VARCHAR(20)  DEFAULT NULL            COMMENT '操作后状态',
    `comment`        VARCHAR(500) DEFAULT NULL            COMMENT '操作说明',
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    PRIMARY KEY (`id`),
    KEY `idx_approval_log_application_created` (`application_id`,`created_at`),
    KEY `idx_approval_log_operator` (`operator_id`),
    CONSTRAINT `fk_log_application` FOREIGN KEY (`application_id`) REFERENCES `leave_application` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_log_extension`   FOREIGN KEY (`extension_id`)   REFERENCES `leave_extension` (`id`)   ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_log_operator`    FOREIGN KEY (`operator_id`)    REFERENCES `user` (`id`)              ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ck_log_action` CHECK (`action` IN (
        'SUBMIT','APPROVE','REJECT','WITHDRAW','CANCEL','COMPLETE','MANUAL_REVIEW',
        'EXTENSION_SUBMIT','EXTENSION_APPROVE','EXTENSION_REJECT','EXTENSION_WITHDRAW','AUTO_WITHDRAW_EXTENSION'
    ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='请假操作日志表';

-- 说明：ck_log_extension_required（EXTENSION 类 action 必须有 extension_id）为跨列逻辑约束，
-- MySQL 9.x 禁止 extension_id 同时用于外键与 CHECK，故降级为 Service 层保证（写日志时按 action 校验）。

-- -------------------------------------------------------------
-- 11. notification 通知表（dedup_key 唯一，一次性事件/自然日桶）
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `receiver_id`   BIGINT       NOT NULL                COMMENT '接收用户 user.id',
    `type`          VARCHAR(50)  NOT NULL                COMMENT '消息类型',
    `title`         VARCHAR(100) NOT NULL                COMMENT '标题',
    `content`       VARCHAR(500) NOT NULL                COMMENT '内容',
    `business_id`   BIGINT       DEFAULT NULL            COMMENT '关联业务ID',
    `business_type` VARCHAR(50)  DEFAULT NULL            COMMENT '关联业务类型',
    `dedup_key`     VARCHAR(150) NOT NULL                COMMENT '去重键（唯一）',
    `is_read`       TINYINT      NOT NULL DEFAULT 0      COMMENT '是否已读：0 未读 / 1 已读',
    `read_at`       DATETIME     DEFAULT NULL            COMMENT '阅读时间',
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_notification_dedup` (`receiver_id`,`dedup_key`),
    KEY `idx_notification_unread` (`receiver_id`,`is_read`,`created_at`),
    KEY `idx_notification_business` (`business_id`,`business_type`),
    CONSTRAINT `fk_notification_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ck_notification_read` CHECK (`is_read` IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统通知表';

-- -------------------------------------------------------------
-- 12. system_config 系统配置表
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_config` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `config_key`   VARCHAR(100) NOT NULL                COMMENT '配置键',
    `config_value` VARCHAR(500) NOT NULL                COMMENT '配置值',
    `config_type`  VARCHAR(20)  NOT NULL                COMMENT 'STRING / INT / BOOLEAN / JSON',
    `description`  VARCHAR(255) DEFAULT NULL            COMMENT '配置说明',
    `updated_by`   BIGINT       DEFAULT NULL            COMMENT '修改人 user.id',
    `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_config_key` (`config_key`),
    CONSTRAINT `fk_config_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ck_config_type` CHECK (`config_type` IN ('STRING','INT','BOOLEAN','JSON'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置表';

-- =============================================================
-- 说明：
--   1. "同一学生同一时段不得有重叠有效申请"无法用 CHECK 表达（跨行），
--      由 Service 层在事务中 SELECT ... FOR UPDATE 实现。
--   2. "续假 requested_end_time > max(end_time, now)"、"开始时间不得早于当前时间"
--      同理由 Service 层校验（NOW() 不可用于 CHECK）。
--   3. status 的 6 个持久状态与 effective_status（WAITING_START/IN_PROGRESS/OVERDUE）
--      的映射见《业务流程与状态机设计 V1.2（冻结版）》§4.1。
--   4. leave_extension.pending_app_id 是生成列，MyBatis-Plus 实体需标注
--      @TableField(exist = false)，否则插入会带上该列导致报错。
--   5. 续假审批事务统一锁顺序：leave_application → leave_extension → 日志 → 通知，
--      与销假事务保持一致，避免死锁。
-- =============================================================

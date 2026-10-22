# -*- coding: utf-8 -*-
"""补两条待审批演示数据，让工作台的待办列表凑齐 3 条（对齐设计稿）。

新增两个学生（王同学 / 赵同学，都在 CS2302），各提交一条 PENDING 申请。
加上陈同学原有的那条，待审批 = 3。

可重复执行：所有 INSERT 都带 WHERE NOT EXISTS，跑多次不会重复插。
"""
import os
import re
import subprocess
import tempfile

ROOT = 'D:/AI Code/CampusLeave'
YML = ROOT + '/backend/src/main/resources/application-dev.yml'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'
HASH = '$2b$10$o/KYivFQKPVs1uLR/iXrRObPiuaZruga7ySYdDQRigR11kuoxdR4W'  # 明文 123456

pwd = re.search(r'password:\s*(\S+)', open(YML, encoding='utf-8').read()).group(1)
cnf = tempfile.NamedTemporaryFile('w', suffix='.cnf', delete=False, encoding='utf-8')
cnf.write('[client]\nuser=root\npassword=%s\nhost=127.0.0.1\nport=3306\ndefault-character-set=utf8mb4\n' % pwd)
cnf.close()


def run(sql):
    r = subprocess.run(
        [MYSQL, '--defaults-extra-file=' + cnf.name, '-N', '-B', 'campus_leave'],
        input=sql, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        print('FAILED:\n' + (r.stderr or '')[:900])
    return r.stdout


SQL = """
-- 1) 两个学生账号
INSERT INTO `user` (`username`, `password_hash`, `role`, `real_name`, `phone`, `status`)
SELECT '2023001003', '{h}', 'STUDENT', '王同学', '13900000003', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE `username` = '2023001003');

INSERT INTO `user` (`username`, `password_hash`, `role`, `real_name`, `phone`, `status`)
SELECT '2023001004', '{h}', 'STUDENT', '赵同学', '13900000004', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE `username` = '2023001004');

-- 2) 学生档案（班级 CS2302）
INSERT INTO `student_profile` (`user_id`, `student_no`, `class_id`, `gender`, `major`, `grade`)
SELECT u.id, '2023001003', c.id, 'MALE', '计算机科学与技术', '2023'
FROM `user` u JOIN `class_info` c ON c.`class_code` = 'CS2302'
WHERE u.`username` = '2023001003'
  AND NOT EXISTS (SELECT 1 FROM `student_profile` sp WHERE sp.`student_no` = '2023001003');

INSERT INTO `student_profile` (`user_id`, `student_no`, `class_id`, `gender`, `major`, `grade`)
SELECT u.id, '2023001004', c.id, 'FEMALE', '计算机科学与技术', '2023'
FROM `user` u JOIN `class_info` c ON c.`class_code` = 'CS2302'
WHERE u.`username` = '2023001004'
  AND NOT EXISTS (SELECT 1 FROM `student_profile` sp WHERE sp.`student_no` = '2023001004');

-- 3) 两条待审批：王同学 校内·事假；赵同学 离校·病假
INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `destination`, `contact_phone`, `status`, `created_at`)
SELECT 'LA202610220101', sp.id, 'ON_CAMPUS', 'PERSONAL',
       DATE(NOW()) + INTERVAL 14 HOUR, DATE(NOW()) + INTERVAL 16 HOUR,
       '参加学院组织的志愿服务', NULL, '13900000003', 'PENDING',
       DATE(NOW()) + INTERVAL 10 HOUR + INTERVAL 42 MINUTE
FROM `student_profile` sp
WHERE sp.`student_no` = '2023001003'
  AND NOT EXISTS (SELECT 1 FROM `leave_application` a WHERE a.`application_no` = 'LA202610220101');

INSERT INTO `leave_application`
    (`application_no`, `student_id`, `leave_scene`, `leave_type`, `start_time`, `end_time`,
     `reason`, `destination`, `contact_phone`, `status`, `created_at`)
SELECT 'LA202610220102', sp.id, 'OFF_CAMPUS', 'SICK',
       DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 8 HOUR,
       DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 17 HOUR,
       '发烧就医，需外出看诊', '市第一医院', '13900000004', 'PENDING',
       DATE(NOW()) + INTERVAL 8 HOUR + INTERVAL 35 MINUTE
FROM `student_profile` sp
WHERE sp.`student_no` = '2023001004'
  AND NOT EXISTS (SELECT 1 FROM `leave_application` a WHERE a.`application_no` = 'LA202610220102');
"""

run(SQL.format(h=HASH))

out = run("""
SELECT a.`application_no`, u.`real_name`, a.`leave_scene`, a.`leave_type`,
       DATE_FORMAT(a.`start_time`, '%m-%d %H:%i'), a.`status`
FROM `leave_application` a
JOIN `student_profile` sp ON sp.id = a.`student_id`
JOIN `user` u ON u.id = sp.`user_id`
WHERE a.`status` = 'PENDING'
ORDER BY a.`created_at`;
""")
print('当前待审批：')
print(out.strip())

os.unlink(cnf.name)

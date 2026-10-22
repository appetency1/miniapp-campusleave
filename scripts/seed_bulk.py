# -*- coding: utf-8 -*-
"""填充"背景数据"：让后台的列表、趋势图、环形图、统计卡看起来像真实学院。

设计约束（很重要，别破坏演示脚本）：

1. **只碰 2024 学号段的学生**。李同学(2023001001)/陈同学(2023001002)/周同学(2023002001)
   的 4+2+0 条申请是"首页五态"和 e2e 探针依赖的，一条都不动。
2. 新增班级 class_code 统一 `BULK-` 前缀，重跑时按前缀清理，不误删手工建的班。
3. 同一学生的时间区间不重叠（业务规则要求），生成时维护占用表。
4. 状态与时间必须自洽：
   - COMPLETED 必须有 actual_end_time
   - APPROVED 必须 actual_end_time IS NULL，且按当前时间分为
     待开始 / 请假中 / 逾期 三种计算态
5. PENDING 只放 3 条，否则教师工作台"待审批 30"会盖住真正的演示重点。

重新执行 = 先删后插，幂等。
"""
import io
import os
import random
import re
import subprocess
import tempfile
from datetime import datetime, timedelta

ROOT = 'D:/AI Code/CampusLeave'
YML = ROOT + '/backend/src/main/resources/application-dev.yml'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'

random.seed(20261022)   # 固定种子：每次生成的数据完全一样，便于排查

NOW = datetime.now().replace(microsecond=0)

# ---------------------------------------------------------------- 基础素材
CLASSES = [
    # 班级名, class_code, 专业, 年级, 辅导员工号（None = 未配置，用于演示"班级未绑定辅导员"）
    ('软件工程1班', 'BULK-SE-2301', '软件工程', '2023', 'T2023001'),
    ('软件工程2班', 'BULK-SE-2302', '软件工程', '2023', 'T2023002'),
    ('网络工程1班', 'BULK-NE-2301', '网络工程', '2023', 'T2023002'),
    ('人工智能1班', 'BULK-AI-2301', '人工智能', '2023', None),
]

SURNAME = list('王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾')
GIVEN = ['子涵', '欣怡', '浩宇', '梓萱', '一鸣', '思远', '雨桐', '俊杰', '嘉怡', '天佑',
         '若曦', '明轩', '佳琪', '宇轩', '诗涵', '浩然', '梦琪', '泽宇', '静怡', '博文',
         '语彤', '皓轩', '紫涵', '睿泽', '雪琪', '嘉豪', '婉清', '志远', '欣然', '子墨']

REASON_POOL = {
    ('OFF_CAMPUS', 'PERSONAL'): [
        '回家处理家中事务', '参加亲属婚礼', '回户籍地办理身份证', '外出参加企业宣讲会',
        '陪同家人就医', '回家取过冬衣物', '参加校外资格考试', '处理银行卡挂失事宜',
    ],
    ('OFF_CAMPUS', 'SICK'): [
        '发热前往医院就诊', '牙科复诊', '眼科检查配镜', '肠胃不适就医',
        '皮肤过敏需到专科门诊', '骨折复查', '体检复查',
    ],
    ('ON_CAMPUS', 'PERSONAL'): [
        '参加学院组织的志愿活动', '社团排练', '实验室值班', '参加学科竞赛培训',
        '学院会议', '班级事务处理', '准备答辩材料',
    ],
    ('ON_CAMPUS', 'SICK'): [
        '感冒在校休息', '运动扭伤在宿舍休养', '肠胃不适休息', '偏头痛休息',
        '低烧在宿舍观察', '喉咙发炎休息',
    ],
    ('ON_CAMPUS', 'OTHER'): [
        '参加校内实践活动', '临时调整学习安排', '校内兼职',
    ],
}

DESTINATIONS = ['武汉市洪山区', '武汉市江夏区', '黄冈市黄州区', '孝感市孝南区',
                '咸宁市咸安区', '鄂州市鄂城区', '长沙市岳麓区', '南昌市青山湖区']

APPROVE_COMMENTS = ['同意，注意安全', '同意，按时返校', '情况属实，同意', '同意，返校后记得销假', '准假，注意身体']
REJECT_COMMENTS = ['材料不齐，请补充诊断证明后重新提交', '请假事由不充分，请补充说明',
                   '该时段有课程考核，不予批准', '请先与任课教师沟通后再申请']

# 状态不能瞎抽 —— 必须与时间窗口自洽，否则会出现"45 天前请的假至今未销假"这种
# 一眼假的数据（第一次跑就抽出了 22 条逾期，教师端异常数直接爆掉）。
# 规则：历史区间只能已完成/被驳回/已取消/撤回，逾期只留极少数；
#       进行中的只能 APPROVED 或提前销假；未来的只能待审或待开始。
HISTORY_STATUS = [('COMPLETED', 80), ('REJECTED', 10), ('CANCELLED', 4),
                  ('WITHDRAWN', 4), ('APPROVED', 2)]     # APPROVED = 逾期未销假
ONGOING_STATUS = [('APPROVED', 75), ('COMPLETED', 25)]
FUTURE_STATUS = [('APPROVED', 55), ('PENDING', 35), ('CANCELLED', 10)]


def esc(s):
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"


def fmt(dt):
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def pick_by(weights):
    total = sum(w for _, w in weights)
    r = random.uniform(0, total)
    acc = 0
    for name, w in weights:
        acc += w
        if r <= acc:
            return name
    return weights[0][0]


def pick_status(start, end):
    if end < NOW:
        return pick_by(HISTORY_STATUS)
    if start <= NOW <= end:
        return pick_by(ONGOING_STATUS)
    return pick_by(FUTURE_STATUS)


def gen_name(used):
    """生成不重复的中文姓名"""
    for _ in range(500):
        n = random.choice(SURNAME) + random.choice(GIVEN)
        if n not in used:
            used.add(n)
            return n
    raise RuntimeError('名字用完了')


def main():
    yml = io.open(YML, encoding='utf-8').read()
    user = re.search(r'username:\s*(\S+)', yml).group(1)
    pwd = re.search(r'password:\s*(\S+)', yml).group(1).strip('"\'')

    sql = io.StringIO()
    w = sql.write

    w('SET NAMES utf8mb4;\nSET time_zone = \'+08:00\';\n\n')
    w('-- ---------- 0. 清理上一次生成的背景数据 ----------\n')
    w("""
DELETE FROM leave_material WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id IN (
        SELECT id FROM student_profile WHERE student_no LIKE '2024%'));
DELETE FROM leave_checkin_log WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id IN (
        SELECT id FROM student_profile WHERE student_no LIKE '2024%'));
DELETE FROM leave_approval_log WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id IN (
        SELECT id FROM student_profile WHERE student_no LIKE '2024%'));
DELETE FROM leave_extension WHERE application_id IN (
    SELECT id FROM leave_application WHERE student_id IN (
        SELECT id FROM student_profile WHERE student_no LIKE '2024%'));
DELETE FROM leave_application WHERE student_id IN (
    SELECT id FROM student_profile WHERE student_no LIKE '2024%');
DELETE FROM notification WHERE receiver_id IN (
    SELECT user_id FROM student_profile WHERE student_no LIKE '2024%');
DELETE FROM student_profile WHERE student_no LIKE '2024%';
DELETE FROM teacher_class WHERE class_id IN (SELECT id FROM class_info WHERE class_code LIKE 'BULK-%');
DELETE FROM class_info WHERE class_code LIKE 'BULK-%';
DELETE FROM `user` WHERE username LIKE '2024%';
""")

    # ---------- 1. 新班级 ----------
    w('\n-- ---------- 1. 班级 ----------\n')
    for name, code, major, grade, _t in CLASSES:
        w("INSERT INTO class_info (class_name, class_code, major, grade, status, created_at, updated_at)\n"
          "VALUES (%s, %s, %s, %s, 'ACTIVE', %s, %s);\n"
          % (esc(name), esc(code), esc(major), esc(grade), esc(fmt(NOW - timedelta(days=120))),
             esc(fmt(NOW - timedelta(days=120)))))

    # ---------- 2. 辅导员绑定 ----------
    w('\n-- ---------- 2. 辅导员绑定（teacher_id 是 teacher_profile.id，不是 user.id） ----------\n')
    for name, code, major, grade, tno in CLASSES:
        if not tno:
            continue
        w("INSERT INTO teacher_class (teacher_id, class_id, created_at)\n"
          "SELECT tp.id, c.id, %s FROM teacher_profile tp\n"
          "  JOIN `user` u ON u.id = tp.user_id\n"
          "  JOIN class_info c ON c.class_code = %s\n"
          " WHERE u.username = %s;\n"
          % (esc(fmt(NOW - timedelta(days=120))), esc(code), esc(tno)))

    # ---------- 3. 学生 ----------
    w('\n-- ---------- 3. 学生（学号 2024 段，与演示学生隔离） ----------\n')
    used_names = set()
    students = []      # (student_no, name, class_code, index)
    idx = 1
    for ci, (cname, code, major, grade, tno) in enumerate(CLASSES):
        # 未配辅导员的班少放人，避免"有学生但没人审批"看起来像 bug
        count = 4 if tno is None else 7
        for k in range(count):
            no = '2024%03d%03d' % (ci + 1, idx)
            name = gen_name(used_names)
            gender = '男' if k % 2 == 0 else '女'
            students.append({
                'no': no, 'name': name, 'class_code': code, 'class_name': cname,
                'major': major, 'grade': grade, 'gender': gender, 'teacher': tno,
            })
            idx += 1

    # 密码复用演示学生的 bcrypt hash（123456），方便临时登录任意账号排查
    w("SET @pwd := (SELECT password_hash FROM `user` WHERE username = '2023001001');\n")
    for s in students:
        w("INSERT INTO `user` (username, password_hash, role, real_name, phone, status, created_at, updated_at)\n"
          "VALUES (%s, @pwd, 'STUDENT', %s, %s, 'ACTIVE', %s, %s);\n"
          % (esc(s['no']), esc(s['name']), esc('138' + s['no'][-8:]),
             esc(fmt(NOW - timedelta(days=200))), esc(fmt(NOW - timedelta(days=200)))))
        w("INSERT INTO student_profile (user_id, student_no, class_id, gender, major, grade, enrollment_year,\n"
          "                             emergency_contact, emergency_phone, created_at, updated_at)\n"
          "SELECT u.id, %s, c.id, %s, %s, %s, 2024, %s, %s, %s, %s\n"
          "  FROM `user` u JOIN class_info c ON c.class_code = %s WHERE u.username = %s;\n"
          % (esc(s['no']), esc(s['gender']), esc(s['major']), esc(s['grade']),
             esc(s['name'][0] + '父'), esc('137' + s['no'][-8:]),
             esc(fmt(NOW - timedelta(days=200))), esc(fmt(NOW - timedelta(days=200))),
             esc(s['class_code']), esc(s['no'])))

    # ---------- 4. 申请 ----------
    w('\n-- ---------- 4. 请假申请 ----------\n')
    # 每个学生维护已占用区间，保证不重叠
    occupied = {s['no']: [] for s in students}

    apps = []          # dict: 供后面生成日志用
    seq = 0

    def free_slot(sno, start, hours):
        """若与已占用区间冲突，往后顺延，最多尝试 40 次"""
        for _ in range(40):
            end = start + timedelta(hours=hours)
            conflict = any(start < e and end > s for (s, e) in occupied[sno])
            if not conflict:
                occupied[sno].append((start, end))
                return start, end
            start = start + timedelta(days=1)
        return None, None

    # 4.1 历史申请：过去 45 天，按天撒
    #    只抽"有辅导员"的学生 —— 未绑定辅导员的班不可能存在已审批的申请，
    #    否则会出现 approved_at 有值、approved_by_user_id 为 NULL 的不自洽数据
    pool_with_teacher = [x for x in students if x['teacher']]
    for day_offset in range(45, 0, -1):
        day = (NOW - timedelta(days=day_offset)).replace(hour=0, minute=0, second=0)
        n_today = random.choice([1, 1, 2, 2, 3, 3, 4])
        for _ in range(n_today):
            s = random.choice(pool_with_teacher)
            scene = 'OFF_CAMPUS' if random.random() < 0.45 else 'ON_CAMPUS'
            ltype = random.choices(['SICK', 'PERSONAL', 'OTHER'], weights=[35, 55, 10])[0]
            if (scene, ltype) not in REASON_POOL:
                ltype = 'PERSONAL'
            start = day.replace(hour=random.choice([8, 9, 10, 13, 14, 15]),
                                minute=random.choice([0, 10, 20, 30, 40]))
            hours = random.choice([2, 3, 4, 6, 8])
            st, en = free_slot(s['no'], start, hours)
            if not st:
                continue
            status = pick_status(st, en)
            seq += 1
            apps.append(dict(student=s, scene=scene, ltype=ltype, start=st, end=en,
                             status=status, no='LB%s%04d' % (st.strftime('%Y%m%d'), seq)))

    # 4.2 今天：多一点，让"今日申请"像样
    today0 = NOW.replace(hour=0, minute=0, second=0)
    for i in range(8):
        s = random.choice(students)
        scene = 'OFF_CAMPUS' if i % 2 == 0 else 'ON_CAMPUS'
        ltype = 'SICK' if i % 3 == 0 else 'PERSONAL'
        start = NOW + timedelta(hours=random.choice([3, 5, 8, 20, 30]))
        st, en = free_slot(s['no'], start, random.choice([3, 4, 6]))
        if not st:
            continue
        seq += 1
        apps.append(dict(student=s, scene=scene, ltype=ltype, start=st, end=en,
                         status=pick_status(st, en), no='LB%s%04d' % (st.strftime('%Y%m%d'), seq)))

    # 4.3 明天之后：待开始 / 待审批各几条
    for i in range(6):
        s = random.choice(students)
        scene = 'OFF_CAMPUS' if i % 2 == 0 else 'ON_CAMPUS'
        ltype = 'PERSONAL' if i % 2 else 'SICK'
        start = (NOW + timedelta(days=random.choice([1, 2, 3]))).replace(
            hour=random.choice([8, 9, 14]), minute=0, second=0)
        st, en = free_slot(s['no'], start, random.choice([4, 6, 8]))
        if not st:
            continue
        seq += 1
        # 有辅导员的班才可能有"已通过待开始"
        status = 'APPROVED' if s['teacher'] else 'PENDING'
        apps.append(dict(student=s, scene=scene, ltype=ltype, start=st, end=en,
                         status=status, no='LB%s%04d' % (st.strftime('%Y%m%d'), seq)))

    # 4.4 请假中 / 逾期：手工兜住，保证后台能看到
    in_progress_plan = [
        ('OFF_CAMPUS', 'SICK', -5, 6),     # 已经请了 5 小时，还有 6 小时
        ('ON_CAMPUS', 'PERSONAL', -2, 5),
        ('OFF_CAMPUS', 'PERSONAL', -3, 4),
    ]
    for i, (scene, ltype, h_from, h_to) in enumerate(in_progress_plan):
        s = [x for x in students if x['teacher']][i]
        st = NOW + timedelta(hours=h_from)
        en = NOW + timedelta(hours=h_to)
        if any(st < e and en > s0 for (s0, e) in occupied[s['no']]):
            continue
        occupied[s['no']].append((st, en))
        seq += 1
        apps.append(dict(student=s, scene=scene, ltype=ltype, start=st, end=en,
                         status='APPROVED', no='LB%s%04d' % (st.strftime('%Y%m%d'), seq)))

    overdue_plan = [
        ('OFF_CAMPUS', 'PERSONAL', -3, -1),
        ('ON_CAMPUS', 'SICK', -2, -1),
    ]
    for i, (scene, ltype, d_from, d_to) in enumerate(overdue_plan):
        s = [x for x in students if x['teacher']][-1 - i]
        st = NOW + timedelta(days=d_from)
        en = NOW + timedelta(days=d_to)
        if any(st < e and en > s0 for (s0, e) in occupied[s['no']]):
            continue
        occupied[s['no']].append((st, en))
        seq += 1
        apps.append(dict(student=s, scene=scene, ltype=ltype, start=st, end=en,
                         status='APPROVED', no='LB%s%04d' % (st.strftime('%Y%m%d'), seq)))

    # 写 leave_application
    for a in apps:
        s = a['student']
        reason = random.choice(REASON_POOL[(a['scene'], a['ltype'])])
        dest = random.choice(DESTINATIONS) if a['scene'] == 'OFF_CAMPUS' else None
        phone = '139' + s['no'][-8:]
        created = a['start'] - timedelta(hours=random.choice([3, 8, 20, 30]))

        approved_at = None
        actual_end = None
        if a['status'] == 'COMPLETED':
            approved_at = created + timedelta(hours=random.choice([1, 2, 3]))
            actual_end = a['end'] + timedelta(minutes=random.choice([-40, -15, 0, 5, 20]))
            if actual_end < a['start']:
                actual_end = a['end']
        elif a['status'] == 'REJECTED':
            approved_at = created + timedelta(hours=random.choice([1, 2, 4]))
        elif a['status'] == 'CANCELLED':
            approved_at = created + timedelta(hours=2)
        elif a['status'] == 'APPROVED':
            approved_at = created + timedelta(hours=random.choice([1, 2, 5]))

        w("INSERT INTO leave_application\n"
          "  (application_no, student_id, leave_scene, leave_type, start_time, end_time, reason,\n"
          "   destination, contact_phone, status, actual_end_time, approved_by_user_id, approved_at,\n"
          "   cancel_reason, cancelled_at, cancelled_by_user_id, created_at, updated_at)\n"
          "SELECT %s, sp.id, %s, %s, %s, %s, %s, %s, %s, %s, %s,\n"
          "       (SELECT u.id FROM teacher_profile tp JOIN `user` u ON u.id = tp.user_id\n"
          "         WHERE tp.id = (SELECT teacher_id FROM teacher_class tc\n"
          "                         WHERE tc.class_id = sp.class_id LIMIT 1)),\n"
          "       %s, %s, %s, %s, %s, %s\n"
          "  FROM student_profile sp WHERE sp.student_no = %s;\n"
          % (esc(a['no']), esc(a['scene']), esc(a['ltype']), esc(fmt(a['start'])), esc(fmt(a['end'])),
             esc(reason), esc(dest) if dest else 'NULL', esc(phone), esc(a['status']),
             esc(fmt(actual_end)) if actual_end else 'NULL',
             esc(fmt(approved_at)) if approved_at else 'NULL',
             esc('个人行程调整' if a['status'] == 'CANCELLED' else ''),
             esc(fmt(a['end'] - timedelta(hours=6))) if a['status'] == 'CANCELLED' else 'NULL',
             '(SELECT u.id FROM `user` u WHERE u.username = %s)' % esc(s['no'])
             if a['status'] == 'CANCELLED' else 'NULL',
             esc(fmt(created)), esc(fmt(created if not approved_at else approved_at)),
             esc(s['no'])))
        a['created'] = created
        a['approved_at'] = approved_at
        a['reason'] = reason

    # ---------- 5. 审批日志 ----------
    w('\n-- ---------- 5. 审批日志（详情页时间轴） ----------\n')
    for a in apps:
        s = a['student']
        w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
          "SELECT la.id, (SELECT u.id FROM `user` u WHERE u.username = %s), 'SUBMIT', NULL, 'PENDING', '提交申请', %s\n"
          "  FROM leave_application la WHERE la.application_no = %s;\n"
          % (esc(s['no']), esc(fmt(a['created'])), esc(a['no'])))

        if a['status'] == 'REJECTED':
            w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
              "SELECT la.id, la.approved_by_user_id, 'REJECT', 'PENDING', 'REJECTED', %s, %s\n"
              "  FROM leave_application la WHERE la.application_no = %s;\n"
              % (esc(random.choice(REJECT_COMMENTS)), esc(fmt(a['approved_at'])), esc(a['no'])))
        elif a['status'] in ('APPROVED', 'COMPLETED', 'CANCELLED'):
            w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
              "SELECT la.id, la.approved_by_user_id, 'APPROVE', 'PENDING', 'APPROVED', %s, %s\n"
              "  FROM leave_application la WHERE la.application_no = %s;\n"
              % (esc(random.choice(APPROVE_COMMENTS)), esc(fmt(a['approved_at'])), esc(a['no'])))

        if a['status'] == 'COMPLETED':
            w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
              "SELECT la.id, (SELECT u.id FROM `user` u WHERE u.username = %s), 'COMPLETE', 'APPROVED', 'COMPLETED', %s, %s\n"
              "  FROM leave_application la WHERE la.application_no = %s;\n"
              % (esc(s['no']),
                 esc('销假方式：' + ('返校定位' if a['scene'] == 'OFF_CAMPUS' else '校内自主确认')),
                 esc(fmt(NOW - timedelta(days=1))), esc(a['no'])))
        elif a['status'] == 'CANCELLED':
            w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
              "SELECT la.id, (SELECT u.id FROM `user` u WHERE u.username = %s), 'CANCEL', 'APPROVED', 'CANCELLED', '个人行程调整', %s\n"
              "  FROM leave_application la WHERE la.application_no = %s;\n"
              % (esc(s['no']), esc(fmt(a['end'] - timedelta(hours=6))), esc(a['no'])))
        elif a['status'] == 'WITHDRAWN':
            w("INSERT INTO leave_approval_log (application_id, operator_id, action, old_status, new_status, comment, created_at)\n"
              "SELECT la.id, (SELECT u.id FROM `user` u WHERE u.username = %s), 'WITHDRAW', 'PENDING', 'WITHDRAWN', '本人撤回', %s\n"
              "  FROM leave_application la WHERE la.application_no = %s;\n"
              % (esc(s['no']), esc(fmt(a['created'] + timedelta(minutes=40))), esc(a['no'])))

    # ---------- 6. 销假记录（已完成的才有） ----------
    w('\n-- ---------- 6. 销假记录 ----------\n')
    for a in apps:
        if a['status'] != 'COMPLETED':
            continue
        s = a['student']
        ctype = 'GPS' if a['scene'] == 'OFF_CAMPUS' else 'ON_CAMPUS_CONFIRM'
        dist = 'ROUND(%s, 2)' % (random.uniform(8, 85)) if ctype == 'GPS' else 'NULL'
        w("INSERT INTO leave_checkin_log\n"
          "  (application_id, check_type, check_result, review_status, distance_m, operator_id,\n"
          "   check_time, overdue_at_completion, delay_minutes, created_at)\n"
          "SELECT la.id, %s, 'PASSED', 'NONE', %s,\n"
          "       (SELECT u.id FROM `user` u WHERE u.username = %s), %s, 0, 0, %s\n"
          "  FROM leave_application la WHERE la.application_no = %s;\n"
          % (esc(ctype), dist, esc(s['no']), esc(fmt(a['end'])), esc(fmt(a['end'])), esc(a['no'])))

    # ---------- 7. 材料（给部分病假挂上诊断证明） ----------
    w('\n-- ---------- 7. 病假材料 ----------\n')
    sick_done = [a for a in apps if a['ltype'] == 'SICK' and a['status'] in ('COMPLETED', 'APPROVED')]
    for a in sick_done[:12]:
        w("INSERT INTO leave_material\n"
          "  (application_id, material_type, file_name, file_url, file_size, mime_type, uploaded_by, created_at)\n"
          "SELECT la.id, 'MEDICAL_PROOF', '诊断证明.png', '/files/2026/10/demo-medical-proof.png',\n"
          "       65789, 'image/png',\n"
          "       (SELECT sp.user_id FROM student_profile sp WHERE sp.id = la.student_id),\n"
          "       DATE_ADD(la.created_at, INTERVAL 5 MINUTE)\n"
          "  FROM leave_application la WHERE la.application_no = %s;\n"
          % esc(a['no']))

    text = sql.getvalue()

    cnf = tempfile.NamedTemporaryFile('w', suffix='.cnf', delete=False, encoding='utf-8')
    cnf.write('[client]\nuser=%s\npassword=%s\nhost=127.0.0.1\nport=3306\n'
              'default-character-set=utf8mb4\n' % (user, pwd))
    cnf.close()

    r = subprocess.run([MYSQL, '--defaults-extra-file=' + cnf.name, 'campus_leave'],
                       input=text, capture_output=True, text=True, encoding='utf-8')
    os.unlink(cnf.name)

    if r.returncode != 0:
        print('FAILED:\n' + (r.stderr or '')[:2000])
        return

    print('生成完成：%d 个学生，%d 条申请' % (len(students), len(apps)))

    # ---------- 回读校验 ----------
    stat_sql = """
SELECT '学生' k, COUNT(*) v FROM student_profile WHERE student_no LIKE '2024%'
UNION ALL SELECT '班级', COUNT(*) FROM class_info WHERE class_code LIKE 'BULK-%'
UNION ALL SELECT '申请', COUNT(*) FROM leave_application WHERE application_no LIKE 'LB%'
UNION ALL SELECT '日志', COUNT(*) FROM leave_approval_log WHERE application_id IN
          (SELECT id FROM leave_application WHERE application_no LIKE 'LB%')
UNION ALL SELECT '销假记录', COUNT(*) FROM leave_checkin_log WHERE application_id IN
          (SELECT id FROM leave_application WHERE application_no LIKE 'LB%')
UNION ALL SELECT '材料', COUNT(*) FROM leave_material WHERE application_id IN
          (SELECT id FROM leave_application WHERE application_no LIKE 'LB%')
;
SELECT status, COUNT(*) c FROM leave_application
 WHERE application_no LIKE 'LB%' GROUP BY status ORDER BY c DESC;
SELECT COUNT(*) 今日申请 FROM leave_application
 WHERE application_no LIKE 'LB%' AND DATE(created_at) = CURDATE();
SELECT COUNT(*) 数据不自洽 FROM leave_application
 WHERE application_no LIKE 'LB%'
   AND ((status = 'COMPLETED' AND actual_end_time IS NULL)
     OR (status = 'APPROVED' AND actual_end_time IS NOT NULL)
     OR end_time <= start_time);
"""
    r2 = subprocess.run([MYSQL, '-u' + user, '-p' + pwd, '--default-character-set=utf8mb4',
                         '-N', '-B', 'campus_leave', '-e', stat_sql],
                        capture_output=True, text=True, encoding='utf-8')
    print((r2.stdout or '').strip())
    if r2.stderr:
        print('stderr:', r2.stderr[:400])


if __name__ == '__main__':
    main()

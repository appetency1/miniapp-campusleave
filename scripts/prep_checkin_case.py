# -*- coding: utf-8 -*-
"""为「人工核验」链路造一条在假中的离校申请。

背景：核验的前提是 status=APPROVED AND actual_end_time IS NULL AND 现在落在
start_time..end_time 之间（EffectiveStatus.IN_PROGRESS）。演示数据里当前只有
一条在假申请，已经用于续假测试，所以这里直接改一条历史申请的时间区间。

只改 date，不碰状态，业务语义仍合法（相当于"这条假正在进行"）。
"""
import re
import subprocess
import tempfile
import os

YML = r'D:/AI Code/CampusLeave/backend/src/main/resources/application-dev.yml'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'

txt = open(YML, encoding='utf-8').read()
pwd = re.search(r'password:\s*(\S+)', txt).group(1)

cnf = tempfile.NamedTemporaryFile('w', suffix='.cnf', delete=False, encoding='utf-8')
cnf.write('[client]\nuser=root\npassword=%s\nhost=127.0.0.1\nport=3306\ndefault-character-set=utf8mb4\n' % pwd)
cnf.close()


def sql(q):
    r = subprocess.run([MYSQL, '--defaults-extra-file=' + cnf.name, '-N', '-B', 'campus_leave', '-e', q],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    return [line.split('\t') for line in r.stdout.strip().splitlines() if line]


print('--- 当前 APPROVED 且未完成的申请 ---')
rows = sql("SELECT id, student_id, leave_scene, DATE_FORMAT(start_time,'%m-%d %H:%i'), "
           "DATE_FORMAT(end_time,'%m-%d %H:%i') FROM leave_application "
           "WHERE status='APPROVED' AND actual_end_time IS NULL ORDER BY id")
for r in rows:
    print('  id=%s student=%s %s  %s ~ %s' % tuple(r))

# 选一条离校的；没有就用第一条
pick = next((r for r in rows if r[2] == 'OFF_CAMPUS'), rows[0] if rows else None)
if not pick:
    raise SystemExit('没有可用申请')

app_id = pick[0]
print('\n选中 id=%s，把它改到今天 08:00 ~ 23:00（进入 IN_PROGRESS）' % app_id)
sql("UPDATE leave_application SET start_time=CONCAT(CURDATE(),' 08:00:00'), "
    "end_time=CONCAT(CURDATE(),' 23:00:00'), updated_at=NOW() WHERE id=%s" % app_id)

chk = sql("SELECT id, leave_scene, status, DATE_FORMAT(start_time,'%m-%d %H:%i'), "
          "DATE_FORMAT(end_time,'%m-%d %H:%i') FROM leave_application WHERE id=" + str(app_id))
print('改后:', chk[0])

os.unlink(cnf.name)

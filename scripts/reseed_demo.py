# -*- coding: utf-8 -*-
"""执行演示数据重置脚本（sql/V1.2__reseed_demo.sql）。

只删两个演示学生（2023001001 / 2023001002）的申请与日志，
不动账号、班级、绑定关系，可反复执行。

顺带把 sql/demo-assets/ 里的演示附件复制到 backend/uploads/2026/10/：
DB 里 leave_material 存的是 /files/2026/10/demo-medical-proof.png，
文件不在的话教师端能看到材料名但点开是 404。uploads 本身不进 git。
"""
import os
import re
import shutil
import subprocess
import tempfile

ROOT = 'D:/AI Code/CampusLeave'
YML = ROOT + '/backend/src/main/resources/application-dev.yml'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'
SQL = ROOT + '/sql/V1.2__reseed_demo.sql'
DEMO_ASSETS = ROOT + '/sql/demo-assets'
UPLOAD_DIR = ROOT + '/backend/uploads/2026/10'

pwd = re.search(r'password:\s*(\S+)', open(YML, encoding='utf-8').read()).group(1).strip('"\'')
cnf = tempfile.NamedTemporaryFile('w', suffix='.cnf', delete=False, encoding='utf-8')
cnf.write('[client]\nuser=root\npassword=%s\nhost=127.0.0.1\nport=3306\ndefault-character-set=utf8mb4\n' % pwd)
cnf.close()

# 附件就位（材料记录已写死在 SQL 里，文件必须先存在）
if os.path.isdir(DEMO_ASSETS):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    for name in os.listdir(DEMO_ASSETS):
        shutil.copy2(os.path.join(DEMO_ASSETS, name), os.path.join(UPLOAD_DIR, name))
    print('demo assets copied -> backend/uploads/2026/10')

with open(SQL, encoding='utf-8') as f:
    script = f.read()

r = subprocess.run(
    [MYSQL, '--defaults-extra-file=' + cnf.name, '--default-character-set=utf8mb4', 'campus_leave'],
    input=script, capture_output=True, text=True, encoding='utf-8')

if r.returncode != 0:
    print('FAILED:\n' + (r.stderr or '')[:800])
else:
    print('reseed done')

# 回读校验
r2 = subprocess.run(
    [MYSQL, '--defaults-extra-file=' + cnf.name, '-N', '-B', 'campus_leave', '-e',
     "SELECT status, COUNT(*) FROM leave_application GROUP BY status ORDER BY status"],
    capture_output=True, text=True, encoding='utf-8')
print('当前申请状态分布：')
for line in r2.stdout.strip().splitlines():
    print('  ' + line)

os.unlink(cnf.name)

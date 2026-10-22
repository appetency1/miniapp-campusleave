# -*- coding: utf-8 -*-
"""一次性修复：把被测试写坏的 CAMPUS_CENTER_LAT 恢复，并修正经纬度的 config_type。

seed 里经纬度被标成 STRING，导致管理端的数值校验摸不到它们；
schema 的 ck_config_type 只允许 STRING/INT/BOOLEAN/JSON，
经纬度只能留在 STRING，校验交给 Service 层的 key 白名单。
"""
import os
import re
import subprocess
import tempfile

YML = r'D:/AI Code/CampusLeave/backend/src/main/resources/application-dev.yml'
MYSQL = r'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'

pwd = re.search(r'password:\s*(\S+)', open(YML, encoding='utf-8').read()).group(1)
cnf = tempfile.NamedTemporaryFile('w', suffix='.cnf', delete=False, encoding='utf-8')
cnf.write('[client]\nuser=root\npassword=%s\nhost=127.0.0.1\nport=3306\ndefault-character-set=utf8mb4\n' % pwd)
cnf.close()


def sql(q):
    r = subprocess.run([MYSQL, '--defaults-extra-file=' + cnf.name, '-N', '-B', 'campus_leave', '-e', q],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    return r.stdout.strip()


sql("UPDATE system_config SET config_value='30.000000' WHERE config_key='CAMPUS_CENTER_LAT'")
print(sql("SELECT config_key, config_value, config_type FROM system_config ORDER BY config_key"))
os.unlink(cnf.name)

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""清理本次排查过程中产生的脏消息（type=LEAVE_OVERDUE，已统一为 OVERDUE_REMINDER）。"""
import io
import re
import subprocess
import sys

yml = io.open("backend/src/main/resources/application-dev.yml", encoding="utf-8").read()
user = re.search(r"username:\s*(\S+)", yml).group(1)
pwd = re.search(r"password:\s*(\S+)", yml).group(1).strip("\"'")
mysql = r"C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe"

sql = sys.argv[1] if len(sys.argv) > 1 else "SELECT COUNT(*) FROM notification WHERE type='LEAVE_OVERDUE';"
r = subprocess.run([mysql, "-u" + user, "-p" + pwd, "-D", "campus_leave", "-e", sql],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
out = (r.stdout or "") + (r.stderr or "")
print("\n".join(l for l in out.splitlines() if "Warning" not in l))

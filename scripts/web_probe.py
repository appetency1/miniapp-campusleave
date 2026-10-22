#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Web 后台数据探针：模拟 api.js 的 loadTeacherStore / loadAdminStore，逐个接口验形状与关键字段。"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8080/api/v1"
results = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))
    print("[%s] %s %s" % ("PASS" if cond else "FAIL", name, detail))


def login(u, p):
    st, b = call("POST", "/auth/login", {"username": u, "password": p})
    return b.get("data", {}).get("token"), b


print("=== 教师后台（T2023001） ===")
tt, b = login("T2023001", "123456")
check("登录", bool(tt), "code=%s" % b.get("code"))

if tt:
    # profile
    st, b = call("GET", "/teacher/profile", None, tt)
    d = b.get("data") or {}
    check("/teacher/profile", b.get("code") == 0, "name=%s no=%s classes=%s"
          % (d.get("name"), d.get("no"), len(d.get("classList") or d.get("classes") or [])))

    st, b = call("GET", "/teacher/workbench", None, tt)
    d = b.get("data") or {}
    check("/teacher/workbench 结构", b.get("code") == 0 and "todos" in d,
          "pending=%s inProgress=%s abnormal=%s overdue=%s todos=%d"
          % (d.get("pendingCount"), d.get("inProgressCount"), d.get("abnormalCount"),
             d.get("overdueCount"), len(d.get("todos") or [])))

    st, b = call("GET", "/teacher/applications?tab=records&size=200", None, tt)
    d = b.get("data") or {}
    rows = d.get("list") or []
    check("/teacher/applications 返回 list", b.get("code") == 0 and isinstance(rows, list),
          "total=%s rows=%d" % (d.get("total"), len(rows)))
    if rows:
        r0 = rows[0]
        need = ["id", "no", "studentName", "className", "phone", "scene", "type",
                "start", "end", "status", "effective", "reason", "approvedBy"]
        missing = [k for k in need if k not in r0]
        check("列表行字段齐全", not missing, "缺=%s" % (missing or "无") if missing else "")

    st, b = call("GET", "/teacher/extensions?size=200", None, tt)
    d = b.get("data") or {}
    check("/teacher/extensions 返回 list", b.get("code") == 0, "total=%s" % d.get("total"))

    st, b = call("GET", "/teacher/students?size=200", None, tt)
    d = b.get("data") or {}
    rows = d.get("list") or []
    check("/teacher/students 返回 list", b.get("code") == 0, "total=%s rows=%d" % (d.get("total"), len(rows)))
    if rows:
        check("学生行字段齐全",
              all(k in rows[0] for k in ["id", "no", "name", "cls", "phone", "total", "approved", "completed", "current"]),
              "首行=%s" % list(rows[0].keys())[:6])

    st, b = call("GET", "/teacher/stats", None, tt)
    d = b.get("data") or {}
    check("/teacher/stats", b.get("code") == 0,
          "total=%s approved=%s completed=%s overdue=%s"
          % (d.get("totalApplications"), d.get("approved"), d.get("completed"), d.get("currentOverdue")))

print("\n=== 管理后台（admin） ===")
at, b = login("admin", "123456")
check("管理员登录", bool(at), "code=%s msg=%s" % (b.get("code"), b.get("message")))
if at:
    # 管理员不应该能调教师接口（角色隔离），单独断言 403
    st, b = call("GET", "/teacher/profile", None, at)
    check("管理员调教师接口被拒", b.get("code") == 40301,
          "code=%s HTTP=%s" % (b.get("code"), st))

    for path, key in [("/admin/users?size=200", "list"),
                      ("/admin/classes?size=200", "list"), ("/admin/teacher-classes", None),
                      ("/admin/configs", None), ("/admin/stats", None), ("/admin/overview", None)]:
        st, b = call("GET", path, None, at)
        d = b.get("data")
        size = len(d.get("list") or []) if isinstance(d, dict) and key else (
            len(d) if isinstance(d, list) else ("obj" if isinstance(d, dict) else "null"))
        check(path, b.get("code") == 0, "size=%s" % size)
        # 额外检查关键字段
        if path == "/admin/overview" and isinstance(d, dict):
            check("overview 关键计数", "studentCount" in d or "totalStudents" in d or "stats" in d,
                  "keys=%s" % list(d.keys())[:8])

print("\n==== 汇总：%d 通过 / %d 失败 ====" % (
    sum(1 for r in results if r[0]), sum(1 for r in results if not r[0])))
for ok, name, detail in results:
    if not ok:
        print("  失败：" + name + "  " + detail)

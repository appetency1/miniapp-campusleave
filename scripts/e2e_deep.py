#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""深链路探针：销假（GPS/人工核验/校内确认）、续假、教师工作台一致性。"""
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8080/api/v1"
results = []
OK, FAIL = "PASS", "FAIL"


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
    results.append((OK if cond else FAIL, name, detail))
    print("[%s] %s %s" % (OK if cond else FAIL, name, detail))


def login(u):
    st, b = call("POST", "/auth/login", {"username": u, "password": "123456"})
    return b.get("data", {}).get("token")


stu = login("2023001001")
tea = login("T2023001")


def cleanup():
    st, b = call("GET", "/student/applications?filter=all", None, stu)
    for a in (b.get("data") or []):
        aid = a.get("applicationId")
        es = a.get("effectiveStatus")
        if es == "PENDING":
            call("POST", "/student/applications/%s/withdraw" % aid, {"reason": "测试清理"}, stu)
        elif es == "WAITING_START":
            call("POST", "/student/applications/%s/cancel" % aid, {"reason": "测试清理"}, stu)
        elif es in ("IN_PROGRESS", "OVERDUE"):
            call("POST", "/student/applications/%s/checkin/gps" % aid,
                 {"latitude": CENTER_LAT, "longitude": CENTER_LNG, "accuracy": 20}, stu)


CENTER_LAT, CENTER_LNG = 30.0, 120.0


def submit(scene="OFF_CAMPUS", start_offset=4, hours=2, reason="深链路测试"):
    start = datetime.now() + timedelta(seconds=start_offset)
    end = start + timedelta(hours=hours)
    p = {
        "leaveScene": scene, "leaveType": "PERSONAL",
        "startTime": start.strftime("%Y-%m-%d %H:%M:%S"),
        "endTime": end.strftime("%Y-%m-%d %H:%M:%S"),
        "reason": reason, "destination": "湖北省武汉市" if scene == "OFF_CAMPUS" else "",
        "contactPhone": "13900000001",
    }
    st, b = call("POST", "/student/applications", p, stu)
    return b.get("data", {}).get("id"), b


def approve(app_id, comment="同意"):
    return call("POST", "/teacher/applications/%s/approve" % app_id, {"comment": comment}, tea)[1]


def dicts():
    return call("GET", "/common/dictionaries")[1].get("data") or {}


D = dicts()
center = D.get("campusCenter") or {"lat": 30.0, "lng": 120.0}
CENTER_LAT, CENTER_LNG = center["lat"], center["lng"]
cleanup()
print("清理完成")
print("校园中心=%s 半径=%s 模拟开关=%s" % (center, D.get("checkinRadius"), D.get("mockLocation")))

# ================= 场景 A：离校 · 定位失败 → 人工核验 → 教师核验通过 =================
print("\n--- 场景 A：离校 GPS 销假（校外 → 人工核验） ---")
a_id, b = submit("OFF_CAMPUS", 4, 2, "A离校测试")
check("A 提交", bool(a_id), "id=%s code=%s" % (a_id, b.get("code")))
if a_id:
    check("A 审批", approve(a_id).get("code") == 0)
    time.sleep(6)
    st, b = call("GET", "/student/applications/%s" % a_id, None, stu)
    d = b.get("data") or {}
    check("A 到点后进入 IN_PROGRESS", d.get("effectiveStatus") == "IN_PROGRESS",
          "实际=%s" % d.get("effectiveStatus"))
    check("A 详情 actions 含 CHECKIN+EXTENSION",
          set(["CHECKIN", "EXTENSION"]).issubset(set(d.get("actions") or [])),
          "actions=%s" % d.get("actions"))

    # 校外 2 公里
    st, b = call("POST", "/student/applications/%s/checkin/gps" % a_id,
                 {"latitude": center["lat"] + 0.02, "longitude": center["lng"] + 0.02, "accuracy": 20}, stu)
    check("A 校外定位被拒", b.get("code") == 42202,
          "code=%s msg=%s" % (b.get("code"), b.get("message")))

    # 申请人工核验
    st, b = call("POST", "/student/applications/%s/checkin/manual-review" % a_id,
                 {"reason": "手机定位漂移，实际已在校区"}, stu)
    check("A 提交人工核验", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
    log_id = b.get("data", {}).get("checkinLogId")

    # 教师端能否看到待核验
    st, b = call("GET", "/teacher/checkin-logs?reviewStatus=PENDING_REVIEW&page=1&pageSize=50", None, tea)
    page = b.get("data") or {}
    rows = page.get("list") or page.get("records") or []
    mine = [r for r in rows if r.get("id") == log_id]
    check("A 教师核验列表能看到", len(mine) > 0, "共%d条 命中%d" % (len(rows), len(mine)))

    # 教师核验通过
    if log_id:
        st, b = call("POST", "/teacher/checkin-logs/%s/review" % log_id,
                     {"action": "APPROVE", "comment": "已核实返校"}, tea)
        check("A 教师核验通过", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
        st, b = call("GET", "/student/applications/%s" % a_id, None, stu)
        d = b.get("data") or {}
        check("A 核验后申请变 COMPLETED", d.get("effectiveStatus") == "COMPLETED",
              "实际=%s" % d.get("effectiveStatus"))
        st, b = call("GET", "/student/messages", None, stu)
        msgs = [m for m in (b.get("data") or []) if m.get("businessId") == a_id]
        check("A 学生收到核验结果消息", len(msgs) >= 2, "该申请消息%d条" % len(msgs))

# ================= 场景 B：校内 · 自主确认结束 =================
print("\n--- 场景 B：校内请假自主确认 ---")
b_id, b = submit("ON_CAMPUS", 4, 2, "B校内测试")
check("B 提交", bool(b_id), "id=%s code=%s" % (b_id, b.get("code")))
if b_id:
    check("B 审批", approve(b_id).get("code") == 0)
    time.sleep(6)
    st, b = call("POST", "/student/applications/%s/checkin/on-campus" % b_id, {}, stu)
    check("B 校内确认成功", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
    st, b = call("GET", "/student/applications/%s" % b_id, None, stu)
    d = b.get("data") or {}
    check("B 状态 COMPLETED", d.get("effectiveStatus") == "COMPLETED", "实际=%s" % d.get("effectiveStatus"))
    # 重复确认应失败
    st, b = call("POST", "/student/applications/%s/checkin/on-campus" % b_id, {}, stu)
    check("B 重复确认被拒", b.get("code") != 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
    # 离校申请不能用校内确认
    if a_id:
        st, b = call("POST", "/student/applications/%s/checkin/on-campus" % a_id, {}, stu)
        check("B 离校申请拒用校内确认", b.get("code") != 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))

# ================= 场景 C：续假 → 教师审批 → 主申请 end_time 是否延长 =================
print("\n--- 场景 C：续假审批 ---")
c_id, b = submit("OFF_CAMPUS", 4, 2, "C续假测试")
check("C 提交", bool(c_id), "id=%s code=%s" % (c_id, b.get("code")))
if c_id:
    check("C 审批", approve(c_id).get("code") == 0)
    time.sleep(6)
    st, b = call("GET", "/student/applications/%s" % c_id, None, stu)
    old_end = (b.get("data") or {}).get("endTime")
    new_end = (datetime.strptime(old_end, "%Y-%m-%d %H:%M:%S") + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
    st, b = call("POST", "/student/applications/%s/extensions" % c_id,
                 {"requestedEndTime": new_end, "reason": "临时加课"}, stu)
    check("C 提交续假", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
    ext_id = b.get("data", {}).get("id")

    # 学生首页应提示「续假审批中」
    st, b = call("GET", "/student/home", None, stu)
    cur = (b.get("data") or {}).get("current") or {}
    check("C 首页提示待审续假", cur.get("hasPendingExtension") is True,
          "hasPendingExtension=%s" % cur.get("hasPendingExtension"))

    # 教师续假列表能看到
    st, b = call("GET", "/teacher/extensions?status=PENDING&page=1&pageSize=50", None, tea)
    page = b.get("data") or {}
    rows = page.get("list") or page.get("records") or []
    mine = [r for r in rows if r.get("id") == ext_id]
    check("C 教师续假列表能看到", len(mine) > 0, "共%d条 命中%d" % (len(rows), len(mine)))

    # 教师批准续假
    st, b = call("POST", "/teacher/extensions/%s/approve" % ext_id, {"comment": "同意延长"}, tea)
    check("C 教师批准续假", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
    st, b = call("GET", "/student/applications/%s" % c_id, None, stu)
    d = b.get("data") or {}
    check("C 主申请 endTime 已延长", d.get("endTime") == new_end,
          "原=%s 新=%s 期望=%s" % (old_end, d.get("endTime"), new_end))
    st, b = call("GET", "/student/messages", None, stu)
    msgs = [m for m in (b.get("data") or []) if m.get("businessId") == c_id]
    check("C 学生收到续假结果", len(msgs) >= 1, "该申请消息%d条" % len(msgs))

# ================= 场景 D：教师工作台数字 vs 列表实际 =================
print("\n--- 场景 D：工作台计数一致性 ---")
st, wb = call("GET", "/teacher/workbench", None, tea)
w = wb.get("data") or {}
st, b = call("GET", "/teacher/applications?tab=pending&page=1&pageSize=200", None, tea)
page = b.get("data") or {}
pending_total = page.get("total")
check("D 待审批数一致", w.get("pendingCount") == pending_total,
      "工作台=%s 列表=%s" % (w.get("pendingCount"), pending_total))
st, b = call("GET", "/teacher/checkin-logs?reviewStatus=PENDING_REVIEW&page=1&pageSize=200", None, tea)
page = b.get("data") or {}
check("D 待核验数一致", w.get("abnormalCount") == page.get("total"),
      "工作台=%s 列表=%s" % (w.get("abnormalCount"), page.get("total")))

st, b = call("GET", "/teacher/applications/overdue?page=1&pageSize=200", None, tea)
page = b.get("data") or {}
check("D 逾期数一致", w.get("overdueCount") == page.get("total"),
      "工作台=%s 列表=%s" % (w.get("overdueCount"), page.get("total")))

st, b = call("GET", "/teacher/stats", None, tea)
tstat = b.get("data") or {}
st, b = call("GET", "/teacher/applications?tab=records&page=1&pageSize=500", None, tea)
page = b.get("data") or {}
all_apps = page.get("list") or page.get("records") or []
all_total = page.get("total")
check("D 统计总数 == 记录列表总数", tstat.get("totalApplications") == all_total,
      "统计=%s 列表=%s" % (tstat.get("totalApplications"), all_total))

print("\n==== 汇总：%d 通过 / %d 失败 ====" % (
    sum(1 for r in results if r[0] == OK), sum(1 for r in results if r[0] == FAIL)))
for r in results:
    if r[0] == FAIL:
        print("  失败：" + r[1] + "  " + r[2])

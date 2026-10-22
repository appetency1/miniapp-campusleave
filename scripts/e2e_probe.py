#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""端到端联调探针：验证小程序依赖的每条数据链路是否真的通。"""
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8080/api/v1"
OK, FAIL = "PASS", "FAIL"
results = []


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((OK if cond else FAIL, name, detail))
    print(("[%s] %s %s" % (OK if cond else FAIL, name, detail)))


def login(u, p="123456"):
    st, b = call("POST", "/auth/login", {"username": u, "password": p})
    return b.get("data", {}).get("token"), b


# ---------- 1. 登录 ----------
stu_token, b = login("2023001001")
check("学生登录", bool(stu_token), "code=%s" % b.get("code"))
tea_token, b = login("T2023001")
check("教师登录", bool(tea_token), "code=%s msg=%s" % (b.get("code"), b.get("message")))

# ---------- 2. 学生提交申请 ----------
start = (datetime.now() + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
end = start.replace(hour=18)
payload = {
    "leaveScene": "OFF_CAMPUS",
    "leaveType": "PERSONAL",
    "startTime": start.strftime("%Y-%m-%d %H:%M:%S"),
    "endTime": end.strftime("%Y-%m-%d %H:%M:%S"),
    "reason": "E2E 联调测试申请",
    "destination": "湖北省武汉市洪山区",
    "contactPhone": "13900000001",
}
st, b = call("POST", "/student/applications", payload, stu_token)
app_id = b.get("data", {}).get("id")
check("提交申请", b.get("code") == 0 and app_id, "id=%s HTTP=%s" % (app_id, st))

# ---------- 3. 教师端能否看到这条申请 ----------
st, b = call("GET", "/teacher/applications?status=PENDING&page=1&pageSize=50", None, tea_token)
rows = (b.get("data") or {}).get("records") or (b.get("data") or {}).get("list") or []
found = [r for r in rows if r.get("applicationId") == app_id or r.get("id") == app_id]
check("教师待审批列表包含该申请", len(found) > 0, "列表%d条，命中%d条" % (len(rows), len(found)))
teacher_view = found[0] if found else {}

# ---------- 4. 审批通过 ----------
st, b = call("POST", "/teacher/applications/%s/approve" % app_id, {"comment": "同意"}, tea_token)
check("教师审批通过", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))

# ---------- 5. 学生首页是否反映已通过 ----------
st, b = call("GET", "/student/home", None, stu_token)
cur = (b.get("data") or {}).get("current") or {}
# 首页主卡片有优先级（请假中 > 逾期 > 待审批 > 待开始），刚审批的未必是主卡片；
# 只要"它是主卡片"或"页面提示另有 N 条待处理"之一成立，就说明数据已进首页。
home_data = b.get("data") or {}
visible = cur.get("applicationId") == app_id or (home_data.get("othersPending") or 0) >= 1
check("首页能看到该申请（主卡片或待处理计数）", visible,
      "current=%s othersPending=%s" % (cur.get("applicationId"), home_data.get("othersPending")))
check("首页主卡片状态值合法", cur.get("effectiveStatus") in
      ("IN_PROGRESS", "OVERDUE", "WAITING_START", "PENDING"),
      "实际=%s" % cur.get("effectiveStatus"))
check("首页 approvedBy 有值", bool(cur.get("approvedBy")), "approvedBy=%s" % cur.get("approvedBy"))

# ---------- 6. 学生消息是否收到审批通知 ----------
st, b = call("GET", "/student/messages", None, stu_token)
msgs = b.get("data") or []
hit = [m for m in msgs if m.get("businessId") == app_id]
check("收到审批通知", len(hit) > 0, "消息%d条，命中%d条" % (len(msgs), len(hit)))
if hit:
    check("通知可跳转到该申请", str(hit[0].get("businessType")) in ("APPLICATION", "LEAVE_APPLICATION"),
          "businessType=%s title=%s" % (hit[0].get("businessType"), hit[0].get("title")))

# ---------- 7. 详情页数据完整性 ----------
st, b = call("GET", "/student/applications/%s" % app_id, None, stu_token)
d = b.get("data") or {}
check("详情返回归属正确", d.get("applicationId") == app_id, "statusLabel=%s" % d.get("statusLabel"))
check("详情 actions 含 CANCEL", "CANCEL" in (d.get("actions") or []), "actions=%s" % d.get("actions"))
check("详情有 createdAt", bool(d.get("createdAt")), "createdAt=%s" % d.get("createdAt"))

# ---------- 8. 学生取消 ----------
st, b = call("POST", "/student/applications/%s/cancel" % app_id, {"reason": "联调取消"}, stu_token)
check("学生取消已通过未开始申请", b.get("code") == 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
st, b = call("GET", "/student/applications/%s" % app_id, None, stu_token)
d = b.get("data") or {}
check("取消后状态=CANCELLED", d.get("effectiveStatus") == "CANCELLED", "实际=%s" % d.get("effectiveStatus"))

# ---------- 9. 教师端详情能看到取消 ----------
st, b = call("GET", "/teacher/applications/%s" % app_id, None, tea_token)
d = b.get("data") or {}
check("教师能看到该申请详情", b.get("code") == 0 and d.get("id") == app_id,
      "effective=%s" % d.get("effective"))

# ---------- 10. 越权：另一个学生能否看这条 ----------
stu2, b2 = login("2023001002")
if stu2:
    st, b = call("GET", "/student/applications/%s" % app_id, None, stu2)
    check("越权防护：他人申请返回不存在", b.get("code") not in (0, None),
          "code=%s msg=%s" % (b.get("code"), b.get("message")))

# ---------- 11. 非法枚举 ----------
st, b = call("POST", "/student/applications", dict(payload, leaveScene="HACK", startTime=(datetime.now()+timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S"), endTime=(datetime.now()+timedelta(days=5, hours=2)).strftime("%Y-%m-%d %H:%M:%S")), stu_token)
check("非法 leaveScene 被拒", b.get("code") != 0, "code=%s msg=%s HTTP=%s" % (b.get("code"), b.get("message"), st))

# ---------- 12. 时间重叠 ----------
st, b = call("POST", "/student/applications", dict(payload, startTime=(datetime.now()+timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"), endTime=(datetime.now()+timedelta(days=2, hours=4)).strftime("%Y-%m-%d %H:%M:%S")), stu_token)
a1 = b.get("data", {}).get("id")
st, b = call("POST", "/student/applications", dict(payload, startTime=(datetime.now()+timedelta(days=2, hours=1)).strftime("%Y-%m-%d %H:%M:%S"), endTime=(datetime.now()+timedelta(days=2, hours=5)).strftime("%Y-%m-%d %H:%M:%S")), stu_token)
check("时间重叠被拒", b.get("code") != 0, "code=%s msg=%s" % (b.get("code"), b.get("message")))
if a1:
    call("POST", "/student/applications/%s/withdraw" % a1, {"reason": "清理"}, stu_token)

# ---------- 13. 统计与列表口径一致 ----------
st, b = call("GET", "/student/applications?filter=all", None, stu_token)
all_list = b.get("data") or []
st, b = call("GET", "/student/home", None, stu_token)
stats = (b.get("data") or {}).get("stats") or {}
check("列表条数 == 统计总数", len(all_list) == stats.get("totalApplications"),
      "列表=%d 统计=%s" % (len(all_list), stats.get("totalApplications")))

print("\n==== 汇总：%d 通过 / %d 失败 ====" % (
    sum(1 for r in results if r[0] == OK), sum(1 for r in results if r[0] == FAIL)))
for r in results:
    if r[0] == FAIL:
        print("  失败：" + r[1] + " " + r[2])

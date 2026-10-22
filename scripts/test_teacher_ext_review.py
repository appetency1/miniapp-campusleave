# -*- coding: utf-8 -*-
"""续假 / 人工核验两条链路的端到端测试。

用 urllib 而不是 node fetch：本机 env 里有 http_proxy，
node 的 undici 行为不稳定；urllib 可以显式挂空 ProxyHandler 彻底绕开代理。
"""
import json
import urllib.request
from datetime import datetime, timedelta

BASE = 'http://127.0.0.1:8080/api/v1'
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(path, method='GET', body=None, token=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with _opener.open(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}


def login(u, p):
    st, j = call('/auth/login', 'POST', {'username': u, 'password': p})
    assert j.get('code') == 0, 'login %s failed: %s' % (u, j)
    return j['data']['token']


def main():
    t = login('T2023001', '123456')
    st, j = call('/teacher/applications?tab=records&size=200', token=t)
    apps = j['data']['list']
    live = [a for a in apps if a.get('effective') == 'IN_PROGRESS']
    print('总申请 %d 条，在假中 %d 条：%s' % (
        len(apps), len(live), ', '.join('%s/%s/%s' % (a['id'], a['studentNo'], a['scene']) for a in live)))

    # ================= 链路 1：续假 =================
    ext_target = None
    for a in live:
        if a['status'] == 'APPROVED' and not a.get('pendingExtension'):
            ext_target = a
            break

    if not ext_target:
        print('\n[链路1] 没有可续假的申请，跳过')
    else:
        a = ext_target
        print('\n===== 链路1 续假：申请 %s %s，原结束 %s =====' % (a['id'], a['studentName'], a['end']))
        s = login(a['studentNo'], '123456')

        cur = datetime.strptime(a['end'] + ':00', '%Y-%m-%d %H:%M:%S')
        nxt = (cur + timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')
        st, j = call('/student/applications/%s/extensions' % a['id'], 'POST',
                     {'requestedEndTime': nxt, 'reason': '复诊需要，医生建议延长观察'}, s)
        print('学生提交续假 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

        st, j = call('/teacher/extensions?status=PENDING', token=t)
        lst = j['data']['list']
        print('教师待审续假 -> %s 条' % j['data']['total'])
        if lst:
            ext = lst[0]
            print('  #%s %s  %s → %s' % (ext['id'], ext['studentName'], ext['originEnd'], ext['requestedEnd']))

            st, j = call('/teacher/extensions/%s/approve' % ext['id'], 'POST', {'comment': '同意延长'}, t)
            print('教师批准续假 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

            st, j = call('/teacher/applications/%s' % a['id'], token=t)
            print('主申请新结束 -> %s（原 %s）' % (j['data']['end'], a['end']))

            st, j = call('/teacher/extensions/%s/approve' % ext['id'], 'POST', {'comment': '再点'}, t)
            print('重复批准 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

    # ================= 链路 2：定位失败 → 人工核验 =================
    chk_target = None
    for a in live:
        # 允许与链路1同一条：续假通过后它仍是在假状态，正好接着验销假
        if a['status'] == 'APPROVED' and a['scene'] == '离校':
            chk_target = a
            break

    if not chk_target:
        print('\n[链路2] 没有可核验的离校申请，跳过')
    else:
        a = chk_target
        print('\n===== 链路2 核验：申请 %s %s =====' % (a['id'], a['studentName']))
        s = login(a['studentNo'], '123456')

        st, j = call('/student/applications/%s/checkin/gps' % a['id'], 'POST',
                     {'latitude': 31.5, 'longitude': 121.5, 'accuracy': 20}, s)
        print('学生 GPS 销假（故意超距）-> %s code=%s %s' % (st, j.get('code'), j.get('message')))

        st, j = call('/student/applications/%s/checkin/manual-review' % a['id'], 'POST',
                     {'reason': '定位漂移，人已到校门口，门禁可查'}, s)
        print('学生申请人工核验 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

        st, j = call('/teacher/checkin-logs?reviewStatus=PENDING_REVIEW', token=t)
        logs = j['data']['list']
        print('教师待核验 -> %s 条' % j['data']['total'])
        mine = [x for x in logs if x['applicationId'] == a['id']]
        if mine:
            log = mine[0]
            print('  #%s %s 距离 %s m' % (log['id'], log['studentName'], log['distance']))

            st, j = call('/teacher/checkin-logs/%s/review' % log['id'], 'POST',
                         {'action': 'APPROVE', 'comment': '门禁记录已核对，通过'}, t)
            print('教师核验通过 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

            st, j = call('/teacher/applications/%s' % a['id'], token=t)
            d = j['data']
            print('主申请状态 -> %s | 实际结束 %s' % (d['status'], d.get('actualEnd') or '—'))

            st, j = call('/teacher/checkin-logs/%s/review' % log['id'], 'POST', {'action': 'APPROVE'}, t)
            print('重复核验 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))


main()

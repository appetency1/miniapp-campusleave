# -*- coding: utf-8 -*-
"""管理端接口实测（03_API §7）。

覆盖：开户 → 新学生能登录 → 停用后登录被拒 → 重复开户被拦 →
班级列表 / 绑定冲突 / 配置读写 / 全校统计。
"""
import json
import urllib.request

BASE = 'http://127.0.0.1:8080/api/v1'
_op = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(path, method='GET', body=None, token=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with _op.open(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}


def login(u, p):
    st, j = call('/auth/login', 'POST', {'username': u, 'password': p})
    return (j['data']['token'] if j.get('code') == 0 else None), j


def main():
    tk, j = login('admin', '123456')
    print('管理员登录 ->', j.get('code'), j.get('message'))
    if not tk:
        return
    H = {'Authorization': 'Bearer ' + tk}
    HJ = dict(H, **{'Content-Type': 'application/json'})

    for p in ['/admin/users?size=5', '/admin/classes', '/admin/teacher-classes', '/admin/configs', '/admin/stats']:
        st, j = call(p, token=tk)
        d = j.get('data')
        brief = ('total=%s' % d.get('total')) if isinstance(d, dict) and 'list' in d else \
                ('%d 项' % len(d) if isinstance(d, list) else str(d)[:120])
        print('%-32s -> %s code=%s %s' % (p, st, j.get('code'), brief))

    # 取一个可用班级
    st, j = call('/admin/classes?size=50', token=tk)
    cls = j['data']['list']
    if not cls:
        print('没有班级，跳过开户测试')
        return
    class_id = cls[0]['id']
    print('\n用班级 %s（%s）开一个学生账号' % (class_id, cls[0]['className']))

    new_no = '2026999999'
    st, j = call('/admin/users', 'POST', {
        'username': new_no, 'realName': '测试同学', 'role': 'STUDENT',
        'studentNo': new_no, 'classId': class_id, 'initialPassword': 'abc123'
    }, tk)
    print('新建学生 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))
    new_id = (j.get('data') or {}).get('id')

    st, j = call('/admin/users', 'POST', {
        'username': new_no, 'realName': '重复', 'role': 'STUDENT',
        'studentNo': new_no + 'x', 'classId': class_id
    }, tk)
    print('重复开户 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))

    if new_id:
        tk2, j2 = login(new_no, 'abc123')
        print('新学生用初始密码登录 ->', j2.get('code'), '拿到 token' if tk2 else j2.get('message'))

        st, j = call('/admin/users/%s/status' % new_id, 'PUT', {'status': 'DISABLED'}, tk)
        print('停用该账号 -> %s code=%s' % (st, j.get('code')))
        tk3, j3 = login(new_no, 'abc123')
        print('停用后登录 ->', j3.get('code'), j3.get('message'))

        st, j = call('/admin/users/%s/status' % new_id, 'PUT', {'status': 'ACTIVE'}, tk)
        print('恢复账号 -> %s code=%s' % (st, j.get('code')))

    # 绑定冲突：拿一个已绑定的班级再绑一次
    st, j = call('/admin/teacher-classes', token=tk)
    bound = j['data']
    if bound:
        b = bound[0]
        st, j = call('/admin/teacher-classes', 'POST', {'teacherId': b['teacherId'], 'classId': b['classId']}, tk)
        print('重复绑定班级 %s -> %s code=%s %s' % (b['className'], st, j.get('code'), j.get('message')))

    # 配置读写
    st, j = call('/admin/configs', token=tk)
    if j['data']:
        key = j['data'][0]['key']
        old = j['data'][0]['value']
        st, j = call('/admin/configs/' + key, 'PUT', {'configValue': old}, tk)
        print('回写配置 %s=%s -> %s code=%s' % (key, old, st, j.get('code')))
        st, j = call('/admin/configs/' + key, 'PUT', {'configValue': 'not-a-number'}, tk)
        print('写非法数值 -> %s code=%s %s' % (st, j.get('code'), j.get('message')))


main()

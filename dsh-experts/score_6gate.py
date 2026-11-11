#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""score_6gate.py -- 计算机毕设六关计算器（零依赖，已加固）

用法: python score_6gate.py 依据.json

依据.json 字段口径（务必按此填，填错不报错但会失真）：
  需求度/可行性/边界清晰度 : 0-10 分
  模块覆盖 / 模块应有      : 个数，模块应有 > 0
  设计完整度               : 0-1 的比例，不是 0-10 分
  可运行 / 总数            : 个数，总数 > 0
  通过项 / 核对项          : 项数，核对项 > 0

相对原版的改动（2026-11-11）：
  1. 分母为 0 时报错退出，不再抛 ZeroDivisionError
  2. 设计完整度超出 0-1 直接报错，避免按 0-10 自评时被钳成满分白送分
  3. 缺字段给出具体字段名，不再 KeyError
  4. 输出附各关缺口，分数低的地方就是该干活的地方
"""
import json
import sys

GATES = [('选题', 20), ('架构', 20), ('代码', 20), ('章节', 15), ('格式', 15), ('答辩', 10)]
LINE = 70


def r(x):
    return int(x + 0.5)


def need(d, gate, *keys):
    block = d.get(gate)
    if block is None:
        sys.exit('缺少关卡「%s」的依据。依据不全时不要打分，只列缺口。' % gate)
    for k in keys:
        if k not in block:
            sys.exit('「%s」缺少字段「%s」。' % (gate, k))


def pos(block, key, gate):
    v = block[key]
    if v <= 0:
        sys.exit('「%s」的「%s」必须大于 0，当前为 %s；依据缺失时不要打分，只列缺口。' % (gate, key, v))
    return v


def xuanti(d):
    need(d, '选题', '需求度', '可行性', '边界清晰度')
    b = d['选题']
    for k in ('需求度', '可行性', '边界清晰度'):
        if not 0 <= b[k] <= 10:
            sys.exit('「选题」的「%s」应在 0-10 之间，当前为 %s。' % (k, b[k]))
    return r(b['需求度'] * 1.0 + b['可行性'] * 0.6 + b['边界清晰度'] * 0.4)


def arch(d):
    need(d, '架构', '模块覆盖', '模块应有', '设计完整度')
    b = d['架构']
    if not 0 <= b['设计完整度'] <= 1:
        sys.exit('「架构」的「设计完整度」是 0-1 的比例，当前为 %s；'
                 '按 0-10 自评会被钳到满分，等于白送分。' % b['设计完整度'])
    return r(b['模块覆盖'] / pos(b, '模块应有', '架构') * 12 + b['设计完整度'] * 8)


def code20(d):
    need(d, '代码', '可运行', '总数')
    b = d['代码']
    return r(b['可运行'] / pos(b, '总数', '代码') * 20)


def ratio15(d):
    need(d, '章节', '通过项', '核对项')
    b = d['章节']
    return r(b['通过项'] / pos(b, '核对项', '章节') * 15)


def fmt15(d):
    need(d, '格式', '通过项', '核对项')
    b = d['格式']
    return r(b['通过项'] / pos(b, '核对项', '格式') * 15)


def ratio10(d):
    need(d, '答辩', '通过项', '核对项')
    b = d['答辩']
    return r(b['通过项'] / pos(b, '核对项', '答辩') * 10)


FNS = {'选题': xuanti, '架构': arch, '代码': code20, '章节': ratio15, '格式': fmt15, '答辩': ratio10}


def main():
    if len(sys.argv) < 2:
        sys.exit('用法: python score_6gate.py 依据.json')
    with open(sys.argv[1], encoding='utf-8') as f:
        d = json.load(f)

    parts, scores, gaps = [], [], []
    for name, mx in GATES:
        v = max(0, min(mx, FNS[name](d)))
        scores.append(v)
        parts.append('%s %d' % (name, v))
        if v < mx:
            gaps.append((mx - v, '%s 差 %d 分' % (name, mx - v)))
    total = sum(scores)
    print('校验行：' + ' ＋ '.join(parts) + ' ＝ 总分 %d（准入线 %d）' % (total, LINE))
    if gaps:
        gaps.sort(reverse=True)
        print('缺口（按分差从大到小）：' + '、'.join(g[1] for g in gaps))
    print('结论：' + ('达准入线，可提交。' if total >= LINE else '未达准入线，按缺口补齐后再评。'))
    print('说明：本分数只用于自查找缺口，不得对外宣称，也不得为了让分数好看调整自评项。')


if __name__ == '__main__':
    main()

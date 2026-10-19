# -*- coding: utf-8 -*-
import json, io

d = json.load(io.open("design/palette.json", encoding="utf-8"))
N = {x["key"]: x for x in d["neutral"]}
B = {x["key"]: x for x in d["brand"]}
A = {x["key"]: x for x in d["accent"]}
S = d["semantic"]

def strip_html(items, h=76, show_key=True):
    out = []
    for it in items:
        txt = it["key"] if show_key else ""
        dark = _lum(it["hex"]) < 0.5
        color = "#fff" if dark else "#16170D"
        out.append(f'''<div class="sw" style="background:{it['hex']};color:{color};height:{h}px">
          <span class="k">{txt}</span><span class="h">{it['hex'].replace('#','')}</span>
        </div>''')
    return "".join(out)

def _lum(hx):
    hx = hx.lstrip("#")
    r, g, b = [int(hx[i:i+2], 16)/255 for i in (0,2,4)]
    def f(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

rows = ""
for c in d["checks"]:
    ok = "ok" if c["pass_"] else "bad"
    rows += f'''<tr><td>{c["name"]}</td><td class="num">{c["ratio"]} : 1</td>
      <td class="num">{c["need"]} : 1</td><td class="{ok}">{"通过" if c["pass_"] else "不通过"}</td></tr>'''

sem_html = ""
for name, arr in S.items():
    sem_html += f'<div class="semrow"><div class="semname">{name}</div><div class="semsw">'
    for it in arr:
        sem_html += f'<div class="sw2" style="background:{it["hex"]}"><span>{it["key"]}</span></div>'
    sem_html += f'</div><span class="hex">{arr[0]["hex"]} / {arr[1]["hex"]}</span></div>'

html = f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>校园请假 · 色彩系统 v1.0</title>
<style>
  :root{{
    --bg:#F6F2ED; --surface:#FDF9F6; --white:#FFFFFF;
    --ink:#181613; --ink2:#534C43; --ink3:#756D65;
    --line:#ECE7E1; --line2:#DDD6CF;
    --brand:#A75E41; --brand-deep:#854429; --brand-soft:#FDE0D5; --brand-tint:#FEF1EC;
    --action:#A6383C; --action-soft:#FFE5E4;
    --sans:"PingFang SC","HarmonyOS Sans SC","Source Han Sans SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;
    --mono:"SF Mono",ui-monospace,"Cascadia Mono",Consolas,monospace;
  }}
  *{{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}}
  body{{background:var(--bg);color:var(--ink);font-family:var(--sans);padding:64px 48px 96px;}}
  .wrap{{max-width:1060px;margin:0 auto;}}

  .kick{{font-family:var(--mono);font-size:10px;letter-spacing:.22em;color:var(--ink3);text-transform:uppercase;}}
  h1{{font-size:42px;font-weight:800;letter-spacing:-.035em;margin-top:12px;}}
  h1 em{{font-style:normal;color:var(--brand);}}
  .lead{{margin-top:14px;font-size:13.5px;line-height:1.8;color:var(--ink2);max-width:600px;}}
  .meta{{margin-top:20px;display:flex;gap:28px;flex-wrap:wrap;font-family:var(--mono);font-size:10px;
         letter-spacing:.12em;color:var(--ink3);text-transform:uppercase;}}

  h2{{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);
      margin:52px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line);}}
  .note{{font-size:11.5px;color:var(--ink3);line-height:1.7;margin:-4px 0 14px;}}

  .strip{{display:flex;border-radius:10px;overflow:hidden;}}
  .sw{{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:9px 8px;
       font-family:var(--mono);font-size:9px;letter-spacing:.04em;}}
  .sw .k{{font-weight:700;opacity:.9;}}
  .sw .h{{opacity:.62;}}

  .semrow{{display:flex;align-items:center;gap:14px;margin-bottom:9px;}}
  .semname{{width:70px;font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--ink2);}}
  .semsw{{display:flex;gap:6px;}}
  .sw2{{width:66px;height:34px;border-radius:8px;display:flex;align-items:flex-end;padding:4px 6px;
       font-family:var(--mono);font-size:8px;color:rgba(0,0,0,.45);}}
  .hex{{font-family:var(--mono);font-size:9px;letter-spacing:.04em;color:var(--ink3);}}

  table{{width:100%;border-collapse:collapse;font-size:12.5px;}}
  th{{text-align:left;font-weight:600;color:var(--ink3);font-size:10px;letter-spacing:.12em;
      text-transform:uppercase;padding:0 0 9px;border-bottom:1px solid var(--line2);}}
  td{{padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink2);}}
  td.num{{font-family:var(--mono);font-size:11.5px;}}
  td.ok{{color:var(--brand);font-weight:700;}}
  td.bad{{color:var(--action);font-weight:700;}}

  .demo{{display:flex;gap:26px;align-items:flex-start;margin-top:8px;flex-wrap:wrap;}}
  .phone{{width:330px;background:var(--bg);border-radius:34px;padding:16px 16px 0;
          box-shadow:0 0 0 1px var(--line2),0 40px 70px -40px rgba(30,40,25,.5);}}
  .hero{{background:linear-gradient(158deg,var(--brand-tint) 0%,var(--brand-soft) 100%);
         border-radius:20px;padding:18px;position:relative;overflow:hidden;}}
  .hero .g{{font-size:10.5px;font-weight:700;letter-spacing:.16em;color:rgba(22,23,13,.42);}}
  .hero .n{{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:7px;}}
  .hero .n em{{font-style:normal;color:var(--action);}}
  .hero .m{{margin-top:9px;font-size:11.5px;font-weight:600;color:rgba(22,23,13,.5);}}
  .hero .w{{margin-top:6px;font-size:12px;font-weight:600;color:rgba(22,23,13,.46);}}
  .hero .st{{margin-top:13px;padding-top:11px;border-top:1px solid rgba(22,23,13,.12);
             display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;}}
  .hero .st i{{width:6px;height:6px;border-radius:50%;background:var(--brand);}}
  .hero .st span{{font-weight:500;color:rgba(22,23,13,.45);font-size:11px;}}
  .mascot{{position:absolute;right:10px;bottom:14px;width:86px;height:80px;
           background:radial-gradient(circle at 36% 22%,#fff,#F7F2E6 60%,#E8DCC5);
           border-radius:52% 52% 46% 46%/58% 58% 42% 42%;
           box-shadow:0 10px 18px -12px rgba(30,40,25,.5);}}
  .mascot::before,.mascot::after{{content:"";position:absolute;top:38px;width:5.5px;height:6.5px;
           border-radius:50%;background:#22322B;}}
  .mascot::before{{left:26px;}} .mascot::after{{right:26px;}}
  .cta{{margin-top:12px;height:46px;border-radius:13px;background:var(--brand-deep);color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;
        letter-spacing:.06em;}}
  .sec{{margin:18px 2px 4px;display:flex;justify-content:space-between;align-items:baseline;}}
  .sec b{{font-size:12.5px;}} .sec s{{text-decoration:none;font-size:10.5px;color:var(--ink3);}}
  .row{{display:flex;justify-content:space-between;align-items:center;padding:10px 2px;
        border-bottom:1px solid var(--line);font-size:12.5px;}}
  .row:last-child{{border-bottom:none;}}
  .row .t{{font-weight:600;}} .row .s{{font-size:10px;color:var(--ink3);margin-top:2px;}}
  .row .d{{font-family:var(--mono);font-size:10px;color:var(--ink3);}}
  .tabs{{display:flex;justify-content:space-between;padding:16px 10px;margin-top:10px;
         border-top:1px solid var(--line);font-size:11px;color:var(--ink3);}}
  .tabs b{{color:var(--ink);font-weight:700;position:relative;}}
  .tabs b::before{{content:"";position:absolute;top:-9px;left:50%;transform:translateX(-50%);
                   width:4px;height:4px;border-radius:50%;background:var(--action);}}

  .legend{{flex:1;min-width:280px;}}
  .lg{{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:11.5px;color:var(--ink2);}}
  .lg i{{width:16px;height:16px;border-radius:5px;flex-shrink:0;margin-top:1px;}}
  .lg b{{font-weight:700;color:var(--ink);}}

  footer{{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);
          font-size:11px;color:var(--ink3);line-height:1.9;}}
</style></head>
<body><div class="wrap">

  <div class="kick">Color System · v1.0</div>
  <h1>校园请假<em>。</em>色彩系统</h1>
  <div class="lead">用 OKLCH 建立感知均匀的色阶。中性色带 72° 的暖米倾向，与陶土同族，整页像一张纸而不是拼贴；朱红退到最后一层，只负责"需要你警惕"的瞬间。</div>
  <div class="meta"><span>OKLCH</span><span>60 · 30 · 10</span><span>AA 全通过</span></div>

  <h2>中性色阶 / Neutral 10</h2>
  <div class="note">全部带 chroma 0.006–0.016 的暖米倾向。纯灰会让界面发死，微染色让它和陶土色潜意识咬合。</div>
  <div class="strip">{strip_html(d["neutral"], 84)}</div>

  <h2>品牌陶土 / Brand 6</h2>
  <div class="note">42° 陶土橙。500 是识别色，600 是主按钮底色（白字 7.35:1），100/50 只做浅底，像旧信封的内衬。</div>
  <div class="strip">{strip_html(d["brand"], 84)}</div>

  <h2>警示朱红 / Alert 3</h2>
  <div class="note">22° 朱红。只用于「驳回」「逾期」「危险操作」，面积控制在 3% 以内。它比品牌色更冷、更急，所以永远不会被误读成可点的东西。</div>
  <div class="strip">{strip_html(d["accent"], 76)}</div>

  <h2>语义色 / Semantic</h2>
  {sem_html}

  <h2>对比度校验</h2>
  <table>
    <thead><tr><th>场景</th><th>实测</th><th>要求</th><th>结果</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>

  <h2>应用验证</h2>
  <div class="demo">
    <div class="phone">
      <div class="hero">
        <div class="g">早上好</div>
        <div class="n">张同学<em>。</em></div>
        <div class="m">10月17日 周五</div>
        <div class="w">☀ 晴 22°C</div>
        <div class="st"><i></i>在校<span>今天没有请假安排</span></div>
        <div class="mascot"></div>
      </div>
      <div class="cta">＋ 申请请假</div>
      <div class="sec"><b>最近</b><s>全部 6 条</s></div>
      <div class="row"><div><div class="t">离校 · 事假</div><div class="s" style="color:var(--brand)">已销假</div></div><div class="d">10.09</div></div>
      <div class="row"><div><div class="t">校内 · 病假</div><div class="s" style="color:var(--brand)">已销假</div></div><div class="d">09.28</div></div>
      <div class="row"><div><div class="t">离校 · 事假</div><div class="s" style="color:var(--action)">已驳回</div></div><div class="d">09.15</div></div>
      <div class="tabs"><b>首页</b><span>记录</span><span>消息</span><span>我的</span></div>
    </div>

    <div class="legend">
      <div class="lg"><i style="background:#F6F2ED"></i><div><b>页面底</b> neutral-100 · 96.2%<br>整页的呼吸空间</div></div>
      <div class="lg"><i style="background:#FDF9F6"></i><div><b>内容面</b> neutral-50 · 98.5%<br>比底亮 2.3%，靠阴影分层</div></div>
      <div class="lg"><i style="background:#FEF1EC"></i><div><b>身份卡</b> brand-50 → brand-100<br>与底同色系，低 4–6% 明度</div></div>
      <div class="lg"><i style="background:#854429"></i><div><b>主按钮</b> brand-600<br>白字 7.35:1</div></div>
      <div class="lg"><i style="background:#A6383C"></i><div><b>警示朱红</b> accent-600<br>只给驳回、逾期、危险操作</div></div>
      <div class="lg"><i style="background:#181613"></i><div><b>正文</b> neutral-900<br>不是纯黑，带 0.007 彩度</div></div>
    </div>
  </div>

  <footer>
    色相：品牌 42° / 中性 72° / 警示 22°。前两者相差 30°，是同一张纸的正反面；警示色只比品牌冷 20°，却因为彩度更高而立刻跳出来。<br>
    规则：任何页面只允许出现一个陶土色块；朱红面积不超过 3%；不用纯黑 #000 与纯白 #fff 做大面积底色。
  </footer>

</div></body></html>'''
io.open("design/color-system.html","w",encoding="utf-8").write(html)
print("written", len(html))

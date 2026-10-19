# -*- coding: utf-8 -*-
import io

BODY = ("M100,46 C156,46 185,80 185,124 C185,170 151,197 100,197 "
        "C49,197 15,170 15,124 C15,80 44,46 100,46 Z")
ANTENNA = ('<path d="M84,64 L77,28" stroke="#DCC49C" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
           '<circle cx="77" cy="27" r="5.4" fill="#E4CFA9"/>'
           '<path d="M116,64 L123,28" stroke="#DCC49C" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
           '<circle cx="123" cy="27" r="5.4" fill="#E4CFA9"/>')

EXPR = {
 "idle": dict(
   eyes='<ellipse cx="73" cy="112" rx="7.2" ry="9.2" fill="#2E3B33"/><ellipse cx="127" cy="112" rx="7.2" ry="9.2" fill="#2E3B33"/>'
        '<circle cx="70.6" cy="108.4" r="2.5" fill="#FFFFFF" opacity=".95"/><circle cx="124.6" cy="108.4" r="2.5" fill="#FFFFFF" opacity=".95"/>',
   mouth='<path d="M92,133 Q100,141 108,133" stroke="#2E3B33" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
   brow=""),
 "happy": dict(
   eyes='<path d="M64,113 Q73,103 82,113" stroke="#2E3B33" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
        '<path d="M118,113 Q127,103 136,113" stroke="#2E3B33" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
   mouth='<path d="M90,130 Q100,145 110,130 Q100,137 90,130 Z" fill="#2E3B33"/>',
   brow=""),
 "wink": dict(
   eyes='<ellipse cx="73" cy="112" rx="7.2" ry="9.2" fill="#2E3B33"/><circle cx="70.6" cy="108.4" r="2.5" fill="#FFF" opacity=".95"/>'
        '<path d="M118,113 Q127,104 136,113" stroke="#2E3B33" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
   mouth='<path d="M92,132 Q100,140 108,132" stroke="#2E3B33" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
   brow=""),
 "sleepy": dict(
   eyes='<path d="M64,114 L82,114" stroke="#2E3B33" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
        '<path d="M118,114 L136,114" stroke="#2E3B33" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
   mouth='<ellipse cx="100" cy="134" rx="4" ry="3.4" fill="#2E3B33" opacity=".85"/>',
   brow=""),
 "surprise": dict(
   eyes='<circle cx="73" cy="113" r="8.6" fill="#2E3B33"/><circle cx="127" cy="113" r="8.6" fill="#2E3B33"/>'
        '<circle cx="70" cy="108" r="3" fill="#FFFFFF" opacity=".95"/><circle cx="124" cy="108" r="3" fill="#FFFFFF" opacity=".95"/>',
   mouth='<ellipse cx="100" cy="136" rx="6.4" ry="7.4" fill="#2E3B33"/>',
   brow='<path d="M64,96 Q73,92 82,96" stroke="#2E3B33" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>'
        '<path d="M118,96 Q127,92 136,96" stroke="#2E3B33" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>'),
 "sad": dict(
   eyes='<ellipse cx="73" cy="114" rx="6.6" ry="8.4" fill="#2E3B33"/><ellipse cx="127" cy="114" rx="6.6" ry="8.4" fill="#2E3B33"/>'
        '<circle cx="71" cy="111" r="2.2" fill="#FFF" opacity=".9"/><circle cx="125" cy="111" r="2.2" fill="#FFF" opacity=".9"/>',
   mouth='<path d="M92,138 Q100,130 108,138" stroke="#2E3B33" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
   brow='<path d="M64,96 Q73,93 82,90" stroke="#2E3B33" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".6"/>'
        '<path d="M118,90 Q127,93 136,96" stroke="#2E3B33" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".6"/>'),
 "think": dict(
   eyes='<ellipse cx="77" cy="112" rx="7" ry="9" fill="#2E3B33"/><ellipse cx="131" cy="112" rx="7" ry="9" fill="#2E3B33"/>'
        '<circle cx="75" cy="108.5" r="2.4" fill="#FFF" opacity=".95"/><circle cx="129" cy="108.5" r="2.4" fill="#FFF" opacity=".95"/>',
   mouth='<path d="M94,134 L106,134" stroke="#2E3B33" stroke-width="2.6" stroke-linecap="round"/>',
   brow='<path d="M64,97 Q73,94 82,97" stroke="#2E3B33" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>'
        '<path d="M118,93 Q127,90 136,93" stroke="#2E3B33" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>'),
 "proud": dict(
   eyes='<path d="M64,114 Q73,106 82,114" stroke="#2E3B33" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
        '<path d="M118,114 Q127,106 136,114" stroke="#2E3B33" stroke-width="3.4" fill="none" stroke-linecap="round"/>',
   mouth='<path d="M90,132 Q100,142 112,130" stroke="#2E3B33" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
   brow=""),
}

def svg(expr, uid, w=200, h=210):
    e = EXPR[expr]
    return f'''<svg viewBox="0 0 200 210" width="{w}" height="{h}" class="char">
  <defs>
    <radialGradient id="bg{uid}" cx="34%" cy="20%" r="82%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="52%" stop-color="#FFFCF5"/>
      <stop offset="100%" stop-color="#EBDBBE"/>
    </radialGradient>
    <filter id="b{uid}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <filter id="s{uid}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <ellipse cx="100" cy="200" rx="52" ry="8" fill="#8C6A38" opacity=".20" filter="url(#s{uid})"/>
  {ANTENNA}
  <path d="{BODY}" fill="url(#bg{uid})"/>
  <ellipse cx="74" cy="76" rx="30" ry="21" fill="#FFFFFF" opacity=".55" filter="url(#b{uid})"/>
  <ellipse cx="105" cy="176" rx="46" ry="14" fill="#D6BE94" opacity=".28" filter="url(#b{uid})"/>
  <ellipse cx="60" cy="130" rx="12" ry="7" fill="#F57D64" opacity=".26" filter="url(#b{uid})"/>
  <ellipse cx="140" cy="130" rx="12" ry="7" fill="#F57D64" opacity=".26" filter="url(#b{uid})"/>
  {e["brow"]}
  {e["eyes"]}
  {e["mouth"]}
</svg>'''

NAMES = {
 "idle":"平常","happy":"开心","wink":"眨眼","sleepy":"困",
 "surprise":"惊讶","sad":"委屈","think":"思考","proud":"得意",
}

cards = []
for i,(k,cn) in enumerate(NAMES.items()):
    cards.append(f'''    <div class="cell">
      <div class="stage">{svg(k, i, 190, 200)}</div>
      <div class="cn">{cn}</div>
      <div class="en">{k}</div>
    </div>''')

sizes = "".join(
    f'<div class="sz"><div class="szbox">{svg("idle", 90+j, s, int(s*1.05))}</div><span>{s}px</span></div>'
    for j,s in enumerate([112, 88, 64, 40])
)

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>角色规范</title>
<style>
  :root{{
    --bg:#FAF4E8; --ink:#1E3B2F; --ink-2:#6C7C73; --ink-3:#A9A196;
    --line:rgba(30,59,47,.10); --accent:#F26A44;
    --sans:"PingFang SC","HarmonyOS Sans SC","Source Han Sans SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;
    --mono:"SF Mono",ui-monospace,"Cascadia Mono",Consolas,monospace;
  }}
  *{{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}}
  body{{background:var(--bg);color:var(--ink);font-family:var(--sans);padding:60px 48px 80px;}}
  .wrap{{max-width:1080px;margin:0 auto;}}
  .kick{{font-family:var(--mono);font-size:10px;letter-spacing:.22em;color:var(--ink-3);text-transform:uppercase;}}
  h1{{font-size:40px;font-weight:800;letter-spacing:-.03em;margin-top:12px;}}
  h1 em{{font-style:normal;color:var(--accent);}}
  .sub{{margin-top:12px;font-size:13px;color:var(--ink-2);line-height:1.7;max-width:520px;}}

  .hero{{display:flex;align-items:flex-end;gap:56px;margin-top:44px;padding-bottom:34px;border-bottom:1px solid var(--line);}}
  .hero .big{{flex-shrink:0;}}
  .hero .note{{padding-bottom:8px;}}
  .hero .note b{{display:block;font-size:15px;font-weight:800;margin-bottom:10px;}}
  .hero .note p{{font-size:12.5px;line-height:1.8;color:var(--ink-2);max-width:420px;}}
  .hero .note p + p{{margin-top:8px;}}

  h2{{font-size:13px;font-weight:700;letter-spacing:.06em;margin:44px 0 18px;color:var(--ink-2);}}
  .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}}
  .cell{{background:rgba(255,255,255,.55);border-radius:16px;padding:16px 12px 14px;text-align:center;}}
  .stage{{height:150px;display:flex;align-items:center;justify-content:center;}}
  .cn{{font-size:12.5px;font-weight:700;margin-top:4px;}}
  .en{{font-family:var(--mono);font-size:9px;letter-spacing:.16em;color:var(--ink-3);margin-top:3px;text-transform:uppercase;}}

  .sizes{{display:flex;align-items:flex-end;gap:34px;padding:10px 0 6px;}}
  .sz{{text-align:center;}}
  .szbox{{display:flex;align-items:flex-end;justify-content:center;height:130px;}}
  .sz span{{display:block;font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--ink-3);margin-top:6px;}}

  .specs{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}}
  .spec{{border-top:2px solid var(--ink);padding-top:12px;}}
  .spec .k{{font-size:11px;color:var(--ink-3);font-weight:600;letter-spacing:.04em;}}
  .spec .v{{font-size:13.5px;font-weight:700;margin-top:6px;}}
  .sw{{display:flex;align-items:center;gap:8px;margin-top:8px;}}
  .sw i{{width:14px;height:14px;border-radius:4px;display:block;}}
  .sw span{{font-family:var(--mono);font-size:9.5px;color:var(--ink-3);}}

  footer{{margin-top:52px;padding-top:22px;border-top:1px solid var(--line);font-size:11.5px;color:var(--ink-3);line-height:1.9;}}
  .char{{display:block;}}
</style>
</head>
<body>
<div class="wrap">
  <div class="kick">Character Sheet</div>
  <h1>角色规范<em>。</em></h1>
  <div class="sub">一个会呼吸的白色团子。它的职责是解释系统、陪伴流程，不承担情绪表演。</div>

  <div class="hero">
    <div class="big">{svg("idle", 99, 260, 273)}</div>
    <div class="note">
      <b>基础形态</b>
      <p>身体是上窄下宽的圆，重心略低，看起来站得稳。头顶两根天线，是它身上唯一不像生物的地方——提醒你它是系统的一部分，不是宠物。</p>
      <p>眼睛用深绿近黑，配一枚高光；腮红只在脸颊，不铺满。全身没有一条硬边，也没有描边。</p>
    </div>
  </div>

  <h2>表情</h2>
  <div class="grid">
{chr(10).join(cards)}
  </div>

  <h2>尺寸</h2>
  <div class="sizes">{sizes}</div>

  <h2>规范</h2>
  <div class="specs">
    <div class="spec"><div class="k">身体</div><div class="v">160 × 156</div>
      <div class="sw"><i style="background:#FFFFFF"></i><span>#FFFFFF</span></div>
      <div class="sw"><i style="background:#EBDBBE"></i><span>#EBDBBE</span></div>
    </div>
    <div class="spec"><div class="k">眼睛</div><div class="v">7.2 × 9.2</div>
      <div class="sw"><i style="background:#2E3B33"></i><span>#2E3B33</span></div>
    </div>
    <div class="spec"><div class="k">腮红</div><div class="v">12 × 7 / 26%</div>
      <div class="sw"><i style="background:#F57D64"></i><span>#F57D64</span></div>
    </div>
    <div class="spec"><div class="k">天线</div><div class="v">3.2 描边 / 5.4 球</div>
      <div class="sw"><i style="background:#DCC49C"></i><span>#DCC49C</span></div>
    </div>
  </div>

  <footer>
    动效：呼吸位移 7px / 3.6s；眨眼 5.4s 一次（scaleY .08）；天线不单独动，跟着身体一起浮。<br>
    禁止：加描边、加投影、加渐变高光斑、加装饰配件。它靠形状和表情表达，不靠特效。
  </footer>
</div>
</body>
</html>
'''
io.open("character.html","w",encoding="utf-8").write(html)
print("ok", len(html))

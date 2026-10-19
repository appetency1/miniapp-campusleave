# -*- coding: utf-8 -*-
import io

FUR = """
    <filter id="furf{u}" x="-25%" y="-25%" width="150%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="3" seed="{seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="fuzzf{u}" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="{seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="grainf{u}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="{seed}" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0" result="g"/>
      <feComponentTransfer in="g" result="a">
        <feFuncA type="linear" slope="0.55" intercept="0"/>
      </feComponentTransfer>
      <feComposite in="a" in2="SourceAlpha" operator="in" result="t"/>
      <feBlend in="SourceGraphic" in2="t" mode="multiply" result="out"/>
    </filter>
    <radialGradient id="furf{u}" cx="36%" cy="24%" r="80%">
      <stop offset="0%" stop-color="#FFFBF1"/>
      <stop offset="48%" stop-color="#F7EAD4"/>
      <stop offset="100%" stop-color="#DDC6A4"/>
    </radialGradient>
    <radialGradient id="eargrad{u}" cx="42%" cy="34%" r="72%">
      <stop offset="0%" stop-color="#FBF1DF"/>
      <stop offset="100%" stop-color="#DCC5A4"/>
    </radialGradient>
"""

def bear(uid=1, seed=3, w=200, h=210, glasses=False):
    eq = ""
    if glasses:
        eq = ('<g filter="url(#fuzzf1)">'
              '<path d="M52,104 Q56,92 78,92 L94,92 Q100,92 100,99 L100,112 Q100,120 91,120 L70,120 Q54,120 52,110 Z" fill="#1F5E46"/>'
              '<path d="M148,104 Q144,92 122,92 L106,92 Q100,92 100,99 L100,112 Q100,120 109,120 L130,120 Q146,120 148,110 Z" fill="#1F5E46"/>'
              '<path d="M100,98 L104,98" stroke="#1F5E46" stroke-width="4"/>'
              '</g>')
    return f'''<svg viewBox="0 0 200 210" width="{w}" height="{h}" class="bear">
  <defs>{FUR.format(u=uid, seed=seed)}</defs>

  <ellipse cx="100" cy="199" rx="54" ry="9" fill="#8A6636" opacity=".22"/>

  <!-- 耳朵 -->
  <g filter="url(#fuzzf{uid})">
    <circle cx="54" cy="58" r="27" fill="url(#eargrad{uid})"/>
    <circle cx="146" cy="58" r="27" fill="url(#eargrad{uid})"/>
  </g>

  <!-- 头 -->
  <g filter="url(#furf{uid})">
    <path d="M100,40 C155,40 184,74 184,120 C184,168 150,197 100,197 C50,197 16,168 16,120 C16,74 45,40 100,40 Z" fill="url(#grad{uid})"/>
  </g>

  <!-- 高光 -->
  <!-- 底部暗部 -->
  <ellipse cx="104" cy="176" rx="44" ry="15" fill="#C7AB84" opacity=".28"/>

  <!-- 腮红 -->
  <ellipse cx="58" cy="132" rx="12" ry="7" fill="#E8917A" opacity=".38"/>
  <ellipse cx="142" cy="132" rx="12" ry="7" fill="#E8917A" opacity=".38"/>

  <!-- 眼睛 -->
  <ellipse cx="72" cy="112" rx="6.6" ry="8.2" fill="#33291F"/>
  <ellipse cx="128" cy="112" rx="6.6" ry="8.2" fill="#33291F"/>
  <circle cx="69.8" cy="108.8" r="2.3" fill="#FFFFFF" opacity=".92"/>
  <circle cx="125.8" cy="108.8" r="2.3" fill="#FFFFFF" opacity=".92"/>
  {eq if glasses else ""}

  <!-- 鼻子 -->
  <path d="M94,126 Q100,121 106,126 Q108,130 100,133 Q92,130 94,126 Z" fill="#6B4A32"/>
  <!-- 嘴 -->
  <path d="M100,133 L100,139 M100,139 Q94,144 90,140 M100,139 Q106,144 110,140"
        stroke="#6B4A32" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>'''

html = f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>角色 · 毛绒版</title>
<style>
  body{{margin:0;background:#FAF4E8;color:#1E3B2F;
       font-family:"PingFang SC","Microsoft YaHei",sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:48px;}}
  .wrap{{display:flex;gap:64px;align-items:flex-end;flex-wrap:wrap;justify-content:center;}}
  .item{{text-align:center;}}
  .item .lb{{margin-top:10px;font-size:11px;letter-spacing:.14em;color:#A9A196;}}
  .big{{transform:scale(1);}}
</style></head>
<body>
<div class="wrap">
  <div class="item">{bear(1, 3, 300, 315)}<div class="lb">默认</div></div>
  <div class="item">{bear(2, 11, 200, 210, glasses=True)}<div class="lb">得意 · 墨镜</div></div>
  <div class="item">{bear(3, 7, 120, 126)}<div class="lb">112px</div></div>
  <div class="item">{bear(4, 5, 72, 76)}<div class="lb">64px</div></div>
</div>
</body></html>'''
io.open("bear.html","w",encoding="utf-8").write(html)
print("ok")

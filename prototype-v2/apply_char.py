# -*- coding: utf-8 -*-
import io, re

s = io.open("v5.html", encoding="utf-8").read()

def make_svg(uid):
    return f'''<svg class="char" viewBox="0 0 200 210" preserveAspectRatio="xMidYMax meet">
        <defs>
          <radialGradient id="cg{uid}" cx="35%" cy="21%" r="82%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="50%" stop-color="#FFFCF5"/>
            <stop offset="100%" stop-color="#F2E5D0"/>
          </radialGradient>
        </defs>
        <ellipse class="c-shadow" cx="100" cy="201" rx="50" ry="7.5" fill="#7A5A28" opacity=".16"/>
        <path class="ant" d="M84,66 L79,34" stroke="#DCC49C" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <circle class="ant-ball" cx="79" cy="33" r="5.6" fill="#E3CDA8"/>
        <path class="ant" d="M116,66 L121,34" stroke="#DCC49C" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <circle class="ant-ball" cx="121" cy="33" r="5.6" fill="#E3CDA8"/>
        <path class="c-body" d="M100,46 C156,46 185,80 185,124 C185,170 151,197 100,197 C49,197 15,170 15,124 C15,80 44,46 100,46 Z" fill="url(#cg{uid})"/>
        <ellipse class="c-shade" cx="104" cy="178" rx="46" ry="14" fill="#D8BF96" opacity=".22"/>
        <ellipse class="blush l" cx="57" cy="130" rx="12" ry="7" fill="#F5826A" opacity=".30"/>
        <ellipse class="blush r" cx="143" cy="130" rx="12" ry="7" fill="#F5826A" opacity=".30"/>
        <g class="eyes">
          <ellipse class="eye l" cx="73" cy="112" rx="7.6" ry="9.6" fill="#2E3B33"/>
          <ellipse class="eye r" cx="127" cy="112" rx="7.6" ry="9.6" fill="#2E3B33"/>
          <circle class="hl" cx="70.4" cy="108.4" r="2.4" fill="#FFFFFF" opacity=".95"/>
          <circle class="hl" cx="124.4" cy="108.4" r="2.4" fill="#FFFFFF" opacity=".95"/>
        </g>
        <path class="c-mouth" d="M92,133 Q100,142 108,133" stroke="#2E3B33" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </svg>'''

def find_end(text, start):
    """从 start 处的 <div 开始，返回匹配的闭合 </div> 之后的位置"""
    i = start
    depth = 0
    while i < len(text):
        if text.startswith("<div", i):
            depth += 1
            i += 4
        elif text.startswith("</div>", i):
            depth -= 1
            i += 6
            if depth == 0:
                return i
        else:
            i += 1
    return -1

# 逐个替换 mascot 块
count = 0
pos = 0
while True:
    idx = s.find('<div class="mascot', pos)
    if idx == -1:
        break
    end = find_end(s, idx)
    if end == -1:
        break
    count += 1
    s = s[:idx] + make_svg(count) + s[end:]
    pos = idx + 10

print("replaced:", count)

# 替换 CSS 段
css_start = s.find("  /* ===== 角色 ===== */")
css_end = s.find("  .absent{")
assert css_start != -1 and css_end != -1

new_css = """  /* ===== 角色（SVG） ===== */
  .mascot{position:relative;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center;}
  .char{display:block;width:100%;height:auto;overflow:visible;
        animation:bob 3.6s ease-in-out infinite;}
  @keyframes bob{
    0%,100%{transform:translateY(0)}
    50%{transform:translateY(-7px)}
  }
  .eye{transform-box:fill-box;transform-origin:center;animation:blinkE 5.6s infinite;}
  @keyframes blinkE{
    0%,93%,100%{transform:scaleY(1)}
    96%{transform:scaleY(.08)}
  }
  .ant{transform-box:fill-box;transform-origin:bottom center;
       animation:antSway 3.6s ease-in-out infinite;}
  .ant-ball{transform-box:fill-box;transform-origin:center;
            animation:antSway 3.6s ease-in-out infinite;}
  @keyframes antSway{
    0%,100%{transform:rotate(-2.5deg)}
    50%{transform:rotate(2.5deg)}
  }
  .c-shadow{animation:shadowPulse 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}
  @keyframes shadowPulse{
    0%,100%{transform:scale(1);opacity:.16}
    50%{transform:scale(.88);opacity:.10}
  }

"""
s = s[:css_start] + new_css + s[css_end:]

# 容器尺寸
s = s.replace(".hero-r{\n    width:136px;height:150px;", ".hero-r{\n    width:152px;height:158px;")

io.open("v5.html", "w", encoding="utf-8").write(s)
print("done")

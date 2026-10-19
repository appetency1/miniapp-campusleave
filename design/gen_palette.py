# -*- coding: utf-8 -*-
import math, io, json

def oklch_to_srgb(L, C, h):
    a = C * math.cos(math.radians(h))
    b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    def enc(x):
        x = max(0.0, min(1.0, x))
        return 12.92*x if x <= 0.0031308 else 1.055*(x**(1/2.4)) - 0.055
    return tuple(round(enc(v)*255) for v in (r, g, bb))

def hexof(L, C, h):
    r, g, b = oklch_to_srgb(L, C, h)
    return "#{:02X}{:02X}{:02X}".format(r, g, b), (r, g, b)

def lum(rgb):
    def f(c):
        c = c/255
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r, g, b = [f(x) for x in rgb]
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(c1, c2):
    L1, L2 = lum(c1), lum(c2)
    if L1 < L2: L1, L2 = L2, L1
    return (L1+0.05)/(L2+0.05)

# ===== 色相定义 =====
HUE_BRAND = 42      # 陶土橙：温暖、有手作感、不刺眼
HUE_ACCENT = 22     # 朱红：只做危险与驳回
HUE_NEUTRAL = 72    # 暖米倾向：与陶土同族

# ===== 中性色阶（10 阶，带极弱暖倾向）=====
NEUTRAL = [
    ("50",  0.985, 0.006),
    ("100", 0.962, 0.008),
    ("200", 0.930, 0.010),
    ("300", 0.880, 0.012),
    ("400", 0.780, 0.014),
    ("500", 0.660, 0.014),
    ("600", 0.540, 0.016),
    ("700", 0.420, 0.018),
    ("800", 0.300, 0.010),
    ("900", 0.200, 0.007),
]

# ===== 品牌绿阶（5 阶）=====
BRAND = [
    ("50",  0.966, 0.016),
    ("100", 0.928, 0.036),
    ("200", 0.862, 0.062),
    ("500", 0.560, 0.105),
    ("600", 0.462, 0.098),
    ("700", 0.360, 0.080),
]

# ===== 语义色 =====
SEM = {
    "success": [(0.935, 0.030, 152), (0.520, 0.090, 152)],
    "warning": [(0.948, 0.045, 84),  (0.640, 0.115, 78)],
    "danger":  [(0.945, 0.030, 24),  (0.520, 0.150, 24)],
    "info":    [(0.942, 0.022, 238), (0.520, 0.070, 238)],
}

out = {}
out["neutral"] = []
for n, L, C in NEUTRAL:
    hx, rgb = hexof(L, C, HUE_NEUTRAL)
    out["neutral"].append(dict(key=n, oklch=f"oklch({L*100:.1f}% {C} {HUE_NEUTRAL})", hex=hx, _rgb=rgb))

out["brand"] = []
for n, L, C in BRAND:
    hx, rgb = hexof(L, C, HUE_BRAND)
    out["brand"].append(dict(key=n, oklch=f"oklch({L*100:.1f}% {C} {HUE_BRAND})", hex=hx, _rgb=rgb))

out["accent"] = []
for n, L, C in [("50",0.945,0.030),("500",0.580,0.150),("600",0.500,0.145)]:
    hx, rgb = hexof(L, C, HUE_ACCENT)
    out["accent"].append(dict(key=n, oklch=f"oklch({L*100:.1f}% {C} {HUE_ACCENT})", hex=hx, _rgb=rgb))

out["semantic"] = {}
for k, arr in SEM.items():
    out["semantic"][k] = []
    for i, (L, C, h) in enumerate(arr):
        hx, rgb = hexof(L, C, h)
        out["semantic"][k].append(dict(key="soft" if i==0 else "solid", oklch=f"oklch({L*100:.1f}% {C} {h})", hex=hx, _rgb=rgb))

# ===== 关键对比度 =====
n = {x["key"]: x for x in out["neutral"]}
b = {x["key"]: x for x in out["brand"]}
a = {x["key"]: x for x in out["accent"]}
checks = [
    ("正文 / 页面底", n["900"]["_rgb"], n["50"]["_rgb"], 4.5),
    ("正文 / 卡片",   n["900"]["_rgb"], (255,255,255),    4.5),
    ("次要文字 / 卡片", n["600"]["_rgb"], (255,255,255),  4.5),
    ("辅助文字 / 卡片", n["500"]["_rgb"], (255,255,255),  3.0),
    ("白字 / 主按钮", (255,255,255),     b["600"]["_rgb"], 4.5),
    ("白字 / 强调按钮", (255,255,255),   a["600"]["_rgb"], 4.5),
    ("正文 / 身份卡", n["900"]["_rgb"], b["100"]["_rgb"], 4.5),
    ("身份卡说明 / 身份卡", n["700"]["_rgb"], b["100"]["_rgb"], 3.0),
]
res = []
for name, c1, c2, need in checks:
    cr = contrast(c1, c2)
    res.append(dict(name=name, ratio=round(cr,2), need=need, pass_=cr >= need))

def strip(d):
    return {k:v for k,v in d.items() if k != "_rgb"}

data = dict(neutral=[strip(x) for x in out["neutral"]],
            brand=[strip(x) for x in out["brand"]],
            accent=[strip(x) for x in out["accent"]],
            semantic={k:[strip(x) for x in v] for k,v in out["semantic"].items()},
            checks=res)

io.open("design/palette.json","w",encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2))

for r in res:
    print(f"{r['name']:22s} {r['ratio']:5.2f} : 1   need {r['need']}   {'OK' if r['pass_'] else 'FAIL'}")
print()
for x in out["neutral"]: print("neutral-"+x["key"], x["hex"], x["oklch"])
print()
for x in out["brand"]: print("brand-"+x["key"], x["hex"], x["oklch"])
print()
for x in out["accent"]: print("accent-"+x["key"], x["hex"], x["oklch"])

# -*- coding: utf-8 -*-
"""处理管理员端素材包（20 张 JPG）。

JPG 没有透明通道，图里的「棋盘格」是透明预览被截图后的产物，得自己抠：
- 圆形色块图标：找圆盘外接框 → 内切圆 mask
- 线条图标 / 插画：亮度阈值抠图（棋盘格与白底都接近纯白，深绿线条保留）

输出统一为 PNG。
"""
import os
from PIL import Image, ImageChops, ImageDraw

SRC = 'C:/Users/Administrator/.workbuddy/clipboard-images/'
OUT = 'D:/AI Code/CampusLeave/backend/web/assets/'

# 文件名(按拍摄毫秒顺序) -> 输出名
MAP = [
    ('09-01-03-653Z-3740467d.jpg', 'admin-hero.png',       'art'),   # 学校建筑
    ('09-01-03-655Z-d2cf2803.jpg', 'asset-hero-alt.png',   'art'),   # 学校建筑（暖色备用）
    ('09-01-03-658Z-7cbfaf32.jpg', 'welcome-bear.png',     'art'),   # 小熊
    ('09-01-03-661Z-7d09e605.jpg', 'stat-student.png',     'disc'),  # 圆·人物
    ('09-01-03-664Z-cddbfafa.jpg', 'stat-apply.png',       'disc'),  # 圆·文档
    ('09-01-03-666Z-dfc16d96.jpg', 'stat-active.png',      'disc'),  # 圆·时钟
    ('09-01-03-669Z-cc6582b7.jpg', 'stat-pending.png',     'disc'),  # 圆·沙漏
    ('09-01-03-672Z-7e79b001.jpg', 'nav-home.png',         'line'),  # 房子
    ('09-01-03-675Z-19015b66.jpg', 'nav-doc.png',          'line'),  # 文件
    ('09-01-03-678Z-fd03c407.jpg', 'nav-shield.png',       'line'),  # 盾牌勾
    ('09-01-03-681Z-2e225144.jpg', 'nav-person.png',       'line'),  # 人物
    ('09-01-03-684Z-647ea9d6.jpg', 'nav-people.png',       'line'),  # 双人
    ('09-01-03-687Z-fef7fad1.jpg', 'nav-team.png',         'line'),  # 三人
    ('09-01-03-691Z-440e0beb.jpg', 'nav-gear.png',         'line'),  # 齿轮
    ('09-01-03-694Z-21e82b13.jpg', 'nav-checklist.png',    'line'),  # 清单勾
    ('09-01-03-697Z-eea123ca.jpg', 'nav-shield-alert.png', 'line'),  # 盾牌感叹
    ('09-01-03-701Z-66e6b876.jpg', 'nav-sync.png',         'line'),  # 循环箭头
    ('09-01-03-704Z-818880dd.jpg', None,                   'line'),  # 与盾牌勾重复，跳过
    ('09-01-03-707Z-17931d7b.jpg', 'avatar-guard.png',     'disc'),  # 警察头像
    ('09-01-03-711Z-3cdda95c.jpg', 'avatar-teacher.png',   'disc'),  # 教师头像
]


def bbox_dark(im, tol=200):
    """找「比阈值暗」的区域外接框（线条图标的包围盒）"""
    gray = im.convert('L')
    mask = gray.point(lambda p: 255 if p < tol else 0)
    return mask.getbbox()


def remove_checker(im, tol=12):
    """抠掉「棋盘格」背景。

    素材是从「透明预览」截的图，背景不是纯白，而是 #FFFFFF 与 #E9E9E9 交替的方格。
    按亮度抠图只能去掉白格，灰格会残留成一块灰底 —— 这就是之前灰方块的来源。
    做法：采样四角拿到这两种背景色，把接近它们的像素全部转透明。
    """
    rgba = im.convert('RGBA')
    rgb = rgba.convert('RGB')
    w, h = rgb.size
    px = rgb.load()

    # 沿整圈边缘采样：棋盘格的两种颜色是交错的，只看四角容易只采到其中一种
    samples = []
    for x in range(0, w, 2):
        samples.append(px[x, 0])
        samples.append(px[x, 1])
        samples.append(px[x, h - 1])
        samples.append(px[x, h - 2])
    for y in range(0, h, 2):
        samples.append(px[0, y])
        samples.append(px[1, y])
        samples.append(px[w - 1, y])
        samples.append(px[w - 2, y])

    from collections import Counter
    cnt = Counter(samples)
    # 取出现最多的 3 种（棋盘两色 + 抗锯齿过渡色）
    bgs = [c for c, _ in cnt.most_common(3)]

    a = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = a[x, y]
            for br, bg_, bb in bgs:
                if abs(r - br) <= tol and abs(g - bg_) <= tol and abs(b - bb) <= tol:
                    a[x, y] = (r, g, b, 0)
                    break
    return rgba


def green_bbox(im):
    """按「有绿色倾向」找圆盘外接框 —— 棋盘格是纯灰（R≈G≈B），不会命中"""
    rgb = im.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if (g - r) > 6 and (g - b) > 2:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        return (0, 0, w, h)
    return (minx, miny, maxx + 1, maxy + 1)


def crown(im):
    """圆形色块图标：找圆盘外接框后做内切圆 mask"""
    bbox = green_bbox(im)
    im = im.crop(bbox).convert('RGBA')
    w, h = im.size
    size = min(w, h)
    im = im.crop(((w - size) // 2, (h - size) // 2, (w + size) // 2, (h + size) // 2))
    m = Image.new('L', (size, size), 0)
    inset = max(1, int(size * 0.008))
    ImageDraw.Draw(m).ellipse((inset, inset, size - 1 - inset, size - 1 - inset), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


def fit(im, canvas=256, pad=0.90):
    """等比缩放到 canvas 画布内居中"""
    im = im.copy()
    im.thumbnail((int(canvas * pad), int(canvas * pad)), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.paste(im, ((canvas - im.width) // 2, (canvas - im.height) // 2), im)
    return out


print('--- 处理 ---')
for src, dst, kind in MAP:
    if not dst:
        continue
    im = Image.open(SRC + 'clipboard-2026-10-22T' + src)
    if kind == 'disc':
        out = fit(crown(im), 256, 0.98)
    elif kind == 'line':
        cut = remove_checker(im)
        bbox = cut.split()[3].getbbox()
        if bbox:
            cut = cut.crop(bbox)
        out = fit(cut, 128, 0.92)
    else:  # art
        cut = remove_checker(im)
        bbox = cut.split()[3].getbbox()
        if bbox:
            cut = cut.crop(bbox)
        out = cut if cut.width >= 400 else fit(cut, 400, 0.98)
    out.save(OUT + dst, 'PNG', optimize=True)
    print('  %-26s %-10s %s' % (dst, kind, out.size))

print('done')

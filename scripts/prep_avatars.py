# -*- coding: utf-8 -*-
"""把 4 张学生头像处理成可用的圆形 PNG。

原图是方图 + 浅绿圆盘 + 白色四角，其中一张右下角还有「豆包 AI 生成」水印。
处理：找出圆盘的外接框 -> 按圆心半径做圆形裁切（水印在圆外，会被裁掉）
-> 输出 256×256 透明底 PNG。
"""
import os
from PIL import Image, ImageDraw

SRC = 'E:/微信记录/xwechat_files/wxid_w7bm2uvy7o9h22_289a/temp/RWTemp/2026-10/9e20f478899dc29eb19741386f9343c8/'
OUT = 'D:/AI Code/CampusLeave/backend/web/assets/'

FILES = [
    'eafb2a0d7fcd5469dbf0c17614d8025c.png',
    '9103f980407b54cc6ca84e32e8c04fc3.png',
    'f519a4ff5516637b034fe63ae2e782be.png',
    '8751af3bc9efad4e6f9e19b64368a9d6.png',
]


def find_disc(im):
    """找出非白色区域的外接框（圆盘所在范围）"""
    rgb = im.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    step = 2  # 隔点采样，够用且快
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            # 白色四角：三通道都很高且接近
            if r > 246 and g > 246 and b > 246:
                continue
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
    if maxx < 0:
        return (0, 0, w, h)
    return (minx, miny, maxx + 1, maxy + 1)


def circular(im, box):
    """按外接框做圆形裁切，返回 256×256 透明底"""
    im = im.crop(box).convert('RGBA')
    w, h = im.size
    size = min(w, h)
    im = im.crop(((w - size) // 2, (h - size) // 2, (w + size) // 2, (h + size) // 2))

    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, (0, 0), mask)
    return canvas.resize((256, 256), Image.LANCZOS)


print('--- 学生头像 ---')
for i, name in enumerate(FILES, start=1):
    im = Image.open(SRC + name)
    box = find_disc(im)
    out = circular(im, box)
    path = os.path.join(OUT, 'avatar-%d.png' % i)
    out.save(path, 'PNG', optimize=True)
    print('  avatar-%d.png  源 %s  裁切框 %s' % (i, im.size, box))

print('done')

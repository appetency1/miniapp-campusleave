# -*- coding: utf-8 -*-
"""把设计稿素材整理成前端可直接用的文件。

输入是用户给的 4 张 PNG：
  42615…  风景插画（房+树+云）  -> side-art.png        侧栏底部
  82052…  小熊 + 对话气泡        -> welcome-bear.png    右栏欢迎卡
  539a3…  文具组合（板/历/钟/盾）-> asset-stationery.png 空态插画
  55ca5…  3×3 图标总图           -> icon-*.png × 9      菜单与统计

处理逻辑：
1. 统一去掉四周的纯色留白（按左上角像素当背景色做差集取 bbox）
2. 图标总图按 3×3 均分后再各自去边，最后统一缩放到 128×128 画布居中，
   保证 9 个图标在 17px 显示时视觉大小一致
3. 输出成 RGBA，浅米底转透明（图标原图底是米白，不转透明会在深色处露底）
"""
import os
from PIL import Image, ImageChops

SRC = 'E:/微信记录/xwechat_files/wxid_w7bm2uvy7o9h22_289a/temp/RWTemp/2026-10/9e20f478899dc29eb19741386f9343c8/'
OUT = 'D:/AI Code/CampusLeave/backend/web/assets/'

FILES = {
    'side': '42615f7910df27d32fc9207e27ebdaa9.png',
    'bear': '82052d79d46a6affbf0ffa3e19b37c77.png',
    'stationery': '539a33fe1567d5030ae4848f4741bc69.png',
    'icons': '55ca521a288379fe1ac8bb9faafdb83f.png',
}

ICON_NAMES = [
    ['checklist', 'calendar-clock', 'bell'],
    ['gauge', 'gauge-alt', 'folder'],
    ['person', 'book', 'clipboard'],
]


def to_transparent(im, tol=10):
    """把接近左上角颜色的像素变成全透明（素材底是米白，不是透明）"""
    im = im.convert('RGBA')
    bg = im.getpixel((0, 0))
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) <= tol and abs(g - bg[1]) <= tol and abs(b - bg[2]) <= tol:
                px[x, y] = (r, g, b, 0)
    return im


def trim(im, tol=10):
    """裁掉四周透明边"""
    if im.mode != 'RGBA':
        im = im.convert('RGBA')
    alpha = im.split()[3]
    bbox = alpha.getbbox()
    return im.crop(bbox) if bbox else im


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, 'PNG', optimize=True)
    print('  %-28s %s' % (name, im.size))


print('--- 图标 ---')
icon_src = to_transparent(Image.open(SRC + FILES['icons']))
W, H = icon_src.size
cw, ch = W // 3, H // 3
for row in range(3):
    for col in range(3):
        cell = icon_src.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        cell = trim(cell)
        # 统一放到 128×128 画布，等比缩放并居中，保证视觉重量一致
        cell.thumbnail((112, 112), Image.LANCZOS)
        canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        canvas.paste(cell, ((128 - cell.width) // 2, (128 - cell.height) // 2), cell)
        save(canvas, 'icon-%s.png' % ICON_NAMES[row][col])

print('--- 插画 ---')
for key, name in [('side', 'side-art.png'), ('bear', 'welcome-bear.png'),
                  ('stationery', 'asset-stationery.png')]:
    im = trim(to_transparent(Image.open(SRC + FILES[key])))
    save(im, name)

print('done ->', OUT)

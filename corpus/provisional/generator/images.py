# -*- coding: utf-8 -*-
# SPDX-License-Identifier: AGPL-3.0-only
"""Corpus images: all drawn here with Pillow (geometric shapes only,
no rendered text -> no dependency on a system font; deterministic output)."""
import math
import os
import random

from PIL import Image, ImageDraw


def _save(img, path, **kw):
    img.save(path, **kw)
    return path


def pie(path, num, den, color=(66, 133, 244), size=400):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    pad = 8
    box = (pad, pad, size - pad, size - pad)
    for k in range(den):
        a0 = -90 + 360.0 * k / den
        a1 = -90 + 360.0 * (k + 1) / den
        fill = color + (255,) if k < num else (255, 255, 255, 255)
        d.pieslice(box, a0, a1, fill=fill, outline=(40, 40, 40, 255), width=4)
    return _save(img, path)


def bar_fraction(path, num, den, color=(234, 67, 53), w=600, h=90):
    img = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    cw = (w - 8) / float(den)
    for k in range(den):
        x0 = 4 + k * cw
        d.rectangle((x0, 4, x0 + cw, h - 4), fill=color if k < num else (255, 255, 255), outline=(40, 40, 40), width=3)
    return _save(img, path)


def seyes(path, w=1240, h=1754):
    """Seyes ruled page background (French school grid): horizontal lines every 2 mm,
    thick line every 8 mm, vertical lines every 8 mm, red margin."""
    img = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    px_mm = w / 210.0
    y = 25 * px_mm
    k = 0
    while y < h - 10 * px_mm:
        if k % 4 == 0:
            d.line((0, y, w, y), fill=(120, 150, 210), width=2)
        else:
            d.line((0, y, w, y), fill=(200, 190, 230), width=1)
        y += 2 * px_mm
        k += 1
    x = 30 * px_mm
    while x < w:
        d.line((x, 25 * px_mm, x, h - 10 * px_mm), fill=(150, 170, 220), width=1)
        x += 8 * px_mm
    d.line((25 * px_mm, 0, 25 * px_mm, h), fill=(220, 60, 60), width=2)
    return _save(img, path, optimize=False)


def plant(path, w=500, h=600):
    img = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    # pot
    d.polygon([(150, 450), (350, 450), (320, 580), (180, 580)], fill=(196, 110, 60), outline=(90, 50, 20))
    d.rectangle((140, 430, 360, 455), fill=(170, 90, 45), outline=(90, 50, 20))
    # soil + roots
    d.ellipse((170, 440, 330, 470), fill=(110, 70, 40))
    for k in range(5):
        x = 200 + k * 25
        d.line((250, 470, x, 560), fill=(230, 220, 190), width=3)
    # stem
    d.line((250, 440, 250, 160), fill=(40, 130, 40), width=10)
    # leaves
    for (y, s) in ((380, -1), (320, 1), (260, -1), (210, 1)):
        x0 = 250
        x1 = 250 + s * 120
        d.polygon([(x0, y), ((x0 + x1) / 2, y - 45), (x1, y - 10), ((x0 + x1) / 2, y + 20)],
                  fill=(70, 170, 70), outline=(30, 100, 30))
    # flower
    for k in range(8):
        a = 2 * math.pi * k / 8
        cx, cy = 250 + 45 * math.cos(a), 120 + 45 * math.sin(a)
        d.ellipse((cx - 28, cy - 28, cx + 28, cy + 28), fill=(250, 200, 40), outline=(200, 140, 0))
    d.ellipse((222, 92, 278, 148), fill=(140, 80, 20))
    return _save(img, path)


def landscape(path, w=800, h=500, sky=(135, 190, 235), hill=(90, 160, 80), sun=True, seed=1, jpeg=False):
    rnd = random.Random(seed)
    img = Image.new('RGB', (w, h), sky)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / float(h)
        c = tuple(int(sky[i] * (1 - t * 0.4) + 255 * t * 0.4) for i in range(3))
        d.line((0, y, w, y), fill=c)
    if sun:
        d.ellipse((w - 190, 40, w - 90, 140), fill=(255, 220, 80))
    for layer in range(3):
        pts = [(0, h)]
        base = h * (0.55 + 0.12 * layer)
        for x in range(0, w + 40, 40):
            pts.append((x, base + rnd.randint(-30, 30)))
        pts.append((w, h))
        c = tuple(max(0, hill[i] - 25 * layer) for i in range(3))
        d.polygon(pts, fill=c)
    for k in range(6):
        x = rnd.randint(20, w - 40)
        y = int(h * 0.8) + rnd.randint(-20, 30)
        d.rectangle((x + 8, y, x + 14, y + 30), fill=(100, 70, 40))
        d.ellipse((x - 10, y - 35, x + 32, y + 5), fill=(40, 110, 50))
    if jpeg:
        return _save(img, path, quality=85, optimize=False)
    return _save(img, path)


def logo(path, shape='circle', c1=(0, 102, 153), c2=(255, 170, 0), size=300):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    if shape == 'circle':
        d.ellipse((10, 10, size - 10, size - 10), fill=c1)
        d.polygon([(size / 2, 50), (size - 70, size - 80), (70, size - 80)], fill=c2)
    elif shape == 'leaf':
        d.ellipse((30, 60, size - 30, size - 60), fill=c1)
        d.line((60, size - 70, size - 60, 70), fill=(255, 255, 255, 255), width=12)
    elif shape == 'hands':
        for k, col in enumerate((c1, c2, (220, 60, 90))):
            cx = 90 + k * 60
            d.ellipse((cx - 60, 80, cx + 60, 200), fill=col + (220,))
        d.rectangle((40, 220, size - 40, 250), fill=c1)
    elif shape == 'tools':
        d.rectangle((20, 20, size - 20, size - 20), fill=c1)
        d.polygon([(60, size - 60), (size / 2, 70), (size - 60, size - 60)], outline=c2, width=18)
        d.line((size / 2, 70, size / 2, size - 60), fill=c2, width=14)
    elif shape == 'blason':
        d.polygon([(30, 30), (size - 30, 30), (size - 30, size / 2), (size / 2, size - 20), (30, size / 2)],
                  fill=c1, outline=(30, 30, 30))
        d.rectangle((size / 2 - 15, 60, size / 2 + 15, size - 80), fill=c2)
        d.rectangle((70, size / 2 - 30, size - 70, size / 2), fill=c2)
    return _save(img, path)


def avatar(path, size=400):
    img = Image.new('RGB', (size, size), (200, 214, 229))
    d = ImageDraw.Draw(img)
    d.ellipse((size * 0.32, size * 0.18, size * 0.68, size * 0.54), fill=(120, 140, 165))
    d.ellipse((size * 0.15, size * 0.58, size * 0.85, size * 1.2), fill=(120, 140, 165))
    return _save(img, path, quality=90) if path.endswith('.jpg') else _save(img, path)


def stamp(path, size=360, color=(30, 60, 160)):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    col = color + (190,)
    d.ellipse((6, 6, size - 6, size - 6), outline=col, width=10)
    d.ellipse((50, 50, size - 50, size - 50), outline=col, width=5)
    for k in range(48):
        a = 2 * math.pi * k / 48
        r0, r1 = size / 2 - 40, size / 2 - 18
        cx = cy = size / 2
        d.line((cx + r0 * math.cos(a), cy + r0 * math.sin(a), cx + r1 * math.cos(a), cy + r1 * math.sin(a)),
               fill=col, width=4)
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        r = 70 if k % 2 == 0 else 30
        pts.append((size / 2 + r * math.cos(a), size / 2 + r * math.sin(a)))
    d.polygon(pts, fill=col)
    return _save(img, path)


def signature(path, w=500, h=160, seed=7):
    rnd = random.Random(seed)
    img = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    pts = []
    x = 20
    while x < w - 30:
        pts.append((x, h / 2 + 45 * math.sin(x / 23.0) * rnd.uniform(0.5, 1.0)))
        x += 6
    d.line(pts, fill=(20, 30, 90, 255), width=4)
    d.line((30, h - 30, w - 60, h - 45), fill=(20, 30, 90, 255), width=3)
    return _save(img, path)


def picto(path, kind, size=260, color=(0, 120, 200)):
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    c = color + (255,)
    if kind == 'main':  # freehand
        d.rounded_rectangle((80, 110, 190, 240), 30, fill=c)
        for k in range(4):
            d.rounded_rectangle((82 + k * 27, 20 + (k % 3) * 10, 104 + k * 27, 140), 10, fill=c)
        d.rounded_rectangle((30, 120, 95, 150), 14, fill=c)
    elif kind == 'oreille':
        d.ellipse((60, 20, 200, 200), outline=c, width=22)
        d.rectangle((60, 110, 130, 240), fill=(255, 255, 255, 0))
        d.line((130, 200, 110, 245), fill=c, width=22)
    elif kind == 'bulle':
        d.ellipse((20, 30, 240, 190), fill=c)
        d.polygon([(70, 170), (40, 245), (130, 180)], fill=c)
    elif kind == 'coeur':
        d.ellipse((30, 40, 135, 145), fill=c)
        d.ellipse((125, 40, 230, 145), fill=c)
        d.polygon([(36, 112), (224, 112), (130, 235)], fill=c)
    elif kind == 'rangement':
        d.rectangle((40, 100, 220, 230), outline=c, width=14)
        d.line((40, 100, 130, 40), fill=c, width=14)
        d.line((220, 100, 130, 40), fill=c, width=14)
    elif kind == 'pyramide':
        d.polygon([(130, 20), (240, 230), (20, 230)], fill=(220, 180, 90, 255), outline=(150, 110, 40, 255))
        for y in range(60, 230, 30):
            d.line((130 - (y - 20) * 0.52, y, 130 + (y - 20) * 0.52, y), fill=(150, 110, 40, 255), width=3)
    elif kind == 'chateau':
        d.rectangle((40, 100, 220, 240), fill=(150, 150, 160, 255))
        for x in (40, 100, 160):
            d.rectangle((x, 60, x + 30, 100), fill=(150, 150, 160, 255))
        d.rectangle((110, 170, 150, 240), fill=(80, 60, 40, 255))
    elif kind == 'temple':
        d.polygon([(20, 80), (240, 80), (130, 20)], fill=(230, 230, 220, 255), outline=(120, 120, 110, 255))
        for x in range(35, 230, 40):
            d.rectangle((x, 85, x + 18, 220), fill=(230, 230, 220, 255), outline=(120, 120, 110, 255))
        d.rectangle((20, 220, 240, 240), fill=(200, 200, 190, 255))
    elif kind == 'usine':
        d.rectangle((20, 130, 240, 240), fill=(140, 80, 60, 255))
        d.rectangle((170, 40, 200, 130), fill=(120, 70, 50, 255))
        d.ellipse((165, 5, 215, 45), fill=(180, 180, 180, 200))
        for x in range(35, 160, 40):
            d.rectangle((x, 160, x + 22, 190), fill=(250, 230, 120, 255))
    elif kind == 'livre':
        d.polygon([(20, 60), (128, 80), (128, 230), (20, 210)], fill=c)
        d.polygon([(240, 60), (132, 80), (132, 230), (240, 210)], fill=color[::-1] + (255,))
    elif kind == 'calendrier':
        d.rectangle((30, 50, 230, 230), fill=(255, 255, 255, 255), outline=c, width=8)
        d.rectangle((30, 50, 230, 95), fill=c)
        for i in range(4):
            for j in range(3):
                d.rectangle((50 + i * 45, 110 + j * 38, 80 + i * 45, 135 + j * 38), fill=c)
    return _save(img, path)


def gradient_bg(path, w=1240, h=1754, c1=(255, 236, 179), c2=(255, 112, 67), dots=True, seed=3):
    rnd = random.Random(seed)
    img = Image.new('RGB', (w, h), c1)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / float(h)
        d.line((0, y, w, y), fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    if dots:
        for k in range(60):
            x, y, r = rnd.randint(0, w), rnd.randint(0, h), rnd.randint(8, 40)
            d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255), width=3)
    return _save(img, path, quality=82) if path.endswith('.jpg') else _save(img, path)


def build_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    p = lambda n: os.path.join(outdir, n)
    pie(p('pie_1_2.png'), 1, 2)
    pie(p('pie_1_4.png'), 1, 4, (52, 168, 83))
    pie(p('pie_3_4.png'), 3, 4, (251, 188, 5))
    pie(p('pie_2_3.png'), 2, 3, (234, 67, 53))
    pie(p('pie_3_8.png'), 3, 8, (156, 39, 176))
    bar_fraction(p('bar_2_5.png'), 2, 5)
    bar_fraction(p('bar_5_6.png'), 5, 6, (66, 133, 244))
    seyes(p('seyes.png'))
    plant(p('plante.png'))
    landscape(p('paysage1.png'), seed=1)
    landscape(p('paysage2.jpg'), sky=(250, 200, 150), hill=(160, 140, 80), seed=2, jpeg=True)
    landscape(p('paysage3.png'), sky=(170, 210, 240), hill=(60, 140, 120), sun=False, seed=3, w=600, h=600)
    logo(p('logo_ecole.png'), 'blason', (0, 84, 147), (255, 204, 0))
    logo(p('logo_asso.png'), 'hands', (0, 150, 136), (255, 152, 0))
    logo(p('logo_jardin.png'), 'leaf', (76, 175, 80))
    logo(p('logo_menuiserie.png'), 'tools', (93, 64, 55), (255, 193, 7))
    logo(p('logo_commune.png'), 'blason', (21, 101, 192), (255, 255, 255))
    logo(p('logo_service.png'), 'circle', (0, 51, 102), (204, 0, 0))
    avatar(p('avatar.jpg'))
    stamp(p('cachet.png'))
    signature(p('signature.png'))
    for k in ('main', 'oreille', 'bulle', 'coeur', 'rangement', 'livre', 'calendrier'):
        picto(p('picto_%s.png' % k), k)
    for k in ('pyramide', 'temple', 'chateau', 'usine'):
        picto(p('frise_%s.png' % k), k)
    gradient_bg(p('fond_flyer.jpg'))
    return outdir

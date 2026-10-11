"""Draws the refresh icon (a circular arrow) used on the game screen: src/qml/icons/refresh.png

    pip install pillow
    python3 tools/make_refresh_icon.py
"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCALE, SIZE = 4, 160
B = SIZE * SCALE

img = Image.new("RGBA", (B, B), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
cx, cy, r, w = B * 0.47, B * 0.53, B * 0.29, B * 0.09
start, end = 12, 312          # degrees, clockwise from 3 o'clock


def pt(a):
    return cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))


d.arc((cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2), start, end, fill="black", width=int(w))
x, y = pt(start)
d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill="black")       # rounded tail

a = math.radians(end)
hx, hy = pt(end)
tx, ty = -math.sin(a), math.cos(a)        # direction of travel (clockwise tangent)
nx, ny = math.cos(a), math.sin(a)         # outward normal
L, W = w * 2.4, w * 1.9
d.polygon([(hx + tx * L, hy + ty * L), (hx + nx * W, hy + ny * W), (hx - nx * W, hy - ny * W)], fill="black")

out = os.path.join(ROOT, "src", "qml", "icons")
os.makedirs(out, exist_ok=True)
img.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, "refresh.png"), optimize=True)
print("Wrote", os.path.join(out, "refresh.png"))

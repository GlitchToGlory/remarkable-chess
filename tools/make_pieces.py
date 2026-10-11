"""Generates the piece images (src/qml/pieces/*.png) and the launcher icon (package/icon.png).

The pieces are the chess glyphs from the DejaVu Sans font, drawn as solid black / white
shapes for good contrast on e-ink. The PNGs are committed to the repo, so you only need
this script if you want to change their look:

    pip install pillow
    python3 tools/make_pieces.py /path/to/DejaVuSans.ttf
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SIZE = 160          # output image size (px); the app scales it to the square
SCALE = 4           # supersampling for smooth edges

OUTLINE = {"K": "♔", "Q": "♕", "R": "♖", "B": "♗", "N": "♘", "P": "♙"}
FILLED = {"K": "♚", "Q": "♛", "R": "♜", "B": "♝", "N": "♞", "P": "♟"}


def render(piece, colour, size=SIZE, inset=0.06):
    big = size * SCALE
    font = ImageFont.truetype(FONT, int(big * 0.86))
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Centre using the outline glyph's box (both glyph sets share metrics).
    l, t, r, b = d.textbbox((0, 0), OUTLINE[piece], font=font)
    x = (big - (r - l)) / 2 - l
    y = big * (1 - inset) - b  # sit pieces on a common baseline near the bottom
    stroke = max(2, big // 60)
    if colour == "w":
        d.text((x, y), FILLED[piece], font=font, fill="white", stroke_width=stroke, stroke_fill="white")
        d.text((x, y), OUTLINE[piece], font=font, fill="black", stroke_width=stroke // 2, stroke_fill="black")
    else:
        d.text((x, y), FILLED[piece], font=font, fill="black", stroke_width=stroke, stroke_fill="white")
    return img.resize((size, size), Image.LANCZOS)


def main():
    out = os.path.join(ROOT, "src", "qml", "pieces")
    os.makedirs(out, exist_ok=True)
    for colour in "wb":
        for piece in "KQRBNP":
            render(piece, colour).save(os.path.join(out, colour + piece + ".png"), optimize=True)

    # Launcher icon: black knight on a white tile with a black border.
    icon = Image.new("RGBA", (256, 256), (255, 255, 255, 255))
    d = ImageDraw.Draw(icon)
    d.rounded_rectangle((6, 6, 249, 249), radius=36, outline="black", width=10)
    knight = render("N", "b", size=220, inset=0.16)
    icon.alpha_composite(knight, (16, 22))
    icon.save(os.path.join(ROOT, "package", "icon.png"), optimize=True)
    print("Wrote pieces to", out)


if __name__ == "__main__":
    main()

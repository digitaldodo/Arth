"""Generate SpendSense raster brand assets from its fixed ledger-mark geometry.

Requires Pillow. The vector source remains the SVG logo family; this script
draws the same normalized paths at high resolution before downsampling.
"""

from __future__ import annotations

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
BRAND = PUBLIC / "brand"
ICONS = PUBLIC / "icons"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

GREEN = "#193F37"
PAPER = "#F6F4ED"
FOLD = "#D9E2D9"
COPPER = "#B67645"
INK = "#181615"
LIGHT_INK = "#F6F4ED"

PAGE = "M42 20h52l34 34v78q0 8-8 8H40q-8 0-8-8V28q0-8 10-8z"
S_MARK = "M96 57H64c-11 0-17 6-17 15 0 8 6 12 17 16l19 6c11 4 17 10 17 18 0 9-7 15-19 15H49"


def symbol_svg(background: str = GREEN, page: str = PAPER, stroke: str = GREEN, accent: str = COPPER) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="SpendSense symbol">
  <rect width="160" height="160" rx="34" fill="{background}"/>
  <path d="{PAGE}" fill="{page}"/>
  <path d="M94 20v34h34" fill="none" stroke="{FOLD}" stroke-width="3" stroke-linejoin="round"/>
  <path d="{S_MARK}" fill="none" stroke="{stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M94 128h17" stroke="{accent}" stroke-width="5" stroke-linecap="round"/>
</svg>'''


def wordmark_svg(text_color: str, mono: bool = False) -> str:
    background, page, stroke, accent = (INK, "#FFFFFF", INK, INK) if mono else (GREEN, PAPER, GREEN, COPPER)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 160" role="img" aria-label="SpendSense">
  <rect width="160" height="160" rx="34" fill="{background}"/>
  <path d="{PAGE}" fill="{page}"/>
  <path d="M94 20v34h34" fill="none" stroke="{FOLD}" stroke-width="3" stroke-linejoin="round"/>
  <path d="{S_MARK}" fill="none" stroke="{stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M94 128h17" stroke="{accent}" stroke-width="5" stroke-linecap="round"/>
  <text x="184" y="106" fill="{text_color}" font-family="Inter, Arial, sans-serif" font-size="63" font-weight="600" letter-spacing="-1.8">SpendSense</text>
</svg>'''


def bezier(p0, p1, p2, p3, steps=24):
    points = []
    for i in range(steps + 1):
        t = i / steps
        q = 1 - t
        points.append((
            q**3 * p0[0] + 3*q*q*t*p1[0] + 3*q*t*t*p2[0] + t**3*p3[0],
            q**3 * p0[1] + 3*q*q*t*p1[1] + 3*q*t*t*p2[1] + t**3*p3[1],
        ))
    return points


def scaled(points, scale):
    return [(round(x * scale), round(y * scale)) for x, y in points]


def draw_symbol(size: int, maskable: bool = False) -> Image.Image:
    scale = max(8, math.ceil(1024 / size))
    canvas = size * scale
    image = Image.new("RGBA", (canvas, canvas), GREEN)
    draw = ImageDraw.Draw(image)
    k = canvas / 160
    r = 34 * k
    draw.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=r, fill=GREEN)
    page_pts = scaled([(42,20),(94,20),(128,54),(128,132),(128,140),(120,140),(40,140),(32,140),(32,132),(32,28)], k)
    draw.polygon(page_pts, fill=PAPER)
    draw.line(scaled([(94,20),(94,54),(128,54)], k), fill=FOLD, width=max(1, round(3*k)), joint="curve")
    path = [(96,57),(64,57)]
    path += bezier((64,57),(53,57),(47,63),(47,72))[1:]
    path += bezier((47,72),(47,80),(53,84),(64,88))[1:]
    path += [(83,94)]
    path += bezier((83,94),(94,98),(100,104),(100,112))[1:]
    path += bezier((100,112),(100,121),(93,127),(81,127))[1:]
    path += [(49,127)]
    draw.line(scaled(path, k), fill=GREEN, width=max(1, round(10*k)), joint="curve")
    draw.line(scaled([(94,128),(111,128)], k), fill=COPPER, width=max(1, round(5*k)))
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    return image


def font(size: int, bold: bool = False):
    candidates = ([r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"] if bold else
                  [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"])
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def create_og():
    image = Image.new("RGB", (1200, 630), PAPER)
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((70, 82, 1130, 548), radius=24, fill="#FFFFFF", outline="#E4E2DC", width=2)
    image.alpha_composite(draw_symbol(270).resize((270,270)), (124,180)) if image.mode == "RGBA" else image.paste(draw_symbol(270).convert("RGB"), (124,180))
    d = ImageDraw.Draw(image)
    d.text((450, 224), "SpendSense", fill=INK, font=font(72, True))
    d.text((454, 319), "A clearer view of your money.", fill="#494541", font=font(30))
    d.text((454, 376), "Indian personal finance, organized with care.", fill="#736E66", font=font(23))
    d.rounded_rectangle((454, 438, 724, 444), radius=3, fill=COPPER)
    image.save(BRAND / "spendsense-og.png", optimize=True)


def create_preview():
    image = Image.new("RGB", (1600, 1040), PAPER)
    d = ImageDraw.Draw(image)
    d.text((76, 56), "SPENDSENSE  /  BRAND SYSTEM", fill=GREEN, font=font(23, True))
    d.text((76, 96), "Ledger Minimal · geometric ledger S", fill="#736E66", font=font(20))
    # Light horizontal lockup
    d.rounded_rectangle((76, 160, 1524, 365), radius=18, fill="#FFFFFF", outline="#E4E2DC", width=2)
    image.paste(draw_symbol(128).convert("RGB"), (116, 198))
    d.text((284, 234), "SpendSense", fill=INK, font=font(64, True))
    d.text((287, 310), "LIGHT WORDMARK", fill="#736E66", font=font(16, True))
    # Dark reversed lockup
    d.rounded_rectangle((76, 402, 1524, 606), radius=18, fill=GREEN)
    image.paste(draw_symbol(128).convert("RGB"), (116, 440))
    d.text((284, 476), "SpendSense", fill=PAPER, font=font(64, True))
    d.text((287, 552), "DARK WORDMARK", fill="#D9E2D9", font=font(16, True))
    # Compact panels
    cards = [(76,642,514,966),(544,642,982,966),(1012,642,1524,966)]
    for card in cards:
        d.rounded_rectangle(card, radius=18, fill="#FFFFFF", outline="#E4E2DC", width=2)
    d.text((104, 668), "SYMBOL", fill=GREEN, font=font(16, True))
    image.paste(draw_symbol(176).convert("RGB"), (205, 730))
    d.text((584, 668), "BROWSER TAB · 16 PX", fill=GREEN, font=font(16, True))
    d.rounded_rectangle((575, 730, 950, 796), radius=12, fill="#F1F1ED", outline="#CDCABF", width=1)
    d.ellipse((592, 752, 602, 762), fill="#CDCABF")
    image.paste(draw_symbol(32).convert("RGB"), (615, 747))
    d.rounded_rectangle((660, 740, 930, 786), radius=8, fill="#FFFFFF")
    d.text((684, 750), "SpendSense · Ledger", fill="#494541", font=font(17))
    d.text((584, 841), "The folded page and S remain distinct", fill="#494541", font=font(17))
    d.text((584, 870), "at favicon and launcher sizes.", fill="#494541", font=font(17))
    d.text((1052, 668), "PWA / ANDROID LAUNCHER", fill=GREEN, font=font(16, True))
    image.paste(draw_symbol(192).convert("RGB"), (1172, 716))
    d.text((1120, 930), "512 px · safe-zone aware", fill="#736E66", font=font(16))
    image.save(BRAND / "spendsense-brand-preview.png", optimize=True)


def main():
    BRAND.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    light = wordmark_svg(INK)
    dark = wordmark_svg(PAPER)
    mono = wordmark_svg(INK, mono=True)
    (BRAND / "spendsense-logo.svg").write_text(light, encoding="utf-8")
    (BRAND / "spendsense-logo-dark.svg").write_text(dark, encoding="utf-8")
    (BRAND / "spendsense-logo-monochrome.svg").write_text(mono, encoding="utf-8")
    (BRAND / "spendsense-symbol.svg").write_text(symbol_svg(), encoding="utf-8")
    (PUBLIC / "favicon.svg").write_text(symbol_svg(), encoding="utf-8")

    for size in (16, 32, 48):
        draw_symbol(size).save(PUBLIC / f"favicon-{size}.png", optimize=True)
    draw_symbol(48).save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48)])
    (ROOT / "frontend" / "src" / "app" / "favicon.ico").write_bytes((PUBLIC / "favicon.ico").read_bytes())

    for size, name in ((180,"apple-touch-icon.png"),(192,"icon-192x192.png"),(512,"icon-512x512.png"),(512,"icon-512x512-maskable.png")):
        draw_symbol(size, maskable=name.endswith("maskable.png")).save(ICONS / name, optimize=True)

    # Legacy launcher densities plus adaptive foreground/background for Android 8+.
    for density, size in (("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)):
        folder = ANDROID_RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        draw_symbol(size).save(folder / "ic_launcher.png", optimize=True)
        draw_symbol(size).save(folder / "ic_launcher_round.png", optimize=True)
    create_og()
    create_preview()


if __name__ == "__main__":
    main()

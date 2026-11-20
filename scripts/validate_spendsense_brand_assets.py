"""Validate SpendSense icon dimensions and referenced public brand assets."""

from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"


def png_size(path: Path):
    with path.open("rb") as image:
        header = image.read(24)
    assert header[:8] == b"\x89PNG\r\n\x1a\n", f"not a PNG: {path}"
    return struct.unpack(">II", header[16:24])


def validate_ico(path: Path):
    raw = path.read_bytes()
    reserved, kind, count = struct.unpack("<HHH", raw[:6])
    assert (reserved, kind, count) == (0, 1, 3), "favicon.ico must contain three icon images"
    dimensions = []
    for index in range(count):
        width, height = struct.unpack("BB", raw[6 + index * 16:8 + index * 16])
        dimensions.append((width or 256, height or 256))
    assert set(dimensions) == {(16, 16), (32, 32), (48, 48)}, dimensions


def main():
    sizes = {
        "favicon-16.png": (16, 16),
        "favicon-32.png": (32, 32),
        "favicon-48.png": (48, 48),
        "icons/apple-touch-icon.png": (180, 180),
        "icons/icon-192x192.png": (192, 192),
        "icons/icon-512x512.png": (512, 512),
        "icons/icon-512x512-maskable.png": (512, 512),
        "brand/spendsense-og.png": (1200, 630),
        "brand/spendsense-brand-preview.png": (1600, 1040),
    }
    for relative, expected in sizes.items():
        path = PUBLIC / relative
        assert path.is_file(), f"missing {path}"
        actual = png_size(path)
        assert actual == expected, f"{relative}: expected {expected}, got {actual}"
        print(f"OK {relative}: {actual[0]}x{actual[1]}")

    validate_ico(PUBLIC / "favicon.ico")
    validate_ico(ROOT / "frontend" / "src" / "app" / "favicon.ico")
    print("OK favicon.ico: 16x16, 32x32, 48x48 (public and Next.js route)")

    manifest = (ROOT / "frontend" / "src" / "app" / "manifest.ts").read_text(encoding="utf-8")
    referenced = re.findall(r"src:\s*'(/[^']+)'", manifest)
    for url in referenced:
        path = PUBLIC / url.lstrip("/")
        assert path.is_file(), f"manifest asset is missing: {url}"
        print(f"OK manifest asset: {url}")

    metadata = (ROOT / "frontend" / "src" / "app" / "layout.tsx").read_text(encoding="utf-8")
    for url in ("/favicon.svg", "/favicon.ico", "/brand/spendsense-og.png", "/icons/apple-touch-icon.png"):
        assert (PUBLIC / url.lstrip("/")).is_file(), f"metadata asset is missing: {url}"
    for name in ("spendsense-logo.svg", "spendsense-logo-dark.svg", "spendsense-logo-monochrome.svg", "spendsense-symbol.svg"):
        ET.parse(PUBLIC / "brand" / name)
    ET.parse(PUBLIC / "favicon.svg")
    ET.parse(ROOT / "frontend" / "src" / "app" / "icon.svg")
    assert not list((PUBLIC / "brand").glob("arth-*.svg")), "old Arth logo assets must not remain"
    print("OK SVG brand family, app metadata, and obsolete logo removal")

    for density, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        for suffix in ("ic_launcher.png", "ic_launcher_round.png"):
            actual = png_size(ROOT / "android" / "app" / "src" / "main" / "res" / f"mipmap-{density}" / suffix)
            assert actual == (size, size), f"{density}/{suffix}: {actual}"
    ET.parse(ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-anydpi-v26" / "ic_launcher.xml")
    ET.parse(ROOT / "android" / "app" / "src" / "main" / "res" / "drawable" / "ic_launcher_foreground.xml")
    print("OK Android launcher densities and adaptive icon resources")


if __name__ == "__main__":
    main()

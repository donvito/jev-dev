"""Generate jev dev's monochrome native icons using the shared J geometry.

Standard library only. Run from any directory; output stays beside this script.
"""

from pathlib import Path
import math
import struct
import zlib


ROOT = Path(__file__).resolve().parent
SEGMENTS = [
    ((193, 146), (320, 146)),
    ((286, 146), (286, 294)),
    ((286, 294), (273, 328)),
    ((273, 328), (242, 348)),
    ((242, 348), (207, 348)),
    ((207, 348), (177, 328)),
]


def line_distance(x, y, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    progress = max(
        0,
        min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / (dx * dx + dy * dy)),
    )
    return math.hypot(x - start[0] - progress * dx, y - start[1] - progress * dy)


def chunk(kind, contents):
    return (
        struct.pack(">I", len(contents))
        + kind
        + contents
        + struct.pack(">I", zlib.crc32(kind + contents) & 0xFFFFFFFF)
    )


def render(size):
    pixels = bytearray()
    scale = size / 512
    for py in range(size):
        pixels.append(0)
        y = (py + 0.5) / scale - 0.5
        for px in range(size):
            x = (px + 0.5) / scale - 0.5
            qx, qy = abs(x - 255.5) - 175.5, abs(y - 255.5) - 175.5
            outline = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - 66
            alpha = round(255 * min(1, max(0, 0.5 - outline * scale)))
            mark = min(line_distance(x, y, start, end) for start, end in SEGMENTS) - 21
            white = round(255 * min(1, max(0, 0.5 - mark * scale)))
            pixels.extend((white, white, white, alpha))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(pixels, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    png = render(512)
    (ROOT / "icon.png").write_bytes(png)
    icns = b"ic09" + struct.pack(">I", len(png) + 8) + png
    (ROOT / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(icns) + 8) + icns)
    png256 = render(256)
    (ROOT / "icon.ico").write_bytes(
        struct.pack("<HHH", 0, 1, 1)
        + struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png256), 22)
        + png256
    )

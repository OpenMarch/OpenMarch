"""Pairs two runs' captures from `tests/render-compare.spec.mts`.

    python3 e2e/browser/render-compare.py <folder> [before] [after]

For each capture in <folder>/<before> and <folder>/<after> (defaults `before`
and `after`), crops both screenshots to the same region in field units (from
each run's own view, through the field test API's zoom and pan), scales them
to one size, and writes <folder>/compare/<name>-<region>.png: before, after,
and their difference (brighter is more different), side by side. Regions: `show` is every visible
marcher with a margin; `detail` is a small window around the middle marcher,
enlarged.

Needs Pillow (`pip install pillow`, in a virtual environment).
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

folder = Path(sys.argv[1])
before = sys.argv[2] if len(sys.argv) > 2 else "before"
after = sys.argv[3] if len(sys.argv) > 3 else "after"
out = folder / "compare"
out.mkdir(exist_ok=True)


def crop(run: str, name: str, region, size):
    state = json.loads((folder / run / f"{name}.json").read_text())
    image = Image.open(folder / run / f"{name}.png").convert("RGB")
    zoom = state["viewport"]["zoom"]
    pan = state["viewport"]["pan"]
    rect = state["rect"]
    x0, y0, x1, y1 = region
    box = (
        rect["x"] + pan["x"] + x0 * zoom,
        rect["y"] + pan["y"] + y0 * zoom,
        rect["x"] + pan["x"] + x1 * zoom,
        rect["y"] + pan["y"] + y1 * zoom,
    )
    return image.resize(size, Image.LANCZOS, box=box)


def regions(name: str):
    state = json.loads((folder / before / f"{name}.json").read_text())
    shown = [m for m in state["marchers"] if m["look"]["visible"]]
    xs = sorted(m["x"] for m in shown)
    ys = sorted(m["y"] for m in shown)
    zoom = state["viewport"]["zoom"]
    margin = 40
    show = (xs[0] - margin, ys[0] - margin, xs[-1] + margin, ys[-1] + margin)
    width = round((show[2] - show[0]) * zoom)
    height = round((show[3] - show[1]) * zoom)
    middle = sorted(shown, key=lambda m: m["x"])[len(shown) // 2]
    detail = (middle["x"] - 60, middle["y"] - 40, middle["x"] + 60, middle["y"] + 40)
    return [("show", show, (width, height)), ("detail", detail, (720, 480))]


for capture in sorted((folder / before).glob("*.json")):
    name = capture.stem
    if not (folder / after / f"{name}.json").exists():
        continue
    for label, region, size in regions(name):
        first = crop(before, name, region, size)
        second = crop(after, name, region, size)
        diff = ImageOps.autocontrast(ImageChops.difference(first, second).convert("L"))
        sheet = Image.new("RGB", (size[0] * 3 + 20, size[1] + 24), "white")
        draw = ImageDraw.Draw(sheet)
        for i, (title, image) in enumerate(
            [(before, first), (after, second), ("difference", diff.convert("RGB"))]
        ):
            sheet.paste(image, (i * (size[0] + 10), 24))
            draw.text((i * (size[0] + 10) + 4, 4), f"{title}  {name} {label}", fill="black")
        sheet.save(out / f"{name}-{label}.png")
        print(out / f"{name}-{label}.png")

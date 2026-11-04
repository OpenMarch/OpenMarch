# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools[woff]==4.60.1"]
# ///
"""
Rebuilds the "OpenMarch Text Symbols" font files in src/fonts/ from pinned
@fontsource releases, keeping only the characters each face's `unicode-range`
in src/text-symbols.css lists. Run after changing a range:

    uv run packages/ui/scripts/subset_text_symbols.py

The fonts are vendored (not npm dependencies) so the relative url() in
text-symbols.css resolves for every consumer of the shared styles, including
apps outside this repo, and each file stays a few KB.
"""

import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset

UI = Path(__file__).resolve().parent.parent
CSS = UI / "src" / "text-symbols.css"
FONTS = UI / "src" / "fonts"

CDN = "https://cdn.jsdelivr.net/npm"
# Output file name -> source font (OFL-1.1)
SOURCES = {
    "text-symbols-noto-sans-symbols.woff2": f"{CDN}/@fontsource/noto-sans-symbols@5.3.0/files/noto-sans-symbols-symbols-400-normal.woff2",
    "text-symbols-noto-sans-symbols-2.woff2": f"{CDN}/@fontsource/noto-sans-symbols-2@5.3.0/files/noto-sans-symbols-2-symbols-400-normal.woff2",
    "text-symbols-noto-sans-math.woff2": f"{CDN}/@fontsource/noto-sans-math@5.3.0/files/noto-sans-math-latin-400-normal.woff2",
}


def faces(css: str) -> dict[str, list[int]]:
    """Code points per font file, from each @font-face's url() and unicode-range"""
    found: dict[str, list[int]] = {}
    for block in re.findall(r"@font-face\s*{([^}]*)}", css):
        name = re.search(r'url\("\./fonts/([^"]+)"\)', block).group(1)
        ranges = re.search(r"unicode-range:([^;]+);", block).group(1)
        codes: list[int] = []
        for start, end in re.findall(r"U\+([0-9A-F]+)(?:-([0-9A-F]+))?", ranges, re.I):
            codes.extend(range(int(start, 16), int(end or start, 16) + 1))
        found[name] = codes
    return found


def main() -> None:
    wanted = faces(CSS.read_text())
    if set(wanted) != set(SOURCES):
        sys.exit(f"text-symbols.css faces {sorted(wanted)} don't match SOURCES {sorted(SOURCES)}")
    FONTS.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, url in SOURCES.items():
            source = Path(tmp) / name
            urllib.request.urlretrieve(url, source)
            options = subset.Options()
            options.flavor = "woff2"
            options.layout_features = ["*"]
            options.name_IDs = ["*"]  # keeps the copyright and OFL license notice
            options.notdef_outline = True
            font = subset.load_font(str(source), options)
            missing = [c for c in wanted[name] if c not in font.getBestCmap()]
            if missing:
                sys.exit(f"{name}: no glyph for " + ", ".join(f"U+{c:04X}" for c in missing))
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=wanted[name])
            subsetter.subset(font)
            subset.save_font(font, str(FONTS / name), options)
            print(f"{name}: {len(wanted[name])} characters, {(FONTS / name).stat().st_size} bytes")


if __name__ == "__main__":
    main()

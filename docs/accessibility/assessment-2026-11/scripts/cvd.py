"""Contrast + color-vision-deficiency distinctness for OpenMarch's meaning-bearing colors.

Pure Python (no numpy). CVD simulation: Machado, Oliveira & Fernandes 2009, severity 1.0
(full dichromacy), applied in linear sRGB. Distance: CIEDE2000 on CIELAB (D65).
Run: python3 -I cvd.py
"""
import itertools, math

# ---------- color math ----------
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def delin(c):
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)

def lum(rgb):
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def over(fg, alpha, bg):
    return tuple(round(f * alpha + b * (1 - alpha)) for f, b in zip(fg, bg))

MACHADO = {
    "protan": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deutan": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritan": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

def simulate(rgb, kind):
    if kind == "normal":
        return rgb
    v = [lin(c) for c in rgb]
    m = MACHADO[kind]
    return tuple(round(delin(sum(m[i][j] * v[j] for j in range(3)))) for i in range(3))

def lab(rgb):
    r, g, b = (lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)

def de2000(c1, c2):
    L1, a1, b1 = lab(c1); L2, a2, b2 = lab(c2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0: dhp = 0
    elif abs(h2p - h1p) <= 180: dhp = h2p - h1p
    elif h2p - h1p > 180: dhp = h2p - h1p - 360
    else: dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0: hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180: hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360: hbp = (h1p + h2p + 360) / 2
    else: hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dth = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dth)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))

KINDS = ["normal", "protan", "deutan", "tritan"]

def pair_report(name, colors, pairs=None):
    """colors: {label: rgb}. Prints min ΔE00 per vision type and the worst pairs."""
    print(f"\n## {name}")
    labels = list(colors)
    pairs = pairs or list(itertools.combinations(labels, 2))
    print("| pair | " + " | ".join(KINDS) + " |")
    print("|---|" + "---|" * len(KINDS))
    for a, b in pairs:
        row = [de2000(simulate(colors[a], k), simulate(colors[b], k)) for k in KINDS]
        flag = " **<10**" if min(row) < 10 else ""
        print(f"| {a} / {b} | " + " | ".join(f"{d:.1f}" for d in row) + f" |{flag}")

def set_min(name, colors):
    labels = list(colors)
    out = []
    for k in KINDS:
        best = min(((de2000(simulate(colors[a], k), simulate(colors[b], k)), a, b)
                    for a, b in itertools.combinations(labels, 2)))
        n_close = sum(1 for a, b in itertools.combinations(labels, 2)
                      if de2000(simulate(colors[a], k), simulate(colors[b], k)) < 10)
        out.append(f"{k}: min {best[0]:.1f} ({best[1]}/{best[2]}), pairs<10: {n_close}")
    print(f"\n### {name} ({len(colors)} colors)\n- " + "\n- ".join(out))

def contrast_table(name, colors, bgs):
    print(f"\n## Contrast: {name}")
    print("| color | " + " | ".join(bgs) + " |")
    print("|---|" + "---|" * len(bgs))
    for label, c in colors.items():
        print(f"| {label} | " + " | ".join(f"{contrast(c, bg):.2f}" for bg in bgs.values()) + " |")

if __name__ != "__main__":
    pass
# ---------- OpenMarch colors (fork main e1792b9b0) ----------
WHITE = (255, 255, 255)
LIGHT_BG = (236, 235, 240)   # --color-bg-1 light
DARK_BG = (15, 14, 19)       # --color-bg-1 dark

field = {  # packages/core/src/field/FieldTheme.ts + hard-coded field inks
    "default marcher red (255,0,0)": (255, 0, 0),
    "collision red [1,0,0]": (255, 0, 0),
    "step-size warning (220,38,38)": (220, 38, 38),
    "next path green (0,175,13)": (0, 175, 13),
    "selection blue #0d6efd": (13, 110, 253),
    "shape purple (126,34,206)": (126, 34, 206),
    "temp path (192,132,252)": (192, 132, 252),
    "guide ink #ea580c": hex2rgb("ea580c"),
    "pivot #facc15": hex2rgb("facc15"),
    "ghost gray #6f6f6f": hex2rgb("6f6f6f"),
    "primary stroke black": (0, 0, 0),
    "secondary grid #aaa": (170, 170, 170),
    "tertiary grid #ddd": (221, 221, 221),
    "yard numbers #888": (136, 136, 136),
    "marcher label black": (0, 0, 0),
}
contrast_table("field inks on the default white field", field, {"white field": WHITE})

pair_report("Field: pairs that must be told apart", field, [
    ("default marcher red (255,0,0)", "collision red [1,0,0]"),
    ("default marcher red (255,0,0)", "next path green (0,175,13)"),
    ("next path green (0,175,13)", "step-size warning (220,38,38)"),
    ("default marcher red (255,0,0)", "step-size warning (220,38,38)"),
    ("selection blue #0d6efd", "shape purple (126,34,206)"),
    ("selection blue #0d6efd", "temp path (192,132,252)"),
    ("shape purple (126,34,206)", "temp path (192,132,252)"),
    ("guide ink #ea580c", "default marcher red (255,0,0)"),
    ("guide ink #ea580c", "step-size warning (220,38,38)"),
    ("pivot #facc15", "guide ink #ea580c"),
    ("next path green (0,175,13)", "ghost gray #6f6f6f"),
])

ui_light = {
    "accent / playhead (100,66,255)": (100, 66, 255),
    "start flag ochre (150,120,0)": (150, 120, 0),
    "start flag text (115,90,0)": (115, 90, 0),
    "red (176,51,51)": (176, 51, 51),
    "green (72,158,51)": (72, 158, 51),
    "yellow (200,170,0)": (200, 170, 0),
    "waveform (180,180,180)": (180, 180, 180),
    "text (32,32,32)": (32, 32, 32),
    "subtitle text 60%": over((32, 32, 32), 0.6, LIGHT_BG),
    "stroke 10% black": over((0, 0, 0), 0.1, LIGHT_BG),
}
ui_dark = {
    "accent / playhead (150,126,255)": (150, 126, 255),
    "start flag yellow (236,211,71)": (236, 211, 71),
    "red (227,74,74)": (227, 74, 74),
    "green (113,222,86)": (113, 222, 86),
    "waveform (180,180,180)": (180, 180, 180),
    "text (208,208,208)": (208, 208, 208),
    "subtitle text 60%": over((208, 208, 208), 0.6, DARK_BG),
    "stroke 6% white": over((255, 255, 255), 0.06, DARK_BG),
}
contrast_table("UI inks, light theme", ui_light, {"bg-1 light": LIGHT_BG})
contrast_table("UI inks, dark theme", ui_dark, {"bg-1 dark": DARK_BG})
pair_report("Timeline: playhead vs start flag vs error red (light)", ui_light, [
    ("accent / playhead (100,66,255)", "start flag ochre (150,120,0)"),
    ("red (176,51,51)", "green (72,158,51)"),
    ("red (176,51,51)", "start flag ochre (150,120,0)"),
])
pair_report("Timeline: playhead vs start flag vs error red (dark)", ui_dark, [
    ("accent / playhead (150,126,255)", "start flag yellow (236,211,71)"),
    ("red (227,74,74)", "green (113,222,86)"),
])

tracks = {h: hex2rgb(h) for h in ["2fc4b2", "e79b00", "e56a82", "7c8cf8", "62b851", "c27be0", "e0784a", "4aa3e0"]}
set_min("Timeline track colors (timelineViewModel.ts)", tracks)
pair_report("Timeline track colors, worst pairs", tracks)
contrast_table("Timeline track colors (as bars/paths)", tracks, {"bg-1 light": LIGHT_BG, "bg-1 dark": DARK_BG, "white field": WHITE})

groups = {h: hex2rgb(h) for h in ["E69F00", "56B4E9", "D55E00", "0072B2", "CC79A7"]}
set_min("Line interval groups (groupDrawing.ts, Okabe-Ito subset)", groups)

# ---------- candidate palettes ----------
okabe_ito = {"orange": "E69F00", "sky blue": "56B4E9", "bluish green": "009E73", "yellow": "F0E442",
             "blue": "0072B2", "vermilion": "D55E00", "reddish purple": "CC79A7", "black": "000000"}
tol_bright = {"blue": "4477AA", "cyan": "66CCEE", "green": "228833", "yellow": "CCBB44",
              "red": "EE6677", "purple": "AA3377", "grey": "BBBBBB"}
tol_muted = {"indigo": "332288", "cyan": "88CCEE", "teal": "44AA99", "green": "117733", "olive": "999933",
             "sand": "DDCC77", "rose": "CC6677", "wine": "882255", "purple": "AA4499"}
# proposed 8-track replacement: Okabe-Ito minus black/yellow plus Tol picks, mid-tone so it reads on both themes
proposal_tracks = {"orange E69F00": "E69F00", "sky 56B4E9": "56B4E9", "green 009E73": "009E73",
                   "vermilion D55E00": "D55E00", "pink CC79A7": "CC79A7", "blue 4477AA": "4477AA",
                   "sand DDCC77": "DDCC77", "grey BBBBBB": "BBBBBB"}
for name, pal in [("Okabe-Ito (8)", okabe_ito), ("Paul Tol bright (7)", tol_bright),
                  ("Paul Tol muted (9)", tol_muted), ("Proposed track/section set (8)", proposal_tracks)]:
    rgb = {k: hex2rgb(v) for k, v in pal.items()}
    set_min(name, rgb)
    contrast_table(name, rgb, {"white field": WHITE, "bg-1 dark": DARK_BG})

# proposed field state inks, deuteranopia-safe: selection blue, next path, warning, collision
proposal_field = {
    "marcher default (Okabe vermilion D55E00)": hex2rgb("D55E00"),
    "selection blue 0072B2": hex2rgb("0072B2"),
    "next path (bluish green 009E73)": hex2rgb("009E73"),
    "warning/collision magenta (CC0077)": hex2rgb("CC0077"),
    "shape purple (126,34,206)": (126, 34, 206),
}
contrast_table("Proposed field state inks", proposal_field, {"white field": WHITE})
pair_report("Proposed field state inks", proposal_field)

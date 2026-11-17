# cspell:words pitlib interp
# cspell:words fascia
# Marimbas, vibraphones, xylophones and the glockenspiel. A size is data: note
# range, published footprint and bar widths, working numbers read from
# manufacturer specifications (proportions only).
import math

import numpy as np

from pitlib import INCH, caster, circle, field_wheel, rect, art_rect

NATURAL_PCS = {0, 2, 4, 5, 7, 9, 11}
SOUND = 343.0
NODE = 0.224


def size(low, high, length, low_depth, high_depth, bar_low, bar_high, **more):
    cfg = dict(
        low=low,
        high=high,
        length=length * INCH,
        low_depth=low_depth * INCH,
        high_depth=high_depth * INCH,
        bar_low=bar_low * INCH,
        bar_high=bar_high * INCH,
        bar_top=0.96,
        rise=0.022,
        inner=0.035,
        edge=0.055,
        end_margin=0.11,
        thick_low=0.026,
        thick_high=0.018,
        len_power=1.35,
        width_power=0.6,
        wheel=0.125,
        tube_floor=0.235,
        oval=0.9,
        max_tube=9.0,
    )
    cfg.update(more)
    return cfg


SIZES = {
    "marimba-4.3": size(45, 96, 83.8, 35.4, 15.7, 2.6, 1.6, edge=0.04, inner=0.015),  # A2-C7
    "marimba-4.6": size(40, 96, 93.7, 47.5, 21.7, 2.8, 1.6),  # E2-C7
    "marimba-5.0": size(36, 96, 100.0, 47.5, 21.7, 2.8, 1.6),  # C2-C7
    "vibraphone-3.0": size(
        53, 89, 60.2, 33.0, 22.0, 2.25, 1.5, thick_low=0.013, thick_high=0.011,
        len_power=1.0, rise=0.018, oval=0.25, tube_floor=0.3,
    ),  # F3-F6
    "vibraphone-3.5": size(
        48, 89, 65.0, 36.0, 22.0, 2.25, 1.5, thick_low=0.013, thick_high=0.011,
        len_power=1.0, rise=0.018, oval=0.25, tube_floor=0.3,
    ),  # C3-F6
    "xylophone-3.5": size(
        65, 108, 57.0, 28.4, 14.0, 2.0, 1.56, edge=0.04, inner=0.02, end_margin=0.08,
        thick_low=0.024, thick_high=0.02, rise=0.02, oval=0.1, wheel=0.1, bar_top=0.92,
    ),  # F4-C8
}


class Layout:
    def __init__(self, cfg, seed=7):
        self.c = cfg
        self.rng = np.random.default_rng(seed)
        self.notes = list(range(cfg["low"], cfg["high"] + 1))
        self.len_low = (cfg["low_depth"] - 2 * cfg["edge"] - cfg["inner"]) / 2
        self.len_high = (cfg["high_depth"] - 2 * cfg["edge"] - cfg["inner"]) / 2
        nats = [n for n in self.notes if n % 12 in NATURAL_PCS]
        widths = [self.width(n) for n in nats]
        span = cfg["length"] - 2 * cfg["end_margin"]
        self.gap = (span - sum(widths)) / (len(nats) - 1)
        self.x = {}
        x = span / 2
        for n, w in zip(nats, widths):
            self.x[n] = x - w / 2
            x -= w + self.gap
        for n in self.notes:
            if n not in self.x:
                self.x[n] = (self.x[n - 1] + self.x[n + 1]) / 2
        self.xs = np.array([self.x[n] for n in nats])[::-1]
        self.ts = np.array([self.t(n) for n in nats])[::-1]

    def t(self, n):
        return (n - self.c["low"]) / (self.c["high"] - self.c["low"])

    def width(self, n):
        c = self.c
        return c["bar_high"] + (c["bar_low"] - c["bar_high"]) * (1 - self.t(n)) ** c["width_power"]

    def len_t(self, t):
        return self.len_high + (self.len_low - self.len_high) * (1 - t) ** self.c["len_power"]

    def bar_len(self, n):
        return self.len_t(self.t(n))

    def t_at(self, x):
        return float(np.interp(x, self.xs, self.ts))

    def len_at(self, x):
        return self.len_t(self.t_at(x))

    def thick(self, n):
        return self.thick_t(self.t(n))

    def thick_t(self, t):
        return self.c["thick_high"] + (self.c["thick_low"] - self.c["thick_high"]) * (1 - t)

    def side(self, n):
        return 1 if n % 12 in NATURAL_PCS else -1

    def top(self, n):
        return self.c["bar_top"] + (0 if self.side(n) > 0 else self.c["rise"])

    def center_y(self, n):
        return self.side(n) * (self.c["inner"] / 2 + self.bar_len(n) / 2)


def build_bar(part, lay, n, high):
    x, y = lay.x[n], lay.center_y(n)
    length, w, th, top = lay.bar_len(n), lay.width(n), lay.thick(n), lay.top(n)
    u0 = float(lay.rng.uniform(0.02, 0.8))
    v0 = float(lay.rng.uniform(0.02, max(0.03, 0.98 - length)))
    if high:
        stations = [(0.0, 1.0), (0.18, 1.0), (0.5, 0.45), (0.82, 1.0), (1.0, 1.0)]
        ch = 0.0025
    else:
        stations = [(0.0, 1.0), (1.0, 1.0)]
        ch = 0
    rings, uvs = [], []
    for f, k in stations:
        yy = y - length / 2 + f * length
        d = th * k
        if ch:
            sec = [
                (-w / 2, -d), (w / 2, -d), (w / 2, -ch),
                (w / 2 - ch, 0), (-w / 2 + ch, 0), (-w / 2, -ch),
            ]
        else:
            sec = [(-w / 2, -d), (w / 2, -d), (w / 2, 0), (-w / 2, 0)]
        rings.append([(x + a, yy, top + b) for a, b in sec])
        uvs.append([(u0 + (a + w / 2 - b) / 0.4, v0 + f * length) for a, b in sec])
    part.loft(rings, uvs=uvs)


def resonator_size(lay, n):
    c = lay.c
    f = 440.0 * 2 ** ((n - 69) / 12)
    rim = c["bar_top"] - 0.066
    limit = min(rim - c["tube_floor"], c["max_tube"])
    raw = max(SOUND / (4 * f) - 0.01, 0.04)
    length = (raw**-4 + limit**-4) ** -0.25
    w = (lay.width(n) + lay.gap) * 0.9
    return rim, length, w, w * (1 + c["oval"] * (1 - lay.t(n)) ** 2)


def edge_path(lay, side, offset, count):
    x_end = lay.c["length"] / 2 - 0.03
    out = []
    for i in range(count):
        x = x_end - 2 * x_end * i / (count - 1)
        out.append((x, side * (lay.c["inner"] / 2 + lay.len_at(x) + offset)))
    return out


def rails(parts, lay, high):
    c = lay.c
    x_end = c["length"] / 2 - 0.03
    segs = 9 if high else 4
    for side in (1, -1):
        rise = 0 if side > 0 else c["rise"]
        for outer in (True, False):
            frac = NODE if outer else 1 - NODE
            path = []
            for i in range(segs):
                x = x_end - 2 * x_end * i / (segs - 1)
                y = side * (c["inner"] / 2 + lay.len_at(x) * (1 - frac))
                path.append((x, y, c["bar_top"] + rise - lay.thick_t(lay.t_at(x))))
            parts["frame"].sweep(rect(0.018, 0.024), [(x, y, z - 0.024) for x, y, z in path])
            if not high:
                continue
            parts["rubber"].sweep(circle(0.002, 4), [(x, y, z - 0.001) for x, y, z in path])
            for n in lay.notes:
                if lay.side(n) != side or n == c["high"]:
                    continue
                y = side * (c["inner"] / 2 + lay.bar_len(n) * (1 - frac))
                x = lay.x[n] - lay.width(n) / 2 - lay.gap / 2
                z = lay.top(n) - lay.thick(n)
                parts["metal"].sweep(circle(0.003, 4), [(x, y, z - 0.012), (x, y, z + 0.012)])


def field_frame(parts, lay, high):
    c = lay.c
    top_of_fascia = c["bar_top"] - 0.045
    fh, ft = 0.08, 0.012
    segs = 12 if high else 5
    for side in (1, -1):
        path = [(x, y, top_of_fascia - fh / 2) for x, y in edge_path(lay, side, 0.02, segs)]
        parts["frame"].sweep(rect(ft, fh), path)
    front = edge_path(lay, -1, 0.02 + ft / 2 + 0.0008, segs)
    dist = [0.0]
    for a, b in zip(front, front[1:]):
        dist.append(dist[-1] + math.dist(a, b))
    total = dist[-1]
    art = parts["artwork"]
    for i in range(len(front) - 1):
        a, b = front[i], front[i + 1]
        ua, ub = 1 - dist[i] / total, 1 - dist[i + 1] / total
        z0, z1 = top_of_fascia - fh, top_of_fascia
        art.face([
            art.vert((b[0], b[1], z0), (ub, 0)),
            art.vert((a[0], a[1], z0), (ua, 0)),
            art.vert((a[0], a[1], z1), (ua, 1)),
            art.vert((b[0], b[1], z1), (ub, 1)),
        ])
    parts.slots["front-fascia"] = (round(total, 4), fh)

    x_end = c["length"] / 2 - 0.03
    low_z = c["wheel"] + 0.075
    rung = {1: [], -1: []}
    legs_y = {1: c["low_depth"] / 2 - 0.07, -1: c["high_depth"] / 2 - 0.07}
    for sx, depth in ((1, c["low_depth"]), (-1, c["high_depth"])):
        x = sx * x_end
        half = depth / 2
        parts["frame"].box((x - 0.03, -half, top_of_fascia - fh), (x + 0.03, half, top_of_fascia + 0.012))
        leg_y = legs_y[sx]
        for sy in (1, -1):
            y = sy * leg_y
            parts["frame"].tube((x, y, low_z), (x, y, top_of_fascia - fh), 0.04)
            if high:
                parts["metal"].sweep(circle(0.02, 8), [(x, y, 0.56), (x, y, 0.60)])
                ky = y + sy * 0.028
                parts["rubber"].sweep(circle(0.014, 8), [(x, ky - sy * 0.012, 0.58), (x, ky + sy * 0.03, 0.58)])
            rung[sy].append((x, y, low_z))
            wx = sx * (x_end - 0.03 - c["wheel"])
            along = (wx + x_end) / (2 * x_end)
            wy = sy * (legs_y[-1] + (legs_y[1] - legs_y[-1]) * along)
            field_wheel(parts, wx, wy, low_z, high, c["wheel"])
        parts["frame"].box((x - 0.02, -leg_y, low_z - 0.0175), (x + 0.02, leg_y, low_z + 0.0175))
    for pts in rung.values():
        parts["frame"].tube(pts[0], pts[1], 0.035)
    # a cross member under the middle, and a gusset from each leg to the top
    mid_y = (legs_y[1] + legs_y[-1]) / 2
    parts["frame"].tube((0, -mid_y, low_z), (0, mid_y, low_z), 0.035)
    for sx in (1, -1):
        x = sx * x_end
        for sy in (1, -1):
            y = sy * legs_y[sx]
            parts["frame"].tube(
                (x, y, top_of_fascia - fh - 0.26), (x, y - sy * 0.26, top_of_fascia - fh - 0.01), 0.028
            )


def vibe_parts(parts, lay, high):
    """Damper bar with its pedal bar on the player's side; motor and fan shafts."""
    c = lay.c
    x0 = lay.xs[-1] + 0.03
    x1 = lay.xs[0] - 0.03
    z = c["bar_top"] - c["thick_low"] - 0.006
    parts["felt"].box((x1, -0.016, z - 0.012), (x0, 0.016, z))
    low_z = c["wheel"] + 0.075
    edge = c["inner"] / 2 + lay.len_at(0) + c["edge"]
    sides = 6 if high else 3
    parts["metal"].rod((0, 0, z - 0.012), (0, 0, low_z), 0.007, sides)
    parts["metal"].rod((0, 0, low_z), (0, edge, 0.13), 0.009, sides)
    # a wide bar a player can reach from anywhere along the keyboard
    parts["frame"].box((-0.34, edge - 0.02, 0.1), (0.34, edge + 0.07, 0.125))
    for s in (-1, 1):
        parts["metal"].rod((s * 0.3, edge, 0.11), (s * 0.3, edge - 0.14, low_z), 0.007, sides)
    # the motor box under the rails at the high end, with two fan shafts
    x = -(c["length"] / 2 - 0.13)
    z_shaft = c["bar_top"] - 0.09
    parts["panel"].box((x - 0.06, -0.09, z_shaft - 0.08), (x + 0.06, 0.09, z_shaft + 0.02))
    if high:
        for n_side in (1, -1):
            pts = [lay.x[n] for n in lay.notes if lay.side(n) == n_side]
            y = n_side * (c["inner"] / 2 + lay.bar_len(c["low"]) / 2 * 0.86)
            parts["metal"].rod((max(pts), y, z_shaft), (x, y, z_shaft), 0.004, 4)


def build_mallet(parts, high, cfg, bars, resonators, vibe=False):
    lay = Layout(cfg)
    bar = parts[bars]
    tube_sides = 14 if high else 6
    arch_low = resonator_size(lay, cfg["low"])[1]
    for n in lay.notes:
        build_bar(bar, lay, n, high)
        rim, length, w, d = resonator_size(lay, n)
        if lay.side(n) < 0:
            # the audience's rank is the arch a marimba is known by: past the
            # middle the tubes are longer than the note needs, rising again
            # toward the high end
            u = max(0.0, (lay.t(n) - 0.5) / 0.5)
            length = max(length, arch_low * (0.28 + 0.36 * u * u))
        x, y = lay.x[n], lay.center_y(n)
        sides = tube_sides if w > 0.045 or not high else 10
        ring = circle(w / 2, sides, d / w)
        rings = [[(x + a, y + b, z) for a, b in ring] for z in (rim - length, rim)]
        parts[resonators].loft(rings, smooth=True, cap_start=True, cap_end=high)
    rails(parts, lay, high)
    for side in (1, -1):
        band = [
            (lay.x[n], lay.center_y(n), cfg["bar_top"] - 0.06)
            for n in lay.notes
            if lay.side(n) == side and n % 3 == 0
        ]
        parts["frame"].sweep(rect(0.016, 0.012), band)
    field_frame(parts, lay, high)
    if vibe:
        vibe_parts(parts, lay, high)


def glockenspiel(parts, high, **_):
    cfg = size(
        79, 108, 32.0, 21.0, 11.0, 1.25, 1.0, edge=0.03, inner=0.02, end_margin=0.04,
        thick_low=0.009, thick_high=0.008, rise=0.012, bar_top=0.97, width_power=1.0, len_power=1.0,
    )
    lay = Layout(cfg, seed=3)
    for n in lay.notes:
        build_bar(parts["bars-steel"], lay, n, high)
    rails_top = cfg["bar_top"] - 0.012
    for side in (1, -1):
        for outer in (True, False):
            frac = NODE if outer else 1 - NODE
            path = []
            segs = 5 if high else 3
            x_end = cfg["length"] / 2 - 0.03
            for i in range(segs):
                x = x_end - 2 * x_end * i / (segs - 1)
                rise = 0 if side > 0 else cfg["rise"]
                y = side * (cfg["inner"] / 2 + lay.len_at(x) * (1 - frac))
                path.append((x, y, rails_top + rise - 0.01))
            parts["felt"].sweep(rect(0.012, 0.012), path)
    # the case: a shallow trapezoid
    length, dl, dh = cfg["length"], cfg["low_depth"], cfg["high_depth"]
    section = [(-dh / 2, -length / 2), (dh / 2, -length / 2), (dl / 2, length / 2), (-dl / 2, length / 2)]
    parts["wood"].sweep(section, [(0, 0, rails_top - 0.075), (0, 0, rails_top - 0.017)])
    # an adjustable stand: two uprights, T feet and a cross brace
    z_top = rails_top - 0.075
    for sx in (1, -1):
        x = sx * 0.27
        parts["metal"].rod((x, 0, 0.09), (x, 0, z_top), 0.012, 8 if high else 4)
        parts["frame"].tube((x, -0.24, 0.07), (x, 0.24, 0.07), 0.03)
        for sy in (-1, 1):
            caster(parts, x, sy * 0.22, high, 0.025)
    parts["frame"].tube((0.27, 0, 0.42), (-0.27, 0, 0.42), 0.025)
    parts["frame"].tube((0.27, 0, z_top - 0.01), (-0.27, 0, z_top - 0.01), 0.025)

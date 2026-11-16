# cspell:words pitlib
# cspell:words tumba quinto
# Drum set, timpani, concert bass drum, congas and bongos. Working numbers;
# proportions only.
import math

from pitlib import INCH, at, art_disc, caster, cymbal, drum, place, rot, tripod


def boom(parts, x, y, height, reach, angle, high):
    """A straight stand with an arm; returns where a cymbal sits on the arm."""
    tripod(parts, x, y, height, high)
    a = math.radians(angle)
    tx, ty, tz = x + reach * math.cos(a), y + reach * math.sin(a), height + reach * 0.45
    parts["metal"].rod((x, y, height), (tx, ty, tz), 0.0075, 6 if high else 3)
    return tx, ty, tz + 0.012


def drum_set(parts, high, cage=False, **_):
    d = 22 * INCH
    # kick: head to the audience, on two spurs
    kick_y, kick_z = -0.08, d / 2 + 0.012
    with place(parts, at(0, kick_y, kick_z), rot(90, "X")):
        drum(parts, high, d, 18 * INCH, lugs=10)
    art_disc(parts, "front-head", (0, kick_y - 9 * INCH - 0.0052, kick_z), d - 0.02)
    for s in (-1, 1):
        parts["metal"].rod(
            (s * d * 0.4, kick_y - 0.12, 0.2), (s * 0.34, kick_y - 0.26, 0.008), 0.0075, 6 if high else 3
        )
    # kick pedal and throne
    py = kick_y + 9 * INCH + 0.02
    parts["frame"].box((-0.05, py, 0.02), (0.05, py + 0.27, 0.05))
    parts["metal"].rod((0, py + 0.02, 0.05), (0, py, kick_z + 0.03), 0.005, 4)
    tripod(parts, 0, 0.78, 0.49, high, 0.24)
    parts["felt"].lathe((0, 0.78, 0.49), [(0.17, 0.0), (0.17, 0.08)], 18 if high else 8, "z", True, (True, True))
    # rack toms on the kick
    tom_z = kick_z + d / 2 + 0.18
    for x, dia, dep, tilt in ((0.17, 12, 8, -12), (-0.17, 13, 9, -12)):
        with place(parts, at(x, kick_y + 0.04, tom_z), rot(tilt, "X")):
            drum(parts, high, dia * INCH, dep * INCH, lugs=6)
        parts["metal"].rod((x * 0.4, kick_y, kick_z + d / 2), (x, kick_y + 0.04, tom_z - 0.08), 0.0085, 4)
    # snare on its stand, at the player's left knee
    sx, sy = 0.18, 0.34
    tripod(parts, sx, sy, 0.57, high, 0.2)
    with place(parts, at(sx, sy, 0.63)):
        drum(parts, high, 14 * INCH, 5.5 * INCH, lugs=8)
    # floor tom on three legs, at the player's right
    fx, fy = -0.55, 0.3
    with place(parts, at(fx, fy, 0.42)):
        drum(parts, high, 16 * INCH, 16 * INCH, lugs=8)
    r = 8 * INCH + 0.02
    for i in range(3):
        a = math.radians(30 + 120 * i)
        lx, ly = fx + r * math.cos(a), fy + r * math.sin(a)
        parts["metal"].rod((lx, ly, 0.42), (lx, ly, 0.02), 0.0075, 6 if high else 3)
    # hi-hat at the player's left
    hx, hy = 0.5, 0.33
    tripod(parts, hx, hy, 0.82, high, 0.22)
    parts["metal"].rod((hx, hy, 0.74), (hx, hy, 0.95), 0.005, 4)
    cymbal(parts, (hx, hy, 0.82), 14 * INCH, high)
    cymbal(parts, (hx, hy, 0.86), 14 * INCH, high)
    # cymbals on booms, or on a rack around the set
    places = (
        (0.62, -0.18, 1.2, 16, 14),
        (-0.68, -0.08, 1.12, 20, 12),
        (-0.32, -0.42, 1.3, 18, 12),
    )
    if cage:
        y_r, h_r = -0.48, 1.08
        pts = [(0.8, 0.45), (0.8, y_r), (-0.8, y_r), (-0.8, 0.45)]
        for x, y in pts:
            tripod_foot = (x, y, 0)
            parts["frame"].tube(tripod_foot, (x, y, h_r), 0.04)
        rung = [(x, y, h_r) for x, y in pts]
        for a, b in zip(rung, rung[1:]):
            parts["frame"].tube(a, b, 0.04)
        for x, y, h, dia, _ in places:
            bx, by = max(min(x, 0.8), -0.8), y_r if y < -0.15 else y
            bx = -0.8 if x < -0.6 else (0.8 if x > 0.6 else x)
            parts["metal"].rod((bx, by, h_r), (x, y, h), 0.0075, 6 if high else 3)
            cymbal(parts, (x, y, h + 0.012), dia * INCH, high, (6, 0))
    else:
        for x, y, h, dia, tilt in places:
            sx2 = x * 1.25
            tx, ty, tz = boom(
                parts, sx2, y - 0.1, h - 0.12, math.hypot(x - sx2, 0.1), math.degrees(math.atan2(0.1, x - sx2)), high
            )
            cymbal(parts, (tx, ty, tz), dia * INCH, high, (tilt, 0))


def timpani(parts, high, inches=26, **_):
    d = inches * INCH
    r = d / 2
    top = 0.85
    depth = 0.68 * d
    bottom = top - depth
    sides = 32 if high else 12
    n = 9 if high else 4
    # a deep rounded bowl: near-vertical at the rim, closing to a small base
    kettle = []
    for i in range(n + 1):
        t = i / n
        rad = r * math.sqrt(max(1 - (1 - t) ** 2, 0.0))
        kettle.append((max(rad, r * 0.1), bottom + (depth - 0.02) * t))
    parts["copper"].lathe((0, 0, 0), kettle, sides, "z", True, (True, False))
    parts["head"].lathe((0, 0, 0), [(r - 0.003, top - 0.02), (r - 0.003, top)], sides, "z", True, (False, True))
    parts["metal"].ring((0, 0, top - 0.012), r + 0.002, 0.012, 0.03, sides)
    ring_r = r * 0.75
    lugs = 8 if high else 4
    for i in range(lugs):
        a = 2 * math.pi * (i + 0.5) / lugs
        ca, sa = math.cos(a), math.sin(a)
        x, y = (r + 0.03) * ca, (r + 0.03) * sa
        parts["metal"].rod((x, y, top - 0.03), (ring_r * ca, ring_r * sa, 0.25), 0.0065, 6 if high else 3)
        if high:  # the tuning handle on top of each lug
            parts["metal"].rod((x, y, top - 0.012), (x, y, top + 0.035), 0.005, 4)
            parts["metal"].rod(
                (x - sa * 0.028, y + ca * 0.028, top + 0.035), (x + sa * 0.028, y - ca * 0.028, top + 0.035), 0.005, 4
            )
    parts["metal"].ring((0, 0, 0.25), ring_r, 0.018, 0.022, sides)
    parts["frame"].rod((0, 0, 0.2), (0, 0, bottom + 0.02), 0.045, 10 if high else 5)
    base = r + 0.12
    for i in range(3):
        a = math.radians(90 + 120 * i)
        x, y = base * math.cos(a), base * math.sin(a)
        parts["frame"].tube((0, 0, 0.22), (x, y, 0.13), 0.045)
        caster(parts, x, y, high, 0.05)
    parts["frame"].box((-0.1, r * 0.72, 0.045), (0.1, r * 0.72 + 0.28, 0.075))
    parts["metal"].rod((0, r * 0.72, 0.075), (0, r * 0.3, 0.22), 0.008, 4)


def concert_bass(parts, high, inches=36, **_):
    d = inches * INCH
    depth = 18 * INCH if inches >= 36 else 16 * INCH
    z = d / 2 + 0.34
    tilt = 8
    with place(parts, at(0, 0, z), rot(90 + tilt, "X")):
        drum(parts, high, d, depth, lugs=12, shell="shell-wood")
    sides = 32 if high else 12
    with place(parts, at(0, 0, z), rot(90, "X")):
        parts["metal"].ring((0, 0, 0), d / 2 + 0.03, 0.025, 0.04, sides)
    hw = d / 2 + 0.1
    for s in (-1, 1):
        parts["frame"].tube((s * hw, 0, 0.14), (s * hw, 0, z), 0.04)
        parts["metal"].rod((s * (d / 2 + 0.05), 0, z), (s * hw, 0, z), 0.012, 8 if high else 4)
        parts["frame"].tube((s * hw, -0.33, 0.12), (s * hw, 0.33, 0.12), 0.04)
        for sy in (-1, 1):
            caster(parts, s * hw, sy * 0.3, high, 0.04)
    parts["frame"].tube((-hw, 0, 0.14), (hw, 0, 0.14), 0.04)


def hand_drum(parts, high, r_top, r_belly, r_foot, height, base_z=0.0, peak=0.62):
    """A stave drum: widest at `peak` of its height, narrowing to the foot."""
    sides = 24 if high else 10
    steps = 8 if high else 4
    power = math.log(0.5) / math.log(peak)
    line = lambda t: r_foot + (r_top - r_foot) * t
    swell = r_belly - line(peak)
    prof = [
        (line(i / steps) + swell * math.sin(math.pi * (i / steps) ** power), base_z + height * i / steps)
        for i in range(steps + 1)
    ]
    parts["shell-wood"].lathe((0, 0, 0), prof, sides, "z", True)
    top = base_z + height
    parts["head"].lathe((0, 0, 0), [(r_top - 0.002, top), (r_top - 0.002, top + 0.004)], sides, "z", True, (False, True))
    parts["metal"].ring((0, 0, top), r_top - 0.002, 0.01, 0.02, sides)
    if high:
        for i in range(6):
            a = 2 * math.pi * i / 6
            x, y = (r_top + 0.012) * math.cos(a), (r_top + 0.012) * math.sin(a)
            parts["metal"].rod((x, y, top), (x, y, top - 0.11), 0.0045, 4)


def congas(parts, high, **_):
    for x, r_top, r_belly, height in ((0.2, 0.15, 0.178, 0.76), (-0.2, 0.135, 0.162, 0.74)):
        with place(parts, at(x, 0, 0.12)):
            hand_drum(parts, high, r_top, r_belly, 0.105, height)
    for x in (-0.2, 0.2):
        tripod(parts, x, 0, 0.3, high, 0.2)
    parts["frame"].tube((-0.3, 0.0, 0.3), (0.3, 0.0, 0.3), 0.03)


def bongos(parts, high, **_):
    tripod(parts, 0, 0, 0.8, high, 0.24)
    for x, r in ((0.115, 0.105), (-0.1, 0.09)):
        with place(parts, at(x, 0, 0.74)):
            hand_drum(parts, high, r, r * 0.97, r * 0.8, 0.17, peak=0.5)
    # the block that joins the pair and sits on the stand
    parts["frame"].box((-0.035, -0.035, 0.775), (0.035, 0.035, 0.875))
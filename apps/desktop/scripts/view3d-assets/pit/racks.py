# cspell:words pitlib claves
# Aux percussion racks and the trap table. Working numbers; proportions only.
import math

from pitlib import INCH, at, caster, circle, cymbal, drum, place, rect, rot

# A rack is a rolling frame with two rails: instruments you strike sit on the
# middle rail at playing height, and the top rail carries what hangs or
# reaches over (cymbals, mark tree, triangle).
RACK_W, MID, TOP = 1.5, 0.9, 1.55


def frame(parts, high):
    w = RACK_W
    for s in (-1, 1):
        x = s * (w / 2 - 0.02)
        parts["frame"].tube((x, 0, 0.14), (x, 0, TOP), 0.04)
        parts["frame"].tube((x, -0.36, 0.12), (x, 0.36, 0.12), 0.045)
        parts["frame"].tube((x, 0.3, 0.14), (x, 0, 0.5), 0.028)
        for sy in (-1, 1):
            caster(parts, x, sy * 0.32, high, 0.05)
    parts["frame"].tube((-w / 2, 0, TOP - 0.02), (w / 2, 0, TOP - 0.02), 0.04)
    parts["frame"].tube((-w / 2, 0, MID), (w / 2, 0, MID), 0.04)
    parts["frame"].tube((-w / 2, 0, 0.42), (w / 2, 0, 0.42), 0.03)


def arm(parts, start, tip, high):
    parts["metal"].rod(start, tip, 0.0085, 6 if high else 3)


def tom(parts, x, inches, high):
    """A concert tom on the middle rail, its head tipped toward the player."""
    d = inches * INCH
    y, z = 0.14, MID + 0.1 + d * 0.22
    arm(parts, (x, 0, MID), (x, y, z - 0.04), high)
    with place(parts, at(x, y, z), rot(-16, "X")):
        drum(parts, high, d, d * 0.8, lugs=6)


def crash(parts, x, inches, high, lift=0.3):
    """A cymbal on a boom that reaches up and back from the top rail."""
    tip = (x, 0.12, TOP + lift)
    arm(parts, (x, 0, TOP - 0.02), tip, high)
    cymbal(parts, (tip[0], tip[1], tip[2] + 0.012), inches * INCH, high, (-8, 0))


def cowbell(parts, x, w, high):
    z = MID + 0.26
    arm(parts, (x, 0, MID), (x, -0.02, z - w * 1.2), high)
    h = w * 2.4
    section = [(-w / 2, -w * 0.32), (w / 2, -w * 0.32), (w / 2, w * 0.32), (-w / 2, w * 0.32)]
    tip = [(a * 0.55, b * 0.55) for a, b in section]
    y = -0.02
    parts["panel"].loft(
        [[(x + a, y + b, z - h) for a, b in section], [(x + a, y + b, z) for a, b in tip]]
    )


def temple_blocks(parts, x0, high):
    """Five graduated blocks on their own bar above the middle rail."""
    z = MID + 0.13
    y = -0.07
    widths = (0.13, 0.118, 0.106, 0.094, 0.082)
    span = sum(widths) + 0.02 * (len(widths) - 1)
    parts["frame"].tube((x0 - 0.02, y, z), (x0 + span + 0.02, y, z), 0.025)
    for px in (x0 + 0.04, x0 + span - 0.04):
        arm(parts, (px, 0, MID), (px, y, z), high)
    x = x0 + span
    for w in widths:
        cx = x - w / 2
        d, h = w * 0.7, w * 0.78
        lo, hi = (cx - w / 2, y - d / 2, z + 0.012), (cx + w / 2, y + d / 2, z + 0.012 + h)
        if high:
            parts["shell"].chamfer_box(lo, hi, w * 0.12)
            # the slot faces the player
            parts["rubber"].box((cx - w * 0.36, y + d / 2 - 0.001, z + 0.012 + h * 0.42), (cx + w * 0.36, y + d / 2 + 0.001, z + 0.012 + h * 0.58))
        else:
            parts["shell"].box(lo, hi)
        x -= w + 0.02


def mark_tree(parts, x, high):
    w = 0.42
    z = TOP - 0.16
    for s in (-1, 1):
        arm(parts, (x + s * 0.15, 0, TOP - 0.02), (x + s * 0.15, 0, z), high)
    parts["wood"].box((x - w / 2, -0.012, z - 0.014), (x + w / 2, 0.012, z))
    count = 24 if high else 8
    for i in range(count):
        t = i / (count - 1)
        px = x - w / 2 + 0.012 + t * (w - 0.024)
        length = 0.3 - t * 0.19
        parts["metal"].rod((px, 0, z - 0.014), (px, 0, z - 0.014 - length), 0.0032, 4 if high else 3, False)


def triangle(parts, x, side, high):
    """Hangs under the top rail on a loop of cord."""
    h = side * math.sqrt(3) / 2
    y = -0.03
    top = TOP - 0.1
    z = top - h / 2
    parts["rubber"].rod((x, y, top), (x, 0, TOP - 0.02), 0.0018, 3)
    pts = [(x - side / 2, y, z - h / 2), (x + side / 2, y, z - h / 2), (x, y, z + h / 2)]
    for a, b in ((0, 1), (1, 2), (2, 0)):
        parts["metal"].rod(pts[a], pts[b], 0.004, 6 if high else 3)


def tray(parts, x0, x1, high):
    """A padded tray on the middle rail, for the things you pick up."""
    z = MID + 0.02
    parts["frame"].box((x0, -0.04, z), (x1, 0.3, z + 0.012))
    parts["felt"].box((x0 + 0.01, -0.03, z + 0.012), (x1 - 0.01, 0.29, z + 0.02))
    for px in (x0 + 0.06, x1 - 0.06):
        parts["frame"].tube((px, 0, MID), (px, 0.28, z), 0.02)
    top = z + 0.02
    cx = (x0 + x1) / 2
    parts["wood"].box((cx - 0.2, 0.04, top), (cx - 0.04, 0.12, top + 0.06))
    parts["wood"].box((cx + 0.02, 0.05, top), (cx + 0.14, 0.11, top + 0.045))
    sides = 12 if high else 5
    parts["panel"].sweep(circle(0.024, sides), [(cx - 0.18, 0.2, top + 0.024), (cx - 0.02, 0.2, top + 0.024)], smooth=True)
    for k in (0, 1):
        yy = 0.19 + k * 0.045
        parts["wood"].sweep(circle(0.011, 8 if high else 4), [(cx + 0.03, yy, top + 0.011), (cx + 0.2, yy, top + 0.011)], smooth=True)


def rack_accessories(parts, high, **_):
    frame(parts, high)
    cowbell(parts, -0.66, 0.07, high)
    cowbell(parts, -0.55, 0.055, high)
    tray(parts, -0.46, 0.08, high)
    temple_blocks(parts, 0.14, high)
    mark_tree(parts, -0.2, high)
    triangle(parts, 0.42, 0.2, high)


def rack_toms(parts, high, **_):
    frame(parts, high)
    for x, d in ((0.52, 10), (0.18, 12), (-0.19, 13), (-0.58, 14)):
        tom(parts, x, d, high)
    crash(parts, 0.38, 16, high)
    crash(parts, -0.42, 18, high, 0.36)


def rack_mixed(parts, high, **_):
    frame(parts, high)
    tom(parts, 0.55, 10, high)
    tom(parts, 0.22, 12, high)
    crash(parts, 0.4, 16, high)
    tray(parts, -0.62, -0.14, high)
    cowbell(parts, -0.03, 0.065, high)
    mark_tree(parts, -0.38, high)
    triangle(parts, 0.02, 0.18, high)
    crash(parts, -0.62, 18, high, 0.36)


def trap_table(parts, high, **_):
    w, d, h = 1.2, 0.6, 0.85
    parts["felt"].box((-w / 2, -d / 2, h - 0.03), (w / 2, d / 2, h))
    # the black cloth hanging to the audience side
    parts["cloth"].box((-w / 2 - 0.004, -d / 2 - 0.006, h - 0.28), (w / 2 + 0.004, -d / 2, h + 0.0005))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.05), sy * (d / 2 - 0.05)
            parts["metal"].rod((x, y, 0.0), (x, y, h - 0.03), 0.011, 8 if high else 4)
            if high:
                parts["rubber"].rod((x, y, 0.0), (x, y, 0.03), 0.015, 6)
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.05)
        parts["frame"].tube((x, -d / 2 + 0.05, 0.3), (x, d / 2 - 0.05, 0.3), 0.025)
    parts["frame"].tube((-w / 2 + 0.05, 0, 0.3), (w / 2 - 0.05, 0, 0.3), 0.025)
    top = h + 0.002
    sides = 20 if high else 8
    # tambourine
    parts["wood"].ring((0.34, 0.05, top + 0.022), 0.115, 0.008, 0.045, sides)
    parts["head"].lathe((0.34, 0.05, 0), [(0.115, top + 0.04), (0.115, top + 0.043)], sides, "z", True, (False, True))
    if high:
        for i in range(6):
            a = 2 * math.pi * i / 6
            parts["metal"].lathe(
                (0.34 + 0.127 * math.cos(a), 0.05 + 0.127 * math.sin(a), top + 0.012),
                [(0.02, 0.0), (0.02, 0.004)], 8, "z", True, (True, True),
            )
    # claves, a shaker, a wood block, a triangle lying down
    for s in (0, 1):
        y = -0.12 + s * 0.05
        parts["wood"].sweep(circle(0.012, 8 if high else 4), [(-0.1, y, top + 0.012), (0.1, y, top + 0.012)], smooth=True)
    parts["panel"].sweep(circle(0.025, 12 if high else 5), [(-0.34, 0.14, top + 0.025), (-0.17, 0.14, top + 0.025)], smooth=True)
    parts["wood"].box((-0.48, -0.16, top), (-0.3, -0.06, top + 0.07))
    side = 0.2
    h3 = side * math.sqrt(3) / 2
    pts = [(0.3, -0.18, top + 0.005), (0.3 + side, -0.18, top + 0.005), (0.3 + side / 2, -0.18 + h3, top + 0.005)]
    for a, b in ((0, 1), (1, 2), (2, 0)):
        parts["metal"].rod(pts[a], pts[b], 0.004, 6 if high else 3)

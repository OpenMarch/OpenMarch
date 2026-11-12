# cspell:words pitlib subwoofer
# Field speakers, the mixer cart and amps. No marks.
import math

from pitlib import art_rect, at, caster, circle, field_wheel, place, rect, rot


def driver(parts, x, z, diameter, face_y, high):
    r = diameter / 2
    sides = 28 if high else 10
    with place(parts, at(x, face_y, z), rot(90, "X")):
        parts["panel"].ring((0, 0, -0.004), r - 0.012, 0.012, 0.012, sides)
        cone = [(r - 0.012, -0.002), (r * 0.72, 0.03), (r * 0.26, 0.07)]
        parts["cone"].lathe((0, 0, 0), cone if high else [cone[0], cone[2]], sides)
        parts["rubber"].lathe((0, 0, 0), [(r * 0.26, 0.07), (r * 0.26, 0.04)], sides, "z", True, (False, True))


def horn(parts, x, z, w, h, face_y, high):
    t = 0.09
    parts["cone"].loft(
        [
            [(x - w / 2, face_y, z - h / 2), (x + w / 2, face_y, z - h / 2), (x + w / 2, face_y, z + h / 2), (x - w / 2, face_y, z + h / 2)],
            [(x - w * 0.14, face_y + t, z - h * 0.18), (x + w * 0.14, face_y + t, z - h * 0.18), (x + w * 0.14, face_y + t, z + h * 0.18), (x - w * 0.14, face_y + t, z + h * 0.18)],
        ],
        cap_start=False,
        cap_end=True,
    )


def rolling_base(parts, w, d, high, r=0.05):
    """A dolly on casters big enough for grass; returns the top of its deck."""
    z = 2 * r + 0.02
    parts["frame"].box((-w / 2, -d / 2, z - 0.005), (w / 2, d / 2, z + 0.025))
    for sx in (-1, 1):
        for sy in (-1, 1):
            caster(parts, sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), high, r)
    return z + 0.025


def cabinet(parts, w, h, d, base, high=True, x=0.0):
    """A cabinet with eased edges and an input plate on its back; returns the
    plane just in front of its face."""
    y0, y1 = -d / 2, d / 2
    lo, hi = (x - w / 2, y0, base), (x + w / 2, y1, base + h)
    if high:
        parts["cabinet"].chamfer_box(lo, hi, 0.014)
        # a recessed baffle edge, so the front doesn't read as a blank slab
        t = 0.022
        for a, b in (
            ((x - w / 2 + 0.014, y0 - 0.004, base + 0.014), (x + w / 2 - 0.014, y0, base + 0.014 + t)),
            ((x - w / 2 + 0.014, y0 - 0.004, base + h - 0.014 - t), (x + w / 2 - 0.014, y0, base + h - 0.014)),
            ((x - w / 2 + 0.014, y0 - 0.004, base + 0.014 + t), (x - w / 2 + 0.014 + t, y0, base + h - 0.014 - t)),
            ((x + w / 2 - 0.014 - t, y0 - 0.004, base + 0.014 + t), (x + w / 2 - 0.014, y0, base + h - 0.014 - t)),
        ):
            parts["panel"].box(a, b)
    else:
        parts["cabinet"].box(lo, hi)
    pw, ph = min(0.24, w * 0.5), min(0.3, h * 0.5)
    parts["panel"].box((x - pw / 2, y1, base + h * 0.2), (x + pw / 2, y1 + 0.004, base + h * 0.2 + ph))
    return y0 - 0.0015


def side_art(parts, w, h, d, base):
    """A side-panel artwork rectangle on the player's-left side (+X)."""
    x = w / 2 + 0.0015
    inset = 0.02
    art = parts["artwork"]
    y0, y1 = -d / 2 + inset, d / 2 - inset
    z0, z1 = base + inset, base + h - inset
    art.face([
        art.vert((x, y0, z0), (0, 0)),
        art.vert((x, y1, z0), (1, 0)),
        art.vert((x, y1, z1), (1, 1)),
        art.vert((x, y0, z1), (0, 1)),
    ])
    parts.slots["side-panel"] = (round(y1 - y0, 4), round(z1 - z0, 4))


def handles(parts, w, h, base, high):
    if not high:
        return
    z = base + h - 0.1
    for s in (-1, 1):
        x = s * (w / 2 + 0.004)
        parts["panel"].box((x - 0.004, -0.08, z - 0.02), (x + 0.004, 0.08, z + 0.02))


def speaker_wide(parts, high, **_):
    w, h, d = 1.2, 0.5, 0.5
    base = rolling_base(parts, w, d, high)
    face = cabinet(parts, w, h, d, base, high)
    for sx in (-1, 1):
        driver(parts, sx * 0.36, base + h / 2, 0.36, face, high)
    horn(parts, 0, base + h / 2, 0.26, 0.2, face, high)
    side_art(parts, w, h, d, base)
    handles(parts, w, h, base, high)


def speaker_square(parts, high, **_):
    w, h, d = 0.7, 0.6, 0.55
    base = rolling_base(parts, w, d, high)
    face = cabinet(parts, w, h, d, base, high)
    driver(parts, 0, base + 0.25, 0.42, face, high)
    horn(parts, 0, base + h - 0.095, 0.34, 0.1, face, high)
    side_art(parts, w, h, d, base)
    handles(parts, w, h, base, high)


def speaker_tall(parts, high, **_):
    """A stack: a subwoofer with a full-range cabinet standing on it."""
    w, h, d = 0.6, 0.62, 0.56
    base = rolling_base(parts, w, d, high)
    face = cabinet(parts, w, h, d, base, high)
    driver(parts, 0, base + h / 2, 0.46, face, high)
    handles(parts, w, h, base, high)
    tw, th, td = 0.5, 1.02, 0.42
    top = base + h
    face = cabinet(parts, tw, th, td, top, high)
    for z in (0.2, 0.52):
        driver(parts, 0, top + z, 0.3, face, high)
    horn(parts, 0, top + th - 0.16, 0.32, 0.16, face, high)
    side_art(parts, tw, th, td, top)


def mixer_cart(parts, high, covered=False, **_):
    w, d = 1.2, 0.72
    deck = 0.86
    wheel = 0.15
    for sx in (-1, 1):
        for sy in (-1, 1):
            field_wheel(parts, sx * (w / 2 - 0.16), sy * (d / 2 - 0.05), 2 * wheel + 0.03, high, wheel)
    low = 2 * wheel + 0.04  # the lower deck clears the tops of the wheels
    parts["frame"].box((-w / 2, -d / 2, low - 0.02), (w / 2, d / 2, low + 0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.03), sy * (d / 2 - 0.03)
            parts["frame"].tube((x, y, low), (x, y, deck), 0.04)
    parts["frame"].box((-w / 2, -d / 2, deck - 0.02), (w / 2, d / 2, deck + 0.02))
    # the rack below the deck
    parts["panel"].box((-0.3, -0.26, low + 0.02), (0.3, 0.26, deck - 0.02))
    if high:
        for i in range(4):
            z = low + 0.05 + i * 0.11
            parts["frame"].box((-0.26, 0.26, z), (0.26, 0.2615, z + 0.09))
            parts["screen"].box((0.16, 0.2615, z + 0.03), (0.22, 0.2625, z + 0.06))
    # push handle on the player's side
    y = d / 2 + 0.08
    for sx in (-1, 1):
        parts["metal"].rod((sx * (w / 2 - 0.06), d / 2, deck - 0.05), (sx * (w / 2 - 0.06), y, deck + 0.14), 0.012, 8 if high else 4)
    parts["metal"].rod((-(w / 2 - 0.06), y, deck + 0.14), (w / 2 - 0.06, y, deck + 0.14), 0.012, 8 if high else 4)
    # cable coils hanging on the audience end
    sides = 16 if high else 7
    for x in (-0.3, 0.3):
        with place(parts, at(x, -d / 2 - 0.014, deck - 0.14), rot(90, "X")):
            parts["rubber"].lathe((0, 0, 0), [(0.075, -0.012), (0.095, -0.012), (0.095, 0.012), (0.075, 0.012)], sides, "z", True, closed=True)
    # the mixer, sloped toward the player, with a laptop shelf
    mw, md = 0.92, 0.56
    top = deck + 0.02
    if covered:
        parts["cover"].loft(
            [
                [(-mw / 2 - 0.05, -md / 2 - 0.05, top), (mw / 2 + 0.05, -md / 2 - 0.05, top), (mw / 2 + 0.05, md / 2 + 0.05, top), (-mw / 2 - 0.05, md / 2 + 0.05, top)],
                [(-mw / 2 - 0.05, -md / 2 - 0.05, top + 0.3), (mw / 2 + 0.05, -md / 2 - 0.05, top + 0.3), (mw / 2 + 0.05, md / 2 + 0.05, top + 0.11), (-mw / 2 - 0.05, md / 2 + 0.05, top + 0.11)],
            ],
            smooth=False,
        )
        return
    with place(parts, at(0, 0, top + 0.1), rot(-14, "X")):
        parts["panel"].box((-mw / 2, -md / 2, -0.1), (mw / 2, md / 2, 0))
        if high:
            strips = 24
            pitch = (mw - 0.16) / strips
            for i in range(strips):
                x = -mw / 2 + 0.08 + (i + 0.5) * pitch
                parts["keys"].box((x - 0.005, 0.11, 0.0), (x + 0.005, 0.19, 0.012))
                for j in range(4):
                    y = -0.2 + j * 0.05
                    parts["frame"].lathe((x, y, 0), [(0.007, 0.0), (0.007, 0.014)], 6, "z", True, (False, True))
            parts["screen"].box((0.12, -0.26, 0.0), (0.42, -0.1, 0.002))
    parts["metal"].rod((-(w / 2 - 0.02), -0.25, top), (-(w / 2 - 0.02), -0.25, top + 0.42), 0.014, 8 if high else 4)
    parts["frame"].box((-(w / 2 - 0.02) - 0.18, -0.4, top + 0.42), (-(w / 2 - 0.02) + 0.18, -0.1, top + 0.435))
    x_l = -(w / 2 - 0.02)
    parts["panel"].box((x_l - 0.16, -0.37, top + 0.435), (x_l + 0.16, -0.13, top + 0.45))
    parts["panel"].box((x_l - 0.16, -0.38, top + 0.45), (x_l + 0.16, -0.37, top + 0.65))


def amp_guitar(parts, high, **_):
    w, h, d = 0.62, 0.5, 0.27
    y0 = -d / 2
    parts["cabinet"].chamfer_box((-w / 2, y0, 0.02), (w / 2, d / 2, 0.02 + h), 0.012)
    parts["cloth"].box((-w / 2 + 0.02, y0 - 0.002, 0.04), (w / 2 - 0.02, y0, 0.02 + h - 0.11))
    parts["panel"].box((-w / 2 + 0.02, y0 - 0.002, 0.02 + h - 0.09), (w / 2 - 0.02, y0, 0.02 + h - 0.02))
    if high:
        for i in range(7):
            x = -0.22 + i * 0.07
            with place(parts, at(x, y0 - 0.002, 0.02 + h - 0.055), rot(90, "X")):
                parts["keys"].lathe((0, 0, 0), [(0.011, 0.0), (0.011, 0.02)], 10, "z", True, (False, True))
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts["rubber"].box((sx * 0.27 - 0.02, sy * 0.1 - 0.02, 0), (sx * 0.27 + 0.02, sy * 0.1 + 0.02, 0.02))
        parts["rubber"].box((-0.1, -0.02, 0.02 + h), (0.1, 0.02, 0.02 + h + 0.014))


def amp_bass(parts, high, **_):
    w, h, d = 0.6, 0.62, 0.36
    y0 = -d / 2
    parts["cabinet"].chamfer_box((-w / 2, y0, 0.02), (w / 2, d / 2, 0.02 + h), 0.012)
    if high:
        for sx in (-1, 1):
            for sz in (0, 1):
                driver(parts, sx * 0.14, 0.02 + 0.17 + sz * 0.28, 0.25, y0 - 0.0015, high)
    else:
        parts["cone"].box((-w / 2 + 0.02, y0 - 0.002, 0.04), (w / 2 - 0.02, y0, 0.02 + h - 0.02))
    # the head on top
    z = 0.02 + h
    parts["cabinet"].box((-0.26, -0.13, z), (0.26, 0.13, z + 0.14))
    parts["panel"].box((-0.24, -0.132, z + 0.02), (0.24, -0.13, z + 0.12))
    if high:
        for i in range(8):
            x = -0.2 + i * 0.057
            with place(parts, at(x, -0.132, z + 0.07), rot(90, "X")):
                parts["keys"].lathe((0, 0, 0), [(0.01, 0.0), (0.01, 0.018)], 10, "z", True, (False, True))
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts["rubber"].box((sx * 0.25 - 0.02, sy * 0.14 - 0.02, 0), (sx * 0.25 + 0.02, sy * 0.14 + 0.02, 0.02))


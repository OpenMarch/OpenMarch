# cspell:words pitlib
# Gong and chimes. Working numbers; proportions only.
import math

from pitlib import INCH, caster, circle, rect


def gong(parts, high, inches=36, **_):
    d = inches * INCH
    r = d / 2
    frame_w = d + 0.3
    frame_h = d + 0.72
    cz = frame_h - 0.3 - r
    sides = 40 if high else 16
    # a tam-tam: a nearly flat face with the rim turned back toward the
    # player, dark in the middle and at the rim with a bright band between
    c = (0, 0, cz)
    parts["gong-dark"].lathe(c, [(0.0015, -0.008), (r * 0.22, -0.004)], sides, "y")
    band = [(r * 0.22, -0.004), (r * 0.55, -0.001), (r * 0.86, 0.0)]
    parts["gong"].lathe(c, band if high else [band[0], band[2]], sides, "y")
    parts["gong-dark"].lathe(c, [(r * 0.86, 0.0), (r * 0.955, 0.01), (r, 0.055)], sides, "y")
    # hung by two cords from the top bar
    top = frame_h - 0.03
    for s in (-1, 1):
        ax = s * r * 0.55
        az = cz + math.sqrt(r * r - ax * ax)
        parts["rubber"].rod((ax, 0.02, az), (s * r * 0.35, 0, top), 0.0035, 4)
    for s in (-1, 1):
        x = s * (frame_w / 2 - 0.02)
        parts["frame"].tube((x, 0, 0.13), (x, 0, frame_h), 0.05)
        parts["frame"].tube((x, -0.38, 0.11), (x, 0.38, 0.11), 0.05)
        for sy in (-1, 1):
            caster(parts, x, sy * 0.34, high, 0.04)
    parts["frame"].tube((-frame_w / 2, 0, frame_h - 0.025), (frame_w / 2, 0, frame_h - 0.025), 0.05)
    parts["frame"].tube((-frame_w / 2, 0, 0.13), (frame_w / 2, 0, 0.13), 0.04)


NATURAL_PCS = {0, 2, 4, 5, 7, 9, 11}


def chimes(parts, high, **_):
    width, depth, height = 0.88, 0.60, 1.82
    tube_r = 0.75 * INCH
    low, high_note = 60, 77  # 18 tubes
    naturals = [n for n in range(low, high_note + 1) if n % 12 in NATURAL_PCS]
    pitch = (width - 0.14) / max(len(naturals) - 1, 1)
    x_of = {n: width / 2 - 0.07 - i * pitch for i, n in enumerate(naturals)}
    for n in range(low, high_note + 1):
        if n not in x_of:
            x_of[n] = (x_of[n - 1] + x_of[n + 1]) / 2
    top = height - 0.1
    sides = 12 if high else 5
    for n in range(low, high_note + 1):
        rank = 0.045 if n in naturals else -0.045
        length = 1.5 * 2 ** (-(n - low) / 24)
        x = x_of[n]
        parts["metal"].sweep(circle(tube_r, sides), [(x, rank, top - length), (x, rank, top)], smooth=True)
        parts["metal"].sweep(circle(tube_r + 0.003, sides), [(x, rank, top - 0.03), (x, rank, top + 0.012)], smooth=True)
        if high:
            parts["rubber"].rod((x, rank, top + 0.012), (x, rank * 0.8, height - 0.02), 0.002, 3)
    for s in (-1, 1):
        x = s * (width / 2 - 0.02)
        parts["frame"].tube((x, 0, 0.11), (x, 0, height), 0.04)
        parts["frame"].tube((x, -depth / 2, 0.09), (x, depth / 2, 0.09), 0.045)
        for sy in (-1, 1):
            caster(parts, x, sy * (depth / 2 - 0.04), high, 0.035)
    parts["frame"].tube((-width / 2, 0, height - 0.02), (width / 2, 0, height - 0.02), 0.04)
    parts["frame"].tube((-width / 2, 0, 0.5), (width / 2, 0, 0.5), 0.03)
    # the damper bar and its pedal
    parts["felt"].box((-width / 2 + 0.05, -0.012, top - 0.09), (width / 2 - 0.05, 0.012, top - 0.06))
    parts["metal"].rod((0, 0.0, top - 0.09), (0, 0.05, 0.1), 0.006, 4)
    parts["frame"].box((-0.05, 0.05, 0.05), (0.05, 0.3, 0.07))

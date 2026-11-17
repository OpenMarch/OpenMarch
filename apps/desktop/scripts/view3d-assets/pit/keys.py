# cspell:words pitlib keybed
# Keyboard synthesizers on a stand with a rack and laptop shelf. No marks.
from pitlib import at, place, rect, rot

WHITE = 0.0235
BLACK_PCS = {1, 3, 6, 8, 10}


def keyboard(parts, high, keys):
    low, high_note = (36, 96) if keys == 61 else (21, 108)
    whites = sum(1 for n in range(low, high_note + 1) if n % 12 not in BLACK_PCS)
    keybed = whites * WHITE
    width = keybed + 0.12
    depth, body_h = 0.32, 0.09
    parts["panel"].box((-width / 2, -depth / 2, 0), (width / 2, depth / 2, body_h))
    key_front, key_back = depth / 2 - 0.15, depth / 2 + 0.0
    top = body_h + 0.002
    if high:
        x = keybed / 2
        index = {}
        for n in range(low, high_note + 1):
            if n % 12 in BLACK_PCS:
                continue
            index[n] = x - WHITE / 2
            parts["keys"].box(
                (x - WHITE + 0.0006, -depth / 2 + 0.0, top - 0.012),
                (x - 0.0006, -depth / 2 + 0.155, top),
            )
            x -= WHITE
        for n in range(low, high_note + 1):
            if n % 12 in BLACK_PCS:
                cx = (index[n - 1] + index[n + 1]) / 2
                parts["frame"].box(
                    (cx - 0.0065, -depth / 2 + 0.06, top),
                    (cx + 0.0065, -depth / 2 + 0.155, top + 0.012),
                )
    else:
        parts["keys"].box((-keybed / 2, -depth / 2, top - 0.012), (keybed / 2, -depth / 2 + 0.155, top))
    # flip so the keys face the player: built with the key front at -Y
    parts["screen"].box((-0.1, depth / 2 - 0.085, body_h), (0.1, depth / 2 - 0.02, body_h + 0.003))
    if high:
        for i in range(10):
            xk = -width / 2 + 0.08 + i * 0.03
            parts["frame"].lathe((xk, depth / 2 - 0.06, 0), [(0.008, body_h), (0.008, body_h + 0.014)], 8, "z", True, (False, True))
    return width, depth, body_h


def synth(parts, high, keys=61, tiers=1, **_):
    deck = 0.82
    with place(parts, at(0, 0, deck), rot(180, "Z")):
        width, depth, body_h = keyboard(parts, high, keys)
    if tiers == 2:
        with place(parts, at(0, -0.14, deck + 0.3), rot(180, "Z"), rot(-10, "X")):
            keyboard(parts, high, keys)
    # a double-braced X stand
    half = min(width / 2 - 0.1, 0.42)
    for s in (-1, 1):
        parts["frame"].tube((half * s, depth / 2 - 0.06, 0.03), (-half * s, -depth / 2 + 0.06, deck - 0.005), 0.03)
        parts["frame"].tube((half * s, -depth / 2 + 0.06, 0.03), (-half * s, depth / 2 - 0.06, deck - 0.005), 0.03)
    for s in (-1, 1):
        parts["frame"].tube((s * half, -0.27, 0.015), (s * half, 0.27, 0.015), 0.03)
        if high:
            for sy in (-1, 1):
                parts["rubber"].box((s * half - 0.025, sy * 0.27 - 0.03, 0), (s * half + 0.025, sy * 0.27 + 0.03, 0.015))
        parts["frame"].tube((s * (half + 0.02), -depth / 2 + 0.03, deck - 0.01), (s * (half + 0.02), depth / 2 - 0.03, deck - 0.01), 0.025)
    if tiers == 2:
        for s in (-1, 1):
            parts["metal"].rod((s * half, -0.1, deck), (s * half, -0.14, deck + 0.3), 0.012, 8 if high else 4)
    # the small rack on the side and a laptop shelf above it
    rack_x = -(width / 2 + 0.16)
    rack_top = 0.36
    parts["cabinet"].chamfer_box((rack_x - 0.2, -0.16, 0.04), (rack_x + 0.2, 0.16, rack_top), 0.008)
    if high:
        for i in range(2):
            z = 0.09 + i * 0.13
            parts["frame"].box((rack_x - 0.18, 0.16, z), (rack_x + 0.18, 0.1615, z + 0.09))
            parts["screen"].box((rack_x + 0.1, 0.1615, z + 0.03), (rack_x + 0.16, 0.1625, z + 0.06))
    parts["metal"].rod((rack_x, 0, rack_top), (rack_x, 0, 0.98), 0.016, 8 if high else 4)
    parts["frame"].box((rack_x - 0.2, -0.15, 0.98), (rack_x + 0.2, 0.15, 0.995))
    # the laptop: base and an open lid toward the player
    parts["panel"].box((rack_x - 0.16, -0.12, 0.995), (rack_x + 0.16, 0.1, 1.012))
    parts["panel"].box((rack_x - 0.16, -0.13, 1.012), (rack_x + 0.16, -0.12, 1.21))
    parts["screen"].box((rack_x - 0.145, -0.12, 1.022), (rack_x + 0.145, -0.1192, 1.2))

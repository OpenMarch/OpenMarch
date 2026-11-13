# cspell:words pitlib toeboard toeboards mathutils
# Podiums a conductor or drum major stands on: the boxy conductor podiums, the
# aluminum drum major stand and towers, a rolling field podium, a stepladder and
# a one-layer scaffold tower. Generic shapes, no marks, kept to the few members
# that read from the stands: legs, one brace a side, treads and a top rail.
#
# The drum major faces the field (+Y) with the audience behind (-Y); every podium
# is climbed from behind, except the rolling one, which has a ladder at each end.
# Each builder sets parts.stand: where the drum major's feet go, in Blender
# coordinates (x, y, top of the standing surface).
from mathutils import Matrix

from pitlib import INCH, caster, place

FT = 12 * INCH
RAIL_H = 0.95  # guardrail height above the deck


def _lerp(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def _sides(high):
    return 8 if high else 4


def _rail(parts, mat, pts, z, high, r=0.016):
    """Posts at each point and one top rail joining them in order."""
    s = _sides(high)
    for x, y in pts:
        parts[mat].rod((x, y, z - 0.01), (x, y, z + RAIL_H), r, s)
    for p, q in zip(pts, pts[1:]):
        parts[mat].rod((p[0], p[1], z + RAIL_H), (q[0], q[1], z + RAIL_H), r, s)


def _treads(parts, mat, half_w, foot, top, steps, depth=0.11):
    """`steps` flat treads evenly spaced between foot (y, z) and top (y, z),
    not counting the top."""
    for i in range(1, steps + 1):
        y, z = _lerp(foot, top, i / (steps + 1))
        parts[mat].box((-half_w, y - depth / 2, z - 0.025), (half_w, y + depth / 2, z))


def _deck(parts, mat, tread, w, d, z, rim=0.05):
    """A deck: a tube rim with a grip surface inset into its top."""
    parts[mat].box((-w / 2, -d / 2, z - rim), (w / 2, d / 2, z - 0.006))
    parts[tread].box((-w / 2 + 0.02, -d / 2 + 0.02, z - 0.006), (w / 2 - 0.02, d / 2 - 0.02, z))


def _finish(black):
    return "powder-black" if black else "aluminum"


def conductor_podium(parts, high, tall=False, **_):
    """A conductor's podium: a low box with a step, or a tall tower with a ladder,
    climbed from behind, with a rail on the other three sides."""
    # Built with the access toward +Y, then mirrored so it faces the audience (-Y).
    with place(parts, Matrix.Scale(-1, 4, (0, 1, 0))):
        _conductor_podium(parts, high, tall)
    parts.stand = (0.0, 0.0, (1.5 if tall else 0.42) + 0.006)


def _conductor_podium(parts, high, tall):
    w = d = 1.2
    h = 1.5 if tall else 0.42
    sides = _sides(high)
    if tall:
        a = w / 2 - 0.04
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts["frame"].tube((sx * a, sy * a, 0), (sx * a, sy * a, h - 0.06), 0.06)
        parts["frame"].box((-w / 2, -d / 2, h - 0.08), (w / 2, d / 2, h))
        # one brace a side, low down, open on the ladder side
        for p, q in (((-a, -a), (a, -a)), ((a, -a), (a, a)), ((-a, a), (-a, -a))):
            parts["frame"].tube((p[0], p[1], 0.2), (q[0], q[1], 0.2), 0.04)
        run = 0.55
        for s in (-1, 1):
            parts["metal"].rod((s * 0.25, d / 2 + run, 0.0), (s * 0.25, d / 2, h), 0.018, sides)
        steps = 6
        for i in range(1, steps):
            t = i / steps
            y = d / 2 + run * (1 - t)
            parts["metal"].rod((-0.25, y, h * t), (0.25, y, h * t), 0.014, sides)
    elif high:
        parts["frame"].chamfer_box((-w / 2, -d / 2, 0.0), (w / 2, d / 2, h), 0.015)
        parts["frame"].chamfer_box((-0.32, d / 2 - 0.02, 0.0), (0.32, d / 2 + 0.3, h * 0.5), 0.012)
    else:
        parts["frame"].box((-w / 2, -d / 2, 0.0), (w / 2, d / 2, h))
        parts["frame"].box((-0.32, d / 2, 0.0), (0.32, d / 2 + 0.3, h * 0.5))
    parts["felt"].box((-w / 2 + 0.02, -d / 2 + 0.02, h), (w / 2 - 0.02, d / 2 - 0.02, h + 0.006))
    # a safety rail on three sides, open where you climb on
    inset = 0.04
    pts = [(-w / 2 + inset, d / 2 - inset), (-w / 2 + inset, -d / 2 + inset), (w / 2 - inset, -d / 2 + inset), (w / 2 - inset, d / 2 - inset)]
    _rail(parts, "metal", pts, h, high)


def stand(parts, high, black=False, **_):
    """A 2 ft aluminum drum major stand: a 24 in deck on four splayed legs, with
    a foot bar on each side and no rail."""
    m = _finish(black)
    h, w = 2 * FT, 2 * FT
    a, b = w / 2 - 0.03, w / 2 + 0.06  # leg inset at the top, splay at the foot
    _deck(parts, m, "tread", w, w, h, 0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts[m].tube((sx * a, sy * a, h - 0.05), (sx * b, sy * b, 0.02), 0.035)
            parts["rubber"].box((sx * b - 0.025, sy * b - 0.025, 0), (sx * b + 0.025, sy * b + 0.025, 0.02))
        z = 0.14
        c = b - (b - a) * (z - 0.02) / (h - 0.07)
        parts[m].tube((sx * c, -c, z), (sx * c, c, z), 0.025)
    parts.stand = (0.0, 0.0, h)


def tower(parts, high, height_ft, black=False, rail="sides", **_):
    """An aluminum drum major tower built like a big step stool: two straight
    front legs, a full-width staircase for the back, one diagonal a side, and a
    36 x 32 in deck. rail is "sides" (a handrail each side, open front and back)
    or "full" (the field side railed too)."""
    m = _finish(black)
    h = height_ft * FT
    w, d = 36 * INCH, 32 * INCH
    ax, ay = w / 2 - 0.03, d / 2 - 0.03
    bx = ax + 0.04 + 0.03 * h  # a little splay at the feet
    run = 0.5 * h
    front = ((ay, h - 0.05), (ay + 0.06 * h, 0.025))
    back = ((-ay, h - 0.05), (-ay - run, 0.025))
    _deck(parts, m, "tread", w, d, h, 0.06)
    for sx in (-1, 1):
        # front legs splay out a little; the stair stringers run straight down
        for (y0, z0), (y1, z1), foot_x, deep in ((*front, bx, 0.045), (*back, ax, 0.07)):
            parts[m].tube((sx * ax, y0, z0), (sx * foot_x, y1, z1), 0.045, deep)
            parts["rubber"].box((sx * foot_x - 0.03, y1 - 0.035, 0), (sx * foot_x + 0.03, y1 + 0.035, 0.025))
        # one diagonal: from the front foot up to the stair stringer
        lo = (sx * (bx - 0.01), front[1][0] - 0.03, 0.18)
        hi = (sx * ax, -ay - run * 0.25, h * 0.75)
        parts[m].tube(lo, hi, 0.028)
    # a low bar across the front
    parts[m].tube((-bx, front[1][0] - 0.02, 0.18), (bx, front[1][0] - 0.02, 0.18), 0.03)
    # treads the width of the stair
    steps = max(3, round(h / 0.3) - 1)
    _treads(parts, "tread", ax - 0.02, (-ay - run, 0.0), (-ay, h), steps)
    ix, iy = w / 2 - 0.025, d / 2 - 0.025
    if rail == "full":
        _rail(parts, m, [(-ix, -iy), (-ix, iy), (ix, iy), (ix, -iy)], h, high)
    else:
        for sx in (-1, 1):
            _rail(parts, m, [(sx * ix, -iy), (sx * ix, iy)], h, high)
    parts.stand = (0.0, 0.0, h)


def rolling(parts, high, black=False, **_):
    """A 6 ft rolling field podium: a 6 x 4 ft deck on four legs and a base frame
    with casters, a ladder at each end, and a rail along the front and back."""
    m = _finish(black)
    h = 6 * FT
    w, d = 6 * FT, 4 * FT
    cz = 0.15  # caster top
    a, b = w / 2 - 0.04, d / 2 - 0.04
    _deck(parts, m, "tread", w, d, h, 0.1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts[m].tube((sx * a, sy * b, cz), (sx * a, sy * b, h - 0.1), 0.06)
            caster(parts, sx * a, sy * b, high, 0.065)
    for sy in (-1, 1):
        parts[m].tube((-a, sy * b, cz + 0.04), (a, sy * b, cz + 0.04), 0.05)
    for sx in (-1, 1):
        parts[m].tube((sx * a, -b, cz + 0.04), (sx * a, b, cz + 0.04), 0.05)
    # a steep ladder hooked over each end, its stiles carried up as grab rails
    half = 0.24
    run = 0.4
    for sx in (-1, 1):
        x_top, x_foot = sx * w / 2, sx * (w / 2 + run)
        for sy in (-1, 1):
            parts[m].tube((x_foot, sy * half, 0.0), (x_top, sy * half, h), 0.04)
            parts[m].tube((x_top, sy * half, h), (x_top - sx * 0.02, sy * half, h + RAIL_H), 0.03)
        for i in range(1, 6):
            t = i / 6
            x = x_foot + (x_top - x_foot) * t
            parts["tread"].box((x - 0.05, -half + 0.02, h * t - 0.025), (x + 0.05, half - 0.02, h * t))
    ix, iy = w / 2 - 0.03, d / 2 - 0.03
    for sy in (-1, 1):
        _rail(parts, m, [(-ix, sy * iy), (ix, sy * iy)], h, high, 0.02)
    parts.stand = (0.0, 0.0, h)


def stepladder(parts, high, **_):
    """A 6 ft aluminum A-frame stepladder, steps toward the audience. The drum
    major stands on the highest step you may stand on, two below the top cap."""
    h = 6 * FT
    steps = 5
    top_w, foot_w = 0.40, 0.56
    y_front_foot, y_front_top = -0.46, -0.07
    y_back_foot, y_back_top = 0.44, 0.07

    def half_at(z):
        return foot_w / 2 + (top_w - foot_w) / 2 * z / h

    for sx in (-1, 1):
        parts["aluminum"].tube((sx * foot_w / 2, y_front_foot, 0.03), (sx * top_w / 2, y_front_top, h - 0.05), 0.022, 0.07)
        parts["rubber"].box((sx * foot_w / 2 - 0.025, y_front_foot - 0.04, 0), (sx * foot_w / 2 + 0.025, y_front_foot + 0.04, 0.03))
        parts["aluminum"].tube((sx * foot_w / 2, y_back_foot, 0.03), (sx * top_w / 2, y_back_top, h - 0.05), 0.022, 0.05)
        parts["rubber"].box((sx * foot_w / 2 - 0.025, y_back_foot - 0.03, 0), (sx * foot_w / 2 + 0.025, y_back_foot + 0.03, 0.03))
        # spreader arm, folded out flat
        z = h * 0.48
        t = z / h
        yf = y_front_foot + (y_front_top - y_front_foot) * t
        yb = y_back_foot + (y_back_top - y_back_foot) * t
        parts["aluminum"].tube((sx * half_at(z), yf + 0.02, z), (sx * half_at(z), yb - 0.02, z), 0.006, 0.02)
    stand_z = stand_y = 0.0
    for i in range(1, steps + 1):
        z = h * i / (steps + 1)
        yf = y_front_foot + (y_front_top - y_front_foot) * z / h
        half = half_at(z) - 0.012
        parts["aluminum"].box((-half, yf - 0.045, z - 0.025), (half, yf + 0.045, z))
        if i == steps - 1:
            stand_z, stand_y = z, yf
    # one brace across the back legs, and the molded top cap
    z = h * 0.2
    yb = y_back_foot + (y_back_top - y_back_foot) * z / h
    parts["aluminum"].tube((-half_at(z), yb, z), (half_at(z), yb, z), 0.02)
    parts["rubber"].chamfer_box((-top_w / 2 - 0.02, -0.11, h - 0.05), (top_w / 2 + 0.02, 0.11, h), 0.01)
    parts.stand = (0.0, stand_y, stand_z)


def scaffold(parts, high, **_):
    """One layer of rolling frame scaffold: two 5 ft end frames with built-in
    rungs, one 7 ft cross brace on each long side, a plank deck about 2 m up,
    a guardrail and toeboards, on locking casters. You climb the rungs of the
    audience-side end frame."""
    s = _sides(high)
    w = 5 * FT
    span = 7 * FT
    deck = 2.0
    plank_t = 0.05
    frame_top = deck - plank_t
    cz = 0.15
    a, b = w / 2, span / 2
    r = 0.024
    for sy in (-1, 1):
        y = sy * b
        for sx in (-1, 1):
            parts["galvanized"].rod((sx * a, y, cz), (sx * a, y, frame_top), r, s)
            caster(parts, sx * a, y, high, 0.065)
        parts["galvanized"].rod((-a, y, frame_top - r), (a, y, frame_top - r), r, s)
        # rungs about 45 cm apart
        n = 3
        for i in range(n + 1):
            z = cz + 0.06 + (frame_top - r - cz - 0.06) * i / (n + 1)
            parts["galvanized"].rod((-a, y, z), (a, y, z), r * 0.75, s)
    # one cross brace a side, pinned to the frame legs
    for sx in (-1, 1):
        x = sx * (a + 0.03)
        parts["galvanized"].rod((x, -b, cz + 0.35), (x, b, frame_top - 0.35), 0.012, s)
    # plank deck across the frames' top bars
    planks = 4
    pw = w / planks
    for i in range(planks):
        x0 = -a + i * pw + 0.005
        parts["plank"].box((x0, -b - 0.1, frame_top), (x0 + pw - 0.01, b + 0.1, deck))
    # guardrail on the frame legs: the long sides and the field end
    _rail(parts, "galvanized", [(-a, -b), (-a, b), (a, b), (a, -b)], deck, high, r)
    # toeboards
    t, tb = 0.025, 0.1
    parts["plank"].box((-a, b - t, deck), (a, b, deck + tb))
    parts["plank"].box((-a, -b, deck), (-a + t, b, deck + tb))
    parts["plank"].box((a - t, -b, deck), (a, b, deck + tb))
    parts.stand = (0.0, 0.0, deck)

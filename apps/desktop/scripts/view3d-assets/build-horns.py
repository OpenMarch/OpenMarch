# cspell:words mathutils bmesh verts mainfile
# Builds the mellophone, baritone, euphonium and contra as .blend files from
# the trumpet's valve block and mouthpiece (assets/instruments/CREDITS.md),
# with new tubing and bells swept to proportions read off side-view product
# photos. Only proportions come from the photos; no image or mark is used.
#
#   blender -b trumpet.blend --python build-horns.py -- out-dir
#
# Writes <out-dir>/<horn>.blend for each horn, in meters, already in the
# 3D View's instrument frame (origin at the right-hand grip) with file axes
# (X, Y, Z) = instrument (+Z bell, +X performer's left, +Y up). Bake each
# with export-horn.py and <horn>.config.json.
import bpy, bmesh, math, sys, mathutils

OUT = sys.argv[sys.argv.index("--") + 1]

# the trumpet file's units per meter of the baked trumpet (trumpet.config.json)
TRUMPET_SCALE = 0.05375
# the valve block's anchor in the trumpet file: the middle of its width, its
# lateral center and its lowest point
VALVE_ANCHOR = mathutils.Vector((-0.61, 0.20, -1.46))
VALVE_PARTS = {
    "Cylinder.001", "Cylinder.004", "Cylinder.007", "Cylinder.009",
    "Cylinder.012", "Cylinder.013", "Cylinder.014", "Cylinder.015",
    "Cylinder.016", "Cylinder.017", "Cylinder.018", "Cylinder.019",
    "Cylinder.020", "Cylinder.021", "Cylinder.022", "Cylinder.023",
    "Cylinder.024", "Cylinder.025", "Cylinder.026", "Cylinder.027",
    "Cylinder.028", "Cylinder.029", "Cylinder.030", "Cylinder.031",
    "Cylinder.032", "Cylinder.033",
}
# the mouthpiece and its receiver: the rim, and the receiver's front end
MOUTHPIECE_RIM = mathutils.Vector((-4.555, -0.05, 0.32))
RECEIVER_END = 1.775  # trumpet units from the rim forward
MOUTHPIECE_PARTS = {
    "Cylinder.002", "Cylinder.010", "Cylinder.011", "Cylinder.034",
    "Cylinder.035", "Cylinder.036", "Cylinder.037", "Cylinder.038",
}


def blender(p):
    """Instrument (x left, y up, z bell) to file (X bell, Y left, Z up)."""
    return mathutils.Vector((p[2], p[0], p[1]))


def catmull(points, per):
    """`per` samples per span on a Catmull-Rom curve through `points`."""
    pts = [mathutils.Vector(p) for p in points]
    out = []
    n = len(pts)
    for i in range(n - 1):
        a = pts[max(i - 1, 0)]
        b, c = pts[i], pts[i + 1]
        d = pts[min(i + 2, n - 1)]
        for k in range(per):
            t = k / per
            out.append(
                0.5 * (2 * b + (c - a) * t
                       + (2 * a - 5 * b + 4 * c - d) * t * t
                       + (3 * b - a - 3 * c + d) * t * t * t))
    out.append(pts[-1])
    return out


def arc(center, radius, a0, a1, steps, plane="yz"):
    """Points on a circle in the instrument's YZ plane (angles in degrees,
    0 toward +Z, 90 toward +Y), or XZ."""
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        if plane == "yz":
            out.append((center[0], center[1] + radius * math.sin(a),
                        center[2] + radius * math.cos(a)))
        else:
            out.append((center[0] + radius * math.sin(a), center[1],
                        center[2] + radius * math.cos(a)))
    return out


def tube(name, points, radii, mat, segments=24, per=4, caps=True):
    """A tube swept along a smooth curve through `points`, its radius
    interpolated from `radii` (one per point, or one for all)."""
    path = catmull(points, per)
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(points)
    # the radius along the smoothed path, by arc length between the points
    rs = []
    for i in range(len(path)):
        f = i / per
        j = min(int(f), len(radii) - 2)
        t = f - j
        rs.append(radii[j] * (1 - t) + radii[j + 1] * t if len(radii) > 1 else radii[0])
    bm = bmesh.new()
    rings = []
    prev_u = None
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        if prev_u is None:
            ref = mathutils.Vector((0, 1, 0)) if abs(t.y) < 0.9 else mathutils.Vector((1, 0, 0))
            u = t.cross(ref).normalized()
        else:
            # parallel transport: keep the ring from twisting
            u = (prev_u - t * prev_u.dot(t)).normalized()
        v = t.cross(u)
        prev_u = u
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            q = p + rs[i] * (math.cos(a) * u + math.sin(a) * v)
            ring.append(bm.verts.new(blender(q)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segments):
            a, b = rings[i][k], rings[i][(k + 1) % segments]
            c, d = rings[i + 1][(k + 1) % segments], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return finish(bm, name, mat)


def lathe(name, profile, axis_y, mat, segments=48, x=0.0):
    """A bell: `profile` is (z, r) pairs along the instrument's +Z at height
    `axis_y`, open at both ends, with a rolled rim bead."""
    bm = bmesh.new()
    rings = []
    for z, r in profile:
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            ring.append(bm.verts.new(blender((x + r * math.cos(a), axis_y + r * math.sin(a), z))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segments):
            a, b = rings[i][k], rings[i][(k + 1) % segments]
            c, d = rings[i + 1][(k + 1) % segments], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    return finish(bm, name, mat)


def finish(bm, name, mat):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(bpy.data.materials[mat])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    # outward normals for the closed parts; the bell is open and two-sided
    return ob


def place(names, anchor, scale, at):
    """Copies trumpet parts, scaled about `anchor` (file units) by `scale`
    (meters per file unit), so the anchor lands at instrument point `at`."""
    m = (mathutils.Matrix.Translation(blender(at))
         @ mathutils.Matrix.Scale(scale, 4)
         @ mathutils.Matrix.Translation(-anchor))
    for n in names:
        src = bpy.data.objects[n]
        ob = src.copy()
        ob.data = src.data.copy()
        ob.matrix_world = m @ src.matrix_world
        ob.name = "horn." + n
        bpy.context.scene.collection.objects.link(ob)


def bell_profile(table, z0, z1, rim_r, steps=40):
    """The bell's (z, r) profile: `table` gives (t, r/rim) along the bell
    from the start of its tube (t 0) to the rim (t 1), smoothly between,
    then a short rolled bead past the rim."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        # piecewise-linear in log radius: a horn flare between the samples
        for j in range(len(table) - 1):
            if table[j][0] <= t <= table[j + 1][0]:
                (ta, ra), (tb, rb) = table[j], table[j + 1]
                f = (t - ta) / (tb - ta)
                r = math.exp(math.log(ra) * (1 - f) + math.log(rb) * f)
                break
        pts.append((z0 + (z1 - z0) * t, r * rim_r))
    # the rim's bead: out, back over and in, so the edge reads thick
    bead = rim_r * 0.025
    pts += [(z1 + bead * 0.5, rim_r + bead * 0.5), (z1, rim_r + bead),
            (z1 - bead * 0.5, rim_r + bead * 0.4)]
    return pts


def clear_scene():
    keep = VALVE_PARTS | MOUTHPIECE_PARTS
    for o in list(bpy.context.scene.objects):
        if o.name not in keep and not o.name.startswith("horn."):
            bpy.data.objects.remove(o)


def hide_sources():
    for n in VALVE_PARTS | MOUTHPIECE_PARTS:
        bpy.data.objects.remove(bpy.data.objects[n])


# Valved marching horns, bell forward over an oval wrap. Every length is a
# fraction of the horn's length L (mouthpiece rim to bell rim) and every
# height is from the bell's axis, as read off the side-view photos; radii
# are meters. `grip` is how far in front of the rim the right hand's grip
# is, as a fraction of L, matching the procedural horns so the holds bring
# the rim to the lips.
VALVED = {
    "mellophone": dict(
        L=0.55, rim_r=0.13, grip=0.35, lead=-0.04,
        back=0.079, bottom=-0.286, front=0.60, valves=0.451,
        casing_bottom=-0.243, valve_scale=1.25, mp_scale=1.1,
        lead_r=0.0045, wrap_r=(0.0105, 0.008), inner=(-0.2, 0.33),
        bell=[(0.0, 0.07), (0.45, 0.09), (0.62, 0.13), (0.8, 0.3),
              (0.9, 0.52), (0.96, 0.78), (1.0, 1.0)],
        slides=[(-0.15, -0.2, 0.18), (-0.13, -0.19, 0.77)],
    ),
    "baritone": dict(
        L=0.62, rim_r=0.125, grip=0.36, lead=-0.045,
        back=0.084, bottom=-0.327, front=0.70, valves=0.413,
        casing_bottom=-0.25, valve_scale=1.45, mp_scale=1.35,
        lead_r=0.0052, wrap_r=(0.016, 0.011), inner=(-0.255, 0.16),
        bell=[(0.0, 0.13), (0.35, 0.18), (0.57, 0.29), (0.79, 0.66),
              (0.9, 0.85), (1.0, 1.0)],
        slides=[(-0.13, -0.19, 0.09), (-0.13, -0.19, 0.63)],
    ),
    "euphonium": dict(
        L=0.66, rim_r=0.14, grip=0.36, lead=-0.05,
        back=0.045, bottom=-0.322, front=0.745, valves=0.41,
        casing_bottom=-0.228, valve_scale=1.45, mp_scale=1.4,
        lead_r=0.0055, wrap_r=(0.021, 0.015), inner=(-0.235, 0.18),
        bell=[(0.0, 0.12), (0.38, 0.18), (0.58, 0.25), (0.79, 0.57),
              (0.9, 0.8), (1.0, 1.0)],
        slides=[(-0.12, -0.17, 0.12), (-0.15, -0.21, 0.64)],
    ),
}


def valved(name, s):
    L = s["L"]
    # instrument coordinates of a photo point (fraction along L from the
    # rim, height from the bell's axis): the rim lands at
    # (0, 0.018, -grip L), level with the leadpipe as on every valved horn
    def at(x, y, lat=0.0):
        return (lat, (y - s["lead"]) * L + 0.018, (x - s["grip"]) * L)

    rim_r = s["rim_r"]
    wrap_r, bottom_r = s["wrap_r"]
    axis_y = at(0, 0)[1]
    bend = -s["bottom"] / 2 * L  # the back bow's radius
    back_c = at(s["back"], 0)[2] + bend  # its center's z
    # the bell: from the top of the back bow to the rim
    lathe(name + ".bell", bell_profile(s["bell"], back_c, at(1.0, 0)[2], rim_r),
          axis_y, "Gold")
    # the wrap: the back bow down from the bell tube, the bottom run forward,
    # and the front bow up toward the valves
    bot_y = at(0, s["bottom"])[1]
    front_z = at(s["front"], 0)[2]
    # the front bow turns the bottom run up and back, level under the casings
    under_y = at(0, s["casing_bottom"])[1] - 0.012
    fb = (under_y - bot_y) / 2
    tube(name + ".wrap",
         [(0, axis_y, back_c + 0.002)]
         + arc((0, (axis_y + bot_y) / 2, back_c), bend, 90, 270, 16)[1:]
         + [(0, bot_y, front_z - fb)]
         + arc((0, bot_y + fb, front_z - fb), fb, -90, 90, 10)[1:]
         + [(0, under_y, at(s["valves"] + 0.04, 0)[2])],
         [rim_r * s["bell"][0][1]] + [wrap_r] * 16
         + [bottom_r] + [bottom_r * 0.92] * 10 + [bottom_r * 0.85],
         "Gold", segments=28)
    # the leadpipe: from the receiver forward past the valves, a bow down,
    # and back under them to the first casing: the inner loop
    rim = at(0, s["lead"])
    mp = s["mp_scale"] * TRUMPET_SCALE
    start = (0, rim[1], rim[2] + RECEIVER_END * mp)
    inner_y = at(0, s["inner"][0])[1]
    lf = at(s["front"] - 0.03, 0)[2]
    ib = (rim[1] - inner_y) / 2
    tube(name + ".lead",
         [start, (0, rim[1], lf - ib)]
         + arc((0, (rim[1] + inner_y) / 2, lf - ib), ib, 90, -90, 8)[1:]
         + [(0, inner_y, at(s["inner"][1], 0)[2])]
         + arc((0, inner_y + ib * 0.35, at(s["inner"][1], 0)[2]), ib * 0.35, -90, -180, 4)[1:]
         + [(0, inner_y + ib * 0.7, at(s["inner"][1] + 0.04, 0)[2]),
            (0, inner_y + ib * 0.7, at(s["valves"] - 0.02, 0)[2])],
         [s["lead_r"] * 0.85, s["lead_r"]] + [s["lead_r"] * 1.15] * 16,
         "Gold", segments=20)
    # the valve slides: Us out to the performer's left, one back, one forward
    for i, (y0, y1, x_end) in enumerate(s["slides"]):
        ya, yb = at(0, y0)[1], at(0, y1)[1]
        za = at(s["valves"], 0)[2]
        zb = at(x_end, 0)[2]
        r = (ya - yb) / 2
        sign = 1 if zb > za else -1
        c = zb - sign * r
        tube(f"{name}.slide{i}",
             [(0.012, ya, za), (0.012, ya, c)]
             + arc((0.012, (ya + yb) / 2, c), r,
                   90 if sign > 0 else 90, -90 if sign > 0 else 270, 6)[1:]
             + [(0.012, yb, za)],
             s["lead_r"] * 1.1, "Gold", segments=16)
    # braces from the leadpipe up to the bell tube
    for x in (0.2, s["front"] - 0.08):
        z = at(x, 0)[2]
        tube(f"{name}.brace{x}", [(0, rim[1], z), (0, axis_y, z)], 0.0018, "Gold", segments=8)
    # the trumpet's valve block, scaled to this horn and standing on the
    # casings' bottom; its mouthpiece and receiver at the rim
    place(VALVE_PARTS, VALVE_ANCHOR, s["valve_scale"] * TRUMPET_SCALE,
          at(s["valves"], s["casing_bottom"], 0.012))
    place(MOUTHPIECE_PARTS, MOUTHPIECE_RIM, mp, rim)


def contra(name):
    # straight from the contra's side photo, meters, instrument frame: the
    # valves by the bell's underside at the grip, the wrap behind
    axis_y, rim_z, rim_r = 0.15, 0.27, 0.25
    top_y, bot_y = axis_y, -0.11
    back_c = -0.525  # the back bow's center
    bend = (top_y - bot_y) / 2
    lathe(name + ".bell",
          bell_profile([(0.0, 0.18), (0.4, 0.21), (0.65, 0.28), (0.83, 0.44),
                        (0.93, 0.64), (1.0, 1.0)], back_c, rim_z, rim_r, steps=48),
          axis_y, "Gold", segments=56)
    tube(name + ".wrap",
         [(0, axis_y, back_c + 0.002)]
         + arc((0, (top_y + bot_y) / 2, back_c), bend, 90, 270, 12)[1:]
         + [(0, bot_y, -0.3), (0, bot_y, -0.12), (0, bot_y + 0.012, -0.05),
            (0, bot_y + 0.03, -0.015)],
         [0.045] + [0.046] * 12 + [0.04, 0.032, 0.026, 0.022],
         "Gold", segments=36)
    # the inner loop: from the valves back inside the wrap and around
    tube(name + ".inner",
         [(0.004, 0.02, -0.03), (0.004, 0.094, -0.1), (0.004, 0.094, -0.5)]
         + arc((0.004, 0.011, -0.5), 0.083, 90, 270, 8)[1:]
         + [(0.004, -0.072, -0.1), (0.004, -0.06, -0.03)],
         0.016, "Gold", segments=24)
    # the valve slides, back from the valves
    for i, (y, z) in enumerate([(0.053, -0.39), (0.029, -0.29)]):
        tube(f"{name}.slide{i}",
             [(0.03, y, 0.0), (0.03, y, z)] + arc((0.03, y - 0.013, z), 0.013, 90, 270, 6)[1:]
             + [(0.03, y - 0.026, 0.0)],
             0.0075, "Gold", segments=16)
    # the leadpipe: from the mouthpiece, which reaches across to the
    # player's lips, into the valves
    mp = 1.8 * TRUMPET_SCALE
    rim = (-0.1, -0.03, 0.025)
    start = (-0.1, -0.03, 0.025 + RECEIVER_END * mp)
    tube(name + ".lead",
         [start, (-0.06, -0.04, 0.2), (-0.01, -0.05, 0.12), (0.0, -0.055, 0.05)],
         [0.007, 0.0075, 0.008, 0.0085], "Gold", segments=20)
    for z in (-0.3, -0.45):
        tube(f"{name}.brace{z}", [(0, bot_y, z), (0, top_y, z)], 0.003, "Gold", segments=8)
    place(VALVE_PARTS, VALVE_ANCHOR, 1.7 * TRUMPET_SCALE, (0.0, -0.13, 0.02))
    place(MOUTHPIECE_PARTS, MOUTHPIECE_RIM, mp, rim)


for horn in ["mellophone", "baritone", "euphonium", "contra"]:
    bpy.ops.wm.revert_mainfile()
    if horn == "contra":
        contra(horn)
    else:
        valved(horn, VALVED[horn])
    hide_sources()
    for o in list(bpy.context.scene.objects):
        if not (o.name.startswith("horn.") or o.name.startswith(horn)):
            bpy.data.objects.remove(o)
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/{horn}.blend", copy=True)
    print("BUILT", horn, len(bpy.context.scene.objects), "objects")

# cspell:words verts interp BSDF backface pydata
# cspell:words bmesh mathutils fascia colorspace texcoords yup hanning principled
# Shared building blocks for the front ensemble models in this folder: merged
# meshes per material, swept and lathed shapes, wheels, stands, drums, and the
# material palette. Everything is built from numbers; no mesh, photo or mark
# from anywhere else goes in.
#
# Blender axes while modeling: meters, Z up, audience at -Y, player at +Y,
# player's left at +X. The GLB comes out +Y up with the audience at +Z.
import math
import os
from contextlib import contextmanager

import bpy
import numpy as np
from mathutils import Matrix, Vector

INCH = 0.0254


class Part:
    """One merged mesh with one material: a model costs one draw per part."""

    def __init__(self, name, owner):
        self.name = name
        self.owner = owner
        self.verts = []
        self.faces = []
        self.smooth = []
        self.uvs = []
        self.has_uv = False

    def vert(self, p, uv=None):
        q = Vector((float(p[0]), float(p[1]), float(p[2])))
        if self.owner.matrix is not None:
            q = self.owner.matrix @ q
        self.verts.append((q.x, q.y, q.z))
        self.uvs.append((0.0, 0.0) if uv is None else (float(uv[0]), float(uv[1])))
        if uv is not None:
            self.has_uv = True
        return len(self.verts) - 1

    def face(self, ids, smooth=False):
        self.faces.append(tuple(ids))
        self.smooth.append(smooth)

    def _volume(self, faces):
        total = 0.0
        for f in faces:
            a = Vector(self.verts[f[0]])
            for i in range(1, len(f) - 1):
                total += a.dot(Vector(self.verts[f[i]]).cross(Vector(self.verts[f[i + 1]])))
        return total

    def loft(self, rings, smooth=False, cap_start=True, cap_end=True, uvs=None):
        """Joins rings of points, facing outward: the solid the rings enclose
        decides the winding, whether or not its two ends are drawn."""
        ids = [
            [self.vert(p, None if uvs is None else uvs[i][j]) for j, p in enumerate(ring)]
            for i, ring in enumerate(rings)
        ]
        n = len(ids[0])
        sides = []
        for r in range(len(ids) - 1):
            for j in range(n):
                k = (j + 1) % n
                sides.append((ids[r][j], ids[r + 1][j], ids[r + 1][k], ids[r][k]))
        start, end = tuple(ids[0]), tuple(reversed(ids[-1]))
        made = [(f, smooth) for f in sides]
        if cap_start:
            made.append((start, False))
        if cap_end:
            made.append((end, False))
        if self._volume(sides + [start, end]) < 0:
            made = [(tuple(reversed(f)), sm) for f, sm in made]
        for f, sm in made:
            self.face(f, sm)

    def sweep(self, section, path, smooth=False, caps=True):
        path = [Vector(p) for p in path]
        up = Vector((0, 0, 1))
        rings = []
        for i, p in enumerate(path):
            t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            ref = Vector((1, 0, 0)) if abs(t.dot(up)) > 0.99 else up
            s = t.cross(ref).normalized()
            u = s.cross(t).normalized()
            rings.append([p + s * c[0] + u * c[1] for c in section])
        self.loft(rings, smooth=smooth, cap_start=caps, cap_end=caps)

    def box(self, lo, hi):
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        self.loft(
            [
                [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
                [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)],
            ]
        )

    def chamfer_box(self, lo, hi, c=0.012):
        """A box with every edge cut back by `c`, so it catches a highlight."""
        x0, y0, z0 = lo
        x1, y1, z1 = hi

        def ring(k, z):
            a, b, e, f = x0 + k, x1 - k, y0 + k, y1 - k
            return [
                (a + c, e, z), (b - c, e, z), (b, e + c, z), (b, f - c, z),
                (b - c, f, z), (a + c, f, z), (a, f - c, z), (a, e + c, z),
            ]

        self.loft([ring(c, z0), ring(0, z0 + c), ring(0, z1 - c), ring(c, z1)])

    def rod(self, a, b, r, sides=6, smooth=True):
        self.sweep(circle(r, sides), [a, b], smooth=smooth)

    def tube(self, a, b, w, h=None):
        self.sweep(rect(w, w if h is None else h), [a, b])

    def lathe(self, center, profile, sides, axis="z", smooth=True, caps=(False, False), closed=False):
        """A solid of revolution; profile is (radius, distance along the axis)."""
        a = Vector({"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis])
        e1 = Vector((1, 0, 0)) if axis != "x" else Vector((0, 1, 0))
        e2 = -a.cross(e1)
        c = Vector(center)
        pts = list(profile) + ([profile[0]] if closed else [])
        rings = []
        for r, d in pts:
            rings.append(
                [
                    c
                    + a * d
                    + e1 * (r * math.cos(2 * math.pi * j / sides))
                    + e2 * (r * math.sin(2 * math.pi * j / sides))
                    for j in range(sides)
                ]
            )
        self.loft(rings, smooth=smooth, cap_start=caps[0], cap_end=caps[1])

    def ring(self, center, radius, thickness, height, sides, axis="z"):
        """A hoop with a rectangular section, centered on `center`."""
        r0, r1 = radius, radius + thickness
        h = height / 2
        self.lathe(center, [(r0, -h), (r1, -h), (r1, h), (r0, h)], sides, axis, False, closed=True)


class Parts:
    def __init__(self):
        self.by_name = {}
        self.matrix = None
        self.slots = {}

    def __getitem__(self, name):
        if name not in self.by_name:
            self.by_name[name] = Part(name, self)
        return self.by_name[name]

    def nonempty(self):
        return {k: v for k, v in self.by_name.items() if v.faces}

    def consolidate(self, limit=6):
        """Folds the near-black materials together until a model has at most
        `limit` parts, since each part is a draw call and these differ only
        in roughness."""
        for src, dst in (("felt", "rubber"), ("rubber", "frame"), ("cloth", "frame"), ("panel", "frame")):
            if len(self.nonempty()) <= limit:
                return
            if src not in self.by_name or not self.by_name[src].faces:
                continue
            a, b = self.by_name.pop(src), self[dst]
            base = len(b.verts)
            b.verts += a.verts
            b.uvs += a.uvs
            b.faces += [tuple(i + base for i in f) for f in a.faces]
            b.smooth += a.smooth


@contextmanager
def place(parts, *matrices):
    """Everything built inside is moved by the matrices, outermost first."""
    old = parts.matrix
    m = Matrix.Identity(4) if old is None else old.copy()
    for each in matrices:
        m = m @ each
    parts.matrix = m
    try:
        yield
    finally:
        parts.matrix = old


def at(x, y, z):
    return Matrix.Translation((x, y, z))


def rot(deg, axis):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def circle(r, sides, sy=1.0):
    return [
        (r * math.cos(2 * math.pi * j / sides), r * sy * math.sin(2 * math.pi * j / sides))
        for j in range(sides)
    ]


def rect(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]


def caster(parts, x, y, high, r=0.04):
    """A small swivel wheel; its top is at 2r + 0.02 above the ground."""
    sides = 12 if high else 6
    w = r * 0.8
    p = [(r * 0.45, -w / 2), (r, -w / 2), (r, w / 2), (r * 0.45, w / 2)]
    parts["rubber"].lathe((x, y, r), p, sides, "y", True, (True, True))
    parts["frame"].box((x - 0.012, y - w / 2 - 0.006, r), (x + 0.012, y + w / 2 + 0.006, 2 * r + 0.02))


def field_wheel(parts, x, y, top, high, radius=0.125, width=0.065):
    """A large pneumatic wheel in a two-plate fork reaching up to z = top."""
    for s in (-1, 1):
        py = y + s * (width / 2 + 0.008)
        parts["frame"].box((x - 0.02, py - 0.004, radius - 0.015), (x + 0.02, py + 0.004, top))
    sides = 24 if high else 10
    hw = width / 2
    hub = radius * 0.5
    if high:
        tire = [
            (hub, -hw),
            (radius - 0.01, -hw),
            (radius - 0.003, -hw + 0.012),
            (radius, -0.008),
            (radius, 0.008),
            (radius - 0.003, hw - 0.012),
            (radius - 0.01, hw),
            (hub, hw),
        ]
    else:
        tire = [(hub, -hw), (radius, -hw), (radius, hw), (hub, hw)]
    parts["rubber"].lathe((x, y, radius), tire, sides, "y")
    parts["frame"].lathe(
        (x, y, radius), [(hub, -hw + 0.005), (hub, hw - 0.005)], sides, "y", False, (True, True)
    )


def tripod(parts, x, y, height, high, spread=0.27, foot_z=0.0):
    """A stand: center pole on three legs braced to a collar."""
    r_pole = 0.011
    parts["metal"].rod((x, y, 0.1), (x, y, height), r_pole, 8 if high else 4)
    for i in range(3):
        a = math.radians(90 + 120 * i)
        fx, fy = x + spread * math.cos(a), y + spread * math.sin(a)
        parts["frame"].rod((x, y, 0.36), (fx, fy, foot_z + 0.01), 0.0095, 6 if high else 3)
        if high:
            mx, my = x + spread * 0.55 * math.cos(a), y + spread * 0.55 * math.sin(a)
            parts["frame"].rod((x, y, 0.14), (mx, my, 0.17), 0.006, 4)
            parts["rubber"].rod((fx, fy, foot_z), (fx, fy, foot_z + 0.03), 0.014, 6)


def cymbal(parts, c, diameter, high, tilt=(0.0, 0.0), material="cymbal"):
    r = diameter / 2
    sides = 28 if high else 10
    bell = 0.07 if diameter > 0.3 else 0.055
    rise = 0.012 + diameter * 0.05
    bow = [
        (r, 0.0),
        (r * 0.75, rise * 0.45),
        (r * 0.45, rise * 0.8),
        (bell, rise),
        (bell * 0.8, rise + 0.018),
        (0.008, rise + 0.022),
    ]
    with place(parts, at(*c), rot(tilt[0], "X"), rot(tilt[1], "Y")):
        parts[material].lathe((0, 0, 0), bow if high else [bow[0], bow[3], bow[5]], sides)


def drum(parts, high, diameter, depth, shell="shell", lugs=8, head="head"):
    """A drum centered on the origin with its axis along local Z."""
    r = diameter / 2
    d = depth / 2
    sides = 28 if high else 12
    parts[shell].lathe((0, 0, 0), [(r, -d), (r, d)], sides, "z", True)
    for sgn in (-1, 1):
        lo, hi = sorted((sgn * d, sgn * (d + 0.004)))
        parts[head].lathe(
            (0, 0, 0), [(r - 0.002, lo), (r - 0.002, hi)], sides, "z", True, (True, True)
        )
        parts["metal"].ring((0, 0, sgn * (d + 0.006)), r - 0.001, 0.008, 0.016, sides)
    if high:
        for i in range(lugs):
            a = 2 * math.pi * i / lugs
            x, y = (r + 0.008) * math.cos(a), (r + 0.008) * math.sin(a)
            parts["metal"].rod((x, y, -d + 0.01), (x, y, d - 0.01), 0.0045, 4, False)


def art_disc(parts, slot, center, diameter, axis_down_y=True):
    """A round artwork surface facing the audience (-Y), UV0 over its square."""
    r = diameter / 2
    sides = 28
    art = parts["artwork"]
    x, y, z = center
    ids = []
    for j in range(sides):
        a = 2 * math.pi * j / sides
        px, pz = r * math.cos(a), r * math.sin(a)
        ids.append(art.vert((x + px, y, z + pz), (0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a))))
    art.face(ids)
    parts.slots[slot] = (diameter, diameter)


def art_rect(parts, slot, x0, x1, y, z0, z1):
    """A flat artwork rectangle facing the audience (-Y)."""
    art = parts["artwork"]
    ids = [
        art.vert((x0, y, z0), (0, 0)),
        art.vert((x1, y, z0), (1, 0)),
        art.vert((x1, y, z1), (1, 1)),
        art.vert((x0, y, z1), (0, 1)),
    ]
    art.face(ids)
    parts.slots[slot] = (round(x1 - x0, 4), round(z1 - z0, 4))


def wood_image(kind, out_dir, size=1024):
    """A shared bar texture; the long axis of the image runs along the grain."""
    path = os.path.join(out_dir, f"bars-{kind}.png")

    def noise(scale, shift):
        n = np.random.default_rng(11 + shift).random(size + scale * 2)
        k = np.hanning(scale * 2 + 1)
        k /= k.sum()
        v = np.convolve(n, k, mode="same")[scale:-scale]
        return (v - v.min()) / (v.max() - v.min())

    across = np.arange(size)
    ys = np.linspace(0, 1, size)
    warp = (
        np.sin(ys[:, None] * 4.0 + across[None, :] * 0.012) * 7
        + np.sin(ys[:, None] * 11.0 + across[None, :] * 0.031) * 2.5
    )
    coords = (across[None, :] + warp) % size
    sample = lambda a: np.interp(coords.ravel(), across, a).reshape(coords.shape)
    broad, mid, fine = noise(90, 1), noise(22, 2), noise(3, 3)
    pores = np.random.default_rng(11).random((size, size))
    pores = np.convolve(pores.ravel(), np.ones(9) / 9, mode="same").reshape(size, size)
    if kind == "rosewood":
        grain = sample(broad) * 0.55 + sample(mid) * 0.3 + sample(fine) * 0.15
        grain -= (sample(fine) ** 6) * 0.35
        dark, light = np.array([58, 24, 18]), np.array([150, 74, 46])
    else:
        grain = sample(broad) * 0.5 + sample(mid) * 0.5
        dark, light = np.array([118, 50, 22]), np.array([168, 82, 38])
    grain = np.clip((grain - grain.min()) / (grain.max() - grain.min()), 0, 1)
    if kind == "rosewood":
        grain = np.clip(grain + (pores - 0.5) * 0.5, 0, 1)
    rgb = dark[None, None, :] + (light - dark)[None, None, :] * grain[:, :, None]
    rgba = np.concatenate([rgb / 255.0, np.ones((size, size, 1))], axis=2)
    img = bpy.data.images.new(f"bars-{kind}", size, size, alpha=False)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


def principled(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m


# name: (color, metallic, roughness). The colored metals stay a little short of
# fully metallic: under the 3D View's dim environment map a pure metal goes dark.
PALETTE = {
    "frame": ((0.015, 0.015, 0.017), 0.0, 0.55),
    "rubber": ((0.012, 0.012, 0.012), 0.0, 0.9),
    "metal": ((0.62, 0.62, 0.64), 1.0, 0.42),
    "resonators-gold": ((0.83, 0.59, 0.22), 0.8, 0.4),
    "resonators-black": ((0.02, 0.02, 0.022), 0.0, 0.45),
    "resonators-silver": ((0.74, 0.74, 0.76), 1.0, 0.4),
    "bars-silver": ((0.78, 0.78, 0.80), 1.0, 0.38),
    "bars-gold": ((0.82, 0.62, 0.28), 0.8, 0.38),
    "bars-steel": ((0.70, 0.71, 0.74), 1.0, 0.3),
    "cymbal": ((0.74, 0.5, 0.19), 0.85, 0.36),
    "gong": ((0.5, 0.3, 0.1), 0.8, 0.5),
    "gong-dark": ((0.11, 0.075, 0.04), 1.0, 0.62),
    "copper": ((0.74, 0.29, 0.13), 0.75, 0.36),
    "head": ((0.86, 0.85, 0.80), 0.0, 0.6),
    "shell": ((0.20, 0.03, 0.05), 0.0, 0.3),
    "shell-wood": ((0.38, 0.17, 0.07), 0.0, 0.34),
    "wood": ((0.36, 0.17, 0.08), 0.0, 0.5),
    "felt": ((0.05, 0.05, 0.055), 0.0, 0.95),
    "cloth": ((0.03, 0.03, 0.033), 0.0, 0.9),
    "cone": ((0.02, 0.02, 0.022), 0.0, 0.7),
    "cabinet": ((0.03, 0.03, 0.032), 0.0, 0.75),
    "keys": ((0.88, 0.87, 0.83), 0.0, 0.35),
    "panel": ((0.10, 0.10, 0.11), 0.0, 0.4),
    "screen": ((0.08, 0.20, 0.28), 0.0, 0.2),
    "cover": ((0.05, 0.07, 0.11), 0.0, 0.85),
    "artwork": ((0.015, 0.015, 0.017), 0.0, 0.55),
}


# Thin sheets seen from both sides; everything else is a closed solid and
# drops its back faces.
TWO_SIDED = {"cymbal", "gong", "gong-dark", "cone", "cloth", "cover"}


def material_for(name, out_dir):
    m = _material_for(name, out_dir)
    m.use_backface_culling = name not in TWO_SIDED
    return m


def _material_for(name, out_dir):
    if name in ("bars-rosewood", "bars-synthetic"):
        kind = name.split("-")[1]
        m = principled(name, (1, 1, 1), 0.0, 0.62 if kind == "rosewood" else 0.58)
        nodes = m.node_tree.nodes
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(wood_image(kind, out_dir))
        m.node_tree.links.new(tex.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
        return m
    return principled(name, *PALETTE[name])


def to_object(part, material, root):
    mesh = bpy.data.meshes.new(part.name)
    mesh.from_pydata(part.verts, [], part.faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", part.smooth)
    if part.has_uv:
        layer = mesh.uv_layers.new(name="UVMap")
        loop_verts = [0] * len(mesh.loops)
        mesh.loops.foreach_get("vertex_index", loop_verts)
        flat = np.array([part.uvs[v] for v in loop_verts], dtype=np.float32).ravel()
        layer.uv.foreach_set("vector", flat)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(part.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    return obj


def export_model(model_id, parts, out_dir, suffix):
    """Writes one GLB and returns its triangle count, parts and extents."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new(model_id, None)
    bpy.context.scene.collection.objects.link(root)
    root["openmarch"] = {"kind": "Prop"}
    used = parts.nonempty()
    for name, part in used.items():
        mat = material_for(name, out_dir)
        if name == "artwork" and parts.slots:
            slot, (w, h) = next(iter(parts.slots.items()))
            mat["openmarch"] = {"artworkSlot": {"id": slot, "widthM": w, "heightM": h}}
        to_object(part, mat, root)
    path = os.path.join(out_dir, f"{model_id}{suffix}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_image_format="JPEG",
        export_image_quality=85,
    )
    pts = np.array([v for p in used.values() for v in p.verts])
    size = pts.max(axis=0) - pts.min(axis=0)
    return {
        "bytes": os.path.getsize(path),
        "triangles": sum(len(f) - 2 for p in used.values() for f in p.faces),
        "parts": len(used),
        "sizeM": {
            "width": round(float(size[0]), 3),
            "depth": round(float(size[1]), 3),
            "height": round(float(size[2]), 3),
        },
        "bottom": round(float(pts[:, 2].min()), 4),
    }

import {
    BufferGeometry,
    Color,
    Euler,
    Float32BufferAttribute,
    InstancedMesh,
    Matrix4,
    Quaternion,
    Vector3,
    type BoxGeometry,
    type Material,
} from "three";

/**
 * Small geometry helpers for the high school kits: a batch of boxes drawn as
 * one `InstancedMesh`, and a quad builder that writes positions, normals and
 * UVs in meters so a repeating texture keeps its scale on any size of face.
 */

/** Collects box transforms, then builds them as one instanced draw call. */
export class BoxBatch {
    private readonly matrices: Matrix4[] = [];
    private readonly colors: (number | undefined)[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly e = new Euler();

    /**
     * Adds a box centered at `pos` with size `size`, rotated by `rot` (radians,
     * XYZ order), optionally tinted with `color` (multiplies the material).
     */
    add(
        pos: [number, number, number],
        size: [number, number, number],
        rot: [number, number, number] = [0, 0, 0],
        color?: number,
    ): this {
        this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
        this.m.compose(
            new Vector3(...pos),
            this.q,
            new Vector3(
                Math.max(size[0], 1e-4),
                Math.max(size[1], 1e-4),
                Math.max(size[2], 1e-4),
            ),
        );
        this.matrices.push(this.m.clone());
        this.colors.push(color);
        return this;
    }

    /**
     * A beam between two points with a square `thick` section; `roll` turns
     * it about its own axis.
     */
    beam(
        a: [number, number, number],
        b: [number, number, number],
        thick: number,
        color?: number,
    ): this {
        const va = new Vector3(...a);
        const vb = new Vector3(...b);
        const dir = vb.clone().sub(va);
        const len = dir.length();
        if (len < 1e-6) return this;
        const mid = va.add(vb).multiplyScalar(0.5);
        // The unit box's long axis is X: rotate X onto `dir`.
        this.q.setFromUnitVectors(new Vector3(1, 0, 0), dir.normalize());
        this.m.compose(mid, this.q, new Vector3(len, thick, thick));
        this.matrices.push(this.m.clone());
        this.colors.push(color);
        return this;
    }

    /** Adds every box of `other` (with its transforms and tints). */
    append(other: BoxBatch): this {
        this.matrices.push(...other.matrices.map((m) => m.clone()));
        this.colors.push(...other.colors);
        return this;
    }

    /** Gives every box without a tint `color`, so the batch can join a tinted one. */
    fill(color: number): this {
        for (let i = 0; i < this.colors.length; i++) {
            this.colors[i] ??= color;
        }
        return this;
    }

    get size(): number {
        return this.matrices.length;
    }

    /** Applies `matrix` (e.g. a placement) to every box added so far. */
    transform(matrix: Matrix4): this {
        for (const m of this.matrices) m.premultiply(matrix);
        return this;
    }

    build(box: BoxGeometry, material: Material, name: string): InstancedMesh {
        const mesh = new InstancedMesh(
            box,
            material,
            Math.max(1, this.matrices.length),
        );
        mesh.name = name;
        mesh.count = this.matrices.length;
        const c = new Color();
        const tinted = this.colors.some((x) => x !== undefined);
        this.matrices.forEach((m, i) => {
            mesh.setMatrixAt(i, m);
            if (tinted)
                mesh.setColorAt(i, c.setHex(this.colors[i] ?? 0xffffff));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        return mesh;
    }
}

/** Accumulates quads (two triangles each) with explicit normals and UVs. */
export class QuadBuilder {
    readonly position: number[] = [];
    readonly normal: number[] = [];
    readonly uv: number[] = [];
    readonly color: number[] = [];

    /**
     * Adds the quad a-b-c-d (counter-clockwise seen from the front) with UVs
     * `ua..ud` and an optional vertex color. With `want`, the quad is flipped
     * if needed so its normal points along `want`.
     */
    quad(
        a: Vector3,
        b: Vector3,
        c: Vector3,
        d: Vector3,
        ua: [number, number],
        ub: [number, number],
        uc: [number, number],
        ud: [number, number],
        color: [number, number, number] = [1, 1, 1],
        want?: Vector3,
    ): this {
        const n = new Vector3()
            .subVectors(b, a)
            .cross(new Vector3().subVectors(d, a))
            .normalize();
        if (want && n.dot(want) < 0) {
            // wound the other way: flip it so it faces `want`
            return this.quad(a, d, c, b, ua, ud, uc, ub, color);
        }
        for (const [p, t] of [
            [a, ua],
            [b, ub],
            [c, uc],
            [a, ua],
            [c, uc],
            [d, ud],
        ] as [Vector3, [number, number]][]) {
            this.position.push(p.x, p.y, p.z);
            this.normal.push(n.x, n.y, n.z);
            this.uv.push(t[0], t[1]);
            this.color.push(...color);
        }
        return this;
    }

    /**
     * An axis-aligned box from `min` to `max` whose side UVs are in meters
     * divided by `tile` (u around, v up), mapped into the v band `[v0, v1]`
     * for the sides and the single point `roofUv` for the top. No bottom.
     */
    box(
        min: Vector3,
        max: Vector3,
        tile: number,
        sideBand: [number, number],
        roofUv: [number, number],
        heightForBand: number,
        color?: [number, number, number],
    ): this {
        const [x0, y0, z0] = [min.x, min.y, min.z];
        const [x1, y1, z1] = [max.x, max.y, max.z];
        const vTop =
            sideBand[0] +
            (sideBand[1] - sideBand[0]) *
                Math.min(1, (y1 - y0) / heightForBand);
        const side = (
            a: Vector3,
            b: Vector3,
            len: number,
            uStart: number,
        ): void => {
            const u0 = uStart / tile;
            const u1 = (uStart + len) / tile;
            this.quad(
                a,
                b,
                new Vector3(b.x, y1, b.z),
                new Vector3(a.x, y1, a.z),
                [u0, sideBand[0]],
                [u1, sideBand[0]],
                [u1, vTop],
                [u0, vTop],
                color,
            );
        };
        const w = x1 - x0;
        const d = z1 - z0;
        side(new Vector3(x0, y0, z1), new Vector3(x1, y0, z1), w, 0);
        side(new Vector3(x1, y0, z1), new Vector3(x1, y0, z0), d, w);
        side(new Vector3(x1, y0, z0), new Vector3(x0, y0, z0), w, w + d);
        side(new Vector3(x0, y0, z0), new Vector3(x0, y0, z1), d, 2 * w + d);
        this.quad(
            new Vector3(x0, y1, z1),
            new Vector3(x1, y1, z1),
            new Vector3(x1, y1, z0),
            new Vector3(x0, y1, z0),
            roofUv,
            roofUv,
            roofUv,
            roofUv,
            color,
        );
        return this;
    }

    get empty(): boolean {
        return this.position.length === 0;
    }

    build(withColor = false): BufferGeometry {
        const g = new BufferGeometry();
        g.setAttribute(
            "position",
            new Float32BufferAttribute(this.position, 3),
        );
        g.setAttribute("normal", new Float32BufferAttribute(this.normal, 3));
        g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
        if (withColor) {
            g.setAttribute("color", new Float32BufferAttribute(this.color, 3));
        }
        g.computeBoundingSphere();
        return g;
    }
}

/**
 * Merges non-indexed or indexed geometries that share the same attributes
 * into one non-indexed geometry. Geometries without a `color` attribute get
 * `tint` (default white) when `withColor` is set. Disposes the inputs.
 */
export function mergeGeometries(
    parts: { geometry: BufferGeometry; matrix?: Matrix4; tint?: number }[],
    withColor: boolean,
): BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const v = new Vector3();
    const c = new Color();
    for (const part of parts) {
        const g = part.geometry.index
            ? part.geometry.toNonIndexed()
            : part.geometry;
        const p = g.getAttribute("position");
        const n = g.getAttribute("normal");
        const t = g.getAttribute("uv");
        const k = g.getAttribute("color");
        const normalMatrix = part.matrix
            ? new Matrix4().copy(part.matrix).invert().transpose()
            : undefined;
        c.setHex(part.tint ?? 0xffffff);
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i);
            if (part.matrix) v.applyMatrix4(part.matrix);
            pos.push(v.x, v.y, v.z);
            if (n) {
                v.fromBufferAttribute(n, i);
                if (normalMatrix) v.transformDirection(normalMatrix);
                nor.push(v.x, v.y, v.z);
            } else nor.push(0, 1, 0);
            if (t) uv.push(t.getX(i), t.getY(i));
            else uv.push(0, 0);
            if (withColor) {
                if (k) col.push(k.getX(i), k.getY(i), k.getZ(i));
                else col.push(c.r, c.g, c.b);
            }
        }
        if (g !== part.geometry) g.dispose();
        part.geometry.dispose();
    }
    const out = new BufferGeometry();
    out.setAttribute("position", new Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    out.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    if (withColor)
        out.setAttribute("color", new Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
}

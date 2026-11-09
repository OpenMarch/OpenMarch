/**
 * Geometry for the seated spectators, one figure per level of detail. Each is
 * a non-indexed `BufferGeometry` with an `aPart` attribute (`PART`), which the
 * crowd shader turns into clothes, skin and hair.
 *
 * The figure's origin is the middle of the seat, +Z is the way it faces and
 * +Y is up. The head's crown is at `FIGURE_HEIGHT`; `crowd.ts` scales from
 * there. The legs hang below the origin, into the row in front.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

/** Top of the head above the seat, meters. */
export const FIGURE_HEIGHT = 0.84;

/** Values of the `aPart` attribute. Shirts use the instance color. */
export const PART = { shirt: 0, skin: 1, hair: 2, pants: 3, seat: 4 } as const;
type Part = (typeof PART)[keyof typeof PART];
type V3 = readonly [number, number, number];

interface Ring {
    center: V3;
    /** Radius along X, and across the path in the plane perpendicular to X. */
    ra: number;
    rb: number;
}

class FigureBuilder {
    private positions: number[] = [];
    private normals: number[] = [];
    private parts: number[] = [];

    /** One flat triangle, wound so that its front faces `normal`. */
    tri(a: V3, b: V3, c: V3, normal: V3, part: Part): void {
        const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const n = new Vector3(...normal).normalize();
        const flip = ab.cross(ac).dot(n) < 0;
        for (const p of flip ? [a, c, b] : [a, b, c]) {
            this.positions.push(p[0], p[1], p[2]);
            this.normals.push(n.x, n.y, n.z);
            this.parts.push(part);
        }
    }

    quad(a: V3, b: V3, c: V3, d: V3, normal: V3, part: Part): void {
        this.tri(a, b, c, normal, part);
        this.tri(a, c, d, normal, part);
    }

    /**
     * A smooth tube through `rings`. `partOf(band, side)` colors each quad, so
     * parts meet on a crisp edge. Close an end with a near-zero ring.
     */
    tube(
        rings: Ring[],
        sides: number,
        partOf: (band: number, side: number) => Part,
    ): void {
        const count = rings.length;
        const grid: Vector3[][] = rings.map((ring, r) => {
            const prev = new Vector3(...rings[Math.max(0, r - 1)].center);
            const next = new Vector3(
                ...rings[Math.min(count - 1, r + 1)].center,
            );
            const dir = next.sub(prev).normalize();
            const a = new Vector3(1, 0, 0)
                .addScaledVector(dir, -dir.x)
                .normalize();
            const b = new Vector3().crossVectors(dir, a);
            const center = new Vector3(...ring.center);
            return Array.from({ length: sides }, (_, s) => {
                const t = ((s + 0.5) / sides) * Math.PI * 2;
                return center
                    .clone()
                    .addScaledVector(a, Math.cos(t) * ring.ra)
                    .addScaledVector(b, Math.sin(t) * ring.rb);
            });
        });

        // Outward face normal of one quad.
        const faceNormal = (band: number, side: number): Vector3 => {
            const next = (side + 1) % sides;
            const p0 = grid[band][side];
            const edgeA = grid[band][next].clone().sub(p0);
            const edgeB = grid[band + 1][side].clone().sub(p0);
            const n = edgeA.cross(edgeB);
            const out = p0
                .clone()
                .add(grid[band + 1][next])
                .multiplyScalar(0.5)
                .sub(
                    new Vector3(...rings[band].center)
                        .add(new Vector3(...rings[band + 1].center))
                        .multiplyScalar(0.5),
                );
            return n.dot(out) < 0 ? n.negate() : n;
        };

        const vertexNormals = grid.map((row) => row.map(() => new Vector3()));
        for (let b = 0; b < count - 1; b++) {
            for (let s = 0; s < sides; s++) {
                const n = faceNormal(b, s);
                const s1 = (s + 1) % sides;
                vertexNormals[b][s].add(n);
                vertexNormals[b][s1].add(n);
                vertexNormals[b + 1][s].add(n);
                vertexNormals[b + 1][s1].add(n);
            }
        }
        vertexNormals.forEach((row) => row.forEach((n) => n.normalize()));

        const emit = (r: number, s: number, part: Part): void => {
            const p = grid[r][s];
            const n = vertexNormals[r][s];
            this.positions.push(p.x, p.y, p.z);
            this.normals.push(n.x, n.y, n.z);
            this.parts.push(part);
        };
        for (let b = 0; b < count - 1; b++) {
            for (let s = 0; s < sides; s++) {
                const s1 = (s + 1) % sides;
                const part = partOf(b, s);
                // Winding from the face normal, so backface culling works.
                const p0 = grid[b][s];
                const edge = grid[b][s1]
                    .clone()
                    .sub(p0)
                    .cross(grid[b + 1][s].clone().sub(p0));
                const flip = edge.dot(faceNormal(b, s)) < 0;
                const quad: [number, number][] = flip
                    ? [
                          [b, s],
                          [b + 1, s],
                          [b, s1],
                          [b, s1],
                          [b + 1, s],
                          [b + 1, s1],
                      ]
                    : [
                          [b, s],
                          [b, s1],
                          [b + 1, s],
                          [b, s1],
                          [b + 1, s1],
                          [b + 1, s],
                      ];
                for (const [r, side] of quad) emit(r, side, part);
            }
        }
    }

    build(): BufferGeometry {
        const g = new BufferGeometry();
        g.setAttribute(
            "position",
            new Float32BufferAttribute(this.positions, 3),
        );
        g.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
        g.setAttribute("aPart", new Float32BufferAttribute(this.parts, 1));
        return g;
    }
}

const HEAD_Y = 0.715;
const HEAD_Z = -0.075;
const HEAD_RX = 0.095;
const HEAD_RY = 0.125;
const TORSO_Z = -0.075;

/** Rings for an ellipsoid head, top to bottom, closed at both poles. */
function headRings(bands: number): Ring[] {
    return Array.from({ length: bands + 1 }, (_, i) => {
        const lat = (i / bands) * Math.PI;
        const k = Math.max(0.02, Math.sin(lat));
        return {
            center: [0, HEAD_Y + Math.cos(lat) * HEAD_RY, HEAD_Z] as V3,
            ra: HEAD_RX * k,
            rb: HEAD_RX * 1.08 * k,
        };
    });
}

/**
 * Close up (160 triangles): a real seated figure with shoulders, a head with
 * hair, arms resting on thighs and legs, on a plain seat, so nobody perches on
 * nothing in the rows where a seat would show. Only people within a few rows
 * of the camera use it.
 */
export function nearFigureGeometry(): BufferGeometry {
    const f = new FigureBuilder();
    f.tube(
        [
            { center: [0, 0.03, TORSO_Z + 0.01], ra: 0.17, rb: 0.125 },
            { center: [0, 0.24, TORSO_Z], ra: 0.175, rb: 0.12 },
            { center: [0, 0.5, TORSO_Z - 0.015], ra: 0.215, rb: 0.1 },
            { center: [0, 0.6, TORSO_Z - 0.015], ra: 0.065, rb: 0.06 },
        ],
        6,
        () => PART.shirt,
    );

    // Six sides around, four bands down. The second band keeps a face at the
    // front; the third only keeps hair at the back.
    f.tube(headRings(4), 6, (band, side) => {
        const angle = ((side + 0.5) / 6) * Math.PI * 2;
        const back = Math.sin(angle) < 0;
        if (band === 0) return PART.hair;
        if (band === 1) return back ? PART.hair : PART.skin;
        if (band === 2) return back ? PART.hair : PART.skin;
        return PART.skin;
    });

    for (const sign of [-1, 1]) {
        f.tube(
            [
                { center: [sign * 0.245, 0.49, -0.09], ra: 0.058, rb: 0.058 },
                { center: [sign * 0.27, 0.25, -0.03], ra: 0.05, rb: 0.05 },
                { center: [sign * 0.16, 0.13, 0.22], ra: 0.038, rb: 0.038 },
            ],
            4,
            (band) => (band === 0 ? PART.shirt : PART.skin),
        );
        f.tube(
            [
                { center: [sign * 0.095, 0.06, -0.03], ra: 0.088, rb: 0.088 },
                { center: [sign * 0.11, 0.06, 0.38], ra: 0.07, rb: 0.07 },
                { center: [sign * 0.115, -0.4, 0.42], ra: 0.052, rb: 0.052 },
            ],
            4,
            () => PART.pants,
        );
    }

    // The seat: a pedestal under the hips and a backrest behind the torso.
    const sx = 0.17;
    const zf = 0.08;
    const zb = -0.16;
    const top = -0.01;
    const foot = -0.46;
    f.quad(
        [-sx, top, zf],
        [sx, top, zf],
        [sx, foot, zf],
        [-sx, foot, zf],
        [0, 0, 1],
        PART.seat,
    );
    f.quad(
        [sx, top, zb],
        [-sx, top, zb],
        [-sx, foot, zb],
        [sx, foot, zb],
        [0, 0, -1],
        PART.seat,
    );
    f.quad(
        [sx, top, zf],
        [sx, top, zb],
        [sx, foot, zb],
        [sx, foot, zf],
        [1, 0, 0],
        PART.seat,
    );
    f.quad(
        [-sx, top, zb],
        [-sx, top, zf],
        [-sx, foot, zf],
        [-sx, foot, zb],
        [-1, 0, 0],
        PART.seat,
    );
    const rest = 0.3;
    const rz = -0.205;
    f.quad(
        [-sx, rest, rz],
        [sx, rest, rz],
        [sx, top, rz],
        [-sx, top, rz],
        [0, 0.05, 1],
        PART.seat,
    );
    f.quad(
        [sx, rest, rz - 0.03],
        [-sx, rest, rz - 0.03],
        [-sx, top, rz - 0.03],
        [sx, top, rz - 0.03],
        [0, 0.05, -1],
        PART.seat,
    );
    return f.build();
}

/**
 * Middle distance (36 triangles): a tapered torso, a faceted head that is hair
 * above and skin below, and a block of knees.
 */
export function midFigureGeometry(): BufferGeometry {
    const f = new FigureBuilder();
    f.tube(
        [
            { center: [0, 0.02, TORSO_Z], ra: 0.2, rb: 0.16 },
            { center: [0, 0.4, TORSO_Z], ra: 0.26, rb: 0.15 },
            { center: [0, 0.6, TORSO_Z], ra: 0.09, rb: 0.07 },
        ],
        4,
        () => PART.shirt,
    );
    f.tube(headRings(2), 4, (band) => (band === 0 ? PART.hair : PART.skin));

    const y = 0.14;
    const x = 0.2;
    const near: V3 = [-x, y, 0.42];
    const nearR: V3 = [x, y, 0.42];
    f.quad([-x, y, 0.02], [x, y, 0.02], nearR, near, [0, 1, 0], PART.pants);
    f.quad(
        near,
        nearR,
        [x, -0.36, 0.44],
        [-x, -0.36, 0.44],
        [0, 0.1, 1],
        PART.pants,
    );
    return f.build();
}

/**
 * Far away (8 triangles): a ridged tent for the torso, seen from any side or
 * from above, and a two-triangle head split into hair and skin.
 */
export function farFigureGeometry(): BufferGeometry {
    const f = new FigureBuilder();
    const y = 0.57;
    const a: V3 = [-0.29, 0, 0.17];
    const b: V3 = [0.29, 0, 0.17];
    const c: V3 = [0.21, y, -0.04];
    const d: V3 = [-0.21, y, -0.04];
    const e: V3 = [-0.29, 0, -0.22];
    const g: V3 = [0.29, 0, -0.22];
    f.quad(a, b, c, d, [0, 0.32, 0.95], PART.shirt);
    f.quad(g, e, d, c, [0, 0.32, -0.95], PART.shirt);
    f.tri(a, d, e, [-0.95, 0.3, 0], PART.shirt);
    f.tri(b, g, c, [0.95, 0.3, 0], PART.shirt);

    // A diamond tipped back, so it still has area from above.
    const tilt = 0.5;
    const hw = 0.115;
    const eye: number = HEAD_Y - 0.01;
    const crown: V3 = [0, eye + 0.145, HEAD_Z - 0.145 * tilt];
    const chin: V3 = [0, eye - 0.145, HEAD_Z + 0.145 * tilt];
    const left: V3 = [-hw, eye, HEAD_Z];
    const right: V3 = [hw, eye, HEAD_Z];
    f.tri(left, right, crown, [0, tilt, 1], PART.hair);
    f.tri(right, left, chin, [0, tilt, 1], PART.skin);
    return f.build();
}

/**
 * Low quality (12 triangles): the one figure used for everyone, solid from
 * every side, with no more triangles than the box it replaced. Its head is two
 * crossed diamonds, so it needs a two-sided material.
 */
export function lowFigureGeometry(): BufferGeometry {
    const f = new FigureBuilder();
    f.tube(
        [
            { center: [0, 0, TORSO_Z], ra: 0.23, rb: 0.17 },
            { center: [0, 0.58, TORSO_Z], ra: 0.14, rb: 0.08 },
        ],
        4,
        () => PART.shirt,
    );
    // A head from two crossed diamonds, so it isn't a cone from any angle.
    const y = 0.7;
    const up = 0.13;
    const w = 0.11;
    const z = HEAD_Z;
    const crown: V3 = [0, y + up, z];
    const chin: V3 = [0, y - up, z];
    f.tri([-w, y, z], [w, y, z], crown, [0, 0.3, 1], PART.hair);
    f.tri([w, y, z], [-w, y, z], chin, [0, 0.3, 1], PART.skin);
    f.tri([0, y, z - w], [0, y, z + w], crown, [1, 0.3, 0], PART.hair);
    f.tri([0, y, z + w], [0, y, z - w], chin, [1, 0.3, 0], PART.skin);
    return f.build();
}

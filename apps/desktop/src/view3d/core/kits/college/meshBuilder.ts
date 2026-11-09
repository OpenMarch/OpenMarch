import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    ShapeUtils,
    Vector2,
} from "three";

export type P3 = [number, number, number];

/**
 * Accumulates non-indexed triangles with UVs and vertex colors, so a kit can
 * merge many quads that share a material into one draw call.
 */
export class MeshBuilder {
    readonly pos: number[] = [];
    readonly uv: number[] = [];
    readonly col: number[] = [];
    /** Vertex color for parts added without one. */
    private readonly white: Color;

    constructor(defaultColor = new Color(1, 1, 1)) {
        this.white = defaultColor;
    }

    get triangleCount(): number {
        return this.pos.length / 9;
    }

    tri(
        a: P3,
        b: P3,
        c: P3,
        ua: number[],
        ub: number[],
        uc: number[],
        color = this.white,
    ) {
        this.pos.push(...a, ...b, ...c);
        this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
        for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
    }

    /** Quad a-b-c-d (in order around the edge) with UVs per corner. */
    quad(
        a: P3,
        b: P3,
        c: P3,
        d: P3,
        uvs: [number[], number[], number[], number[]] = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ],
        color?: Color,
    ) {
        this.tri(a, b, c, uvs[0], uvs[1], uvs[2], color);
        this.tri(a, c, d, uvs[0], uvs[2], uvs[3], color);
    }

    /**
     * A strip between two polylines with matching point counts. `u` runs
     * along `edgeA` in units of `tile` meters (negated when `flipU`, so text
     * reads from the inside of the horseshoe); `v` is `vA` on `edgeA` and
     * `vB` on `edgeB`. `color(i)` colors quad `i`.
     */
    strip(
        edgeA: P3[],
        edgeB: P3[],
        options: {
            tile?: number;
            vA?: number;
            vB?: number;
            flipU?: boolean;
            u0?: number;
            color?: (i: number) => Color | undefined;
        } = {},
    ) {
        const tile = options.tile ?? 8;
        const vA = options.vA ?? 0;
        const vB = options.vB ?? 1;
        const sign = options.flipU ? -1 : 1;
        let u = options.u0 ?? 0;
        for (let i = 0; i + 1 < edgeA.length; i++) {
            const a = edgeA[i];
            const b = edgeA[i + 1];
            const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            const u0 = (sign * u) / tile;
            const u1 = (sign * (u + seg)) / tile;
            this.quad(
                a,
                b,
                edgeB[i + 1],
                edgeB[i],
                [
                    [u0, vA],
                    [u1, vA],
                    [u1, vB],
                    [u0, vB],
                ],
                options.color?.(i),
            );
            u += seg;
        }
        return u;
    }

    /**
     * A flat polygon given in its own 2D frame. `to3` maps a 2D point to
     * world space; UVs are the 2D coordinates divided by `tile`.
     */
    polygon(
        contour: [number, number][],
        to3: (p: [number, number]) => P3,
        tile = 8,
        color?: Color,
    ) {
        const pts = contour.map(([x, y]) => new Vector2(x, y));
        const faces = ShapeUtils.triangulateShape(pts, []);
        for (const [i, j, k] of faces) {
            const [a, b, c] = [contour[i], contour[j], contour[k]];
            this.tri(
                to3(a),
                to3(b),
                to3(c),
                [a[0] / tile, a[1] / tile],
                [b[0] / tile, b[1] / tile],
                [c[0] / tile, c[1] / tile],
                color,
            );
        }
    }

    /** An axis-aligned box (no bottom), for small solid parts. */
    box(
        cx: number,
        cy: number,
        cz: number,
        sx: number,
        sy: number,
        sz: number,
        color?: Color,
        tile = 8,
    ) {
        const x0 = cx - sx / 2;
        const x1 = cx + sx / 2;
        const y0 = cy - sy / 2;
        const y1 = cy + sy / 2;
        const z0 = cz - sz / 2;
        const z1 = cz + sz / 2;
        const uv = (
            w: number,
            h: number,
        ): [number[], number[], number[], number[]] => [
            [0, 0],
            [w / tile, 0],
            [w / tile, h / tile],
            [0, h / tile],
        ];
        this.quad(
            [x0, y0, z1],
            [x1, y0, z1],
            [x1, y1, z1],
            [x0, y1, z1],
            uv(sx, sy),
            color,
        );
        this.quad(
            [x1, y0, z0],
            [x0, y0, z0],
            [x0, y1, z0],
            [x1, y1, z0],
            uv(sx, sy),
            color,
        );
        this.quad(
            [x1, y0, z1],
            [x1, y0, z0],
            [x1, y1, z0],
            [x1, y1, z1],
            uv(sz, sy),
            color,
        );
        this.quad(
            [x0, y0, z0],
            [x0, y0, z1],
            [x0, y1, z1],
            [x0, y1, z0],
            uv(sz, sy),
            color,
        );
        this.quad(
            [x0, y1, z1],
            [x1, y1, z1],
            [x1, y1, z0],
            [x0, y1, z0],
            uv(sx, sz),
            color,
        );
    }

    /** Builds the geometry, or null when nothing was added. */
    build(): BufferGeometry | null {
        if (this.pos.length === 0) return null;
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
        geo.setAttribute("color", new Float32BufferAttribute(this.col, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return geo;
    }
}

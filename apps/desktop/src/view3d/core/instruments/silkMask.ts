/**
 * A silk Cut's mask (fork #973): which of the silk's points lie inside its
 * outline, as a small signed distance field the silk shader samples to
 * discard what is outside. The grid the wave bends (`silkWave.ts`) only
 * spans each column of the fly from the outline's top to its bottom, so a
 * Cut whose outline a column crosses more than twice (the C-swing's hollow,
 * the curved tail's hook, the distressed zigzag, a notched pole edge) needs
 * the mask to show its true shape.
 *
 * The field is planar, as an Artwork template is: x from the pole (0) to
 * the fly's farthest point (1), y from the top of the pole edge (0) down to
 * the outline's lowest point (1). Row 0 is the top.
 *
 * Pure: no three.js.
 */
import {
    cutPathBounds,
    sampleCutPath,
    type CutPath,
    type CutPoint,
} from "../sizes/silkCuts";

/** Texels across and down one Cut's mask. */
export const SILK_MASK_SIZE = 256;

/** Texels either side of the edge the field spans; it clamps beyond. */
export const SILK_MASK_BAND = 6;

/** The byte for a texel on the edge: inside is above, outside below. */
export const SILK_MASK_EDGE = 128;

/**
 * A Cut's mask: `size` × `size` bytes, row 0 at the top, each
 * `SILK_MASK_EDGE` plus its signed distance from the outline in texels
 * (inside positive), scaled so `SILK_MASK_BAND` texels span the byte.
 */
export function silkMaskField(
    path: CutPath,
    size = SILK_MASK_SIZE,
): Uint8Array {
    const b = cutPathBounds(path);
    const sx = size / b.maxX;
    const sy = size / b.maxY;
    // the outline in texels, closed by the pole edge back to (0, 0)
    const poly: CutPoint[] = sampleCutPath(path, 64).map(([x, y]) => [
        x * sx,
        y * sy,
    ]);
    poly.push([0, 0]);
    const inside = new Uint8Array(size * size);
    // scan lines: the even-odd crossings at each row's center
    for (let j = 0; j < size; j++) {
        const y = j + 0.5;
        const xs: number[] = [];
        for (let k = 1; k < poly.length; k++) {
            const [ax, ay] = poly[k - 1];
            const [bx, by] = poly[k];
            const aAbove = ay > y;
            const bAbove = by > y;
            if (aAbove === bAbove) continue;
            xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const from = Math.max(0, Math.ceil(xs[k] - 0.5));
            const to = Math.min(size - 1, Math.floor(xs[k + 1] - 0.5));
            for (let i = from; i <= to; i++) inside[j * size + i] = 1;
        }
    }
    // the distance to the outline, only within the band of each edge
    const dist = new Float32Array(size * size).fill(SILK_MASK_BAND);
    for (let k = 1; k < poly.length; k++) {
        const [ax, ay] = poly[k - 1];
        const [bx, by] = poly[k];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - SILK_MASK_BAND));
        const i1 = Math.min(
            size - 1,
            Math.ceil(Math.max(ax, bx) + SILK_MASK_BAND),
        );
        const j0 = Math.max(0, Math.floor(Math.min(ay, by) - SILK_MASK_BAND));
        const j1 = Math.min(
            size - 1,
            Math.ceil(Math.max(ay, by) + SILK_MASK_BAND),
        );
        for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
                const px = i + 0.5 - ax;
                const py = j + 0.5 - ay;
                const t =
                    len2 > 0
                        ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2))
                        : 0;
                const d = Math.hypot(px - t * dx, py - t * dy);
                const o = j * size + i;
                if (d < dist[o]) dist[o] = d;
            }
    }
    const out = new Uint8Array(size * size);
    const scale = (SILK_MASK_EDGE - 1) / SILK_MASK_BAND;
    for (let o = 0; o < out.length; o++) {
        const d = inside[o] ? dist[o] : -dist[o];
        out[o] = Math.round(SILK_MASK_EDGE + d * scale);
    }
    return out;
}

/** Whether the mask holds a planar point (x, y in [0, 1]) inside the Cut, bilinear. */
export function silkMaskInside(
    field: Uint8Array,
    x: number,
    y: number,
    size = SILK_MASK_SIZE,
): boolean {
    const fx = Math.min(Math.max(x * size - 0.5, 0), size - 1);
    const fy = Math.min(Math.max(y * size - 0.5, 0), size - 1);
    const i = Math.min(Math.floor(fx), size - 2);
    const j = Math.min(Math.floor(fy), size - 2);
    const u = fx - i;
    const v = fy - j;
    const at = (a: number, c: number) => field[c * size + a];
    const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    return top * (1 - v) + bottom * v >= SILK_MASK_EDGE;
}

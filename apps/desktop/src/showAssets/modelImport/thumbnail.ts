// cspell:words SUPERSAMPLE
/**
 * An imported model's thumbnail (fork #998): drawn on the CPU from the audience side and a little
 * above, turned a little to show a side, flat-shaded in each material's average color, on a clear
 * background. The worker has no WebGL to spare, and plain arithmetic gives the same picture on
 * desktop, the web and in tests.
 */
import { encodePng } from "./png";

/** The thumbnail's edge, in pixels */
export const THUMBNAIL_SIZE = 256;
/** Drawn at this many times the size, then averaged down, for smooth edges */
const SUPERSAMPLE = 2;
const MARGIN = 0.06;
/** Turned this far toward the model's right, then looked down on by `PITCH` */
const YAW = (-30 * Math.PI) / 180;
const PITCH = (25 * Math.PI) / 180;
/** Light from the viewer's upper left: ambient plus this much direct */
const AMBIENT = 0.45;
const LIGHT = [-0.45, 0.75, 0.48];

const cy = Math.cos(YAW),
    sy = Math.sin(YAW),
    cp = Math.cos(PITCH),
    sp = Math.sin(PITCH);

/**
 * A point as the thumbnail sees it: x to the right, y up, z toward the viewer (yaw about Y, then
 * pitch about X; the viewer looks along -Z). The review's axis preview draws with it too.
 */
export function thumbnailView(
    x: number,
    y: number,
    z: number,
): [number, number, number] {
    const x1 = cy * x + sy * z;
    const z1 = -sy * x + cy * z;
    return [x1, cp * y - sp * z1, sp * y + cp * z1];
}

export interface ColoredTriangle {
    /** `[ax, ay, az, bx, by, bz, cx, cy, cz]` in meters */
    positions: ArrayLike<number>;
    /** sRGB, 0 to 1 */
    color: readonly [number, number, number];
}

/** The triangles as a PNG thumbnail. */
export async function renderThumbnail(
    triangles: readonly ColoredTriangle[],
): Promise<Uint8Array> {
    const size = THUMBNAIL_SIZE * SUPERSAMPLE;
    const color = new Float32Array(size * size * 3);
    const covered = new Uint8Array(size * size);
    const depth = new Float32Array(size * size).fill(-Infinity);

    const view = thumbnailView;
    const projected = triangles.map(({ positions: p }) => [
        view(p[0], p[1], p[2]),
        view(p[3], p[4], p[5]),
        view(p[6], p[7], p[8]),
    ]);
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for (const tri of projected)
        for (const [x, y] of tri) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    const span = Math.max(maxX - minX, maxY - minY, 1e-9);
    const scale = (size * (1 - 2 * MARGIN)) / span;
    const offsetX = size / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = size / 2 + ((minY + maxY) / 2) * scale;
    const light = normalize(LIGHT);

    projected.forEach((tri, index) => {
        const [a, b, c] = tri;
        const n = normalize(cross(sub(b, a), sub(c, a)));
        if (!n) return;
        // Both sides draw: imported models aren't always closed
        const facing = n[2] < 0 ? -1 : 1;
        const lit =
            AMBIENT +
            (1 - AMBIENT) *
                Math.max(
                    0,
                    facing *
                        (n[0] * light![0] +
                            n[1] * light![1] +
                            n[2] * light![2]),
                );
        const base = triangles[index].color;
        const shade = [base[0] * lit, base[1] * lit, base[2] * lit];
        const s = tri.map(([x, y, z]) => [
            x * scale + offsetX,
            -y * scale + offsetY,
            z,
        ]);
        fill(s, size, (i, z) => {
            if (z <= depth[i]) return;
            depth[i] = z;
            covered[i] = 1;
            color[i * 3] = shade[0];
            color[i * 3 + 1] = shade[1];
            color[i * 3 + 2] = shade[2];
        });
    });

    return encodePng(
        downsample(color, covered),
        THUMBNAIL_SIZE,
        THUMBNAIL_SIZE,
    );
}

/** Averages each SUPERSAMPLE × SUPERSAMPLE block into RGBA, weighting color by coverage */
function downsample(color: Float32Array, covered: Uint8Array): Uint8Array {
    const size = THUMBNAIL_SIZE * SUPERSAMPLE;
    const out = new Uint8Array(THUMBNAIL_SIZE * THUMBNAIL_SIZE * 4);
    for (let y = 0; y < THUMBNAIL_SIZE; y++)
        for (let x = 0; x < THUMBNAIL_SIZE; x++) {
            let r = 0,
                g = 0,
                bl = 0,
                hits = 0;
            for (let dy = 0; dy < SUPERSAMPLE; dy++)
                for (let dx = 0; dx < SUPERSAMPLE; dx++) {
                    const i =
                        (y * SUPERSAMPLE + dy) * size + x * SUPERSAMPLE + dx;
                    if (!covered[i]) continue;
                    hits++;
                    r += color[i * 3];
                    g += color[i * 3 + 1];
                    bl += color[i * 3 + 2];
                }
            const o = (y * THUMBNAIL_SIZE + x) * 4;
            if (!hits) continue;
            const to8 = (v: number) =>
                Math.max(0, Math.min(255, Math.round((v / hits) * 255)));
            out[o] = to8(r);
            out[o + 1] = to8(g);
            out[o + 2] = to8(bl);
            out[o + 3] = Math.round((hits / SUPERSAMPLE ** 2) * 255);
        }
    return out;
}

type V3 = readonly number[];
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
function normalize(v: V3): number[] | null {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l < 1e-20 ? null : [v[0] / l, v[1] / l, v[2] / l];
}

/** Calls `plot` for each pixel center inside the screen-space triangle, with its depth. */
function fill(
    t: number[][],
    size: number,
    plot: (index: number, depth: number) => void,
) {
    const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = t;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const px = x + 0.5,
                py = y + 0.5;
            const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
            const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            plot(y * size + x, w0 * az + w1 * bz + w2 * cz);
        }
}

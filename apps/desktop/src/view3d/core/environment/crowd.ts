import {
    Color,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    BoxGeometry,
    type Vector3Tuple,
} from "three";
import type { SeatRow, VenueParams } from "../types";
import { createRng } from "./random";

/** One person: a box this big, with a little height jitter (design.md section 5). */
export const PERSON_WIDTH = 0.43;
export const PERSON_HEIGHT = 0.8;
export const PERSON_DEPTH = 0.3;
/** Extra height up to this many meters, per person. */
export const PERSON_HEIGHT_JITTER = 0.1;
/** Distance between neighbors along a row. */
export const PERSON_SPACING = 0.64;
/** Default people between aisles. */
export const DEFAULT_AISLE_EVERY = 18;

/** Shirt colors (hex numbers) per seat-row side. */
export type CrowdPalette = Record<SeatRow["side"], number[]>;

export interface CrowdOptions {
    /** Fraction of seats filled, 0 to 1. Default 0.6. */
    density?: number;
    /** Default `defaultCrowdPalette()` with the default team colors. */
    palette?: CrowdPalette;
    /** People between aisles along a row. Default 18. */
    aisleEvery?: number;
    /** People-wide gap at each aisle. Default 2. */
    aisleWidth?: number;
    /** "low" halves the density. Default "high". */
    quality?: "low" | "high";
    /** Seed for the deterministic layout. Default 7. */
    seed?: number;
}

export interface Crowd {
    /** One `InstancedMesh` for everyone, in the same frame as the seat rows. */
    mesh: InstancedMesh;
    /** Number of people placed (before any `clearAround`). */
    count: number;
    /**
     * Hides everyone within `radius` meters of `point` (same frame as the
     * seat rows) and shows everyone else, so the latest call wins. Call it
     * when the camera sits in a seat. Returns how many people are hidden.
     */
    clearAround(point: Vector3Tuple, radius: number): number;
    /** Shows everyone again. */
    reset(): void;
    /** Number of people currently shown. */
    visibleCount(): number;
    dispose(): void;
}

const hex = (css: string, fallback: number): number => {
    const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
    return m ? parseInt(m[1], 16) : fallback;
};

/**
 * Default shirt colors from the demo: home and away rows lean toward their
 * team color, neutral rows use only the mixed palette.
 */
export function defaultCrowdPalette(
    params?: Pick<VenueParams, "homeColor" | "awayColor">,
): CrowdPalette {
    const home = hex(params?.homeColor ?? "", 0x6442ff);
    const away = hex(params?.awayColor ?? "", 0xc23b3b);
    const mix = [0xffffff, 0x22252c, 0x3b5b92, 0xb04a3a, 0xd9c48a, 0x5a6e4e];
    return {
        home: [home, home, ...mix],
        away: [away, away, ...mix],
        neutral: mix,
    };
}

/** Points along a polyline at even spacing; closed rows include the closing segment. */
function sampleRow(
    points: Vector3Tuple[],
    closed: boolean,
    spacing: number,
): { position: Vector3; tangent: Vector3 }[] {
    const out: { position: Vector3; tangent: Vector3 }[] = [];
    const n = points.length;
    if (n < 2) return out;
    const segCount = closed ? n : n - 1;
    let carry = 0;
    for (let s = 0; s < segCount; s++) {
        const a = new Vector3(...points[s]);
        const b = new Vector3(...points[(s + 1) % n]);
        const seg = b.clone().sub(a);
        const len = seg.length();
        if (len < 1e-9) continue;
        const tangent = seg.clone().divideScalar(len);
        let d = carry;
        while (d < len) {
            out.push({
                position: a.clone().addScaledVector(tangent, d),
                tangent,
            });
            d += spacing;
        }
        carry = d - len;
    }
    return out;
}

/**
 * Builds the whole crowd as one `InstancedMesh` (one draw call). People stand
 * on each seat row's polyline (whose points are at seat height), spaced 0.64
 * m apart, with an aisle every 18 people and a random subset skipped to
 * reach `density`. Colors come from the row's `side`.
 */
export function buildCrowd(
    seatRows: SeatRow[],
    options: CrowdOptions = {},
): Crowd {
    const quality = options.quality ?? "high";
    const density =
        Math.min(1, Math.max(0, options.density ?? 0.6)) *
        (quality === "low" ? 0.5 : 1);
    const palette = options.palette ?? defaultCrowdPalette();
    const aisleEvery = Math.max(1, options.aisleEvery ?? DEFAULT_AISLE_EVERY);
    const aisleWidth = Math.max(0, options.aisleWidth ?? 2);
    const rnd = createRng(options.seed ?? 7);

    interface Placed {
        x: number;
        y: number;
        z: number;
        yaw: number;
        height: number;
        color: number;
    }
    const placed: Placed[] = [];
    for (const row of seatRows) {
        const colors = palette[row.side].length
            ? palette[row.side]
            : palette.neutral;
        const samples = sampleRow(row.points, row.closed, PERSON_SPACING);
        samples.forEach(({ position, tangent }, j) => {
            if (j % (aisleEvery + aisleWidth) >= aisleEvery) return;
            if (rnd() >= density) return;
            placed.push({
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: Math.atan2(-tangent.z, tangent.x),
                height: PERSON_HEIGHT + rnd() * PERSON_HEIGHT_JITTER,
                color: colors[Math.floor(rnd() * colors.length)],
            });
        });
    }

    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
    });
    const mesh = new InstancedMesh(
        geometry,
        material,
        Math.max(1, placed.length),
    );
    mesh.name = "crowd";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.crowd = true;

    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const color = new Color();
    placed.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        m.compose(
            new Vector3(p.x, p.y + p.height / 2, p.z),
            q,
            new Vector3(PERSON_WIDTH, p.height, PERSON_DEPTH),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.setHex(p.color));
    });
    mesh.count = placed.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const base = new Float32Array(mesh.instanceMatrix.array); // copy
    let hidden = 0;
    const apply = (point: Vector3Tuple | null, radius: number): number => {
        const arr = mesh.instanceMatrix.array as Float32Array;
        const r2 = radius * radius;
        hidden = 0;
        for (let k = 0; k < placed.length; k++) {
            const i = k * 16;
            let near = false;
            if (point) {
                const dx = base[i + 12] - point[0];
                const dy = base[i + 13] - point[1];
                const dz = base[i + 14] - point[2];
                near = dx * dx + dy * dy + dz * dz < r2;
            }
            if (near) hidden++;
            for (let e = 0; e < 16; e++) {
                arr[i + e] = near && e !== 15 ? 0 : base[i + e];
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
        return hidden;
    };

    return {
        mesh,
        count: placed.length,
        clearAround: (point, radius) => apply(point, radius),
        reset: () => void apply(null, 0),
        visibleCount: () => placed.length - hidden,
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}

import type { CanvasTexture } from "three";
import { paintCanvasTexture, TEXTURE_FONT } from "../../environment";

/** Basketball court size in meters (28.65 x 15.24, the demo's 94 x 50 ft). */
export const COURT_LENGTH = 28.65;
export const COURT_WIDTH = 15.24;
/** The safety tape runs this far outside the performance area. */
export const TAPE_MARGIN = 1.5;

export interface FloorTextureOptions {
    /** Room floor extent in world meters. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** Performance area (the footprint) in world meters. */
    footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * The room floor: maple boards, a basketball court centered under the
 * performance area, and the yellow safety tape 1.5 m outside it. The canvas
 * top is the back wall (most negative z) and its left is minX.
 */
export function floorTexture(o: FloorTextureOptions): CanvasTexture {
    const roomW = o.maxX - o.minX;
    const roomD = o.maxZ - o.minZ;
    const s = Math.min(32, 4096 / Math.max(roomW, roomD));
    const X = (x: number) => (x - o.minX) * s;
    const Y = (z: number) => (z - o.minZ) * s;
    return paintCanvasTexture(
        Math.ceil(roomW * s),
        Math.ceil(roomD * s),
        (g, W, H) => {
            const plank = Math.max(2, Math.round(0.12 * s));
            for (let i = 0, k = 0; i < H; i += plank, k++) {
                g.fillStyle = `hsl(33, ${45 + ((k * 7) % 9)}%, ${62 + ((k * 13) % 7)}%)`;
                g.fillRect(0, i, W, plank);
            }
            const fp = o.footprint;
            const cx = (fp.minX + fp.maxX) / 2;
            const cz = (fp.minZ + fp.maxZ) / 2;
            const halfL = COURT_LENGTH / 2;
            const halfW = COURT_WIDTH / 2;
            if (halfL * 2 <= roomW - 1 && halfW * 2 <= roomD - 1) {
                g.strokeStyle = "#1d2a5c";
                g.lineWidth = 0.08 * s;
                g.strokeRect(
                    X(cx - halfL),
                    Y(cz - halfW),
                    COURT_LENGTH * s,
                    COURT_WIDTH * s,
                );
                g.beginPath();
                g.moveTo(X(cx), Y(cz - halfW));
                g.lineTo(X(cx), Y(cz + halfW));
                g.stroke();
                g.beginPath();
                g.arc(X(cx), Y(cz), 1.83 * s, 0, Math.PI * 2);
                g.stroke();
                for (const sg of [-1, 1]) {
                    const baseX = cx + sg * halfL;
                    // Free-throw lane, 5.79 x 3.66 m, against the baseline.
                    g.strokeRect(
                        X(sg > 0 ? baseX - 5.79 : baseX),
                        Y(cz - 1.83),
                        5.79 * s,
                        3.66 * s,
                    );
                    g.beginPath();
                    g.arc(
                        X(baseX - sg * 1.6),
                        Y(cz),
                        6.7 * s,
                        sg > 0 ? Math.PI * 0.6 : -Math.PI * 0.4,
                        sg > 0 ? Math.PI * 1.4 : Math.PI * 0.4,
                    );
                    g.stroke();
                }
            }
            g.strokeStyle = "#e5b800";
            g.lineWidth = 0.1 * s;
            g.setLineDash([0.6 * s, 0.36 * s]);
            g.strokeRect(
                X(fp.minX - TAPE_MARGIN),
                Y(fp.minZ - TAPE_MARGIN),
                (fp.maxX - fp.minX + 2 * TAPE_MARGIN) * s,
                (fp.maxZ - fp.minZ + 2 * TAPE_MARGIN) * s,
            );
            g.setLineDash([]);
        },
    );
}

/** A back-wall banner: a colored field, up to three lines and a white strip. */
export function bannerTexture(lines: string[], color: string): CanvasTexture {
    return paintCanvasTexture(256, 360, (g) => {
        g.fillStyle = color;
        g.fillRect(0, 0, 256, 360);
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.fillRect(0, 300, 256, 18);
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.font = `700 34px ${TEXTURE_FONT}`;
        lines.forEach((l, i) => g.fillText(l, 128, 90 + i * 48));
    });
}

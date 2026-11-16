import { ClampToEdgeWrapping, type CanvasTexture } from "three";
import {
    creditsTexture,
    inFace,
    paintCanvasTexture,
    paintCreditsCard,
    paintLogoBanner,
    paintOtmAd,
    type CreditsTexture,
} from "../../environment";

/**
 * Canvas textures for the arena kit. Everything is painted here at build time;
 * nothing is downloaded. Sizes stay at or under 2048 px.
 */

export interface ArenaFloorOptions {
    /** Floor extent in world meters (the bowl's inner rectangle). */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** Performance area (the footprint) in world meters. */
    footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Basketball court under the tarp, as in the gym (28.65 x 15.24 m). */
const COURT = { length: 28.65, width: 15.24, apron: 1.8 };
/** The floor tape runs this far outside the performance area. */
export const ARENA_TAPE_MARGIN = 1.5;

/**
 * The arena floor: black event flooring with faint panel seams, the maple
 * court under the middle (mostly hidden by the tarp), and a white boundary
 * tape 1.5 m outside the performance area. The canvas top is the most
 * negative z and its left is minX.
 */
export function arenaFloorTexture(o: ArenaFloorOptions): CanvasTexture {
    const w = o.maxX - o.minX;
    const d = o.maxZ - o.minZ;
    const s = Math.min(24, 2048 / Math.max(w, d));
    const X = (x: number) => (x - o.minX) * s;
    const Y = (z: number) => (z - o.minZ) * s;
    const fp = o.footprint;
    const cx = (fp.minX + fp.maxX) / 2;
    const cz = (fp.minZ + fp.maxZ) / 2;
    return paintCanvasTexture(Math.ceil(w * s), Math.ceil(d * s), (g, W, H) => {
        g.fillStyle = "#1b1c21";
        g.fillRect(0, 0, W, H);
        // Event floor panels, 1.2 m, with a slight tone change per panel.
        const panel = 1.2 * s;
        for (let y = 0, j = 0; y < H; y += panel, j++) {
            for (let x = 0, i = 0; x < W; x += panel, i++) {
                const k = (i * 7 + j * 13) % 5;
                g.fillStyle = `rgba(255,255,255,${0.006 * k})`;
                g.fillRect(x + 1, y + 1, panel - 2, panel - 2);
            }
        }
        // Maple court and apron.
        const cw = COURT.length + 2 * COURT.apron;
        const ch = COURT.width + 2 * COURT.apron;
        if (cw < w && ch < d) {
            const plank = Math.max(2, Math.round(0.1 * s));
            const x0 = X(cx - cw / 2);
            const y0 = Y(cz - ch / 2);
            for (let y = 0, k = 0; y < ch * s; y += plank, k++) {
                g.fillStyle = `hsl(32, ${42 + ((k * 7) % 9)}%, ${54 + ((k * 13) % 7)}%)`;
                g.fillRect(x0, y0 + y, cw * s, Math.min(plank, ch * s - y));
            }
            g.strokeStyle = "#f4f1ea";
            g.lineWidth = 0.06 * s;
            g.strokeRect(
                X(cx - COURT.length / 2),
                Y(cz - COURT.width / 2),
                COURT.length * s,
                COURT.width * s,
            );
        }
        // Boundary tape around the performance area.
        g.strokeStyle = "rgba(240,240,240,0.85)";
        g.lineWidth = 0.08 * s;
        g.strokeRect(
            X(fp.minX - ARENA_TAPE_MARGIN),
            Y(fp.minZ - ARENA_TAPE_MARGIN),
            (fp.maxX - fp.minX + 2 * ARENA_TAPE_MARGIN) * s,
            (fp.maxZ - fp.minZ + 2 * ARENA_TAPE_MARGIN) * s,
        );
    });
}

/**
 * One seat back per tile, white on transparent, for a band tinted by vertex
 * colors and drawn with `alphaTest`. U runs along the row, V up.
 */
export function seatBackTexture(): CanvasTexture {
    const tex = paintCanvasTexture(
        64,
        64,
        (g) => {
            g.clearRect(0, 0, 64, 64);
            const grad = g.createLinearGradient(0, 0, 0, 64);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.25, "#d9d9d9");
            grad.addColorStop(1, "#8c8c8c");
            g.fillStyle = grad;
            g.beginPath();
            g.roundRect(7, 4, 50, 60, [14, 14, 3, 3]);
            g.fill();
        },
        { repeat: true },
    );
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Where each scoreboard face sits in the 1024 x 1024 atlas, in UV units. */
export const SCOREBOARD_ATLAS = {
    /** The two long faces (toward the front and back sides). */
    side: { u0: 0, v0: 0.5, u1: 1, v1: 1 },
    /** The two end faces (toward side 1 and side 2). */
    end: { u0: 0, v0: 0, u1: 0.62, v1: 0.5 },
};

/**
 * The screens' width over height in the arena (`addScoreboard`: width 1,
 * depth 0.62 and height 0.42 of the board width). The atlas regions are
 * narrower than that, so faces are painted wide and squeezed to fit.
 */
const SCREEN_ASPECT = { side: 1 / 0.42, end: 0.62 / 0.42 };

/**
 * The center-hung scoreboard's screens: the show's credits on the long faces
 * and an On The Move ad on the ends. V runs up (three.js convention), so the
 * canvas's top half is the long-face image. Blank credits until `setCredits`.
 */
export function scoreboardTexture(): CreditsTexture {
    return creditsTexture(1024, 1024, (g, credits) => {
        g.clearRect(0, 0, 1024, 1024);
        inFace(g, 0, 0, 1024, 512, SCREEN_ASPECT.side, (w, h) =>
            paintCreditsCard(g, w, h, credits),
        );
        inFace(g, 0, 512, 634, 512, SCREEN_ASPECT.end, (w, h) =>
            paintOtmAd(g, w, h),
        );
    });
}

/**
 * Rafter banner fabrics, one per banner. A matched set in deep ink, each with
 * the OpenMarch logo.
 */
export const ARENA_BANNERS: string[] = [
    "#1b1834",
    "#1b1834",
    "#1b1834",
    "#1b1834",
    "#1b1834",
    "#1b1834",
];

/** A banner's width over height in the arena (1.5 x 4.4 m in `addBanners`). */
const BANNER_ASPECT = 1.5 / 4.4;

/**
 * Every rafter banner side by side in one atlas, 128 x 512 each, so the
 * banners draw as one mesh. Banner `i` spans U from i / n to (i + 1) / n.
 * Each is painted at its true aspect and squeezed into its 128 px column.
 */
export function bannerAtlasTexture(): CanvasTexture {
    const n = ARENA_BANNERS.length;
    return paintCanvasTexture(128 * n, 512, (g) => {
        g.clearRect(0, 0, 128 * n, 512);
        const w = 512 * BANNER_ASPECT;
        ARENA_BANNERS.forEach((color, i) => {
            g.save();
            g.translate(i * 128, 0);
            g.scale(128 / w, 1);
            paintLogoBanner(g, w, 512, color, true);
            g.restore();
        });
    });
}

/**
 * The performers' tunnel mouth: near black, with warm light spilling across
 * the tunnel floor from inside and a faint blue edge.
 */
export function tunnelMouthTexture(): CanvasTexture {
    return paintCanvasTexture(256, 256, (g) => {
        g.fillStyle = "#020203";
        g.fillRect(0, 0, 256, 256);
        const spill = g.createRadialGradient(128, 300, 10, 128, 300, 220);
        spill.addColorStop(0, "rgba(255,190,120,0.75)");
        spill.addColorStop(0.5, "rgba(255,150,80,0.18)");
        spill.addColorStop(1, "rgba(255,150,80,0)");
        g.fillStyle = spill;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "rgba(90,120,255,0.35)";
        g.fillRect(0, 0, 256, 5);
    });
}

/**
 * Vertical fade for the haze beams: opaque white at the lamp (V = 1) fading
 * to nothing at the floor (V = 0).
 */
export function beamFadeTexture(): CanvasTexture {
    const tex = paintCanvasTexture(4, 128, (g) => {
        const grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 4, 128);
    });
    tex.anisotropy = 1;
    return tex;
}

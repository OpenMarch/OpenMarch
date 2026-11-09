import type { CanvasTexture } from "three";
import {
    createRng,
    drawOpenMarchLogo,
    drawOtmLogo,
    inFace,
    OTM_LOGO_ASPECT,
    paintCanvasTexture,
    paintWithOtmLogo,
    SIGN,
    TEXTURE_FONT,
} from "../../environment";
import { muted } from "../hs/textures";

/**
 * Procedural textures for the college kit, painted on 2D canvases (no image
 * files). The kit owns and disposes them. Tones stay in weathered concrete,
 * limestone and old brick; the team color only shows as a muted accent.
 */

type G = CanvasRenderingContext2D;

/** Speckle of light and dark flecks, for concrete and stone. */
function fleck(
    g: G,
    w: number,
    h: number,
    n: number,
    alpha: number,
    seed: number,
): void {
    const rnd = createRng(seed);
    for (let i = 0; i < n; i++) {
        const l = 110 + Math.floor(rnd() * 140);
        g.fillStyle = `rgba(${l},${l - 2},${l - 8},${alpha})`;
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
}

/** Soft dark streaks running down from the top, as rain leaves on concrete. */
function streaks(
    g: G,
    w: number,
    h: number,
    n: number,
    seed: number,
    top = 0,
): void {
    const rnd = createRng(seed);
    for (let i = 0; i < n; i++) {
        const x = rnd() * w;
        const len = (h - top) * (0.3 + rnd() * 0.7);
        const grad = g.createLinearGradient(0, top, 0, top + len);
        grad.addColorStop(0, "rgba(58,54,48,0.2)");
        grad.addColorStop(1, "rgba(58,54,48,0)");
        g.fillStyle = grad;
        g.fillRect(x, top, 2 + rnd() * 9, len);
    }
}

/**
 * Cast concrete for risers, treads and aisles (4 m tile): speckle, faint
 * form-board joints and water stains. Light, so vertex colors set the tone.
 */
export function concreteTexture(): CanvasTexture {
    return paintCanvasTexture(
        512,
        512,
        (g, w, h) => {
            const rnd = createRng(11);
            g.fillStyle = "#cfcbc2";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 26; i++) {
                const r = 30 + rnd() * 90;
                const x = rnd() * w;
                const y = rnd() * h;
                const grad = g.createRadialGradient(x, y, 0, x, y, r);
                const l = rnd() < 0.5 ? 92 : 228;
                grad.addColorStop(0, `rgba(${l},${l},${l - 8},0.09)`);
                grad.addColorStop(1, `rgba(${l},${l},${l - 8},0)`);
                g.fillStyle = grad;
                g.fillRect(x - r, y - r, 2 * r, 2 * r);
            }
            fleck(g, w, h, 6200, 0.3, 12);
            g.fillStyle = "rgba(84,80,72,0.22)";
            for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
            streaks(g, w, h, 9, 13);
        },
        { repeat: true, anisotropy: 4 },
    );
}

/** Precast panels for soffits, end caps and roofs (12 m tile, 3 x 3 panels). */
export function panelTexture(): CanvasTexture {
    return paintCanvasTexture(
        512,
        512,
        (g, w, h) => {
            const rnd = createRng(5);
            const n = 3;
            const pw = w / n;
            const ph = h / n;
            for (let i = 0; i < n; i++)
                for (let j = 0; j < n; j++) {
                    const l = 176 + Math.floor(rnd() * 22);
                    g.fillStyle = `rgb(${l},${l - 4},${l - 12})`;
                    g.fillRect(i * pw, j * ph, pw, ph);
                }
            fleck(g, w, h, 4200, 0.22, 6);
            streaks(g, w, h, 14, 7);
            g.fillStyle = "#5f5c56";
            for (let i = 0; i <= n; i++) {
                g.fillRect(i * pw - 2, 0, 4, h);
                g.fillRect(0, i * ph - 2, w, 4);
            }
        },
        { repeat: true, anisotropy: 4 },
    );
}

/**
 * One seat back per repeat (`SEAT_PITCH` along the row): a light rounded
 * shell with a dark gap and a shadowed foot. Vertex colors tint it.
 */
export function seatTexture(): CanvasTexture {
    return paintCanvasTexture(
        32,
        32,
        (g, w, h) => {
            g.fillStyle = "#2a2a2c";
            g.fillRect(0, 0, w, h);
            const grad = g.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, "#9a9a9a");
            grad.addColorStop(0.35, "#ffffff");
            grad.addColorStop(1, "#e6e6e6");
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(3, h);
            g.lineTo(3, 9);
            g.quadraticCurveTo(3, 2, 10, 2);
            g.lineTo(22, 2);
            g.quadraticCurveTo(29, 2, 29, 9);
            g.lineTo(29, h);
            g.closePath();
            g.fill();
        },
        { repeat: true, anisotropy: 4 },
    );
}

/**
 * Suite and press box glass (24 m wide, two stories per repeat): mullions
 * every 1.5 m, a slab line, and rooms whose lights vary. Used as the color
 * and the emissive map, so the glass glows warm at night.
 */
export function suiteGlassTexture(): CanvasTexture {
    return paintCanvasTexture(
        512,
        128,
        (g, w, h) => {
            const rnd = createRng(23);
            const bays = 16;
            const bw = w / bays;
            for (let story = 0; story < 2; story++) {
                const y0 = story * (h / 2);
                for (let i = 0; i < bays; i++) {
                    const lit = rnd();
                    const l = lit < 0.2 ? 0.25 : 0.65 + rnd() * 0.35;
                    const grad = g.createLinearGradient(0, y0, 0, y0 + h / 2);
                    grad.addColorStop(
                        0,
                        `rgba(${255 * l},${214 * l},${160 * l},1)`,
                    );
                    grad.addColorStop(
                        1,
                        `rgba(${200 * l},${150 * l},${100 * l},1)`,
                    );
                    g.fillStyle = grad;
                    g.fillRect(i * bw, y0, bw, h / 2);
                    if (lit > 0.5) {
                        g.fillStyle = "rgba(20,16,12,0.6)";
                        for (let k = 0; k < 3; k++) {
                            const px = i * bw + 4 + rnd() * (bw - 10);
                            g.fillRect(px, y0 + h * 0.3, 4, h * 0.2);
                        }
                    }
                }
                g.fillStyle = "#1a1c22";
                g.fillRect(0, y0, w, 6);
                g.fillRect(0, y0 + h / 2 - 10, w, 10);
            }
            g.fillStyle = "#23262d";
            for (let i = 0; i <= bays; i++) g.fillRect(i * bw - 1.5, 0, 3, h);
        },
        { repeat: true },
    );
}

/** A bank of stadium lamps: 8 x 3 round heads on a dark frame (emissive). */
export function lampBankTexture(): CanvasTexture {
    return paintCanvasTexture(
        256,
        96,
        (g, w, h) => {
            g.fillStyle = "#202226";
            g.fillRect(0, 0, w, h);
            const cols = 8;
            const rows = 3;
            for (let i = 0; i < cols; i++)
                for (let j = 0; j < rows; j++) {
                    const x = (i + 0.5) * (w / cols);
                    const y = (j + 0.5) * (h / rows);
                    const grad = g.createRadialGradient(x, y, 1, x, y, 13);
                    grad.addColorStop(0, "#ffffff");
                    grad.addColorStop(0.6, "#fff4dc");
                    grad.addColorStop(1, "#3a3a3a");
                    g.fillStyle = grad;
                    g.beginPath();
                    g.arc(x, y, 12, 0, Math.PI * 2);
                    g.fill();
                }
        },
        { anisotropy: 4 },
    );
}

/** The scoreboard under the video board: HOME and VISITORS with a clock. */
export function scoreboardTexture(home: string, away: string): CanvasTexture {
    return paintCanvasTexture(1024, 160, (g, w, h) => {
        g.fillStyle = "#050608";
        g.fillRect(0, 0, w, h);
        g.textAlign = "center";
        g.textBaseline = "middle";
        const block = (x: number, css: string, name: string) => {
            g.fillStyle = muted(css, 0.55);
            g.fillRect(x, 14, 300, 46);
            g.fillStyle = "#e9e7e0";
            g.font = `700 36px ${TEXTURE_FONT}`;
            g.fillText(name, x + 150, 38);
            g.fillStyle = "#e0b656";
            g.font = `700 80px ${TEXTURE_FONT}`;
            g.fillText("0", x + 150, 108);
        };
        block(24, home, "HOME");
        block(w - 324, away, "VISITORS");
        g.fillStyle = "#e9e7e0";
        g.font = `700 64px ${TEXTURE_FONT}`;
        g.fillText("0:00", w / 2, 80);
        g.fillStyle = "rgba(0,0,0,0.4)";
        for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
        for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    });
}

/** Width over height of the sign band under the press box glass. */
export const PRESS_SIGN_ASPECT = 44 / 1.4;

/** The press box sign band: dark, one OpenMarch logo at the center. */
export function pressSignTexture(): CanvasTexture {
    return paintCanvasTexture(2048, 128, (g, w, h) => {
        inFace(g, 0, 0, w, h, PRESS_SIGN_ASPECT, (fw, fh) => {
            g.fillStyle = SIGN.ground;
            g.fillRect(0, 0, fw, fh);
            drawOpenMarchLogo(g, fw / 2, fh / 2, fh * 0.72, SIGN.mark);
        });
    });
}

/** Width over height of each of the two ad panels by the scoreboard. */
export const BOARD_AD_ASPECT = 2.4;

/**
 * Two calm ad panels for the scoreboard's flanks, side by side on one
 * canvas: the OpenMarch logo on the left half, On The Move on the right.
 */
export function boardAdsTexture(): CanvasTexture {
    const W = 1024;
    const H = 216;
    const paint = (g: G) => {
        g.fillStyle = SIGN.ground;
        g.fillRect(0, 0, W, H);
        g.fillStyle = "rgba(140,120,255,0.32)";
        g.fillRect(W / 2 - 1, 0, 2, H);
        inFace(g, 0, 0, W / 2, H, BOARD_AD_ASPECT, (fw, fh) =>
            drawOpenMarchLogo(g, fw / 2, fh / 2, fh * 0.62, SIGN.mark),
        );
        inFace(g, W / 2, 0, W / 2, H, BOARD_AD_ASPECT, (fw, fh) => {
            const lh = Math.min(fh * 0.56, (fw * 0.8) / OTM_LOGO_ASPECT);
            drawOtmLogo(
                g,
                {
                    x: fw * 0.1,
                    y: (fh - lh) / 2,
                    w: fw * 0.8,
                    h: lh,
                },
                SIGN.otm,
            );
        });
    };
    const tex = paintCanvasTexture(W, H, paint);
    paintWithOtmLogo(tex, paint);
    return tex;
}

/**
 * The facade atlas: one 12 m bay wide, repeating in U. Each band spans its
 * own V range, so stories of the wall can pick a band.
 */
export const FACADE_BAY = 12;
export const FACADE_BANDS = {
    /** Ground floor arcade, 13.5 m tall: brick arches and limestone. */
    arcade: [0.5, 1],
    /** One 6 m story of the upper wall: precast piers and dark glazing. */
    story: [0.25, 0.5],
    /** Attic and cornice: limestone with a fine reveal. */
    attic: [0.125, 0.25],
    /** Plain brick for tower cores and the like. */
    plain: [0, 0.125],
} as const;

const ATLAS_SIZE = 1024;
const BANDS_PX = {
    arcade: [0, 512],
    story: [512, 768],
    attic: [768, 896],
    plain: [896, 1024],
} as const;

/** The upper wall's openings, in atlas pixels. */
const STORY_BAYS = 3;
const STORY_BW = ATLAS_SIZE / STORY_BAYS;
const STORY_TOP = 44;
const STORY_OPEN = 158;

/** Running bond brick across the rectangle, with a little tone variation. */
function brick(
    g: G,
    x0: number,
    y0: number,
    w: number,
    h: number,
    seed: number,
    bw = 34,
    bh = 11,
): void {
    const rnd = createRng(seed);
    g.fillStyle = "#6d6157";
    g.fillRect(x0, y0, w, h);
    for (let y = y0, k = 0; y < y0 + h; y += bh, k++) {
        for (let x = x0 - (k % 2) * (bw / 2); x < x0 + w; x += bw) {
            const r = 126 + rnd() * 34;
            g.fillStyle = `rgb(${r},${r * 0.62 + rnd() * 10},${r * 0.5})`;
            g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        }
    }
}

/** The arch outline for one bay's opening, in atlas pixels. */
function archPath(
    g: G,
    cx: number,
    open: number,
    spring: number,
    sill: number,
    pad: number,
): void {
    g.beginPath();
    g.moveTo(cx - open / 2 - pad, sill);
    g.lineTo(cx - open / 2 - pad, spring);
    g.arc(cx, spring, open / 2 + pad, Math.PI, 0);
    g.lineTo(cx + open / 2 + pad, sill);
    g.closePath();
}

/** Day face of the facade atlas: brick arcade, precast stories, attic, brick. */
export function facadeTexture(): CanvasTexture {
    return paintCanvasTexture(
        ATLAS_SIZE,
        ATLAS_SIZE,
        (g, w) => {
            const [, arcadeB] = BANDS_PX.arcade;
            brick(g, 0, 0, w, arcadeB, 31);
            const cx = w / 2;
            const open = 300;
            const spring = 214;
            const sill = 500;
            g.fillStyle = "#c9c0ae";
            archPath(g, cx, open, spring, sill, 26);
            g.fill();
            g.fillStyle = "#23211e";
            archPath(g, cx, open, spring, sill, 0);
            g.fill();
            // Mullions and a transom.
            g.fillStyle = "#4c4842";
            for (const x of [-open / 4, 0, open / 4])
                g.fillRect(cx + x - 3, spring - open / 2 + 8, 6, sill - spring);
            g.fillRect(cx - open / 2, spring + 4, open, 7);
            // Springing course and a limestone foot.
            g.fillStyle = "#c9c0ae";
            g.fillRect(0, 204, 90, 16);
            g.fillRect(w - 90, 204, 90, 16);
            g.fillRect(0, sill, w, arcadeB - sill);
            g.fillRect(0, 0, w, 12);
            streaks(g, w, arcadeB, 10, 33, 12);

            const [s0, s1] = BANDS_PX.story;
            g.fillStyle = "#b8b2a4";
            g.fillRect(0, s0, w, s1 - s0);
            fleck(g, w, s1 - s0, 900, 0.18, 37);
            // Open concourse bays: tall and narrow, with deep limestone piers
            // and a spandrel, so the wall doesn't read as an office block.
            const rnd = createRng(39);
            for (let i = 0; i < STORY_BAYS; i++) {
                const x = i * STORY_BW + STORY_BW * 0.3;
                const gw = STORY_BW * 0.4;
                g.fillStyle = `rgb(${46 + rnd() * 12},${50 + rnd() * 10},${56 + rnd() * 10})`;
                g.fillRect(x, s0 + STORY_TOP, gw, STORY_OPEN);
                g.fillStyle = "rgba(255,255,255,0.1)";
                g.fillRect(x, s0 + STORY_TOP, gw, 5);
            }
            g.fillStyle = "#8f897b";
            g.fillRect(0, s1 - 34, w, 5);
            streaks(g, w, s1 - s0, 8, 41, s0);

            const [a0, a1] = BANDS_PX.attic;
            g.fillStyle = "#c6bfaf";
            g.fillRect(0, a0, w, a1 - a0);
            fleck(g, w, a1 - a0, 500, 0.18, 43);
            g.fillStyle = "rgba(70,66,58,0.55)";
            g.fillRect(0, a0 + 22, w, 3);
            g.fillRect(0, a1 - 18, w, 3);
            for (let x = 0; x < w; x += w / 6) g.fillRect(x, a0, 2, a1 - a0);

            const [p0, p1] = BANDS_PX.plain;
            brick(g, 0, p0, w, p1 - p0, 47);
        },
        { repeat: true, anisotropy: 8 },
    );
}

/** Night face of the atlas: lit arches and lamps washing up the piers. */
export function facadeNightTexture(): CanvasTexture {
    return paintCanvasTexture(
        ATLAS_SIZE / 2,
        ATLAS_SIZE / 2,
        (g, w) => {
            const k = w / ATLAS_SIZE;
            g.fillStyle = "#000000";
            g.fillRect(0, 0, w, w);
            const cx = w / 2;
            const open = 300 * k;
            const spring = 214 * k;
            const sill = 500 * k;
            // A warm wash up the pier either side of every arch.
            for (const px of [0, w]) {
                const grad = g.createLinearGradient(0, sill, 0, 0);
                grad.addColorStop(0, "rgba(255,190,120,0.42)");
                grad.addColorStop(0.5, "rgba(255,170,100,0.18)");
                grad.addColorStop(1, "rgba(255,170,100,0)");
                g.fillStyle = grad;
                g.fillRect(px - 90 * k, 0, 180 * k, sill);
            }
            const glow = g.createLinearGradient(0, spring, 0, sill);
            glow.addColorStop(0, "#d99a58");
            glow.addColorStop(1, "#ffcd8c");
            g.fillStyle = glow;
            archPath(g, cx, open, spring, sill, 0);
            g.fill();
            g.fillStyle = "#3b2c1c";
            for (const x of [-open / 4, 0, open / 4])
                g.fillRect(cx + x - 2, spring - open / 2, 4, sill - spring);

            const s0 = BANDS_PX.story[0] * k;
            const s1 = BANDS_PX.story[1] * k;
            const rnd = createRng(39);
            const bw = STORY_BW * k;
            // A soft warm wash up the wall, so the piers hold at night.
            const wash = g.createLinearGradient(0, s1, 0, s0);
            wash.addColorStop(0, "rgba(255,186,120,0.2)");
            wash.addColorStop(1, "rgba(255,186,120,0.08)");
            g.fillStyle = wash;
            g.fillRect(0, s0, w, s1 - s0);
            for (let i = 0; i < STORY_BAYS; i++) {
                const lit = rnd() < 0.78 ? 0.42 + rnd() * 0.45 : 0.08;
                g.fillStyle = `rgba(255,${196 + rnd() * 20},${130 + rnd() * 30},${lit})`;
                g.fillRect(
                    i * bw + bw * 0.3,
                    s0 + STORY_TOP * k,
                    bw * 0.4,
                    STORY_OPEN * k,
                );
            }
            const a0 = BANDS_PX.attic[0] * k;
            const a1 = BANDS_PX.attic[1] * k;
            g.fillStyle = "rgba(255,186,120,0.12)";
            g.fillRect(0, a0, w, a1 - a0);
            g.fillStyle = "rgba(255,186,120,0.3)";
            g.fillRect(0, a1 - 18 * k, w, 3);
        },
        { repeat: true },
    );
}

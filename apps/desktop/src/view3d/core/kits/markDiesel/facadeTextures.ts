// cspell:ignore ashlar quoins mullion mullions transoms lites
import type { CanvasTexture } from "three";
import { createRng, paintCanvasTexture } from "../../environment";
import type { TexturePair } from "../pro/textures";

/**
 * Canvas textures for the Mark Diesel kit's exterior: one atlas for the brick
 * and limestone walls, and the big end window. All procedural, no logos.
 * Canvas y = 0 is the texture's top (v = 1).
 *
 * The palette follows the building: reddish-brown brick on an Indiana
 * limestone base, limestone belts and copings, dark glass in steel frames.
 */

type G = CanvasRenderingContext2D;

/** Meters of wall one atlas tile spans along `u` (one structural bay). */
export const DIESEL_FACADE_BAY = 16;

/** Atlas size in pixels. */
const ATLAS_W = 1024;
const ATLAS_H = 2048;

/** Atlas rows from the canvas top, in pixels, with the height each was drawn for. */
const ROWS = {
    /** Limestone base with entrance doors. */
    base: { top: 0, px: 224, meters: 8 },
    /** Brick bays: piers and a group of three tall windows. */
    body: { top: 224, px: 800, meters: 30 },
    /** Brick with a row of small windows under a limestone cornice. */
    attic: { top: 1024, px: 256, meters: 9 },
    /** Brick with two limestone belts; stacks for the gables. */
    plain: { top: 1280, px: 448, meters: 16 },
    /** A tower face: limestone quoins and one tall glass slot. One tile per face. */
    tower: { top: 1728, px: 320, meters: 36 },
} as const;

export type DieselFacadeBand = keyof typeof ROWS;

/** Pixels kept clear at a band's edges so mip levels don't bleed into it. */
const BAND_INSET = 2;

const bandV = (name: DieselFacadeBand): [number, number] => {
    const { top, px } = ROWS[name];
    return [
        1 - (top + px - BAND_INSET) / ATLAS_H,
        1 - (top + BAND_INSET) / ATLAS_H,
    ];
};

/** Each band's `v` range in the atlas: [bottom of the wall, top of the wall]. */
export const DIESEL_FACADE_BANDS: Readonly<
    Record<DieselFacadeBand, [number, number]>
> = {
    base: bandV("base"),
    body: bandV("body"),
    attic: bandV("attic"),
    plain: bandV("plain"),
    tower: bandV("tower"),
};

/** The wall height each band was painted for, in meters. */
export const DIESEL_FACADE_BAND_HEIGHT: Readonly<
    Record<DieselFacadeBand, number>
> = {
    base: ROWS.base.meters,
    body: ROWS.body.meters,
    attic: ROWS.attic.meters,
    plain: ROWS.plain.meters,
    tower: ROWS.tower.meters,
};

const BRICK = "#7a4636";
const BRICK_PIER = "#84503e";
const LIMESTONE = "#cdc3ab";
const LIMESTONE_SHADE = "#a89f8a";
const GLASS_TOP = "#33465c";
const GLASS_BOTTOM = "#141d28";
const FRAME = "#2b3038";

/** Running-bond brick with course and brick tone variation. */
function brick(
    g: G,
    x: number,
    y: number,
    w: number,
    h: number,
    seed: number,
    base = BRICK,
): void {
    const rnd = createRng(seed);
    g.fillStyle = base;
    g.fillRect(x, y, w, h);
    const course = 3;
    const len = 13;
    let row = 0;
    for (let cy = y; cy < y + h; cy += course, row++) {
        const shift = row % 2 === 0 ? 0 : len / 2;
        for (let cx = x - shift; cx < x + w; cx += len) {
            const r = rnd();
            if (r < 0.55) continue;
            const tone = r > 0.8 ? "32,14,10" : "190,128,100";
            g.fillStyle = `rgba(${tone},${0.06 + rnd() * 0.12})`;
            const x0 = Math.max(x, cx);
            g.fillRect(
                x0,
                cy,
                Math.min(len - 1, x + w - x0),
                Math.min(course, y + h - cy),
            );
        }
        g.fillStyle = "rgba(214,196,176,0.2)";
        g.fillRect(x, cy, w, 1);
    }
}

/** Limestone ashlar: staggered joints and a little tone per block. */
function limestone(
    g: G,
    x: number,
    y: number,
    w: number,
    h: number,
    seed: number,
    blockH = 17,
    blockW = 72,
): void {
    const rnd = createRng(seed);
    g.fillStyle = LIMESTONE;
    g.fillRect(x, y, w, h);
    let row = 0;
    for (let cy = y; cy < y + h; cy += blockH, row++) {
        const shift = row % 2 === 0 ? 0 : blockW / 2;
        for (let cx = x - shift; cx < x + w; cx += blockW) {
            const x0 = Math.max(x, cx);
            const bw = Math.min(cx + blockW, x + w) - x0;
            const bh = Math.min(blockH, y + h - cy);
            if (bw <= 0) continue;
            const l = rnd() > 0.5 ? "255,250,236" : "120,108,88";
            g.fillStyle = `rgba(${l},${0.03 + rnd() * 0.08})`;
            g.fillRect(x0, cy, bw, bh);
            g.fillStyle = "rgba(92,84,68,0.3)";
            g.fillRect(x0, cy, 1, bh);
        }
        g.fillStyle = "rgba(92,84,68,0.3)";
        g.fillRect(x, cy, w, 1);
    }
}

/** A limestone belt with a shadow line under it. */
function belt(g: G, x: number, y: number, w: number, h: number): void {
    g.fillStyle = LIMESTONE;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,252,240,0.35)";
    g.fillRect(x, y, w, 1);
    g.fillStyle = "rgba(40,26,20,0.4)";
    g.fillRect(x, y + h, w, 2);
}

/** Dark glass in a steel frame with a mullion grid. */
function glazing(
    g: G,
    x: number,
    y: number,
    w: number,
    h: number,
    cols: number,
    rowPx: number,
): void {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, GLASS_TOP);
    grad.addColorStop(1, GLASS_BOTTOM);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
    g.fillStyle = FRAME;
    for (let i = 1; i < cols; i++) g.fillRect(x + (i * w) / cols - 1, y, 2, h);
    for (let r = y + rowPx; r < y + h - 4; r += rowPx) g.fillRect(x, r, w, 2);
    g.strokeStyle = FRAME;
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

/** Where the glass is in each band, shared by the color and glow layers. */
const BODY_WINDOWS = { xs: [212, 432, 652], w: 160, top: 86, bottom: 60 };
const ATTIC_WINDOWS = { count: 6, w: 64, top: 96, h: 84 };
const DOORS = { xs: [176, 608], w: 240, h: 104 };
const TOWER_SLOT = { x: 352, w: 320, top: 30, bottom: 24 };

function paintBase(g: G): void {
    const { top, px } = ROWS.base;
    limestone(g, 0, top, ATLAS_W, px, 5, 22, 96);
    // A darker plinth course at the ground and a water table on top.
    g.fillStyle = "rgba(70,62,50,0.28)";
    g.fillRect(0, top + px - 20, ATLAS_W, 20);
    belt(g, 0, top, ATLAS_W, 10);
    for (const x of DOORS.xs) {
        const y = top + px - DOORS.h;
        g.fillStyle = LIMESTONE_SHADE;
        g.fillRect(x - 10, y - 10, DOORS.w + 20, DOORS.h + 10);
        glazing(g, x, y, DOORS.w, DOORS.h, 6, 44);
    }
}

function paintBody(g: G): void {
    const { top, px } = ROWS.body;
    brick(g, 0, top, ATLAS_W, px, 7);
    // Limestone belts through the brick at the thirds.
    for (const f of [0.34, 0.67]) belt(g, 0, top + px * f, ATLAS_W, 9);
    // Piers at the bay edges, with a limestone cap and foot.
    for (const x of [0, ATLAS_W - 52]) {
        brick(g, x, top, 52, px, 9 + x, BRICK_PIER);
        g.fillStyle = "rgba(30,14,10,0.35)";
        g.fillRect(x === 0 ? 52 : x - 3, top, 3, px);
        belt(g, x, top + 4, 52, 22);
        belt(g, x, top + px - 26, 52, 22);
    }
    const { xs, w, top: wt, bottom: wb } = BODY_WINDOWS;
    const y0 = top + wt;
    const h = px - wt - wb;
    // One limestone surround for the group, then the three lights.
    g.fillStyle = LIMESTONE;
    g.fillRect(xs[0] - 14, y0 - 30, xs[2] + w - xs[0] + 28, 30);
    g.fillRect(xs[0] - 14, y0 + h, xs[2] + w - xs[0] + 28, 16);
    g.fillStyle = "rgba(40,26,20,0.4)";
    g.fillRect(xs[0] - 14, y0 + h + 16, xs[2] + w - xs[0] + 28, 3);
    for (const x of xs) {
        g.fillStyle = "rgba(30,14,10,0.45)";
        g.fillRect(x - 5, y0, w + 10, h);
        glazing(g, x, y0, w, h, 4, 58);
    }
}

function paintAttic(g: G): void {
    const { top, px } = ROWS.attic;
    brick(g, 0, top, ATLAS_W, px, 13);
    // Cornice: a deep limestone course with a shadow under its lip.
    limestone(g, 0, top, ATLAS_W, 40, 15, 20, 128);
    g.fillStyle = "rgba(255,252,240,0.4)";
    g.fillRect(0, top, ATLAS_W, 3);
    g.fillStyle = "rgba(30,18,12,0.5)";
    g.fillRect(0, top + 40, ATLAS_W, 5);
    belt(g, 0, top + px - 14, ATLAS_W, 10);
    const { count, w, top: wt, h } = ATTIC_WINDOWS;
    for (let i = 0; i < count; i++) {
        const x = ((i + 0.5) * ATLAS_W) / count - w / 2;
        g.fillStyle = LIMESTONE;
        g.fillRect(x - 6, top + wt - 8, w + 12, h + 16);
        glazing(g, x, top + wt, w, h, 2, 42);
    }
}

function paintPlain(g: G): void {
    const { top, px } = ROWS.plain;
    brick(g, 0, top, ATLAS_W, px, 17);
    for (const f of [0.25, 0.75]) belt(g, 0, top + px * f - 6, ATLAS_W, 12);
    // Soot and rain under each belt, so a tall gable isn't one flat tone.
    for (const f of [0.25, 0.75]) {
        const y = top + px * f + 8;
        const run = g.createLinearGradient(0, y, 0, y + 70);
        run.addColorStop(0, "rgba(30,16,12,0.22)");
        run.addColorStop(1, "rgba(30,16,12,0)");
        g.fillStyle = run;
        g.fillRect(0, y, ATLAS_W, 70);
    }
}

function paintTower(g: G): void {
    const { top, px } = ROWS.tower;
    brick(g, 0, top, ATLAS_W, px, 19, BRICK_PIER);
    // Quoins up both edges.
    for (let y = top, i = 0; y < top + px; y += 16, i++) {
        const w = i % 2 === 0 ? 72 : 48;
        g.fillStyle = i % 2 === 0 ? LIMESTONE : LIMESTONE_SHADE;
        g.fillRect(0, y, w, 15);
        g.fillRect(ATLAS_W - w, y, w, 15);
    }
    belt(g, 0, top, ATLAS_W, 12);
    const { x, w, top: st, bottom: sb } = TOWER_SLOT;
    g.fillStyle = LIMESTONE;
    g.fillRect(x - 22, top + st - 12, w + 44, px - st - sb + 24);
    glazing(g, x, top + st, w, px - st - sb, 5, 20);
}

/** Warm light behind a pane, brighter toward the bottom. */
function lit(g: G, x: number, y: number, w: number, h: number, a = 1): void {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, `rgba(255,196,124,${0.45 * a})`);
    grad.addColorStop(1, `rgba(255,220,160,${0.95 * a})`);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
}

function paintGlow(g: G): void {
    const rnd = createRng(23);
    // Doors, and the base catching the plaza's light.
    {
        const { top, px } = ROWS.base;
        const foot = g.createLinearGradient(0, top, 0, top + px);
        foot.addColorStop(0, "rgba(150,124,92,0.3)");
        foot.addColorStop(1, "rgba(214,180,134,0.6)");
        g.fillStyle = foot;
        g.fillRect(0, top, ATLAS_W, px);
        for (const x of DOORS.xs)
            lit(g, x, top + px - DOORS.h, DOORS.w, DOORS.h, 1);
    }
    // A wash up the brick from the base, and the tall windows.
    {
        const { top, px } = ROWS.body;
        const wash = g.createLinearGradient(0, top, 0, top + px);
        wash.addColorStop(0, "rgba(96,58,40,0.12)");
        wash.addColorStop(0.6, "rgba(150,92,62,0.34)");
        wash.addColorStop(1, "rgba(206,134,88,0.62)");
        g.fillStyle = wash;
        g.fillRect(0, top, ATLAS_W, px);
        for (const x of [26, ATLAS_W - 26]) {
            g.save();
            g.translate(x, top + px);
            g.scale(1, 6);
            const r = 70;
            const up = g.createRadialGradient(0, 0, 0, 0, 0, r);
            up.addColorStop(0, "rgba(255,206,150,0.5)");
            up.addColorStop(1, "rgba(255,190,130,0)");
            g.fillStyle = up;
            g.fillRect(-r, -r, 2 * r, r);
            g.restore();
        }
        const { xs, w, top: wt, bottom: wb } = BODY_WINDOWS;
        for (const x of xs) lit(g, x, top + wt, w, px - wt - wb, 0.9);
    }
    // Some attic windows are lit, and the cornice holds a thin line.
    {
        const { top } = ROWS.attic;
        const { count, w, top: wt, h } = ATTIC_WINDOWS;
        for (let i = 0; i < count; i++) {
            const x = ((i + 0.5) * ATLAS_W) / count - w / 2;
            lit(g, x, top + wt, w, h, 0.35 + rnd() * 0.6);
        }
        g.fillStyle = "rgba(255,232,196,0.7)";
        g.fillRect(0, top + 36, ATLAS_W, 5);
    }
    // Gables: only a faint wash, so the roofline reads against the sky.
    {
        const { top, px } = ROWS.plain;
        g.fillStyle = "rgba(120,74,52,0.2)";
        g.fillRect(0, top, ATLAS_W, px);
    }
    {
        const { top, px } = ROWS.tower;
        g.fillStyle = "rgba(150,96,66,0.3)";
        g.fillRect(0, top, ATLAS_W, px);
        const { x, w, top: st, bottom: sb } = TOWER_SLOT;
        lit(g, x, top + st, w, px - st - sb, 1);
    }
}

/**
 * The wall atlas and its night glow (lit windows and doors, and a warm wash
 * up the brick). `scale` shrinks both canvases for low quality.
 */
export function dieselFacadeTextures(scale = 1): TexturePair {
    const sized =
        (paint: (g: G) => void, s: number) =>
        (g: G): void => {
            g.save();
            g.scale(s, s);
            paint(g);
            g.restore();
        };
    const map = paintCanvasTexture(
        Math.round(ATLAS_W * scale),
        Math.round(ATLAS_H * scale),
        sized((g) => {
            paintBase(g);
            paintBody(g);
            paintAttic(g);
            paintPlain(g);
            paintTower(g);
        }, scale),
        { repeat: true },
    );
    const glowScale = scale * 0.5;
    const emissive = paintCanvasTexture(
        Math.round(ATLAS_W * glowScale),
        Math.round(ATLAS_H * glowScale),
        sized((g) => {
            g.fillStyle = "#000";
            g.fillRect(0, 0, ATLAS_W, ATLAS_H);
            paintGlow(g);
        }, glowScale),
        { repeat: true },
    );
    return { map, emissive };
}

/**
 * The end window's grid, as fractions of the wall: six sliding panels, each
 * six lites wide, with a transom about every 2.4 m (eleven rows over 26.8 m).
 */
export const DIESEL_WINDOW_GRID = { panels: 6, lites: 6, rows: 11 } as const;

export interface DieselWindowTextures {
    /** Dark glass and steel bars, lit by the scene. */
    map: CanvasTexture;
    /** Seen from inside by day: sky and a hazy skyline. */
    dayView: CanvasTexture;
    /** Seen from inside at night: a dark sky and a lit skyline. */
    nightView: CanvasTexture;
    /** Seen from outside at night: the lit bowl behind the glass. */
    interiorGlow: CanvasTexture;
}

const WINDOW_W = 1024;
const WINDOW_H = 512;

/** The steel grid: panel frames, lites and transoms. */
function windowBars(g: G, heavy: number, light: number): void {
    const { panels, lites, rows } = DIESEL_WINDOW_GRID;
    const pw = WINDOW_W / panels;
    for (let p = 0; p < panels; p++)
        for (let i = 1; i < lites; i++)
            g.fillRect(
                p * pw + (i * pw) / lites - light / 2,
                0,
                light,
                WINDOW_H,
            );
    for (let r = 1; r < rows; r++)
        g.fillRect(0, (r * WINDOW_H) / rows - light / 2, WINDOW_W, light);
    for (let p = 0; p <= panels; p++)
        g.fillRect(p * pw - heavy / 2, 0, heavy, WINDOW_H);
    g.fillRect(0, 0, WINDOW_W, heavy);
    g.fillRect(0, WINDOW_H - heavy, WINDOW_W, heavy);
}

/** A made-up skyline: boxes of random width and height along the sill. */
function skyline(
    g: G,
    seed: number,
    body: string,
    far: string,
    windows: string | null,
): void {
    const rnd = createRng(seed);
    const row = (
        color: string,
        maxH: number,
        minW: number,
        dots: boolean,
    ): void => {
        for (let x = -20; x < WINDOW_W; ) {
            const w = minW + rnd() * minW * 1.4;
            const tall = rnd() > 0.72;
            const h = (tall ? 0.55 + rnd() * 0.45 : 0.18 + rnd() * 0.3) * maxH;
            g.fillStyle = color;
            g.fillRect(x, WINDOW_H - h, w, h);
            if (tall && rnd() > 0.5)
                g.fillRect(x + w * 0.3, WINDOW_H - h - 14, w * 0.4, 14);
            if (dots && windows) {
                g.fillStyle = windows;
                for (let wy = WINDOW_H - h + 5; wy < WINDOW_H - 6; wy += 7)
                    for (let wx = x + 4; wx < x + w - 4; wx += 6)
                        if (rnd() > 0.62) g.fillRect(wx, wy, 3, 3);
            }
            x += w + rnd() * 10;
        }
    };
    row(far, 150, 34, false);
    row(body, 230, 46, true);
}

/** The end window wall's textures; each maps once across the whole wall. */
export function dieselWindowTextures(): DieselWindowTextures {
    const map = paintCanvasTexture(WINDOW_W, WINDOW_H, (g) => {
        const pane = g.createLinearGradient(0, 0, 0, WINDOW_H);
        pane.addColorStop(0, "#111821");
        pane.addColorStop(1, "#090c11");
        g.fillStyle = pane;
        g.fillRect(0, 0, WINDOW_W, WINDOW_H);
        g.fillStyle = "#6d727a";
        windowBars(g, 12, 4);
    });
    const dayView = paintCanvasTexture(WINDOW_W, WINDOW_H, (g) => {
        const sky = g.createLinearGradient(0, 0, 0, WINDOW_H);
        sky.addColorStop(0, "#8fb6e4");
        sky.addColorStop(0.6, "#cfe0f0");
        sky.addColorStop(1, "#eef2f2");
        g.fillStyle = sky;
        g.fillRect(0, 0, WINDOW_W, WINDOW_H);
        skyline(g, 61, "#8a98a8", "#b4c2d0", null);
        g.fillStyle = "#000";
        windowBars(g, 12, 4);
    });
    const nightView = paintCanvasTexture(WINDOW_W, WINDOW_H, (g) => {
        const sky = g.createLinearGradient(0, 0, 0, WINDOW_H);
        sky.addColorStop(0, "#04060c");
        sky.addColorStop(0.7, "#101828");
        sky.addColorStop(1, "#3a2c22");
        g.fillStyle = sky;
        g.fillRect(0, 0, WINDOW_W, WINDOW_H);
        skyline(g, 61, "#0a0e16", "#141c2a", "rgba(255,214,150,0.9)");
        g.fillStyle = "#000";
        windowBars(g, 12, 4);
    });
    const interiorGlow = paintCanvasTexture(WINDOW_W, WINDOW_H, (g) => {
        const glow = g.createLinearGradient(0, 0, 0, WINDOW_H);
        glow.addColorStop(0, "rgba(150,170,200,0.55)");
        glow.addColorStop(0.5, "rgba(236,214,170,0.75)");
        glow.addColorStop(1, "rgba(255,226,176,1)");
        g.fillStyle = "#000";
        g.fillRect(0, 0, WINDOW_W, WINDOW_H);
        g.fillStyle = glow;
        g.fillRect(0, 0, WINDOW_W, WINDOW_H);
        g.fillStyle = "#000";
        windowBars(g, 12, 4);
    });
    return { map, dayView, nightView, interiorGlow };
}

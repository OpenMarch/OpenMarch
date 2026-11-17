// cspell:ignore purlins
import type { CanvasTexture } from "three";
import { createRng, paintCanvasTexture } from "../../environment";

/**
 * Canvas textures for the pro dome. All procedural: nothing is downloaded or
 * bundled. Canvas y = 0 is the texture's top (v = 1). Bands built by
 * `bandGeometry` run `v` from the lower ring (0) to the upper one (1), so on
 * a vertical wall the canvas top is the top of the wall.
 *
 * The palette is neutral on purpose (gray concrete, charcoal seats, dark
 * glass): the field is the brightest, most colorful thing in the frame.
 */

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** A color and an emissive texture painted on the same layout. */
export interface TexturePair {
    map: CanvasTexture;
    emissive: CanvasTexture;
}

function pair(
    w: number,
    h: number,
    color: Paint,
    glow: Paint,
    repeat = true,
    glowScale = 1,
): TexturePair {
    return {
        map: paintCanvasTexture(w, h, color, { repeat }),
        emissive: paintCanvasTexture(
            Math.round(w * glowScale),
            Math.round(h * glowScale),
            (g, cw, ch) => {
                g.fillStyle = "#000";
                g.fillRect(0, 0, cw, ch);
                g.save();
                g.scale(glowScale, glowScale);
                glow(g, w, h);
                g.restore();
            },
            { repeat },
        ),
    };
}

/**
 * One seating section, one row deep: a concrete walkway at the front of the
 * tread, charcoal seats behind it and a half aisle with a stair nosing at
 * each side. `u` spans one section (`ringSections`), `v` one tread.
 */
export function seatTexture(): CanvasTexture {
    return paintCanvasTexture(
        512,
        64,
        (g, w, h) => {
            g.fillStyle = "#66686b";
            g.fillRect(0, 0, w, h);
            const seatTop = 4;
            const seatBottom = 40;
            g.fillStyle = "#232a36";
            g.fillRect(0, seatTop, w, seatBottom - seatTop);
            const seatW = 11;
            for (let x = 0; x < w; x += seatW) {
                // Seat back (top), seat pan, and a shadow line between seats.
                g.fillStyle = "#1a2029";
                g.fillRect(x, seatTop, seatW - 2, 10);
                g.fillStyle = "#2d3542";
                g.fillRect(x + 1, seatTop + 12, seatW - 3, seatBottom - 18);
                g.fillStyle = "#12161d";
                g.fillRect(x + seatW - 2, seatTop, 2, seatBottom - seatTop);
            }
            g.fillStyle = "rgba(0,0,0,0.35)";
            g.fillRect(0, seatBottom, w, 5);
            // Aisle steps: plain concrete, a worn nosing at the front edge.
            const aisle = 26;
            for (const x of [0, w - aisle]) {
                g.fillStyle = "#787a7c";
                g.fillRect(x, 0, aisle, h);
                g.fillStyle = "#b7b197";
                g.fillRect(x, h - 5, aisle, 5);
            }
        },
        { repeat: true },
    );
}

/** Neutral weathered concrete with form joints, stains and a little grain. */
export function concreteTexture(): CanvasTexture {
    const rnd = createRng(17);
    return paintCanvasTexture(
        512,
        256,
        (g, w, h) => {
            g.fillStyle = "#8e8f8d";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 90; i++) {
                const x = rnd() * w;
                const y = rnd() * h;
                const r = 12 + rnd() * 46;
                const dark = rnd() > 0.45;
                const a = 0.03 + rnd() * 0.06;
                const blot = g.createRadialGradient(x, y, 0, x, y, r);
                const c = dark ? "48,48,46" : "190,190,184";
                blot.addColorStop(0, `rgba(${c},${a})`);
                blot.addColorStop(1, `rgba(${c},0)`);
                g.fillStyle = blot;
                g.fillRect(x - r, y - r, 2 * r, 2 * r);
            }
            // Water stains that run down from the top edge.
            for (let i = 0; i < 26; i++) {
                const x = rnd() * w;
                const len = 30 + rnd() * 130;
                const run = g.createLinearGradient(0, 0, 0, len);
                run.addColorStop(0, "rgba(50,48,44,0.14)");
                run.addColorStop(1, "rgba(50,48,44,0)");
                g.fillStyle = run;
                g.fillRect(x, 0, 2 + rnd() * 5, len);
            }
            // Form joints.
            g.fillStyle = "rgba(40,40,40,0.28)";
            for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
            g.fillRect(0, h / 2, w, 2);
        },
        { repeat: true },
    );
}

/** A warm-lit suite window per tile fraction, with people at the glass. */
export function suiteTexture(): CanvasTexture {
    const rnd = createRng(31);
    return paintCanvasTexture(
        1024,
        128,
        (g, w, h) => {
            const n = 8;
            const sw = w / n;
            for (let i = 0; i < n; i++) {
                const x = i * sw;
                const lit = 0.5 + rnd() * 0.5;
                const grad = g.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, `rgba(240,216,172,${lit})`);
                grad.addColorStop(0.55, `rgba(150,118,84,${lit * 0.8})`);
                grad.addColorStop(1, `rgba(52,40,32,${lit * 0.9})`);
                g.fillStyle = "#14161c";
                g.fillRect(x, 0, sw, h);
                g.fillStyle = grad;
                g.fillRect(x, 0, sw, h);
                g.fillStyle = "rgba(255,245,220,0.8)";
                for (let k = 0; k < 3; k++)
                    g.fillRect(x + 16 + k * 40, 8, 18, 4);
                const people = Math.floor(rnd() * 4);
                for (let k = 0; k < people; k++) {
                    const px = x + 12 + rnd() * (sw - 30);
                    g.fillStyle = `rgba(20,16,14,${0.7 + rnd() * 0.3})`;
                    g.fillRect(px, h - 70, 12, 70);
                    g.beginPath();
                    g.arc(px + 6, h - 78, 7, 0, Math.PI * 2);
                    g.fill();
                }
                g.fillStyle = "#0b0c10";
                g.fillRect(x, 0, 6, h);
                g.fillRect(x + sw / 2 - 2, 0, 3, h);
                g.fillRect(x, h - 26, sw, 5);
            }
            g.fillStyle = "#0b0c10";
            g.fillRect(0, 0, w, 4);
            g.fillRect(0, h - 4, w, 4);
        },
        { repeat: true },
    );
}

/** Exterior heights in the facade texture, meters above the ground. */
export const FACADE_LAYOUT = {
    /** Wall height the texture's v spans. */
    height: 52,
    /** Precast plinth with entrances. */
    base: 5,
    /** Top of the brick and its tall windows. */
    brick: 33,
    /** Top of the steel and glass band; above it is the cornice. */
    glass: 50.5,
} as const;

/**
 * The outside wall, one bay per tile (24 m): a precast plinth with doors,
 * muted brick with two tall rectangular windows in precast surrounds, a
 * string course, then a steel-and-glass band up to a cornice. The emissive
 * texture washes the wall from below with soft-edged light for night.
 */
export function facadeTextures(): TexturePair {
    const H = FACADE_LAYOUT.height;
    const W = 512;
    const CH = 1024;
    const y = (m: number) => CH * (1 - m / H);
    const L = FACADE_LAYOUT;
    const windows = [90, 326];
    const DOORS = [84, 320];
    const ww = 96;
    const winTop = y(L.brick - 4);
    const winBottom = y(L.base + 3);
    return pair(
        W,
        CH,
        (g) => {
            const rnd = createRng(11);
            g.fillStyle = "#6e5a4e";
            g.fillRect(0, 0, W, CH);
            for (let row = y(L.brick); row < y(L.base); row += 6) {
                const tone = rnd() > 0.5 ? "40,28,22" : "150,124,106";
                g.fillStyle = `rgba(${tone},${0.08 + rnd() * 0.1})`;
                g.fillRect(0, row, W, 6);
                g.fillStyle = "rgba(30,20,16,0.25)";
                g.fillRect(0, row, W, 1);
            }
            // Piers at the bay edges and the middle.
            g.fillStyle = "#7a6556";
            g.fillRect(0, y(L.brick), 24, y(L.base) - y(L.brick));
            g.fillRect(W - 24, y(L.brick), 24, y(L.base) - y(L.brick));
            g.fillRect(W / 2 - 12, y(L.brick), 24, y(L.base) - y(L.brick));
            for (const x of windows) {
                g.fillStyle = "#b9b4a7";
                g.fillRect(x - 8, winTop - 8, ww + 16, winBottom - winTop + 16);
                g.fillStyle = "#1c2633";
                g.fillRect(x, winTop, ww, winBottom - winTop);
                g.fillStyle = "#2f3a48";
                for (let m = 1; m < 4; m++)
                    g.fillRect(
                        x + (m * ww) / 4 - 2,
                        winTop,
                        4,
                        winBottom - winTop,
                    );
                for (let r = winTop + 40; r < winBottom; r += 40)
                    g.fillRect(x, r, ww, 3);
            }
            // Precast plinth, string course, doors.
            g.fillStyle = "#a9a59a";
            g.fillRect(0, y(L.base), W, CH - y(L.base));
            g.fillRect(0, y(L.brick + 1.4), W, y(L.brick) - y(L.brick + 1.4));
            g.fillStyle = "#94908a";
            g.fillRect(0, y(L.base) - 4, W, 8);
            g.fillStyle = "#20252c";
            for (const x of DOORS) g.fillRect(x, y(3.6), 112, y(0) - y(3.6));
            // Steel and glass band.
            const gTop = y(L.glass);
            const gBot = y(L.brick + 1.4);
            const glass = g.createLinearGradient(0, gTop, 0, gBot);
            glass.addColorStop(0, "#5a6f88");
            glass.addColorStop(1, "#2a3a4f");
            g.fillStyle = glass;
            g.fillRect(0, gTop, W, gBot - gTop);
            g.fillStyle = "#b4b8be";
            for (let x = 0; x <= W; x += 32)
                g.fillRect(x - 2, gTop, 4, gBot - gTop);
            for (let r = gTop; r < gBot; r += 52) g.fillRect(0, r, W, 3);
            g.fillStyle = "#d9d7d0";
            g.fillRect(0, 0, W, gTop);
            g.fillStyle = "rgba(0,0,0,0.2)";
            g.fillRect(0, gTop - 4, W, 4);
        },
        (g) => {
            // A warm wash up the brick, strongest at the concourse line.
            const wash = g.createLinearGradient(0, y(L.brick), 0, y(L.base));
            wash.addColorStop(0, "rgba(92,62,44,0.28)");
            wash.addColorStop(0.65, "rgba(150,100,70,0.5)");
            wash.addColorStop(1, "rgba(196,136,92,0.72)");
            g.fillStyle = wash;
            g.fillRect(0, y(L.brick), W, y(L.base) - y(L.brick));
            // Lights grazing each pier from below: tall, with no visible edge.
            for (const x of [0, W / 2, W]) {
                g.save();
                g.translate(x, y(L.base));
                g.scale(1, 5.2);
                const r = 62;
                const up = g.createRadialGradient(0, 0, 0, 0, 0, r);
                up.addColorStop(0, "rgba(255,206,150,0.5)");
                up.addColorStop(0.5, "rgba(255,190,130,0.16)");
                up.addColorStop(1, "rgba(255,190,130,0)");
                g.fillStyle = up;
                g.fillRect(-r, -r, 2 * r, 2 * r);
                g.restore();
            }
            for (const x of windows) {
                const grad = g.createLinearGradient(0, winTop, 0, winBottom);
                grad.addColorStop(0, "rgba(255,196,124,0.42)");
                grad.addColorStop(1, "rgba(255,216,156,0.92)");
                g.fillStyle = grad;
                g.fillRect(x, winTop, ww, winBottom - winTop);
            }
            g.fillStyle = "rgba(255,226,170,0.95)";
            for (const x of DOORS) g.fillRect(x, y(3.6), 112, y(0) - y(3.6));
            // The plinth catches the plaza's light.
            const foot = g.createLinearGradient(0, y(L.base), 0, CH);
            foot.addColorStop(0, "rgba(170,140,106,0.34)");
            foot.addColorStop(1, "rgba(220,186,140,0.62)");
            g.globalCompositeOperation = "lighter";
            g.fillStyle = foot;
            g.fillRect(0, y(L.base), W, CH - y(L.base));
            g.globalCompositeOperation = "source-over";
            // The glass band glows from the concourse inside.
            const band = g.createLinearGradient(
                0,
                y(L.glass),
                0,
                y(L.brick + 1.4),
            );
            band.addColorStop(0, "rgba(120,146,190,0.34)");
            band.addColorStop(1, "rgba(240,206,150,0.62)");
            g.fillStyle = band;
            g.fillRect(0, y(L.glass), W, y(L.brick + 1.4) - y(L.glass));
            // A thin, lit cornice so the roofline holds against the sky.
            g.fillStyle = "rgba(255,236,204,0.8)";
            g.fillRect(0, y(L.glass) - 8, W, 5);
        },
    );
}

/**
 * The inside of the outer wall, seen above the upper deck: dark panels, a
 * lit concourse strip and a band of clerestory glass under the roof.
 */
export function interiorWallTextures(rimTop: number): TexturePair {
    const H = FACADE_LAYOUT.height;
    const CH = 512;
    const W = 256;
    const y = (m: number) => CH * (1 - m / H);
    const strip = (g: CanvasRenderingContext2D) =>
        g.fillRect(0, y(rimTop + 2.2), W, y(rimTop + 1.2) - y(rimTop + 2.2));
    return pair(
        W,
        CH,
        (g) => {
            g.fillStyle = "#24272d";
            g.fillRect(0, 0, W, CH);
            g.fillStyle = "#1a1c21";
            for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 2, CH);
            const gTop = y(H - 4);
            const gBot = y(rimTop + 5);
            const glass = g.createLinearGradient(0, gTop, 0, gBot);
            glass.addColorStop(0, "#9fb0c2");
            glass.addColorStop(1, "#6d7f94");
            g.fillStyle = glass;
            g.fillRect(0, gTop, W, gBot - gTop);
            g.fillStyle = "#2c3038";
            for (let x = 0; x < W; x += 21) g.fillRect(x, gTop, 3, gBot - gTop);
            g.fillRect(0, (gTop + gBot) / 2, W, 3);
            g.fillStyle = "#e9dcc0";
            strip(g);
        },
        (g) => {
            g.fillStyle = "rgba(255,226,180,1)";
            strip(g);
        },
    );
}

/**
 * The end window wall: a glass curtain wall with heavy mullions every half
 * tile, lighter ones between and transoms. The panes are translucent (alpha),
 * and the emissive layer is the concourse glowing behind them at night.
 */
export function windowWallTextures(): TexturePair {
    const paintBars = (g: CanvasRenderingContext2D, w: number, h: number) => {
        for (let x = 0; x <= w; x += w / 8) g.fillRect(x - 3, 0, 6, h);
        for (let x = 0; x <= w; x += w / 2) g.fillRect(x - 8, 0, 16, h);
        for (let r = 0; r <= h; r += h / 16) g.fillRect(0, r - 3, w, 6);
        for (let r = 0; r <= h; r += h / 4) g.fillRect(0, r - 7, w, 14);
    };
    return pair(
        256,
        512,
        (g, w, h) => {
            g.clearRect(0, 0, w, h);
            const pane = g.createLinearGradient(0, 0, 0, h);
            pane.addColorStop(0, "rgba(186,204,222,0.42)");
            pane.addColorStop(1, "rgba(140,164,190,0.34)");
            g.fillStyle = pane;
            g.fillRect(0, 0, w, h);
            g.fillStyle = "rgba(52,58,68,1)";
            paintBars(g, w, h);
        },
        (g, w, h) => {
            const glow = g.createLinearGradient(0, 0, 0, h);
            glow.addColorStop(0, "rgba(120,150,200,0.5)");
            glow.addColorStop(0.55, "rgba(236,204,150,0.7)");
            glow.addColorStop(1, "rgba(255,216,160,0.95)");
            g.fillStyle = glow;
            g.fillRect(0, 0, w, h);
            g.fillStyle = "rgba(0,0,0,0.9)";
            paintBars(g, w, h);
        },
    );
}

/** Meters of roof one `roofDeckTexture` tile spans, four truss bays wide. */
export const ROOF_TILE = 72;

/**
 * The fixed roof's top, mapped in plan: four 18 m bays that line up with the
 * cross trusses, each a slightly different metal tone with a gutter, faint
 * standing seams, cross joints and weathering, and a row of skylights in
 * every other bay. Long parallel bays read as one roof, not a quilt.
 */
export function roofDeckTexture(): CanvasTexture {
    const rnd = createRng(3);
    const size = 1024;
    const bay = size / 4;
    return paintCanvasTexture(
        size,
        size,
        (g) => {
            const tones = ["#83878a", "#8d9193", "#7b8084", "#888c8d"];
            tones.forEach((tone, i) => {
                g.fillStyle = tone;
                g.fillRect(i * bay, 0, bay, size);
            });
            // Sheets across each bay, a little uneven in tone.
            for (let i = 0; i < 4; i++)
                for (let y = 0; y < size; y += bay / 2) {
                    const c = rnd() > 0.5 ? "255,255,255" : "40,44,50";
                    g.fillStyle = `rgba(${c},${0.02 + rnd() * 0.05})`;
                    g.fillRect(i * bay, y, bay, bay / 2);
                }
            g.fillStyle = "rgba(20,24,30,0.1)";
            for (let x = 0; x < size; x += 16) g.fillRect(x, 0, 1, size);
            // Weathering that runs the length of the bays.
            for (let i = 0; i < 40; i++) {
                const x = rnd() * size;
                const w = 6 + rnd() * 34;
                const y = rnd() * size;
                const len = 120 + rnd() * 380;
                const run = g.createLinearGradient(0, y, 0, y + len);
                run.addColorStop(0, "rgba(46,46,44,0)");
                run.addColorStop(0.5, "rgba(46,46,44,0.09)");
                run.addColorStop(1, "rgba(46,46,44,0)");
                g.fillStyle = run;
                g.fillRect(x, y, w, len);
            }
            // Skylights: glazed strips along every other bay, with curbs.
            for (const i of [1, 3])
                for (let y = 0; y < size; y += bay) {
                    const x = (i + 0.5) * bay - 24;
                    g.fillStyle = "#c2c5c6";
                    g.fillRect(x - 3, y + 33, 54, bay - 66);
                    g.fillStyle = "#3a4656";
                    g.fillRect(x, y + 36, 48, bay - 72);
                }
            // Cross joints, then the gutters over the trusses.
            g.fillStyle = "rgba(44,48,54,0.34)";
            for (let y = 0; y < size; y += bay) g.fillRect(0, y, size, 2);
            for (let i = 0; i < 4; i++) {
                g.fillStyle = "rgba(30,33,38,0.72)";
                g.fillRect(i * bay - 3, 0, 6, size);
                g.fillStyle = "rgba(226,228,226,0.3)";
                g.fillRect(i * bay + 3, 0, 2, size);
            }
        },
        { repeat: true },
    );
}

/**
 * The underside of one sliding panel, mapped once across it: corrugated deck
 * between purlins, with primary girders across the panel. Only seen from
 * below, so it also feeds the panel's faint glow, which keeps it legible.
 */
export function panelCeilingTexture(): CanvasTexture {
    const size = 1024;
    return paintCanvasTexture(size, size, (g) => {
        g.fillStyle = "#8f8f8b";
        g.fillRect(0, 0, size, size);
        // Corrugated deck: fine ribs along the slide.
        g.fillStyle = "rgba(30,30,28,0.22)";
        for (let y = 0; y < size; y += 6) g.fillRect(0, y, size, 2);
        // Purlins, about every 5 m: a lit flange with a shadow beside it.
        const purlins = 14;
        for (let i = 0; i <= purlins; i++) {
            const y = (i / purlins) * size;
            g.fillStyle = "rgba(14,14,14,0.42)";
            g.fillRect(0, y + 6, size, 9);
            g.fillStyle = "#b6b4b0";
            g.fillRect(0, y - 3, size, 9);
        }
        // Girders across the panel, about every 13 m, with cross bracing.
        const girders = 5;
        const span = size / girders;
        g.strokeStyle = "rgba(20,20,20,0.34)";
        g.lineWidth = 5;
        g.beginPath();
        for (let i = 0; i < girders; i++)
            for (let k = 0; k < 2; k++) {
                const x = i * span;
                const y = (k * size) / 2;
                g.moveTo(x, y);
                g.lineTo(x + span, y + size / 2);
                g.moveTo(x + span, y);
                g.lineTo(x, y + size / 2);
            }
        g.stroke();
        for (let i = 0; i <= girders; i++) {
            const x = i * span;
            g.fillStyle = "rgba(10,10,10,0.4)";
            g.fillRect(x + 7, 0, 12, size);
            g.fillStyle = "#bdbbb6";
            g.fillRect(x - 7, 0, 14, size);
        }
    });
}

/** The plan of the grounds, in meters from the field center (see `siteTextures`). */
export interface SiteLayout {
    /** Half the plane's side. */
    halfSize: number;
    /** The outer wall's half-extents and corner radius. */
    rx: number;
    rz: number;
    corner: number;
    /** Plaza depth beyond the wall. */
    plaza: number;
}

function roundedRect(
    g: CanvasRenderingContext2D,
    hx: number,
    hz: number,
    r: number,
): void {
    g.beginPath();
    g.moveTo(-hx + r, -hz);
    g.arcTo(hx, -hz, hx, hz, r);
    g.arcTo(hx, hz, -hx, hz, r);
    g.arcTo(-hx, hz, -hx, -hz, r);
    g.arcTo(-hx, -hz, hx, -hz, r);
    g.closePath();
}

/**
 * The grounds as one plan-view texture on a single plane: a paved plaza, an
 * avenue to each entrance, four parking lots broken up by planted medians,
 * and an alpha fade to nothing so the land layer takes over with no edge.
 * The hole under the building is transparent. The emissive layer holds the
 * plaza's night lighting, as soft pools that never show a boundary.
 */
export function siteTextures(site: SiteLayout): TexturePair {
    const { halfSize: S, rx, rz, corner, plaza } = site;
    const rnd = createRng(41);
    /** Runs `draw` with the context in meters, origin at the field center. */
    const inMeters = (
        g: CanvasRenderingContext2D,
        w: number,
        draw: () => void,
    ) => {
        g.save();
        g.translate(w / 2, w / 2);
        g.scale(w / (2 * S), w / (2 * S));
        draw();
        g.restore();
    };
    /** The four lots: x0, x1, z0, z1 in the +x +z quadrant, then mirrored. */
    const lotX0 = 26;
    const lotX1 = rx + 46;
    const lotZ0 = rz + plaza + 6;
    const lotZ1 = lotZ0 + 44;
    const signs = [-1, 1];
    const pool = (
        g: CanvasRenderingContext2D,
        x: number,
        z: number,
        r: number,
        a: number,
    ) => {
        const p = g.createRadialGradient(x, z, 0, x, z, r);
        p.addColorStop(0, `rgba(255,212,160,${a})`);
        p.addColorStop(0.45, `rgba(255,200,140,${a * 0.38})`);
        p.addColorStop(1, "rgba(255,200,140,0)");
        g.fillStyle = p;
        g.fillRect(x - r, z - r, 2 * r, 2 * r);
    };
    const size = 2048;
    const map = paintCanvasTexture(size, size, (g) => {
        inMeters(g, size, () => {
            // Lots first, so the plaza and avenues cross them cleanly.
            for (const sx of signs)
                for (const sz of signs) {
                    const x0 = Math.min(sx * lotX0, sx * lotX1);
                    const z0 = Math.min(sz * lotZ0, sz * lotZ1);
                    g.fillStyle = "#3d3f42";
                    g.fillRect(x0, z0, lotX1 - lotX0, lotZ1 - lotZ0);
                    // Planted medians with trees: big, even, quiet shapes.
                    for (let x = lotX0 + 14; x < lotX1 - 6; x += 22) {
                        const mx = sx * x;
                        g.fillStyle = "#4b5a3c";
                        g.fillRect(mx - 2, z0, 4, lotZ1 - lotZ0);
                        g.fillStyle = "#2e3d2a";
                        for (let t = 5; t < lotZ1 - lotZ0; t += 11) {
                            g.beginPath();
                            g.arc(mx, z0 + t, 3.4 + rnd() * 0.8, 0, 7);
                            g.fill();
                        }
                    }
                }
            // Avenues from the four entrances, then the plaza over them.
            g.fillStyle = "#807d76";
            g.fillRect(-11, -S, 22, 2 * S);
            g.fillRect(-S, -11, 2 * S, 22);
            g.fillStyle = "#8a877f";
            roundedRect(g, rx + plaza, rz + plaza, corner + plaza);
            g.fill();
            g.strokeStyle = "rgba(40,38,34,0.16)";
            g.lineWidth = 0.28;
            g.beginPath();
            for (let m = -S; m <= S; m += 9) {
                g.moveTo(m, -S);
                g.lineTo(m, S);
                g.moveTo(-S, m);
                g.lineTo(S, m);
            }
            g.stroke();
            // A planted strip along the plaza's outer edge.
            g.strokeStyle = "#4a5a3c";
            g.lineWidth = 3.2;
            roundedRect(
                g,
                rx + plaza - 1.6,
                rz + plaza - 1.6,
                corner + plaza - 1.6,
            );
            g.stroke();
            // The land layer takes over by the plane's edge.
            g.globalCompositeOperation = "destination-in";
            const fade = g.createRadialGradient(0, 0, S * 0.64, 0, 0, S * 0.98);
            fade.addColorStop(0, "rgba(0,0,0,1)");
            fade.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = fade;
            g.fillRect(-S, -S, 2 * S, 2 * S);
            // Nothing under the building.
            g.globalCompositeOperation = "destination-out";
            g.fillStyle = "#000";
            roundedRect(g, rx - 0.5, rz - 0.5, corner);
            g.fill();
            g.globalCompositeOperation = "source-over";
        });
    });
    const glowSize = 1024;
    const emissive = paintCanvasTexture(glowSize, glowSize, (g) => {
        g.fillStyle = "#000";
        g.fillRect(0, 0, glowSize, glowSize);
        inMeters(g, glowSize, () => {
            g.globalCompositeOperation = "lighter";
            // An even band of light against the wall, lit from the facade.
            const hx = rx + plaza * 0.42;
            const hz = rz + plaza * 0.42;
            for (let m = -hx; m <= hx; m += 16)
                for (const sz of signs) pool(g, m, sz * hz, 25, 0.26);
            for (let m = -hz; m <= hz; m += 16)
                for (const sx of signs) pool(g, sx * hx, m, 25, 0.26);
            // Brighter at the entrances, then down the avenues.
            for (const [x, z] of [
                [0, rz + plaza * 0.5],
                [0, -rz - plaza * 0.5],
                [rx + plaza * 0.5, 0],
                [-rx - plaza * 0.5, 0],
            ])
                pool(g, x, z, 46, 0.5);
            for (let m = 34; m < S * 0.42; m += 24) {
                for (const s of signs) {
                    pool(g, 0, s * (rz + m), 22, 0.2);
                    pool(g, s * (rx + m), 0, 22, 0.2);
                }
            }
            // A faint wash over the lots.
            for (const sx of signs)
                for (const sz of signs)
                    for (let x = lotX0 + 14; x < lotX1 - 6; x += 44)
                        pool(g, sx * x, sz * (lotZ0 + lotZ1) * 0.5, 34, 0.1);
        });
    });
    return { map, emissive };
}

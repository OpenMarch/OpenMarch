import { ClampToEdgeWrapping, RepeatWrapping, type CanvasTexture } from "three";
import {
    createRng,
    drawOpenMarchLogo,
    paintCanvasTexture,
    TEXTURE_FONT,
} from "../../environment";

/**
 * Canvas textures for the high school kits. Everything is procedural: no image
 * files, no network. Team colors are muted before they are painted on walls,
 * so nothing in the venue competes with the field.
 */

type G = CanvasRenderingContext2D;

/** "#rrggbb" to [r, g, b] (0..255); falls back to `fallback`. */
export function rgbOf(
    css: string,
    fallback = "#6442ff",
): [number, number, number] {
    const m =
        /^#([0-9a-f]{6})$/i.exec(css.trim()) ??
        /^#([0-9a-f]{6})$/i.exec(fallback);
    const n = parseInt(m ? m[1] : "6442ff", 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes a css color toward black (k < 0) or white (k > 0). */
export function shade(css: string, k: number): string {
    const [r, g, b] = rgbOf(css);
    const t = k < 0 ? 0 : 255;
    const a = Math.abs(k);
    const f = (c: number) => Math.round(c + (t - c) * a);
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** A team color taken down toward charcoal, for painted walls. */
export function muted(css: string, amount = 0.62): string {
    const [r, g, b] = rgbOf(css);
    const f = (c: number, base: number) => Math.round(c + (base - c) * amount);
    return `rgb(${f(r, 40)}, ${f(g, 42)}, ${f(b, 47)})`;
}

/** Sprinkles `n` tiny rectangles of random gray over the canvas (grain). */
function grain(
    g: G,
    w: number,
    h: number,
    n: number,
    alpha: number,
    seed: number,
    size = 1,
): void {
    const rnd = createRng(seed);
    for (let i = 0; i < n; i++) {
        const v = rnd() < 0.5 ? 0 : 255;
        g.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
        g.fillRect(rnd() * w, rnd() * h, size, size);
    }
}

/** A soft vertical drip stain starting at (x, y). */
function streak(
    g: G,
    x: number,
    y: number,
    w: number,
    len: number,
    color: string,
    alpha: number,
): void {
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, `rgba(${color},${alpha})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(x, y, w, len);
}

// ---------------------------------------------------------------------------
// Stands

export type StandKind = "aluminum" | "concrete";

/** Meters of stand length one texture repeat covers (24 ft plank lengths). */
export const STAND_TILE = 7.315;
/** V bands of the stand atlas. */
export const STAND_BANDS = {
    tread: [0.02, 0.4] as [number, number],
    riser: [0.43, 0.58] as [number, number],
    bench: [0.61, 0.72] as [number, number],
    aisle: [0.75, 0.84] as [number, number],
    side: [0.87, 0.99] as [number, number],
};

/** Stand surface atlas: treads, risers, seat planks, aisle steps and ends. */
export function standTexture(kind: StandKind): CanvasTexture {
    const tex = paintCanvasTexture(1024, 1024, (g, w, h) => {
        const band = (v: [number, number]) => {
            const top = h * (1 - v[1]);
            return { top, bot: h * (1 - v[0]), hgt: h * (v[1] - v[0]) };
        };
        const tread = band(STAND_BANDS.tread);
        const riser = band(STAND_BANDS.riser);
        const bench = band(STAND_BANDS.bench);
        const aisle = band(STAND_BANDS.aisle);
        const side = band(STAND_BANDS.side);
        const rnd = createRng(kind === "aluminum" ? 11 : 23);
        const plank = (top: number, hgt: number, base: string) => {
            g.fillStyle = base;
            g.fillRect(0, top, w, hgt);
            for (let i = 0; i < 700; i++) {
                const y = top + rnd() * hgt;
                const v = rnd() < 0.5 ? 255 : 50;
                g.fillStyle = `rgba(${v},${v},${v + 12},${0.03 + rnd() * 0.05})`;
                g.fillRect(rnd() * w * 0.6, y, 60 + rnd() * w * 0.7, 1);
            }
        };
        if (kind === "aluminum") {
            plank(tread.top, tread.hgt, "#b7bbc1");
            // three deck boards, worn brighter where people walk
            for (let i = 0; i < 26; i++) {
                const x = rnd() * w;
                const y = tread.top + tread.hgt * (0.45 + rnd() * 0.4);
                const grad = g.createRadialGradient(x, y, 0, x, y, 70);
                grad.addColorStop(0, "rgba(232,235,240,0.22)");
                grad.addColorStop(1, "rgba(232,235,240,0)");
                g.fillStyle = grad;
                g.fillRect(x - 70, y - 70, 140, 140);
            }
            g.fillStyle = "rgba(28,32,38,0.6)";
            for (const f of [0.34, 0.67]) {
                g.fillRect(0, tread.top + tread.hgt * f, w, 3);
            }
            const sh = g.createLinearGradient(
                0,
                tread.top,
                0,
                tread.top + tread.hgt * 0.16,
            );
            sh.addColorStop(0, "rgba(16,18,24,0.5)");
            sh.addColorStop(1, "rgba(16,18,24,0)");
            g.fillStyle = sh;
            g.fillRect(0, tread.top, w, tread.hgt * 0.16);
            g.fillStyle = "#dfe2e6";
            g.fillRect(0, tread.bot - 7, w, 7);
            g.fillStyle = "rgba(22,24,30,0.6)";
            g.fillRect(0, tread.top, 4, tread.hgt);
            // riser plate, darker, one rib and a line of bolts
            g.fillStyle = "#7f858e";
            g.fillRect(0, riser.top, w, riser.hgt);
            g.fillStyle = "rgba(255,255,255,0.16)";
            g.fillRect(0, riser.top + riser.hgt * 0.45, w, 4);
            g.fillStyle = "rgba(0,0,0,0.3)";
            g.fillRect(0, riser.top + riser.hgt * 0.45 + 4, w, 3);
            g.fillStyle = "rgba(34,38,44,0.65)";
            for (let x = 18; x < w; x += 56) {
                g.fillRect(x, riser.top + riser.hgt * 0.2, 4, 4);
            }
            // seat plank: brightest, with a seam and a worn middle
            plank(bench.top, bench.hgt, "#8a8d93");
            g.fillStyle = "rgba(255,255,255,0.14)";
            g.fillRect(0, bench.top + bench.hgt * 0.3, w, bench.hgt * 0.4);
            g.fillStyle = "rgba(22,24,30,0.5)";
            g.fillRect(0, bench.top + bench.hgt * 0.5, w, 2);
            // aisle step: dark grip with a faded safety nosing
            plank(aisle.top, aisle.hgt, "#969aa2");
            g.fillStyle = "#b99a3a";
            g.fillRect(0, aisle.bot - aisle.hgt * 0.18, w, aisle.hgt * 0.18);
            // galvanized end plates with bolts and chalky streaks
            g.fillStyle = "#737a83";
            g.fillRect(0, side.top, w, side.hgt);
            for (let i = 0; i < 80; i++) {
                streak(
                    g,
                    rnd() * w,
                    side.top + rnd() * side.hgt * 0.5,
                    2 + rnd() * 3,
                    20 + rnd() * side.hgt * 0.5,
                    rnd() < 0.7 ? "220,222,226" : "40,44,50",
                    0.08,
                );
            }
            grain(g, w, h, 16000, 0.16, 5);
        } else {
            g.fillStyle = "#ada79c";
            g.fillRect(0, tread.top, w, tread.hgt);
            // stains and wear where people walk, plus old gum and scuffs
            for (let i = 0; i < 260; i++) {
                const dark = rnd() < 0.6;
                const r = 6 + rnd() * 36;
                g.fillStyle = dark
                    ? `rgba(66,62,56,${0.03 + rnd() * 0.06})`
                    : `rgba(232,228,220,${0.03 + rnd() * 0.06})`;
                g.beginPath();
                g.ellipse(
                    rnd() * w,
                    tread.top + tread.hgt * (0.25 + rnd() * 0.75),
                    r * 2.4,
                    r,
                    0,
                    0,
                    Math.PI * 2,
                );
                g.fill();
            }
            g.fillStyle = "rgba(38,34,30,0.55)";
            for (let i = 0; i < 70; i++) {
                g.beginPath();
                g.arc(
                    rnd() * w,
                    tread.top + rnd() * tread.hgt,
                    1 + rnd() * 2,
                    0,
                    Math.PI * 2,
                );
                g.fill();
            }
            const sh = g.createLinearGradient(
                0,
                tread.top,
                0,
                tread.top + tread.hgt * 0.22,
            );
            sh.addColorStop(0, "rgba(32,28,24,0.55)");
            sh.addColorStop(1, "rgba(32,28,24,0)");
            g.fillStyle = sh;
            g.fillRect(0, tread.top, w, tread.hgt * 0.22);
            g.fillStyle = "#cdc8bc";
            g.fillRect(0, tread.bot - 10, w, 10);
            g.fillStyle = "rgba(42,38,34,0.6)";
            g.fillRect(0, tread.top, 3, tread.hgt);
            g.fillRect(w / 2, tread.top, 3, tread.hgt);
            // risers: board-formed, darkening down from each joint
            g.fillStyle = "#857f76";
            g.fillRect(0, riser.top, w, riser.hgt);
            g.fillStyle = "rgba(0,0,0,0.13)";
            for (let y = riser.top + 6; y < riser.bot; y += 14) {
                g.fillRect(0, y, w, 2);
            }
            for (let i = 0; i < 90; i++) {
                streak(
                    g,
                    rnd() * w,
                    riser.top,
                    2 + rnd() * 5,
                    riser.hgt * (0.5 + rnd() * 0.5),
                    "30,26,22",
                    0.16,
                );
            }
            g.fillStyle = "rgba(38,34,30,0.6)";
            g.fillRect(0, riser.top, 2, riser.hgt);
            g.fillRect(w / 2, riser.top, 2, riser.hgt);
            // aluminum seat planks bolted to the concrete
            plank(bench.top, bench.hgt, "#85888e");
            g.fillStyle = "rgba(22,24,30,0.5)";
            g.fillRect(0, bench.top + bench.hgt * 0.5, w, 2);
            // aisle step: painted nosing
            g.fillStyle = "#8c867c";
            g.fillRect(0, aisle.top, w, aisle.hgt);
            g.fillStyle = "#b99a3a";
            g.fillRect(0, aisle.bot - aisle.hgt * 0.16, w, aisle.hgt * 0.16);
            // end walls: board-formed concrete with form ties and rust stains
            g.fillStyle = "#99948a";
            g.fillRect(0, side.top, w, side.hgt);
            g.fillStyle = "rgba(0,0,0,0.1)";
            for (let y = side.top + 9; y < side.bot; y += 16) {
                g.fillRect(0, y, w, 2);
            }
            g.fillStyle = "rgba(56,52,46,0.4)";
            for (let x = 22; x < w; x += 48) {
                for (let y = side.top + 14; y < side.bot; y += 32) {
                    g.fillRect(x, y, 3, 3);
                }
            }
            for (let i = 0; i < 60; i++) {
                streak(
                    g,
                    rnd() * w,
                    side.top + rnd() * side.hgt * 0.4,
                    2 + rnd() * 4,
                    30 + rnd() * side.hgt * 0.6,
                    rnd() < 0.5 ? "110,70,40" : "40,36,32",
                    0.12,
                );
            }
            grain(g, w, h, 26000, 0.2, 9);
        }
    });
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

export interface WallRun {
    color: string;
    text: string;
    length: number;
    height: number;
    /** Dark gate openings along a tall concrete wall. */
    gates: boolean;
}

/**
 * The fronts of the stands, one strip each down the canvas: painted charcoal
 * panels, a thin stripe of team color and plain block letters. The team color
 * stays a stripe so the wall never fights the field.
 */
export function wallTexture(runs: WallRun[]): CanvasTexture {
    const W = 2048;
    const stripH = 128;
    return paintCanvasTexture(W, stripH * runs.length, (g) => {
        runs.forEach((run, r) => {
            const y0 = r * stripH;
            const k = W / run.length;
            g.fillStyle = "#34373d";
            g.fillRect(0, y0, W, stripH);
            const rnd = createRng(3 + r);
            for (let i = 0; i < 400; i++) {
                const v = rnd() < 0.5 ? 255 : 0;
                g.fillStyle = `rgba(${v},${v},${v},0.04)`;
                g.fillRect(rnd() * W, y0 + rnd() * stripH, 3, 12);
            }
            const pad = Math.max(6, ft8(k));
            g.fillStyle = "rgba(8,9,12,0.55)";
            for (let x = 0; x < W; x += pad) g.fillRect(x, y0, 2, stripH);
            g.fillStyle = muted(run.color, 0.35);
            g.fillRect(0, y0, W, 9);
            g.fillStyle = "rgba(0,0,0,0.3)";
            g.fillRect(0, y0 + stripH - 6, W, 6);
            if (run.gates) {
                const n = Math.max(1, Math.round(run.length / 24));
                for (let i = 0; i < n; i++) {
                    const cx = (W * (i + 0.5)) / n;
                    const gw = 2.6 * k;
                    g.fillStyle = "#17181c";
                    g.fillRect(cx - gw / 2, y0 + stripH * 0.28, gw, stripH);
                    g.fillStyle = "#6a6d73";
                    g.fillRect(cx - gw / 2 - 2, y0 + stripH * 0.25, gw + 4, 3);
                }
            }
            if (!run.text) return;
            g.fillStyle = "#e7e4dc";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.font = `800 58px ${TEXTURE_FONT}`;
            const sx = (stripH / run.height / k) * 1.05;
            const repeats = run.length > 70 ? 3 : 2;
            for (let i = 0; i < repeats; i++) {
                const cx = (W * (i + 0.5)) / repeats + (run.gates ? W / 50 : 0);
                g.save();
                g.translate(cx, y0 + stripH / 2 + 4);
                g.scale(1 / sx, 1);
                g.fillText(run.text, 0, 0);
                g.restore();
            }
        });
    });
}

function ft8(pxPerMeter: number): number {
    return Math.round(pxPerMeter * 2.44);
}

/** Meters one bay of the concrete stand's rear wall covers along it. */
export const REAR_BAY = 12;
/** Height in meters the rear wall texture represents. */
export const REAR_HEIGHT = 20;

/**
 * The back of a concrete stand, one bay wide: brick concourse wall with a gate
 * and a wall lamp, exposed precast above. The emissive twin lights the gate.
 */
export function standRearTextures(): FacadeTextures {
    const W = 512;
    const H = 1024;
    const px = H / REAR_HEIGHT;
    const brickH = 4 * px;
    const gateW = 2.8 * px;
    const gateH = 2.7 * px;
    const paint = (lit: boolean) =>
        paintCanvasTexture(
            W,
            H,
            (g) => {
                const rnd = createRng(14);
                const base = H - brickH;
                g.fillStyle = lit ? "#2c2925" : "#a39f96";
                g.fillRect(0, 0, W, H);
                if (!lit) {
                    g.fillStyle = "rgba(0,0,0,0.1)";
                    for (let y = 0; y < base; y += 18) g.fillRect(0, y, W, 2);
                    g.fillStyle = "rgba(0,0,0,0.3)";
                    g.fillRect(0, 0, 3, base);
                    g.fillRect(W / 2, 0, 2, base);
                    for (let y = 12; y < base; y += 164) {
                        g.fillRect(0, y, W, 3);
                    }
                    for (let i = 0; i < 90; i++) {
                        streak(
                            g,
                            rnd() * W,
                            rnd() * base * 0.8,
                            2 + rnd() * 6,
                            40 + rnd() * 200,
                            rnd() < 0.6 ? "48,44,38" : "120,84,52",
                            0.13,
                        );
                    }
                    g.fillStyle = "#7c5a48";
                    g.fillRect(0, base, W, brickH);
                    for (let y = base; y < H; y += 5) {
                        for (let x = (y / 5) % 2 ? 0 : -7; x < W; x += 14) {
                            const v = rnd();
                            g.fillStyle = `rgba(${v < 0.5 ? "50,28,18" : "196,150,120"},0.13)`;
                            g.fillRect(x, y, 13, 4);
                        }
                    }
                    g.fillStyle = "#c2bcae";
                    g.fillRect(0, base - 6, W, 12);
                }
                const cx = W / 2;
                const y0 = H - gateH;
                if (lit) {
                    const grad = g.createLinearGradient(0, y0, 0, H);
                    grad.addColorStop(0, "#ffd9a0");
                    grad.addColorStop(1, "#b98448");
                    g.fillStyle = grad;
                    g.fillRect(cx - gateW / 2, y0, gateW, gateH);
                    const pool = g.createRadialGradient(
                        cx,
                        y0 - 20,
                        0,
                        cx,
                        y0 - 20,
                        150,
                    );
                    pool.addColorStop(0, "rgba(255,220,170,0.6)");
                    pool.addColorStop(1, "rgba(255,220,170,0)");
                    g.fillStyle = pool;
                    g.fillRect(cx - 150, y0 - 170, 300, 340);
                } else {
                    g.fillStyle = "#1a1c20";
                    g.fillRect(cx - gateW / 2, y0, gateW, gateH);
                    g.fillStyle = "rgba(230,230,226,0.75)";
                    for (let x = cx - gateW / 2; x <= cx + gateW / 2; x += 18) {
                        g.fillRect(x, y0, 3, gateH);
                    }
                    g.fillRect(cx - gateW / 2 - 6, y0 - 6, gateW + 12, 6);
                }
            },
            { repeat: true },
        );
    const map = paint(false);
    const emissive = paint(true);
    for (const t of [map, emissive]) t.wrapT = ClampToEdgeWrapping;
    return { map, emissive };
}

// ---------------------------------------------------------------------------
// Fence and track

/** Meters one chain-link texture repeat covers along the fence. */
export const FENCE_TILE = 3.05;

/** Chain-link fence: thin diamond wires, a top rail and a post at u = 0. */
export function chainLinkTexture(): CanvasTexture {
    const tex = paintCanvasTexture(
        256,
        128,
        (g, w, h) => {
            g.clearRect(0, 0, w, h);
            g.strokeStyle = "rgba(170,176,184,0.75)";
            g.lineWidth = 1;
            const step = 8;
            for (let x = -h; x < w + h; x += step) {
                g.beginPath();
                g.moveTo(x, 0);
                g.lineTo(x + h, h);
                g.moveTo(x + h, 0);
                g.lineTo(x, h);
                g.stroke();
            }
            g.fillStyle = "rgba(150,156,164,1)";
            g.fillRect(0, 0, w, 6);
            g.fillRect(0, h - 3, w, 3);
            g.fillStyle = "rgba(120,126,134,1)";
            g.fillRect(0, 0, 6, h);
        },
        { repeat: true },
    );
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Meters of track one texture repeat covers along the lanes. */
export const TRACK_TILE = 9.144;

/**
 * Track surface across the six lanes (v = 0 is the inside curb): speckled
 * polyurethane, lane lines and a white curb line. Repeats along u.
 */
export function trackTexture(lanes: number): CanvasTexture {
    const tex = paintCanvasTexture(
        512,
        512,
        (g, w, h) => {
            g.fillStyle = "#9a4634";
            g.fillRect(0, 0, w, h);
            const rnd = createRng(31);
            const wear = g.createLinearGradient(0, h, 0, 0);
            wear.addColorStop(0, "rgba(226,170,140,0.18)");
            wear.addColorStop(0.35, "rgba(226,170,140,0.05)");
            wear.addColorStop(1, "rgba(60,20,10,0.08)");
            g.fillStyle = wear;
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 16000; i++) {
                const k = rnd();
                g.fillStyle =
                    k < 0.4
                        ? "rgba(66,24,14,0.5)"
                        : k < 0.75
                          ? "rgba(206,118,90,0.45)"
                          : "rgba(38,30,28,0.35)";
                g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
            }
            g.fillStyle = "#ece9e2";
            const px = h / TRACK_TILE;
            const line = Math.max(2, 0.05 * px);
            for (let k = 0; k <= lanes; k++) {
                const y = h - (k / lanes) * h;
                const t = k === 0 ? line * 2.2 : line;
                g.fillRect(0, Math.min(h - t, Math.max(0, y - t / 2)), w, t);
            }
        },
        { repeat: true },
    );
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Finish line decal: lane numbers 1..lanes and a white line, transparent. */
export function finishTexture(lanes: number): CanvasTexture {
    return paintCanvasTexture(256, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = "#ece9e2";
        g.fillRect(w - 14, 0, 10, h);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `700 70px ${TEXTURE_FONT}`;
        for (let k = 0; k < lanes; k++) {
            const y = h - ((k + 0.5) / lanes) * h;
            g.save();
            g.translate(w * 0.55, y);
            g.rotate(Math.PI / 2);
            g.fillText(String(k + 1), 0, 0);
            g.restore();
        }
    });
}

// ---------------------------------------------------------------------------
// Scoreboard

/**
 * A plain high school scoreboard: time, score, downs and the real OpenMarch
 * logo in the footer panel. Map and emissive in one.
 */
export function scoreboardTexture(): CanvasTexture {
    return paintCanvasTexture(1024, 512, (g, w, h) => {
        g.fillStyle = "#121317";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#e6e4dd";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `700 46px ${TEXTURE_FONT}`;
        g.fillText("HOME", 170, 66);
        g.fillText("VISITORS", w - 170, 66);
        g.font = `700 28px ${TEXTURE_FONT}`;
        g.fillText("QTR", w / 2, 216);
        for (const [label, x] of [
            ["DOWN", 200],
            ["TO GO", w / 2],
            ["BALL ON", w - 200],
        ] as const) {
            g.fillText(label, x, 300);
        }
        const digits = (
            text: string,
            x: number,
            y: number,
            size: number,
            color: string,
        ) => {
            g.font = `700 ${size}px "DejaVu Sans Mono", monospace`;
            g.fillStyle = "rgba(255,255,255,0.05)";
            g.fillText("8".repeat(text.length), x, y);
            g.fillStyle = color;
            g.fillText(text, x, y);
        };
        digits("00", 170, 140, 104, "#d94a3a");
        digits("00", w - 170, 140, 104, "#d94a3a");
        digits("12:00", w / 2, 106, 108, "#dea33a");
        digits("1", w / 2, 254, 54, "#dea33a");
        digits("1", 200, 354, 54, "#d94a3a");
        digits("10", w / 2, 354, 54, "#d94a3a");
        digits("--", w - 200, 354, 54, "#d94a3a");
        g.fillStyle = "#1c1d22";
        g.fillRect(0, h - 96, w, 96);
        g.fillStyle = "rgba(255,255,255,0.08)";
        g.fillRect(0, h - 96, w, 2);
        drawOpenMarchLogo(g, w / 2, h - 48, 54, "#cfcbe6");
    });
}

// ---------------------------------------------------------------------------
// Press box

export interface FacadeTextures {
    map: CanvasTexture;
    emissive: CanvasTexture;
}

/** V bands of a press box facade texture. */
export const PRESS_FRONT_BAND: [number, number] = [0.3, 1];
export const PRESS_REAR_BAND: [number, number] = [0, 0.3];

/**
 * Press box walls, with an emissive twin for lit windows. The front has painted
 * siding, a fascia on the top story and a band of glass per story with people
 * inside; the rear has a door, small windows and a security light.
 */
export function pressBoxFacade(
    width: number,
    height: number,
    stories: number,
    homeColor: string,
    text: string,
    high: boolean,
): FacadeTextures {
    const W = high ? 2048 : 1024;
    const H = high ? 1024 : 512;
    const frontH = H * 0.7;
    const pxm = W / width;
    const storyH = frontH / stories;
    const rows = (k: number) => {
        const top = k * storyH;
        return {
            fascia: [top, top + storyH * 0.2],
            glass: [top + storyH * 0.26, top + storyH * 0.78],
        };
    };
    const bay = Math.max(8, pxm * 2.13);
    const people = (g: G, k: number, lit: boolean) => {
        const { glass } = rows(k);
        const rnd = createRng(77 + k);
        const gh = glass[1] - glass[0];
        for (let x = bay * 0.5; x < W; x += bay * (0.4 + rnd() * 0.9)) {
            if (rnd() < 0.3) continue;
            const s = gh * (0.42 + rnd() * 0.12);
            g.fillStyle = lit ? "rgba(36,24,16,0.85)" : "rgba(8,10,14,0.55)";
            g.fillRect(x - s * 0.32, glass[1] - s * 0.62, s * 0.64, s * 0.62);
            g.beginPath();
            g.arc(x, glass[1] - s * 0.8, s * 0.18, 0, Math.PI * 2);
            g.fill();
        }
    };
    const paint = (lit: boolean) =>
        paintCanvasTexture(W, H, (g) => {
            g.fillStyle = lit ? "#000" : "#d7d0c1";
            g.fillRect(0, 0, W, H);
            const rnd = createRng(4);
            if (!lit) {
                // ribbed metal siding and the grime that gathers under the sills
                g.fillStyle = "rgba(0,0,0,0.08)";
                for (let x = 0; x < W; x += Math.max(4, pxm * 0.6)) {
                    g.fillRect(x, 0, 2, H);
                }
                for (let i = 0; i < 180; i++) {
                    streak(
                        g,
                        rnd() * W,
                        rnd() * frontH,
                        2 + rnd() * 5,
                        20 + rnd() * storyH * 0.7,
                        "60,54,44",
                        0.09,
                    );
                }
            }
            for (let k = 0; k < stories; k++) {
                const r = rows(k);
                if (!lit && k === 0) {
                    g.fillStyle = muted(homeColor, 0.55);
                    g.fillRect(0, r.fascia[0], W, r.fascia[1] - r.fascia[0]);
                    g.fillStyle = "rgba(255,255,255,0.45)";
                    g.fillRect(0, r.fascia[1] - 3, W, 3);
                    const fh = r.fascia[1] - r.fascia[0];
                    const cy = r.fascia[0] + fh / 2;
                    if (!text || /^open\s*march$/i.test(text.trim())) {
                        drawOpenMarchLogo(g, W / 2, cy, fh * 0.62, "#e7e3f0");
                    } else {
                        g.fillStyle = "#efece4";
                        g.textAlign = "center";
                        g.textBaseline = "middle";
                        g.font = `800 ${Math.round(fh * 0.66)}px ${TEXTURE_FONT}`;
                        g.fillText(text.toUpperCase(), W / 2, cy + 2, W * 0.6);
                    }
                }
                const [g0, g1] = r.glass;
                if (lit) {
                    const warm = g.createLinearGradient(0, g0, 0, g1);
                    warm.addColorStop(0, "#ffe2b0");
                    warm.addColorStop(1, "#c78e50");
                    g.fillStyle = warm;
                } else {
                    const sky = g.createLinearGradient(0, g0, 0, g1);
                    sky.addColorStop(0, "#a3b1ba");
                    sky.addColorStop(0.55, "#5e6c76");
                    sky.addColorStop(1, "#3a454f");
                    g.fillStyle = sky;
                }
                g.fillRect(0, g0, W, g1 - g0);
                people(g, k, lit);
                g.fillStyle = lit ? "#000" : "#3c3f45";
                for (let x = 0; x <= W; x += bay) {
                    g.fillRect(x - 2, g0, 4, g1 - g0);
                }
                g.fillRect(0, g0, W, 4);
                g.fillRect(0, g1 - 5, W, 5);
                if (!lit) {
                    g.fillStyle = "rgba(0,0,0,0.3)";
                    g.fillRect(0, g1, W, 6);
                }
            }

            // Rear wall: a door, small windows, and the security light's pool.
            const y0 = frontH;
            const rh = H - frontH;
            if (!lit) {
                g.fillStyle = "#bdb6a7";
                g.fillRect(0, y0, W, rh);
                g.fillStyle = "rgba(0,0,0,0.08)";
                for (let x = 0; x < W; x += Math.max(4, pxm * 0.6)) {
                    g.fillRect(x, y0, 2, rh);
                }
            }
            const n = Math.max(2, Math.round(width / 9));
            for (let i = 0; i < n; i++) {
                const cx = (W * (i + 0.5)) / n;
                const door = i === Math.floor(n / 2);
                const w0 = door ? pxm * 1.1 : pxm * 1.7;
                const y = door ? y0 + rh * 0.2 : y0 + rh * 0.28;
                const hh = door ? rh * 0.8 : rh * 0.4;
                if (lit) {
                    const on = door || rnd() < 0.55;
                    if (!on) continue;
                    g.fillStyle = door ? "#ffdca6" : "#fff0ce";
                    g.fillRect(cx - w0 / 2, y, w0, hh);
                } else {
                    g.fillStyle = door ? "#4b4e55" : "#28313e";
                    g.fillRect(cx - w0 / 2, y, w0, hh);
                }
            }
            if (lit) {
                const grad = g.createRadialGradient(
                    W / 2,
                    y0 + rh * 0.18,
                    0,
                    W / 2,
                    y0 + rh * 0.18,
                    W * 0.25,
                );
                grad.addColorStop(0, "rgba(255,226,180,0.18)");
                grad.addColorStop(1, "rgba(255,226,180,0)");
                g.fillStyle = grad;
                g.fillRect(0, y0, W, rh);
            }
        });
    return { map: paint(false), emissive: paint(true) };
}

// ---------------------------------------------------------------------------
// Buildings

/** Meters one building texture repeat covers horizontally. */
export const BUILDING_TILE = 12;
/** Height in meters the facade band of the atlas represents (two stories). */
export const BUILDING_BAND_HEIGHT = 8;
/** The facade band and a plain brick point in the building atlas. */
export const BUILDING_FACADE_BAND: [number, number] = [0.25, 1];
export const BUILDING_BRICK_UV: [number, number] = [0.5, 0.681];

/**
 * School walls: two stories of window bands over brick, a cast stone band and
 * splash darkening at the ground. The emissive twin lights about half the
 * windows. A plain gray roof patch sits at the bottom of the atlas.
 */
export function buildingTextures(): FacadeTextures {
    const W = 512;
    const H = 512;
    const facadeH = H * 0.75;
    const storyH = facadeH / 2;
    const win = (k: number) => ({
        y0: k * storyH + storyH * 0.3,
        y1: k * storyH + storyH * 0.72,
    });
    const paint = (lit: boolean) =>
        paintCanvasTexture(
            W,
            H,
            (g) => {
                g.fillStyle = lit ? "#17120e" : "#a0795f";
                g.fillRect(0, 0, W, facadeH);
                const rnd = createRng(lit ? 3 : 5);
                if (!lit) {
                    for (let y = 0; y < facadeH; y += 4) {
                        for (let x = (y / 4) % 2 ? 0 : -5; x < W; x += 10) {
                            const v = rnd();
                            g.fillStyle = `rgba(${v < 0.5 ? "60,30,20" : "210,170,140"},${0.07 + rnd() * 0.12})`;
                            g.fillRect(x, y, 9, 3);
                        }
                    }
                    for (let i = 0; i < 60; i++) {
                        streak(
                            g,
                            rnd() * W,
                            rnd() * facadeH * 0.4,
                            1 + rnd() * 3,
                            40 + rnd() * 100,
                            "40,30,24",
                            0.1,
                        );
                    }
                    g.fillStyle = "#c9c0ad";
                    g.fillRect(0, 0, W, 8);
                    g.fillRect(0, storyH - 3, W, 5);
                    const shade2 = g.createLinearGradient(
                        0,
                        facadeH - 44,
                        0,
                        facadeH,
                    );
                    shade2.addColorStop(0, "rgba(30,24,20,0)");
                    shade2.addColorStop(1, "rgba(30,24,20,0.45)");
                    g.fillStyle = shade2;
                    g.fillRect(0, facadeH - 44, W, 44);
                }
                for (let k = 0; k < 2; k++) {
                    const { y0, y1 } = win(k);
                    for (let i = 0; i < 6; i++) {
                        const x0 = (W / 6) * i + 10;
                        const x1 = (W / 6) * (i + 1) - 10;
                        if (lit) {
                            if (rnd() < 0.45) continue;
                            g.fillStyle = rnd() < 0.7 ? "#ffe6b8" : "#cfe2ff";
                        } else {
                            const sky = g.createLinearGradient(0, y0, 0, y1);
                            sky.addColorStop(0, "#7a8da3");
                            sky.addColorStop(1, "#27313e");
                            g.fillStyle = sky;
                        }
                        g.fillRect(x0, y0, x1 - x0, y1 - y0);
                        g.fillStyle = lit ? "#000" : "#d8d4cc";
                        g.fillRect((x0 + x1) / 2 - 2, y0, 4, y1 - y0);
                        g.fillRect(x0, y0 + (y1 - y0) * 0.35, x1 - x0, 3);
                        if (!lit) {
                            g.fillStyle = "#c9c0ad";
                            g.fillRect(x0 - 3, y1, x1 - x0 + 6, 4);
                        }
                    }
                }
                g.fillStyle = lit ? "#000" : "#6d6c69";
                g.fillRect(0, facadeH, W, H - facadeH);
            },
            { repeat: true },
        );
    const map = paint(false);
    const emissive = paint(true);
    for (const t of [map, emissive]) t.wrapT = ClampToEdgeWrapping;
    return { map, emissive };
}

/** Meters one roof texture repeat covers along x. */
export const ROOF_TILE = 12;
/** V bands of the roof atlas: flat membrane and standing seam metal. */
export const ROOF_FLAT_BAND: [number, number] = [0.02, 0.48];
export const ROOF_METAL_BAND: [number, number] = [0.52, 0.98];

/** Flat roof membrane with seams and water stains, and ribbed metal roofing. */
export function roofTexture(): CanvasTexture {
    const tex = paintCanvasTexture(1024, 512, (g, w, h) => {
        const rnd = createRng(61);
        const flatTop = h * 0.52;
        const metalH = h * 0.48;
        g.fillStyle = "#74736d";
        g.fillRect(0, flatTop, w, h - flatTop);
        for (let i = 0; i < 80; i++) {
            const r = 20 + rnd() * 70;
            const x = rnd() * w;
            const y = flatTop + rnd() * (h - flatTop);
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, "rgba(58,56,52,0.2)");
            grad.addColorStop(1, "rgba(58,56,52,0)");
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        g.fillStyle = "rgba(30,30,28,0.16)";
        for (let y = flatTop; y < h; y += 40) g.fillRect(0, y, w, 2);
        for (let x = 0; x < w; x += 85) g.fillRect(x, flatTop, 2, h - flatTop);
        g.fillStyle = "#6e747b";
        g.fillRect(0, 0, w, metalH);
        for (let x = 0; x < w; x += 22) {
            g.fillStyle = "rgba(255,255,255,0.16)";
            g.fillRect(x, 0, 3, metalH);
            g.fillStyle = "rgba(0,0,0,0.22)";
            g.fillRect(x + 3, 0, 3, metalH);
        }
        grain(g, w, h, 9000, 0.18, 8);
    });
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

// ---------------------------------------------------------------------------
// Parking lots

/** The parking tile: four stalls across, one double row of stalls down. */
export const LOT_TILE_W = 11;
export const LOT_TILE_D = 18;
export const STALL_W = LOT_TILE_W / 4;
export const STALL_D = 5.5;
export const LOT_AISLE = 7;

/**
 * Asphalt and stall lines, tiled over the lot: `7 m` of aisle, then a double
 * row of stalls. A stall is 2.75 m by 5.5 m, the line width about 12 cm.
 */
export function lotTexture(): CanvasTexture {
    const tex = paintCanvasTexture(
        512,
        1024,
        (g, w, h) => {
            const rnd = createRng(19);
            const px = h / LOT_TILE_D;
            g.fillStyle = "#3f4143";
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 26000; i++) {
                const v = rnd() < 0.5 ? 16 : 118;
                g.fillStyle = `rgba(${v},${v},${v + 2},0.18)`;
                g.fillRect(rnd() * w, rnd() * h, 2, 2);
            }
            for (let i = 0; i < 26; i++) {
                g.fillStyle = "rgba(20,20,22,0.2)";
                g.beginPath();
                g.ellipse(
                    rnd() * w,
                    rnd() * h,
                    (1 + rnd() * 3) * px,
                    (0.5 + rnd() * 1.4) * px,
                    rnd() * 3,
                    0,
                    Math.PI * 2,
                );
                g.fill();
            }
            // canvas y 0 is v = 1, the far end of the tile
            const y1 = (LOT_AISLE + STALL_D) * px;
            const y2 = (LOT_AISLE + 2 * STALL_D) * px;
            const y0 = LOT_AISLE * px;
            g.fillStyle = "rgba(226,222,208,0.8)";
            const lw = Math.max(3, 0.12 * px);
            g.fillRect(0, y1 - lw / 2, w, lw);
            for (let i = 0; i < 4; i++) {
                const x = (w * i) / 4;
                g.fillRect(x - lw / 2, y0, lw, y2 - y0);
            }
            g.strokeStyle = "rgba(226,222,208,0.8)";
        },
        { repeat: true },
    );
    return tex;
}

// ---------------------------------------------------------------------------
// Site

export interface SiteRect {
    /** Center, in world meters. */
    x: number;
    z: number;
    /** Size along x and z. */
    w: number;
    d: number;
}

export interface SitePaint {
    cx: number;
    cz: number;
    size: number;
    px: number;
    grass: string;
    /** Paved lots. On the low path their stalls are painted here too. */
    lots: SiteRect[];
    paintLots: boolean;
    /** Parking on the mown grass (`hs` overflow): tire tracks and stripes. */
    grassLots: SiteRect[];
    /** Concrete pads and plazas. */
    pads: SiteRect[];
    /** Concrete walks as polylines of [x, z] points. */
    walks: { points: [number, number][]; width: number }[];
    /** Asphalt roads, edge to edge, with a dashed center line. */
    roads: { points: [number, number][]; width: number }[];
    /** Practice fields: lighter grass with faded lines. */
    fields: SiteRect[];
    /** Asphalt lots painted with yard lines, where the band practices. */
    bandLots: SiteRect[];
    /** Tennis courts, with sides along x. */
    courts: SiteRect[];
    /** Ponds, as ellipses. */
    ponds: SiteRect[];
    /** Baseball diamonds: home plate position and the direction to second base. */
    diamonds: { x: number; z: number; angle: number }[];
    /** Roofs and contact shadows of everything standing on the ground. */
    footprints: (SiteRect & { h: number })[];
    /** Soft shade under the trees. */
    treeShade: { x: number; z: number; r: number }[];
    /** Trees drawn as canopies (only on the low path). */
    paintedTrees: { x: number; z: number; r: number }[];
    /** The infield inside the track: same grass, mown shorter. */
    infield?: { cx: number; cz: number; straight: number; r: number };
    seed: number;
}

/** The ground around the stadium, as seen by daylight. */
export function siteTexture(s: SitePaint): CanvasTexture {
    const S = s.px;
    const k = S / s.size;
    const X = (x: number) => (x - (s.cx - s.size / 2)) * k;
    const Y = (z: number) => (z - (s.cz - s.size / 2)) * k;
    const rect = (r: SiteRect, inset = 0) =>
        [
            X(r.x - r.w / 2) + inset,
            Y(r.z - r.d / 2) + inset,
            r.w * k - 2 * inset,
            r.d * k - 2 * inset,
        ] as const;
    const pathTrace = (g: G, points: [number, number][]) => {
        g.beginPath();
        points.forEach(([x, z], i) => {
            if (i === 0) g.moveTo(X(x), Y(z));
            else g.lineTo(X(x), Y(z));
        });
    };
    return paintCanvasTexture(
        S,
        S,
        (g) => {
            const rnd = createRng(s.seed);
            g.fillStyle = s.grass;
            g.fillRect(0, 0, S, S);
            for (let i = 0; i < 420; i++) {
                const r = (10 + rnd() * 60) * k;
                const x = rnd() * S;
                const y = rnd() * S;
                const tone = rnd();
                const col =
                    tone < 0.4
                        ? "132,130,62"
                        : tone < 0.75
                          ? "36,76,30"
                          : "96,110,50";
                const grad = g.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, `rgba(${col},0.2)`);
                grad.addColorStop(1, `rgba(${col},0)`);
                g.fillStyle = grad;
                g.fillRect(x - r, y - r, 2 * r, 2 * r);
            }
            // mowing stripes, 6 m wide
            const stripe = 6 * k;
            g.fillStyle = "rgba(255,255,230,0.02)";
            for (let x = 0; x < S; x += stripe * 2) g.fillRect(x, 0, stripe, S);
            for (let i = 0; i < 14000; i++) {
                g.fillStyle = `rgba(${rnd() < 0.5 ? "20,40,10" : "170,180,110"},0.12)`;
                g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
            }

            for (const t of s.treeShade) {
                const r = t.r * k;
                const grad = g.createRadialGradient(
                    X(t.x),
                    Y(t.z),
                    0,
                    X(t.x),
                    Y(t.z),
                    r,
                );
                grad.addColorStop(0, "rgba(34,44,22,0.5)");
                grad.addColorStop(1, "rgba(34,44,22,0)");
                g.fillStyle = grad;
                g.fillRect(X(t.x) - r, Y(t.z) - r, 2 * r, 2 * r);
            }

            if (s.infield) {
                const f = s.infield;
                g.fillStyle = "#3d6e31";
                g.beginPath();
                g.arc(
                    X(f.cx - f.straight),
                    Y(f.cz),
                    f.r * k,
                    Math.PI / 2,
                    (3 * Math.PI) / 2,
                );
                g.arc(
                    X(f.cx + f.straight),
                    Y(f.cz),
                    f.r * k,
                    -Math.PI / 2,
                    Math.PI / 2,
                );
                g.closePath();
                g.fill();
            }

            for (const r of s.roads) {
                g.lineCap = "butt";
                g.lineJoin = "round";
                g.strokeStyle = "#35373a";
                g.lineWidth = r.width * k;
                pathTrace(g, r.points);
                g.stroke();
                g.strokeStyle = "rgba(208,176,90,0.7)";
                g.lineWidth = Math.max(1, 0.18 * k);
                g.setLineDash([3 * k, 4 * k]);
                pathTrace(g, r.points);
                g.stroke();
                g.setLineDash([]);
            }

            for (const f of s.fields) {
                g.fillStyle = "rgba(112,150,72,0.35)";
                g.fillRect(...rect(f));
                g.strokeStyle = "rgba(240,240,230,0.5)";
                g.lineWidth = Math.max(1, 0.14 * k);
                g.strokeRect(...rect(f, 2 * k));
                const [x0, y0, w, h] = rect(f, 2 * k);
                const along = f.w >= f.d;
                for (let i = 1; i < 10; i++) {
                    g.beginPath();
                    if (along) {
                        g.moveTo(x0 + (w * i) / 10, y0);
                        g.lineTo(x0 + (w * i) / 10, y0 + h);
                    } else {
                        g.moveTo(x0, y0 + (h * i) / 10);
                        g.lineTo(x0 + w, y0 + (h * i) / 10);
                    }
                    g.stroke();
                }
            }

            for (const d of s.diamonds) {
                g.save();
                g.translate(X(d.x), Y(d.z));
                g.rotate(d.angle);
                g.fillStyle = "#b08a5e";
                g.beginPath();
                g.moveTo(0, 0);
                g.arc(0, 0, 29 * k, -Math.PI / 4, Math.PI / 4);
                g.closePath();
                g.fill();
                g.fillStyle = s.grass;
                g.save();
                g.rotate(Math.PI / 4);
                g.fillRect(2 * k, 2 * k, 23.5 * k, 23.5 * k);
                g.restore();
                g.fillStyle = "#b08a5e";
                g.beginPath();
                g.arc(18.4 * k, 0, 3 * k, 0, Math.PI * 2);
                g.arc(0, 0, 4 * k, 0, Math.PI * 2);
                g.fill();
                g.strokeStyle = "rgba(245,245,240,0.8)";
                g.lineWidth = Math.max(1, 0.1 * k);
                g.beginPath();
                g.moveTo(0, 0);
                g.lineTo(
                    Math.cos(-Math.PI / 4) * 95 * k,
                    Math.sin(-Math.PI / 4) * 95 * k,
                );
                g.moveTo(0, 0);
                g.lineTo(
                    Math.cos(Math.PI / 4) * 95 * k,
                    Math.sin(Math.PI / 4) * 95 * k,
                );
                g.stroke();
                g.restore();
            }

            for (const p of s.ponds) {
                g.fillStyle = "#48565a";
                g.beginPath();
                g.ellipse(
                    X(p.x),
                    Y(p.z),
                    (p.w * k) / 2,
                    (p.d * k) / 2,
                    0,
                    0,
                    Math.PI * 2,
                );
                g.fill();
                g.strokeStyle = "rgba(74,96,58,0.7)";
                g.lineWidth = 2.4 * k;
                g.stroke();
            }

            for (const c of s.courts) {
                g.fillStyle = "#39604f";
                g.fillRect(...rect(c));
                g.fillStyle = "#4b7a6a";
                g.fillRect(...rect(c, 3 * k));
                g.strokeStyle = "rgba(240,240,232,0.85)";
                g.lineWidth = Math.max(1, 0.1 * k);
                g.strokeRect(...rect(c, 3 * k));
                const [x0, y0, w, h] = rect(c, 3 * k);
                g.beginPath();
                g.moveTo(x0 + w / 2, y0);
                g.lineTo(x0 + w / 2, y0 + h);
                g.stroke();
            }

            const asphalt = (r: SiteRect) => {
                g.fillStyle = "#3f4143";
                g.fillRect(...rect(r));
                const [x0, y0, w, h] = rect(r);
                for (let i = 0; i < (r.w * r.d * k * k) / 30; i++) {
                    g.fillStyle = `rgba(${rnd() < 0.5 ? "20,20,22" : "120,120,118"},0.2)`;
                    g.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1, 1);
                }
            };

            for (const p of s.pads) {
                g.fillStyle = "#b0ada5";
                g.fillRect(...rect(p));
                g.strokeStyle = "rgba(90,88,84,0.16)";
                g.lineWidth = 1;
                const [x0, y0, w, h] = rect(p);
                const step = Math.max(3, 1.5 * k);
                for (let x = x0; x < x0 + w; x += step) {
                    g.beginPath();
                    g.moveTo(x, y0);
                    g.lineTo(x, y0 + h);
                    g.stroke();
                }
                for (let y = y0; y < y0 + h; y += step) {
                    g.beginPath();
                    g.moveTo(x0, y);
                    g.lineTo(x0 + w, y);
                    g.stroke();
                }
            }

            for (const w of s.walks) {
                g.strokeStyle = "#b9b5ab";
                g.lineCap = "round";
                g.lineJoin = "round";
                g.lineWidth = w.width * k;
                pathTrace(g, w.points);
                g.stroke();
            }

            // Grass parking: lanes the tires have worn into the turf.
            for (const l of s.grassLots) {
                g.fillStyle = "rgba(110,124,60,0.5)";
                g.fillRect(...rect(l));
                const [x0, y0, w, h] = rect(l);
                const step = 18 * k;
                for (let y = y0 + 7 * k; y < y0 + h; y += step) {
                    g.fillStyle = "rgba(60,52,30,0.26)";
                    g.fillRect(x0, y - 3 * k, w, 3.2 * k);
                }
            }

            if (s.paintLots) {
                for (const lot of s.lots) {
                    asphalt(lot);
                    const [x0, y0, w, h] = rect(lot, 1.5 * k);
                    const stallW = 2.75 * k;
                    const stallD = 5.5 * k;
                    const module = 2 * stallD + 7 * k;
                    g.strokeStyle = "rgba(240,240,232,0.8)";
                    g.lineWidth = Math.max(1, 0.12 * k);
                    for (
                        let y = y0 + 7 * k;
                        y + 2 * stallD <= y0 + h;
                        y += module
                    ) {
                        g.beginPath();
                        g.moveTo(x0, y + stallD);
                        g.lineTo(x0 + w, y + stallD);
                        for (let x = x0; x <= x0 + w; x += stallW) {
                            g.moveTo(x, y);
                            g.lineTo(x, y + 2 * stallD);
                        }
                        g.stroke();
                    }
                }
            }

            for (const b of s.bandLots) {
                asphalt(b);
                const [x0, y0, w, h] = rect(b, 2 * k);
                g.strokeStyle = "rgba(250,250,245,0.9)";
                g.lineWidth = Math.max(1, 0.1 * k);
                g.strokeRect(x0, y0, w, h);
                const yd = 4.572 * k;
                for (let x = x0; x <= x0 + w + 0.1; x += yd) {
                    g.beginPath();
                    g.moveTo(x, y0);
                    g.lineTo(x, y0 + h);
                    g.stroke();
                }
                for (const f of [1 / 3, 2 / 3]) {
                    for (let x = x0; x <= x0 + w; x += yd / 5) {
                        g.beginPath();
                        g.moveTo(x, y0 + h * f - 0.3 * k);
                        g.lineTo(x, y0 + h * f + 0.3 * k);
                        g.stroke();
                    }
                }
            }

            // Shadows of the buildings, soft, leaning away from the day sun.
            for (const b of s.footprints) {
                const offX = -0.58 * b.h * k;
                const offY = -0.5 * b.h * k;
                const r = rect(b);
                const blur = Math.max(4, b.h * 0.8 * k);
                g.save();
                g.filter = `blur(${blur}px)`;
                g.fillStyle = "rgba(14,16,14,0.62)";
                g.fillRect(r[0] + offX, r[1] + offY, r[2], r[3]);
                g.restore();
                // the footprint itself, a dark contact edge
                g.fillStyle = "rgba(24,24,22,0.7)";
                g.fillRect(...rect(b, -0.8 * k));
            }

            for (const t of s.paintedTrees) {
                const r = t.r * k;
                g.fillStyle = "rgba(20,28,16,0.5)";
                g.beginPath();
                g.arc(X(t.x) - r * 0.3, Y(t.z) - r * 0.3, r, 0, Math.PI * 2);
                g.fill();
                const grad = g.createRadialGradient(
                    X(t.x) + r * 0.2,
                    Y(t.z) + r * 0.2,
                    0,
                    X(t.x),
                    Y(t.z),
                    r,
                );
                grad.addColorStop(0, "#6a8440");
                grad.addColorStop(1, "#35502a");
                g.fillStyle = grad;
                g.beginPath();
                g.arc(X(t.x), Y(t.z), r, 0, Math.PI * 2);
                g.fill();
            }

            // Fade the square's edge, so it melts into whatever ground is below.
            g.globalCompositeOperation = "destination-out";
            const fade = 44 * k;
            for (const [x0, y0, x1, y1] of [
                [0, 0, fade, 0],
                [S, 0, S - fade, 0],
                [0, 0, 0, fade],
                [0, S, 0, S - fade],
            ]) {
                const grad = g.createLinearGradient(x0, y0, x1, y1);
                grad.addColorStop(0, "rgba(0,0,0,1)");
                grad.addColorStop(1, "rgba(0,0,0,0)");
                g.fillStyle = grad;
                g.fillRect(0, 0, S, S);
            }
            g.globalCompositeOperation = "source-over";
        },
        { anisotropy: 8 },
    );
}

export interface NightPaint {
    cx: number;
    cz: number;
    size: number;
    px: number;
    /** Pools under lamps: position, radius and strength 0..1. */
    pools: { x: number; z: number; r: number; k: number }[];
    /** Soft lit rectangles along walls and under the stands. */
    washes: (SiteRect & { k: number })[];
}

/** The ground's night glow, as an emissive map. */
export function siteNightTexture(n: NightPaint): CanvasTexture {
    const S = n.px;
    const k = S / n.size;
    const X = (x: number) => (x - (n.cx - n.size / 2)) * k;
    const Y = (z: number) => (z - (n.cz - n.size / 2)) * k;
    return paintCanvasTexture(S, S, (g) => {
        g.fillStyle = "#000";
        g.fillRect(0, 0, S, S);
        g.globalCompositeOperation = "lighter";
        for (const w of n.washes) {
            const r = Math.max(w.w, w.d) * k * 0.7;
            const grad = g.createRadialGradient(
                X(w.x),
                Y(w.z),
                r * 0.2,
                X(w.x),
                Y(w.z),
                r,
            );
            const v = Math.round(110 * w.k);
            grad.addColorStop(
                0,
                `rgba(${v},${Math.round(v * 0.82)},${Math.round(v * 0.62)},1)`,
            );
            grad.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = grad;
            g.fillRect(X(w.x) - r, Y(w.z) - r, 2 * r, 2 * r);
        }
        for (const p of n.pools) {
            const r = p.r * k;
            const grad = g.createRadialGradient(
                X(p.x),
                Y(p.z),
                0,
                X(p.x),
                Y(p.z),
                r,
            );
            const v = Math.round(255 * p.k);
            grad.addColorStop(
                0,
                `rgb(${v},${Math.round(v * 0.86)},${Math.round(v * 0.66)})`,
            );
            grad.addColorStop(
                0.5,
                `rgb(${Math.round(v * 0.4)},${Math.round(v * 0.34)},${Math.round(v * 0.24)})`,
            );
            grad.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = grad;
            g.fillRect(X(p.x) - r, Y(p.z) - r, 2 * r, 2 * r);
        }
        g.globalCompositeOperation = "source-over";
        // Faint gradients band in 8 bits, so dither the whole map.
        grain(g, S, S, S * S * 0.3, 0.05, 88, 2);
    });
}

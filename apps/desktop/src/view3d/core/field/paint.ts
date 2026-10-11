import type { FieldFootprint } from "@openmarch/core";
import { TEXTURE_FONT } from "../environment";
import { MARCHER_MARK, OPENMARCH_LOGO } from "./brandMark";
import { createRng } from "../environment/random";
import type {
    FieldPlan,
    PlanArrow,
    PlanFade,
    PlanGrain,
    PlanHatch,
    PlanItem,
    PlanLogo,
    PlanText,
} from "./plan";

/** A texture's pixel grid over the footprint. */
export interface TextureLayout {
    width: number;
    height: number;
    /** Pixels per meter along x and z; equal up to rounding. */
    scaleX: number;
    scaleZ: number;
    footprint: FieldFootprint;
}

/** Long side of the texture: 4096 px, or 8192 when the GPU allows it. */
export function textureLongSide(maxTextureSize?: number): number {
    if (maxTextureSize === undefined) return 4096;
    if (maxTextureSize >= 8192) return 8192;
    return Math.min(4096, maxTextureSize);
}

export function textureLayout(
    footprint: FieldFootprint,
    longSide: number,
): TextureLayout {
    const w = Math.max(footprint.maxX - footprint.minX, 1e-3);
    const d = Math.max(footprint.maxZ - footprint.minZ, 1e-3);
    const scale = longSide / Math.max(w, d);
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(d * scale));
    return {
        width,
        height,
        scaleX: width / w,
        scaleZ: height / d,
        footprint,
    };
}

/** Digits' cap height as a share of the font size (DM Sans and fallbacks). */
const CAP_HEIGHT = 0.72;

/**
 * Paints a plan into a 2D context. The canvas's top row is the back of the
 * field (min z) and its left column is side 1 (min x), which is how the
 * surface's plane maps the texture.
 */
export function paintPlan(
    g: CanvasRenderingContext2D,
    plan: FieldPlan,
    layout: TextureLayout,
    image?: CanvasImageSource | null,
): void {
    for (const item of plan.items) paintItem(g, item, layout, image);
}

function paintItem(
    g: CanvasRenderingContext2D,
    item: PlanItem,
    layout: TextureLayout,
    image?: CanvasImageSource | null,
): void {
    const { scaleX: sx, scaleZ: sz, footprint: f } = layout;
    const s = sx;
    const X = (x: number) => (x - f.minX) * sx;
    const Y = (z: number) => (z - f.minZ) * sz;
    switch (item.type) {
        case "rect":
            g.fillStyle = item.color;
            g.fillRect(
                X(item.minX),
                Y(item.minZ),
                (item.maxX - item.minX) * sx,
                (item.maxZ - item.minZ) * sz,
            );
            return;
        case "image":
            if (!image) return;
            g.save();
            g.globalAlpha = item.opacity;
            g.drawImage(
                image,
                X(item.minX),
                Y(item.minZ),
                (item.maxX - item.minX) * sx,
                (item.maxZ - item.minZ) * sz,
            );
            g.restore();
            return;
        case "text":
            paintText(g, item, X(item.x), Y(item.z), s);
            return;
        case "arrow":
            paintArrow(g, item, X(item.x), Y(item.z), s);
            return;
        case "tarpArt":
            paintTarpArt(g, layout);
            return;
        case "logo":
            paintLogo(g, item, X(item.x), Y(item.z), s);
            return;
        case "hatch":
            paintHatch(g, item, X, Y, s);
            return;
        case "grain":
            paintGrain(g, item, layout);
            return;
        case "fade":
            paintFade(g, item, X, Y);
            return;
    }
}

/** Diagonal bands, clipped to the hatch's rectangle. */
function paintHatch(
    g: CanvasRenderingContext2D,
    h: PlanHatch,
    X: (x: number) => number,
    Y: (z: number) => number,
    s: number,
): void {
    const [x0, y0, x1, y1] = [X(h.minX), Y(h.minZ), X(h.maxX), Y(h.maxZ)];
    const half = (h.width * s) / 2 / Math.SQRT1_2;
    const step = (h.spacing * s) / Math.SQRT1_2;
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    g.fillStyle = h.color;
    // Bands run at 45 degrees: parallelograms along x + d * y = c.
    const d = h.direction ?? 1;
    const span = y1 - y0;
    for (let c = x0 - span; c < x1 + span; c += step) {
        const at = (y: number) => c - d * (y - y0);
        g.beginPath();
        g.moveTo(at(y0) - half, y0);
        g.lineTo(at(y0) + half, y0);
        g.lineTo(at(y1) + half, y1);
        g.lineTo(at(y1) - half, y1);
        g.closePath();
        g.fill();
    }
    g.restore();
}

/** A linear fade from the item's color to clear, across x. */
function paintFade(
    g: CanvasRenderingContext2D,
    fade: PlanFade,
    X: (x: number) => number,
    Y: (z: number) => number,
): void {
    const [a, b] = [X(fade.fromX), X(fade.toX)];
    const gradient = g.createLinearGradient(a, 0, b, 0);
    gradient.addColorStop(0, fade.color);
    gradient.addColorStop(0.55, fade.color + "b0");
    gradient.addColorStop(1, fade.color + "00");
    g.fillStyle = gradient;
    const [y0, y1] = [Y(fade.minZ), Y(fade.maxZ)];
    g.fillRect(Math.min(a, b), y0, Math.abs(b - a), y1 - y0);
}

/** Side of the generated noise tiles, in pixels. */
const GRAIN_TILE = 256;

/**
 * Overlays two seamless noise tiles: speckle at about 3 m a tile for
 * blade-scale texture, and soft blotches at about 40 m a tile for uneven
 * growth and wear.
 * Needs a DOM canvas for the tiles; skipped without one (tests).
 */
function paintGrain(
    g: CanvasRenderingContext2D,
    grain: PlanGrain,
    layout: TextureLayout,
): void {
    if (typeof document === "undefined" || typeof DOMMatrix === "undefined")
        return;
    const rng = createRng(grain.seed);
    /**
     * A seamless GRAIN_TILE tile of value noise over a `cells` x `cells`
     * grid, smoothly interpolated and wrapped at the edges.
     */
    const tile = (cells: number) => {
        const grid = Array.from({ length: cells * cells }, () => rng());
        const at = (i: number, j: number) =>
            grid[(j % cells) * cells + (i % cells)];
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = GRAIN_TILE;
        const tg = canvas.getContext("2d");
        if (!tg) return null;
        const img = tg.createImageData(GRAIN_TILE, GRAIN_TILE);
        const per = GRAIN_TILE / cells;
        const ease = (t: number) => t * t * (3 - 2 * t);
        for (let y = 0; y < GRAIN_TILE; y++)
            for (let x = 0; x < GRAIN_TILE; x++) {
                const i = Math.floor(x / per);
                const j = Math.floor(y / per);
                const u = ease(x / per - i);
                const w = ease(y / per - j);
                const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
                const bottom =
                    at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
                const v = Math.round((top + (bottom - top) * w) * 255);
                img.data.set([v, v, v, 255], (y * GRAIN_TILE + x) * 4);
            }
        tg.putImageData(img, 0, 0);
        return canvas;
    };
    const layers: [number, number, number][] = [
        // cells, meters per tile, alpha
        [GRAIN_TILE, 3, 0.16],
        [12, 40, 0.22],
    ];
    g.save();
    g.globalCompositeOperation = "soft-light";
    for (const [cells, meters, alpha] of layers) {
        const t = tile(cells);
        const pattern = t && g.createPattern(t, "repeat");
        if (!pattern) continue;
        const k = (meters * layout.scaleX) / GRAIN_TILE;
        pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
        g.globalAlpha = alpha * grain.strength;
        g.fillStyle = pattern;
        g.fillRect(0, 0, layout.width, layout.height);
    }
    g.restore();
}

/**
 * Paints the logo's SVG paths in `color`. Needs `Path2D`, which test DOMs
 * may lack.
 */
function paintLogo(
    g: CanvasRenderingContext2D,
    logo: PlanLogo,
    px: number,
    py: number,
    s: number,
): void {
    if (typeof Path2D === "undefined") return;
    const k = (logo.width * s) / OPENMARCH_LOGO.width;
    const paths = OPENMARCH_LOGO.paths.map((d) => new Path2D(d));
    g.save();
    g.translate(px, py);
    g.rotate(logo.rotation);
    g.scale(k, k);
    g.translate(-OPENMARCH_LOGO.width / 2, -OPENMARCH_LOGO.height / 2);
    if (logo.shadow) {
        const d = (SHADOW_OFFSET / 2) * OPENMARCH_LOGO.height;
        g.save();
        g.translate(d, d);
        g.fillStyle = logo.shadow;
        for (const p of paths) g.fill(p);
        g.restore();
    }
    g.fillStyle = logo.color;
    for (const p of paths) g.fill(p);
    g.restore();
}

function paintText(
    g: CanvasRenderingContext2D,
    t: PlanText,
    px: number,
    py: number,
    s: number,
): void {
    let size = (t.height * s) / CAP_HEIGHT;
    g.save();
    g.font = `${t.weight} ${size}px ${TEXTURE_FONT}`;
    const measure = typeof g.measureText === "function";
    const mark = t.leadingMark && typeof Path2D !== "undefined" && measure;
    const markRun = (cap: number) =>
        mark
            ? cap *
              ((MARK_HEIGHT * MARCHER_MARK.width) / MARCHER_MARK.height +
                  MARK_GAP)
            : 0;
    if (t.maxLength !== undefined && measure) {
        const w = g.measureText(t.text).width + markRun(size * CAP_HEIGHT);
        if (w > t.maxLength * s) {
            size *= (t.maxLength * s) / w;
            g.font = `${t.weight} ${size}px ${TEXTURE_FONT}`;
        }
    }
    const cap = size * CAP_HEIGHT;
    g.translate(px, py);
    g.rotate(t.rotation);
    g.textBaseline = "alphabetic";
    const run = markRun(cap);
    const textWidth = mark ? g.measureText(t.text).width : 0;
    const left = -(run + textWidth) / 2;
    const marks = mark ? MARCHER_MARK.paths.map((d) => new Path2D(d)) : [];
    const k = (cap * MARK_HEIGHT) / MARCHER_MARK.height;
    /** Paints the text, and the mark if any, in one color at an offset. */
    const layer = (color: string, dx: number, dy: number, outline = 0) => {
        g.fillStyle = color;
        g.strokeStyle = color;
        g.lineJoin = "round";
        g.lineWidth = outline;
        g.textAlign = mark ? "left" : "center";
        const tx = (mark ? left + run : 0) + dx;
        if (outline) g.strokeText(t.text, tx, cap / 2 + dy);
        g.fillText(t.text, tx, cap / 2 + dy);
        if (!mark) return;
        // The mark is centered on the caps, which span -cap / 2 to cap / 2.
        g.save();
        g.translate(left + dx, (-cap * MARK_HEIGHT) / 2 + dy);
        g.scale(k, k);
        if (outline) {
            g.lineWidth = outline / k;
            for (const p of marks) g.stroke(p);
        }
        for (const p of marks) g.fill(p);
        g.restore();
    };
    if (t.shadow) {
        const d = cap * SHADOW_OFFSET;
        layer(t.shadow, d, d, cap * 0.05);
        layer(t.shadow, 0, 0, cap * 0.07);
    }
    layer(t.color, 0, 0);
    g.restore();
}

/** Drop-shadow offset for painted text and logos, as a share of their height. */
const SHADOW_OFFSET = 0.07;

/** The marcher mark's height and its gap before end-zone text, in cap heights. */
const MARK_HEIGHT = 1.3;
const MARK_GAP = 0.3;

function paintArrow(
    g: CanvasRenderingContext2D,
    a: PlanArrow,
    px: number,
    py: number,
    s: number,
): void {
    const len = a.length * s;
    const half = a.halfWidth * s;
    g.fillStyle = a.color;
    g.beginPath();
    g.moveTo(px + (a.dir * len) / 2, py);
    g.lineTo(px - (a.dir * len) / 2, py - half);
    g.lineTo(px - (a.dir * len) / 2, py + half);
    g.closePath();
    g.fill();
}

/**
 * The generated tarp's artwork, ported from the reference demo's
 * `tarpTexture` and scaled to the texture: a navy gradient, a violet glow
 * with rings, and an amber wedge from the front-left corner.
 */
function paintTarpArt(g: CanvasRenderingContext2D, layout: TextureLayout) {
    const { width: W, height: H, scaleX: s } = layout;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#15123a");
    bg.addColorStop(1, "#0c1a2e");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const cx = W * 0.72;
    const cy = H * 0.3;
    const rg = g.createRadialGradient(cx, cy, 10, cx, cy, W * 0.55);
    rg.addColorStop(0, "rgba(140,110,255,0.75)");
    rg.addColorStop(1, "rgba(140,110,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(230,225,255,0.55)";
    const ring = Math.min(W, H) * 0.07;
    for (let i = 1; i < 9; i++) {
        g.lineWidth = (i % 3 ? 0.03 : 0.09) * s;
        g.beginPath();
        g.arc(cx, cy, i * ring, 0, Math.PI * 2);
        g.stroke();
    }
    g.fillStyle = "rgba(255,180,90,0.85)";
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(W * 0.42, H);
    g.lineTo(W * 0.08, H * 0.35);
    g.lineTo(0, H * 0.42);
    g.closePath();
    g.fill();
}

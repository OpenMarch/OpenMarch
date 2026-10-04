import type { FieldFootprint } from "@openmarch/core";
import { TEXTURE_FONT } from "../environment";
import type { FieldPlan, PlanArrow, PlanItem, PlanText } from "./plan";

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
    }
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
    if (t.maxLength !== undefined && typeof g.measureText === "function") {
        const w = g.measureText(t.text).width;
        if (w > t.maxLength * s) {
            size *= (t.maxLength * s) / w;
            g.font = `${t.weight} ${size}px ${TEXTURE_FONT}`;
        }
    }
    g.translate(px, py);
    g.rotate(t.rotation);
    g.fillStyle = t.color;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText(t.text, 0, (size * CAP_HEIGHT) / 2);
    g.restore();
}

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

import type { CanvasTexture } from "three";
import type { ShowCredits } from "../types";
import otmLogoUrl from "@/assets/otm-logo-white.webp";
import { OPENMARCH_LOGO } from "../field/brandMark";
import { repaintCanvasTexture, TEXTURE_FONT } from "./textures";

/**
 * OpenMarch's own branding for venue signage: the OpenMarch logo (vector,
 * painted straight away) and the OpenMarch: On The Move logo (a bundled
 * image, painted once it decodes). Nothing is downloaded at run time.
 */

/**
 * The credits from the workspace settings, falling back to the file name for
 * the title. Trims every field and drops empty ones.
 */
export function showCreditsFrom(
    settings: { projectName?: string; designer?: string; client?: string },
    fileName: string,
): ShowCredits {
    const title = settings.projectName?.trim() || fileName.trim();
    const designer = settings.designer?.trim();
    const client = settings.client?.trim();
    return {
        title,
        ...(designer ? { designer } : {}),
        ...(client ? { client } : {}),
    };
}

/**
 * Paints the OpenMarch logo in one color, centered on (cx, cy) and `height`
 * pixels tall.
 */
export function drawOpenMarchLogo(
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    height: number,
    color: string,
): void {
    const k = height / OPENMARCH_LOGO.height;
    g.save();
    g.translate(cx - (OPENMARCH_LOGO.width * k) / 2, cy - height / 2);
    g.scale(k, k);
    g.fillStyle = color;
    for (const d of OPENMARCH_LOGO.paths) g.fill(new Path2D(d));
    g.restore();
}

/** OpenMarch logo width over height. */
export const OPENMARCH_LOGO_ASPECT =
    OPENMARCH_LOGO.width / OPENMARCH_LOGO.height;

/**
 * The On The Move logo's bounds inside its 801 x 400 image (white on
 * transparent), so callers can fit the artwork rather than the padding.
 */
const OTM_IMAGE = { w: 801, h: 400, crop: { x: 58, y: 82, w: 685, h: 238 } };
export const OTM_LOGO_ASPECT = OTM_IMAGE.crop.w / OTM_IMAGE.crop.h;

let otmImage: HTMLImageElement | null = null;
let otmReady = false;
/** Set once the image has loaded or failed: nothing more to wait for. */
let otmSettled = false;
const otmWaiters = new Set<() => void>();

function settleOtm(loaded: boolean): void {
    otmReady = loaded;
    otmSettled = true;
    const waiters = [...otmWaiters];
    otmWaiters.clear();
    waiters.forEach((f) => f());
}

function loadOtm(): void {
    if (otmImage || typeof Image === "undefined") return;
    otmImage = new Image();
    otmImage.decoding = "async";
    otmImage.onload = () => settleOtm(true);
    // Signage just goes without the logo; waiters must not pile up.
    otmImage.onerror = () => settleOtm(false);
    otmImage.src = otmLogoUrl;
}

/**
 * Resolves once the On The Move logo has loaded or failed to (or at once
 * without `Image`).
 */
export function brandArtReady(): Promise<void> {
    loadOtm();
    if (otmSettled || !otmImage) return Promise.resolve();
    return new Promise((resolve) => otmWaiters.add(() => resolve()));
}

/**
 * Paints the On The Move logo's artwork (no padding) into the box, scaled to
 * fit and centered, tinted `color` when given. Does nothing until the image
 * has loaded; `paintWithOtmLogo` repaints once it has.
 */
export function drawOtmLogo(
    g: CanvasRenderingContext2D,
    box: { x: number; y: number; w: number; h: number },
    color?: string,
): void {
    loadOtm();
    if (!otmReady || !otmImage) return;
    const { crop } = OTM_IMAGE;
    const s = Math.min(box.w / crop.w, box.h / crop.h);
    const w = crop.w * s;
    const h = crop.h * s;
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;
    if (!color) {
        g.drawImage(otmImage, crop.x, crop.y, crop.w, crop.h, x, y, w, h);
        return;
    }
    // Tint: draw into a scratch canvas, then fill with the color "source-in".
    const c = document.createElement("canvas");
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    const t = c.getContext("2d");
    if (!t) return;
    t.drawImage(otmImage, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = color;
    t.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, x, y);
}

/**
 * Repaints `texture` with `paint` once the On The Move logo has loaded (the
 * first paint, from `paintCanvasTexture`, had no logo yet). Disposing the
 * texture first cancels the repaint; so does the returned function.
 */
export function paintWithOtmLogo(
    texture: CanvasTexture,
    paint: (g: CanvasRenderingContext2D, width: number, height: number) => void,
): () => void {
    loadOtm();
    if (otmSettled || !otmImage) return () => {};
    const cancel = () => {
        otmWaiters.delete(repaint);
        texture.removeEventListener("dispose", cancel);
    };
    const repaint = () => {
        cancel();
        if (otmReady) repaintCanvasTexture(texture, paint);
    };
    otmWaiters.add(repaint);
    texture.addEventListener("dispose", cancel);
    return cancel;
}

/**
 * For fitting a line of text: shrinks the font until the text fits
 * `maxWidth`, down to `min`, then shortens the text with an ellipsis. Sets
 * `g.font` and returns the text to draw.
 */
export function fitText(
    g: CanvasRenderingContext2D,
    text: string,
    weight: number,
    size: number,
    min: number,
    maxWidth: number,
): string {
    g.font = `${weight} ${size}px ${TEXTURE_FONT}`;
    while (size > min && g.measureText(text).width > maxWidth) {
        size = Math.max(min, size - 2);
        g.font = `${weight} ${size}px ${TEXTURE_FONT}`;
    }
    if (g.measureText(text).width <= maxWidth) return text;
    let chars = [...text];
    while (chars.length > 1) {
        chars = chars.slice(0, -1);
        const short = `${chars.join("").trimEnd()}…`;
        if (g.measureText(short).width <= maxWidth) return short;
    }
    return "…";
}

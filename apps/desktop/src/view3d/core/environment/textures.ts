import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Canvas texture helpers. Text drawn into the scene is painted here (ADR 0010
 * D-1). Painting needs a 2D canvas context, which Vitest's jsdom doesn't have,
 * so tests call `setTexturePainting(false)`: textures are still created, just
 * left blank. A missing context is also tolerated at runtime.
 */
let paintingEnabled = true;

export function setTexturePainting(enabled: boolean): void {
    paintingEnabled = enabled;
}

/**
 * Lists the text symbols face (packages/ui text-symbols.css) like the app's stacks. A
 * canvas doesn't wait for a face to load, so text with ↔ or ↕ would also need
 * `document.fonts.load` for it first (see fontsLoaded in core/field).
 */
export const TEXTURE_FONT = '"DM Sans", "OpenMarch Text Symbols", sans-serif';

/**
 * Creates a canvas of the given size and a texture for it, then calls `paint`
 * with the 2D context (unless painting is disabled or unavailable).
 */
export function paintCanvasTexture(
    width: number,
    height: number,
    paint: (g: CanvasRenderingContext2D, width: number, height: number) => void,
    options: { repeat?: boolean; anisotropy?: number } = {},
): CanvasTexture {
    // Without a DOM (node tests) the texture has no image to paint.
    if (typeof document === "undefined") {
        const tex = new CanvasTexture(undefined as never);
        tex.colorSpace = SRGBColorSpace;
        if (options.repeat) tex.wrapS = tex.wrapT = RepeatWrapping;
        return tex;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    if (paintingEnabled) {
        const g = canvas.getContext("2d");
        if (g) paint(g, width, height);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = options.anisotropy ?? 8;
    if (options.repeat) tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
}

/**
 * Clears and repaints a texture made by `paintCanvasTexture` (when painting is
 * enabled), then flags it for upload.
 */
export function repaintCanvasTexture(
    texture: CanvasTexture,
    paint: (g: CanvasRenderingContext2D, width: number, height: number) => void,
): void {
    if (!paintingEnabled) return;
    const canvas = texture.image as HTMLCanvasElement | undefined;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    paint(g, canvas.width, canvas.height);
    texture.needsUpdate = true;
}

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Canvas texture helpers. Text drawn into the scene is painted here (ADR 0002
 * D-1). Painting needs a 2D canvas context, which Vitest's jsdom doesn't have,
 * so tests call `setTexturePainting(false)`: textures are still created, just
 * left blank. A missing context is also tolerated at runtime.
 */
let paintingEnabled = true;

export function setTexturePainting(enabled: boolean): void {
    paintingEnabled = enabled;
}

export const TEXTURE_FONT = '"DM Sans", sans-serif';

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

/** Video board face: purple-to-dark gradient, a title and a subtitle. */
export function boardTexture(title: string, sub: string): CanvasTexture {
    return paintCanvasTexture(1024, 560, (g) => {
        const bg = g.createLinearGradient(0, 0, 1024, 560);
        bg.addColorStop(0, "#2a1880");
        bg.addColorStop(1, "#0b0b1e");
        g.fillStyle = bg;
        g.fillRect(0, 0, 1024, 560);
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.font = `700 120px ${TEXTURE_FONT}`;
        g.fillText(title, 512, 300);
        g.font = `500 48px ${TEXTURE_FONT}`;
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.fillText(sub, 512, 390);
        g.fillStyle = "#6442ff";
        g.fillRect(0, 520, 1024, 40);
    });
}

/**
 * LED fascia ribbon (the pro dome's upper fascia). Repeats along U. Pass
 * `params.endZoneText || "OPENMARCH"` as `text`.
 */
export function ribbonTexture(text: string): CanvasTexture {
    return paintCanvasTexture(
        1024,
        64,
        (g) => {
            g.fillStyle = "#120c3a";
            g.fillRect(0, 0, 1024, 64);
            g.fillStyle = "#b9a8ff";
            g.font = `700 40px ${TEXTURE_FONT}`;
            g.textBaseline = "middle";
            g.fillText(`${text}  ·`, 16, 34);
        },
        { repeat: true },
    );
}

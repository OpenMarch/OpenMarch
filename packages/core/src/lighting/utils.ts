import { z } from "zod";
import type { LightingEffectLayerRect } from "./effectLayers";

export const ColorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/);

/** RGBA in 0-255 / 0-1 range (matches theme marcher colors in app). */
export type LightingRgba = {
    r: number;
    g: number;
    b: number;
    a: number;
};

export type LightingSampleContext<TArgs> = {
    args: TArgs;
    timestampMs: number;
    window: { startMs: number; durationMs: number };
    marcherId: number;
    baseFill: LightingRgba;
    layers: readonly LightingEffectLayerRect[];
    marcherPosition?: { x: number; y: number };
};

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

export function hex6ToLightingRgba(hex: string): LightingRgba {
    const m = HEX6.exec(hex.trim());
    const hexBody = m?.[1];
    if (!hexBody) return { r: 0, g: 0, b: 0, a: 1 };
    const n = parseInt(hexBody, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: 1,
    };
}

import { RgbaColor } from "@uiw/react-color";

const FALLBACK_RGBA: RgbaColor = { r: 255, g: 0, b: 0, a: 1 };

export function isRgbaColor(value: unknown): value is RgbaColor {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<RgbaColor>;
    return (
        typeof candidate.r === "number" &&
        typeof candidate.g === "number" &&
        typeof candidate.b === "number" &&
        typeof candidate.a === "number"
    );
}

export function hex6ToRgba(hex: string): RgbaColor {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return FALLBACK_RGBA;
    const n = parseInt(m[1], 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: 1,
    };
}

export function rgbaToHex6(color: RgbaColor): string {
    const r = Math.round(color.r);
    const g = Math.round(color.g);
    const b = Math.round(color.b);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

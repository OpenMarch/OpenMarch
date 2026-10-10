// Pure, no electron imports, so Vitest can load it.
export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const SETTINGS_MIN = { width: 640, height: 420 };
export const SETTINGS_DEFAULT = { width: 760, height: 560 };
const SETTINGS_DEFAULT_MAX = { width: 1200, height: 900 };

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

/** A first-open size that suits the screen: a share of its work area, within sensible bounds. */
export function defaultSettingsSize(workArea: Rectangle) {
    return {
        width: Math.min(
            workArea.width,
            clamp(
                Math.round(workArea.width * 0.6),
                SETTINGS_DEFAULT.width,
                SETTINGS_DEFAULT_MAX.width,
            ),
        ),
        height: Math.min(
            workArea.height,
            clamp(
                Math.round(workArea.height * 0.7),
                SETTINGS_DEFAULT.height,
                SETTINGS_DEFAULT_MAX.height,
            ),
        ),
    };
}

/** Saved bounds if at least their top-left 100×40 is on a connected display; else the fallback. */
export function fitBounds(
    saved: Rectangle | undefined,
    displays: Rectangle[],
    fallback: Rectangle,
): Rectangle {
    if (!saved) return fallback;
    const visible = displays.some(
        (d) =>
            saved.x + 100 > d.x &&
            saved.x < d.x + d.width - 100 &&
            saved.y >= d.y &&
            saved.y + 40 < d.y + d.height,
    );
    if (!visible) return fallback;
    return {
        ...saved,
        width: Math.max(saved.width, SETTINGS_MIN.width),
        height: Math.max(saved.height, SETTINGS_MIN.height),
    };
}

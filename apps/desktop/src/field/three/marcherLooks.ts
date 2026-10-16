import type { FieldTheme, RgbaColor } from "@openmarch/core";
import {
    resolveMarcherLook,
    type AppearanceComponentOptional,
} from "@/entity-components/appearance";

/** Each dot shape's code in the marcher layer's `aShape` attribute. */
export const MARCHER_SHAPE = {
    hidden: -1,
    circle: 0,
    square: 1,
    triangle: 2,
    cross: 3,
} as const;

/** The marcher layer's per-instance look buffers, one entry per marcher. */
export type MarcherLookBuffers = {
    /** rgba in 0–1, four per marcher; an X's line color */
    fill: Float32Array;
    /** rgba in 0–1, four per marcher; transparent for an X */
    outline: Float32Array;
    /** One of {@link MARCHER_SHAPE} per marcher */
    shape: Float32Array;
};

const TRANSPARENT: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };

const write = (out: Float32Array, i: number, color: RgbaColor) => {
    out[i * 4] = color.r / 255;
    out[i * 4 + 1] = color.g / 255;
    out[i * 4 + 2] = color.b / 255;
    out[i * 4 + 3] = color.a;
};

/**
 * Writes each marcher's look, resolved from its appearance stack by the
 * shared {@link resolveMarcherLook} (as the exports), into
 * the layers' per-instance buffers. A null stack is the theme's default.
 */
export function writeMarcherLooks(
    stacks: readonly (AppearanceComponentOptional[] | null)[],
    theme: FieldTheme,
    out: MarcherLookBuffers,
): void {
    for (let i = 0; i < stacks.length; i++) {
        const look = resolveMarcherLook(stacks[i] ?? [], theme);
        if (!look.visible) {
            out.shape[i] = MARCHER_SHAPE.hidden;
            write(out.fill, i, TRANSPARENT);
            write(out.outline, i, TRANSPARENT);
        } else if (look.shape === "cross") {
            out.shape[i] = MARCHER_SHAPE.cross;
            write(out.fill, i, look.crossColor);
            write(out.outline, i, TRANSPARENT);
        } else {
            out.shape[i] = MARCHER_SHAPE[look.shape];
            write(out.fill, i, look.fill);
            write(out.outline, i, look.outline);
        }
    }
}

/** Whether each marcher's label is drawn (`resolveMarcherLook`): 1 or 0, by index in `stacks`. */
export function labelsShown(
    stacks: readonly (AppearanceComponentOptional[] | null)[],
    theme: FieldTheme,
): Uint8Array {
    const shown = new Uint8Array(stacks.length);
    for (let i = 0; i < stacks.length; i++)
        if (resolveMarcherLook(stacks[i] ?? [], theme).labelVisible)
            shown[i] = 1;
    return shown;
}

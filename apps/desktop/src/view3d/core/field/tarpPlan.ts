import { rgbaToString } from "@openmarch/core";
import { planImage } from "./imagePlan";
import {
    pushBorder,
    pushLineX,
    pushLineZ,
    pushRect,
    type PlanContext,
} from "./plan";

/** Tarp marks, from the reference demo's `tarpTexture`. */
export const TARP = {
    mark: "#f4f2ff",
    dot: "rgba(255,255,255,0.18)",
} as const;

/** Steps between tarp marks. */
export const TARP_MARK_STEPS = 5;
const TICK_LENGTH = 0.27;
const TICK_WIDTH = 0.06;
const DOT = 0.1;

/**
 * The `tarp` style (gym kit). With a field background image, the tarp is the
 * image, placed like the 2D canvas (`imageFillOrFit`) over the theme's
 * background and fully opaque: it is the printed tarp, not an editor
 * underlay. Without one, a generated dark tarp with marks every 5 steps from
 * center front along every edge and faint dots at the inner 5-step crossings.
 */
export function planTarp(ctx: PlanContext): void {
    const f = ctx.footprint;
    if (ctx.image) {
        pushRect(
            ctx,
            "background",
            rgbaToString(ctx.theme.background),
            f.minX,
            f.minZ,
            f.maxX,
            f.maxZ,
        );
        ctx.items.push(planImage(ctx, ctx.image, 1));
        return;
    }
    ctx.items.push({ type: "tarpArt", role: "tarpArt" });
    const xs = marks(f.minX, f.maxX, ctx.step * TARP_MARK_STEPS);
    const zs = marks(f.minZ, f.maxZ, ctx.step * TARP_MARK_STEPS);
    for (const x of xs)
        for (const z of zs)
            pushRect(ctx, "dot", TARP.dot, x - DOT, z - DOT, x + DOT, z + DOT);
    for (const x of xs) {
        pushLineZ(
            ctx,
            "tick",
            TARP.mark,
            x,
            TICK_WIDTH,
            f.minZ,
            f.minZ + TICK_LENGTH,
        );
        pushLineZ(
            ctx,
            "tick",
            TARP.mark,
            x,
            TICK_WIDTH,
            f.maxZ - TICK_LENGTH,
            f.maxZ,
        );
    }
    for (const z of zs) {
        pushLineX(
            ctx,
            "tick",
            TARP.mark,
            z,
            TICK_WIDTH,
            f.minX,
            f.minX + TICK_LENGTH,
        );
        pushLineX(
            ctx,
            "tick",
            TARP.mark,
            z,
            TICK_WIDTH,
            f.maxX - TICK_LENGTH,
            f.maxX,
        );
    }
    pushBorder(ctx, TARP.mark, 0.1);
}

/** Multiples of `interval` strictly inside (min, max), from zero. */
function marks(min: number, max: number, interval: number): number[] {
    const out: number[] = [];
    const eps = interval * 1e-6;
    for (let k = Math.ceil(min / interval); k * interval < max - eps; k++) {
        const v = k * interval;
        if (v > min + eps) out.push(v);
    }
    return out;
}

import {
    FieldProperties,
    rgbaToString,
    type Checkpoint,
} from "@openmarch/core";
import {
    checkpointWorld,
    pushBorder,
    pushLineX,
    pushLineZ,
    pushRect,
    visible,
    yardNumberBands,
    type PlanContext,
} from "./plan";
import { planImage } from "./imagePlan";

/**
 * The `theme` style (blank kit): the 2D canvas's field, painted with the
 * `FieldTheme` colors. Mirrors `OpenMarchCanvas.createFieldGrid` element for
 * element, with the editor's default of grid and half lines on. Only the
 * checkpoint labels outside the field's edges are left out, because the
 * surface covers the footprint.
 */
export function planTheme(ctx: PlanContext): void {
    const { fieldProperties: fp, theme, footprint: f } = ctx;
    /** One 2D canvas pixel in meters (2 inches). */
    const px = 0.0254 / FieldProperties.PIXELS_PER_INCH;
    const stroke = FieldProperties.GRID_STROKE_WIDTH * px;

    pushRect(
        ctx,
        "background",
        rgbaToString(theme.background),
        f.minX,
        f.minZ,
        f.maxX,
        f.maxZ,
    );
    if (fp.showFieldImage && ctx.image)
        ctx.items.push(planImage(ctx, ctx.image, fp.backgroundImageOpacity));

    const startZ = gridStartZ(ctx);
    planGridLines(ctx, startZ, rgbaToString(theme.tertiaryStroke), stroke);
    planHalfLines(ctx, startZ, rgbaToString(theme.secondaryStroke), stroke);
    planCheckpoints(ctx, px, stroke);
    planThemeNumbers(ctx);
    pushBorder(ctx, rgbaToString(theme.primaryStroke), stroke * 3);
}

/**
 * Where the y grid starts: the front checkpoint, or the visible checkpoint
 * nearest the front when that one isn't a whole number of steps from the
 * front (as in 2D).
 */
function gridStartZ(ctx: PlanContext): number {
    const ys = [...ctx.fieldProperties.yCheckpoints].sort(
        (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
    );
    if (ys.length === 0) return 0;
    const firstVisible = ys.reduce(
        (prev, cur) =>
            cur.visible && cur.stepsFromCenterFront > prev.stepsFromCenterFront
                ? cur
                : prev,
        ys[ys.length - 1],
    );
    const start =
        firstVisible.stepsFromCenterFront !== 0 &&
        firstVisible.stepsFromCenterFront % 1 !== 0
            ? firstVisible
            : ys[0];
    return checkpointWorld(ctx, start);
}

/** X lines from the center out, every `interval` meters, inside the edges. */
function xLinesFromCenter(ctx: PlanContext, interval: number): number[] {
    const { minX, maxX } = ctx.footprint;
    const xs: number[] = [];
    const eps = interval * 1e-6;
    for (let x = 0; x < maxX - eps; x += interval) xs.push(x);
    for (let x = -interval; x > minX + eps; x -= interval) xs.push(x);
    return xs;
}

/** Z lines from `startZ` toward the back, inside the back edge. */
function zLinesBack(ctx: PlanContext, startZ: number, interval: number) {
    const zs: number[] = [];
    const eps = interval * 1e-6;
    for (let z = startZ; z > ctx.footprint.minZ + eps; z -= interval)
        zs.push(z);
    return zs;
}

function planGridLines(
    ctx: PlanContext,
    startZ: number,
    color: string,
    width: number,
): void {
    for (const x of xLinesFromCenter(ctx, ctx.step))
        pushLineZ(ctx, "grid", color, x, width);
    for (const z of zLinesBack(ctx, startZ, ctx.step))
        pushLineX(ctx, "grid", color, z, width);
}

function planHalfLines(
    ctx: PlanContext,
    startZ: number,
    color: string,
    width: number,
): void {
    const { halfLineXInterval, halfLineYInterval } = ctx.fieldProperties;
    if (halfLineXInterval)
        for (const x of xLinesFromCenter(ctx, halfLineXInterval * ctx.step))
            pushLineZ(ctx, "halfLine", color, x, width);
    if (halfLineYInterval) {
        const interval = halfLineYInterval * ctx.step;
        for (const z of zLinesBack(ctx, startZ - interval, interval))
            pushLineX(ctx, "halfLine", color, z, width);
    }
}

function planCheckpoints(ctx: PlanContext, px: number, stroke: number) {
    const { fieldProperties: fp, theme } = ctx;
    const primary = rgbaToString(theme.primaryStroke);
    const secondary = rgbaToString(theme.secondaryStroke);
    const ys = visible(fp.yCheckpoints);
    const hashHalf = 10 * px;
    for (const xc of visible(fp.xCheckpoints)) {
        const x = checkpointWorld(ctx, xc);
        pushLineZ(ctx, "yardLine", primary, x, stroke);
        if (!fp.useHashes) continue;
        for (const yc of ys) {
            const ref = yc.useAsReference;
            const z = checkpointWorld(ctx, yc);
            pushLineX(
                ctx,
                "hash",
                ref ? primary : secondary,
                z,
                stroke * (ref ? 3 : 2),
                x - hashHalf,
                x + hashHalf,
            );
        }
    }
    if (!fp.useHashes)
        for (const yc of ys)
            pushLineX(ctx, "yLine", primary, checkpointWorld(ctx, yc), stroke);
}

function planThemeNumbers(ctx: PlanContext): void {
    const { home, away } = yardNumberBands(ctx);
    if (!home) return;
    const color = rgbaToString(ctx.theme.fieldLabel);
    const labeled = ctx.fieldProperties.xCheckpoints.filter(
        (c): c is Checkpoint & { fieldLabel: string } => !!c.fieldLabel,
    );
    // fabric's text box is the font size; the digits' cap height is ~0.7 of it.
    const height = (home.outside - home.inside) * 0.7;
    for (const xc of labeled) {
        const x = checkpointWorld(ctx, xc);
        const push = (z: number, rotation: number) =>
            ctx.items.push({
                type: "text",
                role: "yardNumber",
                text: xc.fieldLabel,
                x,
                z,
                height,
                rotation,
                color,
                weight: 400,
            });
        push((home.inside + home.outside) / 2, 0);
        if (away) push((away.inside + away.outside) / 2, Math.PI);
    }
}

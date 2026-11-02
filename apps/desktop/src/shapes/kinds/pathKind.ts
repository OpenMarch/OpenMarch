import tolgee from "@/global/singletons/Tolgee";
import type { Path } from "../geometry/path";
import { sampleAlong } from "../spacing";
import type { ParamGroup, Readout, ShapeContext, Spacing, XY } from "../types";

/** Shared pieces of path kinds (line, arc, curve, ...), so spacing reads the same in each. */

export const SPACING_GROUP: ParamGroup<{ spacing: Spacing }> = {
    get label() {
        return tolgee.t("shapes.kinds.path.spacing", "Spacing");
    },
    fields: [
        {
            type: "spacing",
            key: "spacing",
            get label() {
                return tolgee.t("shapes.kinds.path.spacing", "Spacing");
            },
        },
    ],
};

/** Path kinds start by fitting the marchers' current extent: spacing derived, nothing moves far. */
export const FIT: Spacing = { mode: "fit" };

/** Steps to the hundredth, the same precision the panel's fields show */
export const formatSteps = (fieldUnits: number, ctx: ShapeContext): string => {
    const steps = Math.round((fieldUnits / ctx.stepPx) * 100) / 100;
    return tolgee.t(
        "shapes.kinds.path.readout.steps",
        "{steps, plural, one {# step} other {# steps}}",
        { steps },
    );
};

/** Points along `path` from `from` to `to`, about every half step */
function span(path: Path, from: number, to: number, ctx: ShapeContext): XY[] {
    const count = Math.max(
        2,
        Math.min(4096, Math.ceil(Math.abs(to - from) / (ctx.stepPx / 2)) + 1),
    );
    const points: XY[] = [];
    for (let i = 0; i < count; i++)
        points.push(path.at(from + ((to - from) * i) / (count - 1)));
    return points;
}

/**
 * A path kind's outline: the whole path when fitting, or just the stretch an interval run
 * covers (which may run past the path's ends).
 */
export function pathOutline(
    path: Path,
    spacing: Spacing,
    n: number,
    ctx: ShapeContext,
): XY[][] {
    if (spacing.mode === "fit") return [span(path, 0, path.length, ctx)];
    const slots = sampleAlong(path, spacing, n, ctx.stepPx);
    return [span(path, slots[0]?.s ?? 0, slots.at(-1)?.s ?? 0, ctx)];
}

/** A path kind's faint guide: the drawn path, when an interval run doesn't follow it exactly */
export function pathGuide(
    path: Path,
    spacing: Spacing,
    ctx: ShapeContext,
): XY[][] {
    return spacing.mode === "interval" ? [span(path, 0, path.length, ctx)] : [];
}

export function pathReadouts(
    path: Path,
    spacing: Spacing,
    n: number,
    ctx: ShapeContext,
): Readout[] {
    // On the path, the run can be shorter (or longer) than the shape: say "run" then, so it
    // doesn't read as the shape's length
    if (spacing.mode === "interval" && spacing.size !== "follow") {
        const slots = sampleAlong(path, spacing, n, ctx.stepPx);
        const run = (slots.at(-1)?.s ?? 0) - (slots[0]?.s ?? 0);
        return [
            {
                label: tolgee.t("shapes.kinds.path.readout.run", "Run"),
                value: formatSteps(run, ctx),
            },
        ];
    }
    const readouts: Readout[] = [
        {
            label: tolgee.t("shapes.kinds.path.readout.length", "Length"),
            value: formatSteps(path.length, ctx),
        },
    ];
    if (spacing.mode === "fit" && n > 1) {
        // Straight between neighbors, as drill measures it
        const slots = sampleAlong(path, spacing, n, ctx.stepPx);
        readouts.push({
            label: tolgee.t("shapes.kinds.path.readout.interval", "Interval"),
            value: formatSteps(
                Math.hypot(
                    slots[1]!.x - slots[0]!.x,
                    slots[1]!.y - slots[0]!.y,
                ),
                ctx,
            ),
        });
    }
    return readouts;
}

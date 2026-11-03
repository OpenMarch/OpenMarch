import tolgee from "@/global/singletons/Tolgee";
import { compare as compareMarchers } from "@/global/classes/Marcher";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import type { AssignMarcher } from "../assign";
import type { ShapeContext } from "../types";
import { placedBoxesAt } from "../placed/placedBoxStore";
import { withPlacedOrder } from "../placed/placedOrder";
import { moveCounts, originsAtStart } from "./previewContext";
import type { FieldProperties } from "@openmarch/core";
import { StepSize } from "@/global/classes/StepSize";
import type { ShapeField } from "./shapeField";

export { currentShapeField } from "./shapeField";

/**
 * The field as shape kinds see it. Points snap to the View tab's coordinate rounding, like a
 * marcher drag, unless `snap` is false.
 */
export function shapeContextFor(field: ShapeField, snap = true): ShapeContext {
    const { fieldProperties } = field;
    const { uiSettings } = useUiSettingsStore.getState();
    // The same object for the same field and settings, so work done for it can be known again
    // (`canRecalculate`, #455)
    const last = contexts.get(fieldProperties);
    if (last?.uiSettings === uiSettings && last.snap === snap) return last.ctx;
    const ctx = contextOf(fieldProperties, uiSettings, snap);
    contexts.set(fieldProperties, { uiSettings, snap, ctx });
    return ctx;
}

const contexts = new WeakMap<
    FieldProperties,
    { uiSettings: unknown; snap: boolean; ctx: ShapeContext }
>();

function contextOf(
    fieldProperties: FieldProperties,
    uiSettings: ReturnType<typeof useUiSettingsStore.getState>["uiSettings"],
    snap: boolean,
): ShapeContext {
    return {
        stepPx: fieldProperties.pixelsPerStep,
        field: { width: fieldProperties.width, height: fieldProperties.height },
        // Worked out when read: the move's counts change while this object is reused
        get steps() {
            return stepLimit(fieldProperties);
        },
        snapPoint: (p) => {
            if (!snap) return p;
            const rounded = getRoundCoordinates2({
                coordinate: { xPixels: p.x, yPixels: p.y },
                fieldProperties,
                uiSettings,
            });
            return { x: rounded.xPixels, y: rounded.yPixels };
        },
    };
}

/**
 * The marchers with these ids where the field draws them now (the edit window's arrival), in
 * `ids` order, ranked by drill number, with where each starts the move being edited when that's
 * somewhere else, and each one's place along the placed Line they all stand on, if they do (#528).
 */
export function marchersOnField(
    field: ShapeField,
    ids: readonly number[],
): AssignMarcher[] {
    const drawn = field.drawn(ids);
    const byId = new Map(field.marchers().map((m) => [m.id, m]));
    const present = ids.flatMap((id) => {
        const marcher = byId.get(id);
        const at = drawn.get(id);
        return marcher && at ? [{ id, marcher, at }] : [];
    });
    const ranked = [...present].sort((a, b) =>
        compareMarchers(a.marcher, b.marcher),
    );
    const rank = new Map(ranked.map((m, i) => [m.id, i]));
    const origins = originsAtStart(present.map((m) => m.id));
    const marchers = present.map((m): AssignMarcher => {
        const { at } = m;
        const from = origins.get(m.id);
        return {
            id: m.id,
            at,
            drillRank: rank.get(m.id)!,
            ...(from && Math.hypot(from.x - at.x, from.y - at.y) > 1e-6
                ? { from }
                : {}),
        };
    });
    return withPlacedOrder(
        marchers,
        placedBoxesAt(displayedBeat(useTimelineSelectionStore.getState())),
    );
}

/**
 * The biggest step the move allows: the field's step size warning over the move's counts.
 * None at Home, with no move, or with the warning off (a threshold of 0).
 */
function stepLimit(fieldProperties: FieldProperties): ShapeContext["steps"] {
    const counts = moveCounts();
    const threshold = fieldProperties.stepSizeWarningThresholdInches;
    if (!counts || counts <= 0 || !(threshold > 0)) return undefined;
    return {
        counts,
        // Inches per step over inches per 8-to-5 step, in field units; the 0.5 inch tolerance
        // matches StepSize.exceedsThreshold
        maxPerCount:
            ((threshold + 0.5) / fieldProperties.stepSizeInches) *
            fieldProperties.pixelsPerStep,
        // Five yards over the inches a step may take
        limit: tolgee.t("shapes.field.stepLimit", "{steps} to 5", {
            steps: String(Math.round((180 / threshold) * 10) / 10),
        }),
        describe: (distance) =>
            StepSize.fromDistance({
                marcher_id: -1,
                distance,
                counts,
                fieldProperties,
            }).displayString(),
    };
}

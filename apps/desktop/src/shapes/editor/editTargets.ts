import { useEffect, useMemo, useRef } from "react";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useQueryClient } from "@tanstack/react-query";
import { carryPivot } from "../frame/pivot";
import { currentShapeField, shapeContextFor } from "../field/shapeFieldContext";
import {
    clearReleasedPreview,
    previewPlacedBox,
    releasePlacedBoxPreview,
    useBoxSelectionStore,
} from "../placed/boxSelectionStore";
import { originsAtStart } from "../field/previewContext";
import { commitBox } from "../placed/commitBox";
import { recalculatedTargets } from "../placed/liveBox";
import {
    canCloseUp,
    closedUpParams,
    type PlacedBox,
} from "../placed/placedBox";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { toolEnvFor } from "../tool/toolEnv";
import { useDrawnOnPage } from "../placed/placedBoxText";
import {
    beginEdit,
    cancelGesture,
    edit,
    canRecalculate,
    previewEdit,
    recalculate,
    release,
} from "../tool/toolMachine";
import {
    updateTool,
    useShapeHidden,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import type { AnyToolKind } from "../tool/toolKind";
import { useApplyShape } from "../tool/useShapeToolActions";

/**
 * What the floating editor edits (08-shape-system-ux.md, "The floating editor"): the shape the
 * tool has open, which waits for Place, or a selected placed shape, which saves each edit on
 * release. The editor itself doesn't know which, nor the shape's kind: it shows the numbers the
 * kind declares.
 */
export interface ShapeEditTarget {
    readonly kind: AnyToolKind;
    readonly params: unknown;
    /** Spots in the shape, holes included */
    readonly spots: number;
    /** Spots no member stands on any more (a placed shape's holes) */
    readonly empty: number;
    /** Place, for a new shape; absent for a placed one */
    readonly place?: () => void;
    /** "Page 3", when a placed shape was drawn on an earlier page than the one shown */
    readonly drawnOn: string | null;
    /** A number's drag starts, moves and ends: one change when it's kept */
    begin(): void;
    preview(params: unknown): void;
    end(keep: boolean): void;
    /** One change at once: a typed number, a button */
    apply(params: unknown): void;
    /**
     * One change worked out from the shape as it is now, not as the editor last drew it: a key
     * pressed twice before the editor redraws turns it twice (review). A placed shape takes no
     * new change while the last one is still being saved.
     */
    update(change: (params: unknown) => unknown): void;
    /**
     * Recalculate who goes where (#429): the marchers on the shape's spots by least travel from
     * where they come from, as one change. Null when that changes nothing, so the button is
     * disabled; moving and turning keep who goes where until it's pressed.
     */
    readonly recalculate: (() => void) | null;
    /**
     * Close up (#392): a placed closed shape with holes laid out again for its members, as one
     * change. Absent for a new shape, and for a placed one with no holes or an open kind.
     */
    readonly closeUp?: () => void;
}

const withField = (run: (ctx: ReturnType<typeof shapeContextFor>) => void) => {
    const field = currentShapeField();
    if (field) run(shapeContextFor(field));
};

/**
 * The open tool's shape, or null with none open, none drawn yet, or the shape waiting out of
 * sight (#416, `useShapeHidden`)
 */
export function useToolEditTarget(): ShapeEditTarget | null {
    const tool = useShapeToolStore((s) => s.tool);
    const away = useShapeHidden();
    const place = useApplyShape();
    // During a drag it isn't worked out (a full least-travel solve): it keeps what it last was,
    // so the button doesn't go off and flash back on around every drag (#429)
    const lastCan = useRef(false);
    return useMemo(() => {
        if (!tool || tool.params === null || away) return null;
        const can = tool.gesture ? lastCan.current : toolCanRecalculate(tool);
        lastCan.current = can;
        return {
            kind: tool.kind,
            params: tool.params,
            spots: tool.spots,
            empty: 0,
            place: () => void place(),
            drawnOn: null,
            begin: () => updateTool(beginEdit),
            preview: (params) => updateTool((t) => previewEdit(t, params)),
            end: (keep) =>
                keep
                    ? withField((ctx) => updateTool((t) => release(t, ctx)))
                    : updateTool(cancelGesture),
            apply: (params) =>
                withField((ctx) => updateTool((t) => edit(t, params, ctx))),
            update: (change) =>
                withField((ctx) =>
                    updateTool((t) =>
                        t.params === null || t.gesture
                            ? t
                            : edit(t, change(t.params), ctx),
                    ),
                ),
            recalculate: can
                ? () =>
                      withField((ctx) => updateTool((t) => recalculate(t, ctx)))
                : null,
        };
    }, [tool, away, place]);
}

/** How long a saved drag's preview may outlast the save before the box is read back */
const PREVIEW_HOLD_MS = 1000;

/**
 * Runs a write of `box`, unless one started from it is still going: until it's read back, `box`
 * is the old one, and a change worked out from it would undo the last (review)
 */
export const oneWriteAtATime =
    (
        writing: { current: PlacedBox | null },
        queued: { current: Change[] },
        box: PlacedBox,
    ) =>
    (run: () => Promise<void>) => {
        if (writing.current === box) return;
        writing.current = box;
        const done = () => {
            if (writing.current !== box) return;
            writing.current = null;
            queued.current = [];
        };
        // The box read back normally moves on first (a new box), and the changes waiting for it
        // go on from there, however slow the read back is (a busy machine took over a second and
        // dropped the second of two quick Alt+R presses). A failed write mustn't stick, nor the
        // changes waiting for it; nor a write whose box never comes back
        void run().then(
            () => setTimeout(done, READ_BACK_LIMIT_MS),
            () => done(),
        );
    };

/** How long a saved shape may take to be read back before the presses waiting for it are dropped */
const READ_BACK_LIMIT_MS = 3000;

type Change = (params: unknown) => unknown;

/** The box read back after a write: the changes that waited for it, as one more change */
function useWaitingChanges(
    target: ShapeEditTarget | null,
    queued: { current: Change[] },
) {
    useEffect(() => {
        if (!target || queued.current.length === 0) return;
        const changes = queued.current;
        queued.current = [];
        target.update((params) =>
            changes.reduce<unknown>((p, change) => change(p), params),
        );
    }, [target, queued]);
}

/** The selected placed shape, of any kind, or null with none selected */
export function usePlacedEditTarget(): ShapeEditTarget | null {
    const box = useBoxSelectionStore((s) => s.selected);
    const queryClient = useQueryClient();
    const drawnOn = useDrawnOnPage(box);
    const resolverVersion = useTimelineResolverStore((s) => s.version);
    /** The box a write started from, until a newer one is read back */
    const writing = useRef<PlacedBox | null>(null);
    /** Changes asked for while it was being written, for the box read back */
    const queued = useRef<Change[]>([]);
    // Where the members come from moves with the start flag
    const startFlag = useTimelineSelectionStore((s) =>
        s.isolation
            ? s.isolation.start
            : s.selection.kind === "range"
              ? s.selection.start
              : null,
    );
    const target = useMemo((): ShapeEditTarget | null => {
        if (!box) return null;
        const write = oneWriteAtATime(writing, queued, box);
        const save = (params: unknown) =>
            write(() =>
                commitBox(box, params, queryClient).finally(() =>
                    // Normally the box read back replaces the preview first (useShapeFieldModes)
                    setTimeout(clearReleasedPreview, PREVIEW_HOLD_MS, params),
                ),
            );
        return {
            kind: box.kind,
            params: box.params,
            spots: box.spots,
            empty: box.spots - box.recipe.members.length,
            drawnOn,
            begin: () => previewPlacedBox(box.params),
            preview: (params) =>
                previewPlacedBox(carryPivot(box.params, params)),
            end: (keep) => {
                const params = releasePlacedBoxPreview();
                if (keep && params && params !== box.params) save(params);
                else previewPlacedBox(null);
            },
            apply: (params) => {
                if (params !== box.params) save(carryPivot(box.params, params));
            },
            update: (change) => {
                // Mid-write, the change waits for the box read back, so presses add up
                if (writing.current === box) {
                    queued.current.push(change);
                    return;
                }
                const params = change(box.params);
                if (params !== box.params) save(carryPivot(box.params, params));
            },
            // With no start flag (at home) there's nowhere else to come from
            recalculate:
                startFlag !== null && placedCanRecalculate(box)
                    ? () =>
                          write(() =>
                              commitBox(
                                  box,
                                  box.params,
                                  queryClient,
                                  true,
                                  originsOf(box),
                              ),
                          )
                    : null,
            ...(canCloseUp(box) && {
                closeUp: () => {
                    const field = currentShapeField();
                    if (!field) return;
                    const params = closedUpParams(
                        box,
                        box.recipe.members.length,
                        toolEnvFor(field),
                    );
                    // Least travel, whatever order it was laid out in (spec #385)
                    if (params !== null)
                        write(() => commitBox(box, params, queryClient, true));
                },
            }),
        };
        // `resolverVersion` changes whenever the resolver's answers may have: where members come
        // from moves with an undo or redo at the start flag too (review)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box, queryClient, drawnOn, startFlag, resolverVersion]);
    useWaitingChanges(target, queued);
    return target;
}

const toolCanRecalculate = (tool: Parameters<typeof canRecalculate>[0]) => {
    const field = currentShapeField();
    return !!field && canRecalculate(tool, shapeContextFor(field));
};

/** Where a placed shape's members come from: the start flag */
const originsOf = (box: PlacedBox) =>
    originsAtStart(box.recipe.members.map((m) => m.marcherId));

const placedCanRecalculate = (box: PlacedBox) => {
    const field = currentShapeField();
    return (
        !!field &&
        recalculatedTargets(box, shapeContextFor(field), originsOf(box)) !==
            null
    );
};

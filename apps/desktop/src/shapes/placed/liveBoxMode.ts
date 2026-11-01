import type { PivotKey } from "../frame/frame";
import type { QueryClient } from "@tanstack/react-query";
import type {
    FieldMode,
    FieldModePress,
    FieldPointer,
} from "@/field/editor/fieldEditor";
import {
    drillNumbers,
    frameDrawing,
    guideDrawing,
    memoDrawing,
    shapeCursor,
    SPOT_LABEL_LIMIT,
} from "../field/fieldModeBase";
import { currentShapeField, shapeContextFor } from "../field/shapeFieldContext";
import {
    shapeOutline,
    shapeTargetAt,
    type ShapeTarget,
} from "../frame/gestures";
import { toolEnvFor } from "../tool/toolEnv";
import { pressShapeKeys, type HeldFieldGesture } from "../field/heldGesture";
import { commitBox } from "./commitBox";
import {
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    releaseLive,
    type LiveBox,
} from "./liveBox";
import type { PlacedBox } from "./placedBox";
import { enterBox } from "./boxSelection";
import {
    usePlacedBoxPreviewStore,
    useSavingBoxStore,
} from "./boxSelectionStore";
import { outlineGapAt } from "../distribute/outlineGap";
import type { AnyToolKind } from "../tool/toolKind";
import type { XY } from "../types";
import type { Roles } from "@/input/modifierRoles";
import {
    setShapeDragging,
    setShapePointerOver,
    shapeCalm,
    useShapePointerStore,
    guideGesture,
} from "../field/shapePointer";

/** What a press that reaches inside keeps for the box: its pivot, handles and knob */
const OWN_CONTROLS: ReadonlySet<ShapeTarget["type"]> = new Set([
    "pivot",
    "handle",
    "rotate",
]);

/** An odd-count outline's gap, the spot nobody stands on by design (#390) */
function gapsOf(kind: AnyToolKind, params: unknown, n: number) {
    const gap = outlineGapAt(kind, params, n);
    return gap ? [gap] : [];
}

/** The shape as drawn: mid-gesture, or as a number dragged in its floating editor has it */
interface Shown {
    readonly live: LiveBox;
    readonly preview: unknown;
    /** The controls are calm: the pointer away, as on the open shape (#430) */
    readonly calm: boolean;
    /** The pivot a cell of the editor's pivot menu points at (#437), drawn by `frameDrawing` */
    readonly pivotPreview: PivotKey | null;
    /** A spacing number is being dragged: guides as for a move (#452) */
    readonly scrubbing: boolean;
}

const drawingOf = memoDrawing(
    ({ live: saved, preview, calm, scrubbing }: Shown) => {
        const live =
            preview && !saved.gesture ? { ...saved, params: preview } : saved;
        const changing = live.gesture !== null || preview !== null;
        const field = currentShapeField();
        if (!field) return null;
        const { kind, spots: n } = live.box;
        const ctx = shapeContextFor(field);
        // Each member keeps their spot (or the box is laid out again for a new count across); a
        // spread drafts its spots while a handle is dragged (#439), and the commit lays them out
        const targets = changing
            ? liveTargets(
                  live.box,
                  live.params,
                  live.gesture ? { ...ctx, draft: true } : ctx,
              ).members
            : [];
        const names = drillNumbers(field);
        const env = toolEnvFor(field);
        return {
            stage: "open" as const,
            outline: shapeOutline(kind, live.params, n),
            // While a gesture goes, where the marchers will stand, and who
            spots: targets,
            walks: [],
            labels:
                targets.length <= SPOT_LABEL_LIMIT
                    ? targets.map((t) => ({
                          at: t,
                          text: names.get(t.marcherId) ?? "",
                      }))
                    : [],
            calm,
            handles: kind.handles(live.params, n).map((h) => h.at),
            gaps: gapsOf(kind, live.params, n),
            ...frameDrawing(
                kind,
                live.params,
                n,
                live.gesture,
                live.pointer ?? null,
                env,
            ),
            ...guideDrawing(
                kind,
                live.params,
                n,
                targets,
                guideGesture(live.gesture, scrubbing),
                env,
                field,
            ),
        };
    },
);

/**
 * A selected placed shape of any kind, edited in place (07-placed-boxes.md), as a field editor
 * mode: it claims presses on its handles and inside it. Its handles resize it (a box's stretch it),
 * a drag inside moves it, and each gesture is saved when it ends, as one undo step. A double click
 * on a member goes inside the box. A press that reaches inside ($mod on a member, away from the
 * box's controls) and other presses go through the editor's rules as usual. The selection box's own handles (#198) are off while it's on.
 */
export class LiveBoxMode implements FieldMode {
    private live: LiveBox;
    private readonly listeners = new Set<() => void>();
    readonly ownsSelectionBox = true;
    // The box turns with its own knob; the selection's typed rotation would take its members off
    // their spots
    readonly locksSelection = true;
    readonly gesture = { kind: "box", always: false } as const;

    private shown: Shown | null = null;
    /** The held roles of the gesture under way, from its press to its end */
    private held: HeldFieldGesture | null = null;

    constructor(
        box: PlacedBox,
        private readonly queryClient: QueryClient,
    ) {
        this.live = openLive(box);
    }

    /** The box was saved or changed elsewhere; mid-gesture, the gesture's own box stays */
    setBox(box: PlacedBox): void {
        if (this.live.gesture) return;
        this.live = openLive(box);
        this.emit();
    }

    claims(pointer: FieldPointer, press: FieldModePress): boolean {
        return (
            !this.yieldsToEditor(pointer, press) &&
            this.pressed(pointer) !== null
        );
    }

    /**
     * A press that reaches inside a placed box, by the field editor's own rule: the editor's,
     * which picks that marcher out of the box. Where the editor says no (you're inside this box
     * already, no member under the press), $mod is `constrain` on the box's own move. The box's
     * controls drawn over a member keep their press: on the pivot (the crosshair, or the center
     * dot that $mod pulls the pivot out of) $mod is reach inside's, and on a handle or the knob
     * it's `constrain` (on a corner, an equal-spaced resize).
     */
    private yieldsToEditor(
        pointer: FieldPointer,
        press: FieldModePress,
    ): boolean {
        if (!press.reachesInside()) return false;
        const field = currentShapeField();
        if (!field) return false;
        const { kind, params, spots } = this.live.box;
        const target = shapeTargetAt(kind, params, spots, pointer.field, {
            ...toolEnvFor(field),
            reachInside: true,
        });
        return !target || !OWN_CONTROLS.has(target.type);
    }

    press(pointer: FieldPointer, { isMac }: FieldModePress): void {
        const field = currentShapeField();
        this.endHeld();
        if (!field) return;
        const { held, reachInside } = pressShapeKeys(
            pointer,
            {
                kind: this.live.box.kind,
                params: this.live.box.params,
                n: this.live.box.spots,
            },
            (reachInside) =>
                shapeTargetAt(
                    this.live.box.kind,
                    this.live.box.params,
                    this.live.box.spots,
                    pointer.field,
                    { ...toolEnvFor(field), reachInside },
                ),
            (at, roles) => this.rerun(at, roles),
            isMac,
        );
        this.held = held;
        this.live =
            pressLive(this.live, pointer.field, {
                ...toolEnvFor(field, held.roles()),
                reachInside,
            }) ?? this.live;
        this.emit();
    }

    move(pointer: FieldPointer): void {
        const field = currentShapeField();
        if (!field) return;
        this.live = moveLive(
            this.live,
            pointer.field,
            toolEnvFor(field, this.held?.move(pointer)),
        );
        this.emit();
    }

    /** A role key pressed or released mid-drag: the last move again, at the last pointer */
    private rerun(at: XY, roles: Roles): void {
        const field = currentShapeField();
        if (!field) return;
        this.live = moveLive(this.live, at, toolEnvFor(field, roles));
        this.emit();
    }

    private endHeld(): void {
        this.held?.end();
        this.held = null;
    }

    release(pointer: FieldPointer, click: { double: boolean } | null): void {
        this.endHeld();
        const before = this.live;
        const out = releaseLive(before, click);
        this.live = out.live;
        if (out.changed) {
            void commitBox(before.box, out.live.params, this.queryClient);
            // The next press goes on from the shape as saved, before the selection hears of it
            const saving = useSavingBoxStore.getState().box;
            if (saving) this.live = openLive(saving);
        }
        this.emit();
        if (!out.changed && click?.double) this.enterAt(pointer);
    }

    cancel(): void {
        this.endHeld();
        this.live = openLive(this.live.box);
        this.emit();
    }

    leave(): void {
        setShapePointerOver(false);
    }

    cursorAt(pointer: FieldPointer) {
        const field = currentShapeField();
        if (!field) return null;
        const { kind } = this.live.box;
        const target = shapeTargetAt(
            kind,
            this.live.params,
            this.live.box.spots,
            pointer.field,
            toolEnvFor(field),
        );
        // The editor asks for the cursor as the pointer moves, so this is where hovering is seen
        setShapePointerOver(target !== null);
        return target
            ? shapeCursor(kind, this.live.params, this.live.box.spots, target)
            : null;
    }

    drawing() {
        const preview = usePlacedBoxPreviewStore.getState().params;
        const calm = shapeCalm(this.live.gesture !== null);
        const { pivotPreview, scrubbing } = useShapePointerStore.getState();
        if (
            this.shown?.live !== this.live ||
            this.shown.preview !== preview ||
            this.shown.calm !== calm ||
            this.shown.pivotPreview !== pivotPreview ||
            this.shown.scrubbing !== scrubbing
        )
            this.shown = {
                live: this.live,
                preview,
                calm,
                pivotPreview,
                scrubbing,
            };
        return drawingOf(this.shown);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        const unsubscribe = usePlacedBoxPreviewStore.subscribe(listener);
        const offPointer = useShapePointerStore.subscribe(listener);
        return () => {
            this.listeners.delete(listener);
            unsubscribe();
            offPointer();
        };
    }

    private pressed(pointer: FieldPointer): LiveBox | null {
        const field = currentShapeField();
        if (!field) return null;
        return pressLive(this.live, pointer.field, toolEnvFor(field));
    }

    /** Goes inside the box at the member nearest `pointer` */
    private enterAt(pointer: FieldPointer): void {
        const at = pointer.field;
        let best: { id: number; d: number } | null = null;
        for (const m of this.live.box.recipe.members) {
            const d = Math.hypot(m.x - at.x, m.y - at.y);
            if (!best || d < best.d) best = { id: m.marcherId, d };
        }
        if (best) enterBox(best.id);
    }

    private emit(): void {
        // The floating editor stays faded through a gesture, as the open shape's does (#426)
        setShapeDragging(this.live.gesture !== null);
        for (const listener of this.listeners) listener();
    }
}

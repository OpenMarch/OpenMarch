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
    handleDrawing,
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
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { commitBox, sameParams } from "./commitBox";
import {
    clearLiveSelection,
    liveTargets,
    moveLive,
    openLive,
    pickLive,
    pressLive,
    releaseLive,
    reopenLive,
    type LiveBox,
    type LiveClick,
} from "./liveBox";
import type { PlacedBox } from "./placedBox";
import { enterBox } from "./boxSelection";
import {
    usePlacedBoxPreviewStore,
    useSavingBoxStore,
} from "./boxSelectionStore";
import { outlineGapAt } from "../distribute/outlineGap";
import { openHandleMenu } from "../field/handleMenu";
import { groupDrawing } from "../field/groupDrawing";
import { stepDrawing } from "../field/stepDrawing";
import type { GroupMenuState } from "../field/shapePointer";
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
    /** The editor's group menu is open, and the group lit (#526 follow-up) */
    readonly groupMenu: GroupMenuState | null;
    /** A number setting the kind's step is engaged: the step drawn (owner on #596) */
    readonly stepShown: boolean;
}

const drawingOf = memoDrawing(
    ({
        live: saved,
        preview,
        calm,
        scrubbing,
        groupMenu,
        stepShown,
    }: Shown) => {
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
            openOutline: kind.outlineOpen?.(live.params, n) ?? false,
            construction: kind.construction?.(live.params, n) ?? [],
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
            ...handleDrawing(kind, live.params, n, live.selected),
            gaps: gapsOf(kind, live.params, n),
            ...stepDrawing(
                kind,
                live.params,
                n,
                stepShown,
                live.gesture,
                env.stepPx,
            ),
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
            // The members stand on the spots, laid out in order along the shape
            ...(groupMenu
                ? groupDrawing(
                      kind,
                      live.params,
                      n,
                      kind.shape.generate(live.params, n, ctx),
                      groupMenu,
                      env.stepPx,
                  )
                : {}),
        };
    },
);

/** The live mode of the selected placed shape, for its keys; null with none selected */
let activeLive: LiveBoxMode | null = null;

/** Sets the selected placed shape's live mode, or null when none is selected */
export const setActiveLiveBox = (mode: LiveBoxMode | null): void => {
    activeLive = mode;
};

/**
 * The live mode to keep for `box`, though it's a new recipe: the one with a gesture under way on
 * these marchers at this moment. An earlier save reading back as this page's own copy of the shape
 * mustn't end a drag that's still held.
 */
export const liveBoxHolding = (box: PlacedBox): LiveBoxMode | null =>
    activeLive?.holds(box) ? activeLive : null;

/**
 * Escape on a selected placed shape with a handle selected (#557): clears that, and says whether
 * there was one, so the same press doesn't also deselect the shape
 */
export const clearLiveBoxSelection = (): boolean =>
    activeLive?.clearSelection() ?? false;

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
    /** The shape this mode last saved, until it's read back: the selection outlives only that */
    private saved: unknown = undefined;
    /** The beat shown when the gesture under way was pressed */
    private pressedAt: number | null = null;
    /** The box as last read during a gesture, for when the gesture changes nothing */
    private readDuringGesture: PlacedBox | null = null;

    constructor(
        box: PlacedBox,
        private readonly queryClient: QueryClient,
    ) {
        this.live = openLive(box);
    }

    /**
     * The box was saved or changed elsewhere; mid-gesture, the gesture's own box stays. The
     * selected handle stays only through this mode's own save (#557): an undo or redo clears it.
     */
    setBox(box: PlacedBox): void {
        if (this.live.gesture) {
            this.readDuringGesture = box;
            return;
        }
        this.readDuringGesture = null;
        const saved = this.saved;
        // Read again unchanged (the playhead moved), the save may still be on its way
        if (!sameParams(box.params, this.live.box.params))
            this.saved = undefined;
        this.live = reopenLive(this.live, box, saved);
        this.emit();
    }

    /** Whether a gesture is under way on `box`'s marchers, at the moment it was pressed */
    holds(box: PlacedBox): boolean {
        if (!this.live.gesture) return false;
        if (
            this.pressedAt !==
            displayedBeat(useTimelineSelectionStore.getState())
        )
            return false;
        const ids = new Set(box.recipe.members.map((m) => m.marcherId));
        const { members } = this.live.box.recipe;
        return (
            members.length === ids.size &&
            members.every((m) => ids.has(m.marcherId))
        );
    }

    /** Escape with a handle selected (#557): clears it, and says whether there was one */
    clearSelection(): boolean {
        if (!this.live.selected) return false;
        this.live = clearLiveSelection(this.live);
        this.emit();
        return true;
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
        const target = shapeTargetAt(
            kind,
            params,
            spots,
            pointer.field,
            { ...toolEnvFor(field), reachInside: true },
            this.live.selected,
        );
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
                    this.live.selected,
                ),
            (at, roles) => this.rerun(at, roles),
            isMac,
        );
        this.held = held;
        this.pressedAt = displayedBeat(useTimelineSelectionStore.getState());
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

    release(pointer: FieldPointer, click: LiveClick | null): void {
        this.endHeld();
        const before = this.live;
        const out = releaseLive(before, click);
        this.live = out.live;
        if (out.changed) {
            this.saved = out.live.params;
            void commitBox(before.box, out.live.params, this.queryClient);
            // The next press goes on from the shape as saved, before the selection hears of it
            const saving = useSavingBoxStore.getState().box;
            if (saving) this.live = openLive(saving, this.live.selected);
            this.readDuringGesture = null;
        }
        this.catchUp();
        this.emit();
        if (!out.changed && out.enter) this.enterAt(pointer);
    }

    /** A right-click on a handle with a menu (a Line's point or segment, #569) opens it */
    openMenu(pointer: FieldPointer): boolean {
        const field = currentShapeField();
        if (!field || this.live.gesture) return false;
        const { kind, spots } = this.live.box;
        const target = shapeTargetAt(
            kind,
            this.live.params,
            spots,
            pointer.field,
            toolEnvFor(field),
            this.live.selected,
        );
        return openHandleMenu(
            kind,
            this.live.params,
            spots,
            target,
            pointer.screen,
            (key, value) => this.pickMenu(key, value),
        );
    }

    /**
     * An entry of a handle's menu picked: saved as one undo step when it changed something. The
     * shape after it, for the menu.
     */
    private pickMenu(
        key: string,
        value: string,
    ): { params: unknown; n: number } | null {
        const field = currentShapeField();
        if (!field) return null;
        const before = this.live;
        const out = pickLive(before, key, value, toolEnvFor(field));
        this.live = out.live;
        if (out.changed) {
            this.saved = out.live.params;
            void commitBox(before.box, out.live.params, this.queryClient);
            const saving = useSavingBoxStore.getState().box;
            if (saving) this.live = openLive(saving, this.live.selected);
        }
        this.emit();
        return { params: this.live.params, n: this.live.box.spots };
    }

    cancel(): void {
        this.endHeld();
        this.live = openLive(this.live.box, this.live.selected);
        this.catchUp();
        this.emit();
    }

    /** A gesture that ended without a save takes the box read while it was held */
    private catchUp(): void {
        if (this.readDuringGesture) this.setBox(this.readDuringGesture);
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
            this.live.selected,
        );
        // The editor asks for the cursor as the pointer moves, so this is where hovering is seen
        setShapePointerOver(target !== null);
        return target
            ? shapeCursor(
                  kind,
                  this.live.params,
                  this.live.box.spots,
                  target,
                  this.live.selected,
              )
            : null;
    }

    drawing() {
        const preview = usePlacedBoxPreviewStore.getState().params;
        const calm = shapeCalm(this.live.gesture !== null);
        const { pivotPreview, scrubbing, groupMenu, stepShown } =
            useShapePointerStore.getState();
        if (
            this.shown?.live !== this.live ||
            this.shown.preview !== preview ||
            this.shown.calm !== calm ||
            this.shown.pivotPreview !== pivotPreview ||
            this.shown.scrubbing !== scrubbing ||
            this.shown.groupMenu !== groupMenu ||
            this.shown.stepShown !== stepShown
        )
            this.shown = {
                live: this.live,
                preview,
                calm,
                pivotPreview,
                scrubbing,
                groupMenu,
                stepShown,
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

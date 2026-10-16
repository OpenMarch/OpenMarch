import type { FieldTestGesture } from "@/field/fieldTestApi";
import {
    startLasso,
    startMarquee,
    type AreaGesture,
    type AreaPorts,
    type AreaShape,
} from "./areaGestures";
import {
    boundsOf,
    centerOf,
    handleAt,
    handleCursor,
    handlePoints,
    rotatePositions,
    type HandleId,
    type SelectionFrame,
} from "./groupTransform";
import { hitRadius, marcherAt, type DrawnMarchers } from "./hitTest";
import { LineTool, type LineToolShape, type StepGrid } from "./lineTool";
import {
    MoveGesture,
    type MarcherPosition,
    type MoveTransform,
} from "./moveGesture";
import type { FieldRect } from "./selectionArea";
import { selectionAfterClick } from "./selectionRules";
import { RotateGesture, ScaleGesture } from "./transformGestures";
import { isPanButton } from "./view";

/**
 * The field editor (ADR 0005 D-1): what a press, click or drag on the field
 * does. Plain TypeScript, with no React and no renderer. A field renderer
 * reports pointer events to it and draws what it says; the editor never
 * draws.
 *
 * It owns no copy of the selection: it reads and writes the app's (the
 * inspector's and the timeline's) through {@link FieldEditorPorts.selection}.
 */

/** A point in field units, as the timeline stores positions. */
export type FieldPoint = { x: number; y: number };

/**
 * One pointer event, as the renderer reports it: where it is on the field and
 * on screen, and which button and modifiers are down.
 */
export type FieldPointer = {
    /** Field units. */
    field: FieldPoint;
    /** CSS pixels from the field element's top-left. Distances on screen (the click slop) use these. */
    screen: FieldPoint;
    /** The button that changed (`PointerEvent.button`): 0 is the primary button. */
    button: number;
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
};

/** What the editor reads from, and writes to, the rest of the app. */
export type FieldEditorPorts = {
    /** The app's marcher selection: the one selection, shared with the inspector and timeline. */
    selection: {
        get(): readonly number[];
        set(ids: readonly number[]): void;
    };
    /** The marchers drawn, where they're drawn. */
    marchers(): DrawnMarchers;
    /** The view's zoom, in CSS pixels per field unit. */
    zoom(): number;
    /** False for a marcher that can't be selected or hit (one dimmed outside the isolated move). */
    canSelect(id: number): boolean;
    /**
     * Called once at the start of every edit press, before the editor does
     * anything with it. The app may act on the press here (story 60: the
     * first press after a paused preview clears the preview) and returns
     * true when it takes it, so the editor selects, drags and drops nothing.
     */
    takePress?(): boolean;
    /**
     * How far the selection box drawn around a multi-selection reaches past
     * its outermost marchers, in field units. A drag from inside it moves the
     * selection, and its handles (#198) sit on it. 0 when omitted.
     */
    selectionBoxPadding?(): number;
    /**
     * Draws these marchers at these positions instead of where the show has
     * them (a drag, then a drop waiting to be saved); null draws the show.
     */
    showPositions(positions: ReadonlyMap<number, FieldPoint> | null): void;
    /**
     * Saves dropped marchers through the timeline's rules. Resolves "saved"
     * once the field can draw the show with the drop in it, or "refused" when
     * nothing was saved (the reason has been shown).
     */
    drop(positions: readonly MarcherPosition[]): Promise<DropResult>;
    /**
     * The line tool finished a line (#203): where it puts its marchers, for
     * the app to apply (Shift+Enter).
     */
    lineFinished?(targets: readonly MarcherPosition[]): void;
    /** The step grid line points round to; null before the field loads. */
    stepGrid?(): StepGrid | null;
};

export type DropResult = "saved" | "refused";

export type FieldEditorOptions = {
    /** On a Mac, Ctrl+press is a right-click, which pans (navigation's, not the editor's). */
    isMac?: boolean;
    /** The time in milliseconds, for double-clicks. Defaults to `performance.now`. */
    now?: () => number;
    /** Where a drag puts the marchers for a pointer delta; snapping and locks are #197's. */
    moveTransform?: MoveTransform;
};

/**
 * A press that moves less than this far, in screen pixels, is a click: it
 * never moves anything. There's no time limit (rules table: Click vs drag).
 */
export const CLICK_SLOP = 4;

/** How long a drop may take to save before the editor logs that it hasn't settled. */
const DROP_SETTLE_WARNING_MS = 30_000;

/**
 * A press within this many milliseconds and screen pixels of a click on empty
 * field is its double-click: dragged, it draws a lasso (rules table: Lasso).
 */
export const DOUBLE_CLICK_MS = 500;
export const DOUBLE_CLICK_SLOP = 8;

/**
 * A gesture the editor runs once a press becomes a drag: marquee, lasso
 * (#195), move (#196), scale and rotate (#198), line (#203).
 */
export interface FieldGesture {
    readonly kind: FieldTestGesture;
    move(pointer: FieldPointer): void;
    end(pointer: FieldPointer): void;
    cancel(): void;
}

/** A primary-button press that hasn't become a drag (yet). */
export type FieldPress = {
    start: FieldPointer;
    /** The marcher pressed on, or null on empty field or a handle. */
    hit: number | null;
    /** The selection box's handle pressed on (#198), which wins over a marcher under it. */
    handle: HandleId | null;
    /** The second press of a double-click on empty field. */
    double: boolean;
};

/** The last click, for telling a double-click. */
type LastClick = { time: number; screen: FieldPoint; hit: number | null };

export type FieldCursor =
    | "default"
    | "pointer"
    | "crosshair"
    | ReturnType<typeof handleCursor>;

/** A rotation typed into the inspector (user story 54), until it's saved. */
type TypedRotation = {
    starts: readonly MarcherPosition[];
    center: FieldPoint;
    degrees: number;
};

export class FieldEditor {
    private press: FieldPress | null = null;
    /** The button of a drag that became no gesture: its moves and release do nothing. */
    private ignoredButton: number | null = null;
    private gesture: FieldGesture | null = null;
    private gestureButton = 0;
    private hover: FieldCursor = "default";
    private lastClick: LastClick | null = null;
    /** The marquee or lasso last started, which the overlay draws while it's the gesture. */
    private area: AreaGesture | null = null;
    /**
     * Dropped marchers whose save hasn't settled: they're drawn where they
     * were dropped until it has (user story 42). `drop` counts drops, so only
     * the last one's answer clears them.
     */
    private pending: ReadonlyMap<number, FieldPoint> | null = null;
    private drops = 0;
    /** Where the marchers being dragged are drawn, or null with no drag. */
    private live: readonly MarcherPosition[] | null = null;
    private typed: TypedRotation | null = null;
    /** Counts typed rotations ended, saved or not, so the inspector's input starts over after each. */
    private rotationsEnded = 0;
    /** The line tool, while it's on (#203). */
    private lineTool: LineTool | null = null;
    /** A right press during the line tool, until its release: a click clears the line. */
    private rightPress: FieldPointer | null = null;
    private readonly listeners = new Set<() => void>();
    private readonly now: () => number;
    private readonly areaPorts: AreaPorts;

    constructor(
        private readonly ports: FieldEditorPorts,
        private readonly options: FieldEditorOptions = {},
    ) {
        this.now = options.now ?? (() => performance.now());
        this.areaPorts = {
            marchers: () => ports.marchers(),
            zoom: () => ports.zoom(),
            canSelect: (id) => ports.canSelect(id),
            selection: () => ports.selection.get(),
            select: (ids) => this.write(ids),
            changed: () => this.emit(),
        };
    }

    /**
     * A button went down on the field. Returns true when the editor takes the
     * press, so the renderer captures the pointer and sends the rest of it
     * here; false leaves it to navigation (right, middle, Ctrl on a Mac).
     */
    pointerDown(pointer: FieldPointer): boolean {
        if (!this.isEditButton(pointer)) {
            // Navigation pans with it; a right-click (no drag) clears the line tool's line
            this.rightPress =
                pointer.button === 2 && this.lineTool ? pointer : null;
            return false;
        }
        this.cancelGesture();
        this.ignoredButton = null;
        const taken = this.ports.takePress?.() ?? false;
        if (taken || this.lineTool) {
            // Captured all the same, so its moves and release do nothing either.
            // Nor is it half of a double-click: the next press can't start a lasso
            this.press = null;
            this.lastClick = null;
            this.ignoredButton = pointer.button;
            // The line tool's presses draw its line and never select (story 20).
            // Ctrl/Cmd+click doesn't touch the line
            if (!taken && !pointer.ctrl && !pointer.meta)
                this.lineTool?.press(pointer);
            return true;
        }
        // A press on the field saves a rotation typed in the inspector first
        this.endRotation();
        const handle = this.handleAt(pointer.field);
        const hit = handle ? null : this.marcherAt(pointer.field);
        this.press = {
            start: pointer,
            hit,
            handle,
            double: hit === null && !handle && this.isDoubleClick(pointer),
        };
        return true;
    }

    pointerMove(pointer: FieldPointer): void {
        if (this.lineTool) {
            this.lineTool.move(pointer);
            return;
        }
        if (this.gesture) {
            this.gesture.move(pointer);
            return;
        }
        if (this.ignoredButton !== null) return;
        const press = this.press;
        if (!press) {
            const handle = this.handleAt(pointer.field);
            this.setHover(
                handle
                    ? handleCursor(handle)
                    : this.marcherAt(pointer.field) === null
                      ? "default"
                      : "pointer",
            );
            return;
        }
        if (!isPastSlop(press.start, pointer)) return;
        // A drag: the press is no longer a click, whatever comes of it
        this.press = null;
        this.lastClick = null;
        this.gesture = this.startDrag(press, pointer);
        this.gestureButton = press.start.button;
        if (!this.gesture) {
            this.ignoredButton = press.start.button;
            return;
        }
        this.emit();
        this.gesture.move(pointer);
    }

    pointerUp(pointer: FieldPointer): void {
        if (pointer.button === 2) {
            const right = this.rightPress;
            this.rightPress = null;
            // A right-drag panned: the line stays, so the user can pan to its far end
            if (right && !isPastSlop(right, pointer)) this.lineTool?.clear();
            return;
        }
        if (this.ignoredButton !== null) {
            if (pointer.button === this.ignoredButton)
                this.ignoredButton = null;
            return;
        }
        if (this.gesture) {
            if (pointer.button !== this.gestureButton) return;
            const gesture = this.gesture;
            this.gesture = null;
            gesture.end(pointer);
            this.emit();
            return;
        }
        const press = this.press;
        if (!press || pointer.button !== press.start.button) return;
        this.press = null;
        // Over the slop since the last move event: a drag, not a click, that
        // ends where it starts
        if (isPastSlop(press.start, pointer)) {
            this.lastClick = null;
            const gesture = this.startDrag(press, pointer);
            gesture?.move(pointer);
            gesture?.end(pointer);
            return;
        }
        // A click on a handle does nothing, and is no half of a double-click
        if (press.handle) {
            this.lastClick = null;
            return;
        }
        // A double-click's second click starts no third
        this.lastClick = press.double
            ? null
            : {
                  time: this.now(),
                  screen: press.start.screen,
                  hit: press.hit,
              };
        this.click(press, pointer.shift);
    }

    /** The pointer was lost (capture lost, the window lost focus): nothing is clicked or dropped. */
    pointerCancel(): void {
        // The last click stays: the renderer also cancels after every release
        this.press = null;
        this.ignoredButton = null;
        this.cancelGesture();
    }

    /** The pointer left the field with no button down. */
    pointerLeave(): void {
        this.setHover("default");
    }

    /** Ctrl/Cmd+A: every marcher drawn that can be selected. */
    selectAll(): void {
        const { ids, hidden } = this.ports.marchers();
        this.write(
            ids.filter((id, i) => !hidden?.[i] && this.ports.canSelect(id)),
        );
    }

    /** The gesture in progress, for the field test API and the overlay; a press that's still a click has none. */
    activeGesture(): FieldTestGesture | null {
        if (this.lineTool) return "line";
        return this.gesture?.kind ?? null;
    }

    /**
     * Turns the line tool on for `ids` (the app's alignment event, L), or
     * off with null. Turning it on ends any press or gesture.
     */
    setLineTool(ids: readonly number[] | null): void {
        if (ids === null) {
            if (!this.lineTool) return;
            this.lineTool = null;
            this.emit();
            return;
        }
        this.cancelGesture();
        this.press = null;
        this.lastClick = null;
        this.lineTool = new LineTool(ids, {
            marchers: () => this.drawnPositions(ids),
            grid: () => this.ports.stepGrid?.() ?? null,
            finished: (targets) => this.ports.lineFinished?.(targets),
            changed: () => this.emit(),
        });
        this.emit();
    }

    /** The marchers were drawn again: a finished line lines them up from where they are now. */
    refreshLineTool(): void {
        this.lineTool?.refresh();
    }

    /** The line tool's line, previews and marchers, or null when it's off. */
    lineToolShape(): LineToolShape | null {
        return this.lineTool?.shape() ?? null;
    }

    /** The marquee or lasso being drawn, for the overlay; null during any other gesture. */
    areaShape(): AreaShape | null {
        return this.area && this.gesture === this.area
            ? this.area.shape()
            : null;
    }

    /**
     * The selection box while a rotation is being dragged: the box at the
     * press, turned by the angle drawn. The overlay draws it so until the
     * release, then the box fits the marchers again. Null otherwise.
     */
    rotationFrame(): { box: FieldRect; angle: number } | null {
        return this.gesture instanceof RotateGesture
            ? { box: this.gesture.box, angle: this.gesture.angle() }
            : null;
    }

    /** Whether the selection can be scaled and rotated: two or more marchers drawn. */
    canTransform(): boolean {
        return this.drawnPositions(this.ports.selection.get()).length >= 2;
    }

    /** The rotation typed into the inspector and not yet saved, in degrees; 0 with none. */
    typedRotation(): number {
        return this.typed?.degrees ?? 0;
    }

    /**
     * Goes up each time a typed rotation ends, saved (a blur, or a press on
     * the field first) or dropped: the inspector's input starts over at 0.
     */
    rotationVersion(): number {
        return this.rotationsEnded;
    }

    /**
     * Turns the selection `degrees` clockwise about its box's center, from
     * where it was when the typing started, as the rotate handle does (user
     * story 54). Drawn until {@link endRotation} saves it. Refused during a
     * drag and while the line tool is on. Over a drop still saving it starts
     * from where that drop is drawn, and is dropped if that drop is refused.
     */
    rotateSelection(degrees: number): void {
        if (this.gesture || this.lineTool) return;
        if (!this.typed) {
            const starts = this.drawnPositions(this.ports.selection.get());
            const box = boundsOf(starts);
            if (starts.length < 2 || !box) return;
            this.typed = { starts, center: centerOf(box), degrees: 0 };
        }
        this.typed.degrees = degrees;
        this.showLive(
            rotatePositions(this.typed.starts, this.typed.center, degrees),
        );
        this.emit();
    }

    /**
     * Saves the rotation typed into the inspector, through the same drop as a
     * handle. One left unchanged (or back at 0) saves nothing (user story 54).
     */
    endRotation(): void {
        const typed = this.typed;
        if (!typed) return;
        this.typed = null;
        this.rotationsEnded++;
        this.drop(
            typed.starts,
            rotatePositions(typed.starts, typed.center, typed.degrees),
        );
        this.emit();
    }

    /**
     * Drops a typed rotation without saving it: the marchers go back. For
     * when it can't be saved where it was typed (the selection or the page
     * changed, or the input went away without a blur).
     */
    cancelRotation(): void {
        if (!this.typed) return;
        this.typed = null;
        this.rotationsEnded++;
        this.endLive();
        this.emit();
    }

    /** Drops a typed rotation whose marchers aren't the selection any more. */
    selectionChanged(): void {
        if (!this.typed) return;
        if (
            !sameIds(
                this.typed.starts.map((p) => p.id),
                this.ports.selection.get(),
            )
        )
            this.cancelRotation();
    }

    /** The cursor the field shows. */
    cursor(): FieldCursor {
        return this.lineTool ? "crosshair" : this.hover;
    }

    /** Calls `listener` whenever the gesture or cursor changes. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * The gesture a press becomes once it moves past the click slop, or null
     * when the press does nothing more. A handle of the selection box scales
     * or rotates the selection (#198). A move starts from a marcher, or from
     * empty field inside a multi-selection's box (owner decision, #196);
     * marquee and lasso (#195) start from the rest of the empty field: a lasso
     * after a double-click, else a marquee.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected startDrag(press: FieldPress, pointer: FieldPointer) {
        return (
            this.startTransform(press) ??
            this.startMove(press) ??
            this.startArea(press)
        );
    }

    /** Scaling or rotating the selection from one of its box's handles (#198). */
    private startTransform(press: FieldPress): FieldGesture | null {
        if (!press.handle) return null;
        const starts = this.drawnPositions(this.ports.selection.get());
        const box = boundsOf(starts);
        if (starts.length < 2 || !box) return null;
        const host = {
            show: (positions: readonly MarcherPosition[]) =>
                this.showLive(positions),
            drop: (positions: readonly MarcherPosition[]) =>
                this.drop(starts, positions),
            cancel: () => this.endLive(),
        };
        return press.handle === "rot"
            ? new RotateGesture(press.start, starts, host, box)
            : new ScaleGesture(press.start, starts, host, press.handle, box);
    }

    /**
     * The selection box's frame, for its handles: around the selected
     * marchers as drawn, or null with fewer than two.
     */
    private selectionFrame(): SelectionFrame | null {
        const starts = this.drawnPositions(this.ports.selection.get());
        const box = boundsOf(starts);
        if (starts.length < 2 || !box) return null;
        return { box, pad: this.ports.selectionBoxPadding?.() ?? 0, angle: 0 };
    }

    /** The handle of the selection box at `point`, or null. */
    private handleAt(point: FieldPoint): HandleId | null {
        const frame = this.selectionFrame();
        if (!frame) return null;
        const zoom = this.ports.zoom();
        return handleAt(handlePoints(frame, zoom), point, zoom);
    }

    /** A marquee, or a lasso after a double-click, from empty field. */
    private startArea(press: FieldPress): FieldGesture {
        this.area = press.double
            ? startLasso(this.areaPorts, press.start)
            : startMarquee(this.areaPorts, press.start);
        return this.area;
    }

    private isDoubleClick(pointer: FieldPointer) {
        const last = this.lastClick;
        return (
            last !== null &&
            last.hit === null &&
            this.now() - last.time <= DOUBLE_CLICK_MS &&
            Math.hypot(
                pointer.screen.x - last.screen.x,
                pointer.screen.y - last.screen.y,
            ) <= DOUBLE_CLICK_SLOP
        );
    }

    /**
     * Drags the marchers a press moves, or returns null when it moves none:
     *
     * - pressing a selected marcher moves the whole selection (narrowing to
     *   it happens only on a click);
     * - pressing another marcher selects it (Shift adds it) and moves the
     *   selection;
     * - pressing empty field inside a multi-selection's box moves the
     *   selection.
     */
    private startMove(press: FieldPress): FieldGesture | null {
        const selection = this.ports.selection.get();
        let ids: readonly number[];
        if (press.hit !== null) {
            ids = selection.includes(press.hit)
                ? selection
                : press.start.shift
                  ? [...selection, press.hit]
                  : [press.hit];
            this.write(ids);
        } else if (this.insideSelectionBox(selection, press.start.field)) {
            ids = selection;
        } else return null;

        const starts = this.drawnPositions(ids);
        if (starts.length === 0) return null;
        return new MoveGesture(
            press.start,
            starts,
            {
                show: (positions) => this.showLive(positions),
                drop: (positions) => this.drop(starts, positions),
                cancel: () => this.endLive(),
            },
            this.options.moveTransform,
        );
    }

    /** Where `ids` are drawn now, skipping any not drawn or hidden. */
    private drawnPositions(ids: readonly number[]): MarcherPosition[] {
        const { ids: drawn, positions, hidden } = this.ports.marchers();
        const wanted = new Set(ids);
        const starts: MarcherPosition[] = [];
        for (let i = 0; i < drawn.length; i++) {
            if (!wanted.has(drawn[i]) || hidden?.[i]) continue;
            starts.push({
                id: drawn[i],
                x: positions[i * 2],
                y: positions[i * 2 + 1],
            });
        }
        return starts;
    }

    /** Whether `point` is inside the box drawn around a selection of two or more. */
    private insideSelectionBox(
        selection: readonly number[],
        point: FieldPoint,
    ) {
        if (selection.length < 2) return false;
        const starts = this.drawnPositions(selection);
        if (starts.length < 2) return false;
        const pad = this.ports.selectionBoxPadding?.() ?? 0;
        const xs = starts.map((p) => p.x);
        const ys = starts.map((p) => p.y);
        return (
            point.x >= Math.min(...xs) - pad &&
            point.x <= Math.max(...xs) + pad &&
            point.y >= Math.min(...ys) - pad &&
            point.y <= Math.max(...ys) + pad
        );
    }

    /** Draws the dragged marchers live, over any earlier drop still saving. */
    private showLive(positions: readonly MarcherPosition[]) {
        this.live = positions;
        this.ports.showPositions(withPositions(this.pending, positions));
    }

    /** The drag is over with nothing dropped: only drops still saving are drawn. */
    private endLive() {
        this.live = null;
        this.ports.showPositions(this.pending);
    }

    /**
     * Saves a drop. The marchers stay where they were dropped until the save
     * settles, then the field draws the show again: with the drop in it, or
     * without it when it was refused (they snap back). A drop that moved
     * nothing saves nothing.
     */
    private drop(
        starts: readonly MarcherPosition[],
        positions: readonly MarcherPosition[],
    ) {
        const moved = positions.some(
            (p, i) => p.x !== starts[i].x || p.y !== starts[i].y,
        );
        if (!moved) {
            this.endLive();
            return;
        }
        this.live = null;
        const pending = withPositions(this.pending, positions);
        this.pending = pending;
        const drop = ++this.drops;
        this.ports.showPositions(pending);
        // The port must settle on every path; say so if it doesn't, since the
        // marchers stay drawn where they were dropped until it does
        const unsettled = setTimeout(
            () =>
                console.error(
                    "A drop hasn't settled after 30 s: its marchers stay where they were dropped",
                ),
            DROP_SETTLE_WARNING_MS,
        );
        const settle = (result?: DropResult) => {
            clearTimeout(unsettled);
            // A rotation typed over this drop started from where it snaps back from
            if (result !== "saved") this.cancelRotation();
            // A later drop is still saving: its answer clears both
            if (drop !== this.drops) return;
            this.pending = null;
            // A drag in progress stays under the pointer
            this.ports.showPositions(
                this.live && withPositions(null, this.live),
            );
        };
        this.ports.drop(positions).then(settle, () => settle());
    }

    private click(press: FieldPress, shift: boolean) {
        this.write(
            selectionAfterClick(this.ports.selection.get(), press.hit, shift),
        );
    }

    private write(ids: readonly number[]) {
        if (!sameIds(ids, this.ports.selection.get()))
            this.ports.selection.set(ids);
    }

    private marcherAt(point: FieldPoint) {
        return marcherAt(
            this.ports.marchers(),
            point,
            hitRadius(this.ports.zoom()),
            (id) => this.ports.canSelect(id),
        );
    }

    /** The primary button, unless the press pans (navigation's rule, `isPanButton`). */
    private isEditButton(pointer: FieldPointer) {
        return (
            pointer.button === 0 &&
            !isPanButton(
                { button: pointer.button, ctrlKey: pointer.ctrl },
                this.options.isMac ?? false,
            )
        );
    }

    private cancelGesture() {
        if (!this.gesture) return;
        const gesture = this.gesture;
        this.gesture = null;
        gesture.cancel();
        this.emit();
    }

    private setHover(cursor: FieldCursor) {
        if (cursor === this.hover) return;
        this.hover = cursor;
        this.emit();
    }

    private emit() {
        for (const listener of this.listeners) listener();
    }
}

/** `base` with `positions` written over it. */
const withPositions = (
    base: ReadonlyMap<number, FieldPoint> | null,
    positions: readonly MarcherPosition[],
): ReadonlyMap<number, FieldPoint> => {
    const merged = new Map(base);
    for (const { id, x, y } of positions) merged.set(id, { x, y });
    return merged;
};

const isPastSlop = (start: FieldPointer, pointer: FieldPointer) =>
    Math.hypot(
        pointer.screen.x - start.screen.x,
        pointer.screen.y - start.screen.y,
    ) >= CLICK_SLOP;

/** The same ids, in any order. */
const sameIds = (a: readonly number[], b: readonly number[]) => {
    if (a.length !== b.length) return false;
    const set = new Set(b);
    return a.every((id) => set.has(id));
};

import type { FieldTestGesture } from "@/field/fieldTestApi";
import {
    pressChoiceOf,
    type HeldRole,
    REACH_INSIDE,
    type PressChoice,
    type RoleKey,
} from "@/input/modifierRoles";
import {
    areaChoice,
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
import { fieldKeys, type FieldKeys } from "./fieldKeys";
import { hitRadius, marcherAt, type DrawnMarchers } from "./hitTest";
import {
    ItemResizeGesture,
    ItemRotateGesture,
    itemSelectionFrame,
    type ItemFrame,
    type ItemSize,
} from "./itemTransform";
import { PropTool, type PropToolShape } from "./propTool";
import type { OutlineType } from "@/db-functions/items";
import type { DrawnOutline } from "@/items/itemOutlines";
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
 * on screen, and which button and modifiers are down. The keys are raw:
 * selection and navigation read them, and drag gestures read held roles
 * through `startGestureKeys` (`fieldKeys.ts`), which takes a `FieldPointer`
 * as the keys it carries.
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
     * A right-click calls it too, before it opens the menu, and goes on
     * whatever it returns (#315).
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
     * The selection a press on marcher `hit` makes instead of the editor's
     * rules, or null for the editor's rules: a click on a placed box's member
     * selects the whole box. Asked once per press, when it becomes a click or
     * a drag. `reachInside`: the press reaches inside ($mod, where
     * {@link reachesInside} said it can); the app enters the box and leaves
     * the press as a press inside the box: null, so the editor's rules pick
     * the marcher, except that Shift on a selected member returns the
     * selection without it (the press is done).
     */
    pressSelection?(
        hit: number,
        shift: boolean,
        reachInside: boolean,
    ): readonly number[] | null;
    /**
     * Whether a press on marcher `hit` can reach inside ($mod): it's a member
     * of a placed box that a press would select whole, so not one you're
     * inside already. When it can't, $mod is no press choice there and stays
     * a held role (constrain).
     */
    reachesInside?(hit: number): boolean;
    /** A double-click on marcher `id`: the second click came after a click on it. */
    doubleClickMarcher?(id: number): void;
    /**
     * Whether a marcher row is an item (a prop or equipment, C2.1). Items are
     * hit by their Outline ({@link itemAt}), not by a dot at their center.
     */
    isItem?(id: number): boolean;
    /** The item whose Outline holds `point`, topmost first, or null. */
    itemAt?(point: FieldPoint): number | null;
    /** Item `id`'s Outline as drawn, or null when it isn't drawn. */
    itemFrame?(id: number): ItemFrame | null;
    /** Draws item `id` at this size and turn while a handle drags it; null draws it as stored. */
    previewItem?(id: number, size: ItemSize | null): void;
    /**
     * Saves item `id`'s new size and turn at the playhead. Resolves "saved"
     * once the field can draw it, or "refused" when nothing was saved.
     */
    saveItem?(id: number, size: ItemSize): Promise<DropResult>;
    /** A point snapped as a marcher's coordinates are (the prop tool's corners). */
    snap?(point: FieldPoint): FieldPoint;
    /** The prop tool finished an Outline: for the app to make the prop. */
    propDrawn?(outline: DrawnOutline): void;
    /**
     * A right-click (a right press released under the click slop, with no
     * open shape) asks for the field's menu here (#315), after selecting the
     * marcher clicked if it wasn't selected.
     */
    openMenu?(at: FieldPointer): void;
};

export type DropResult = "saved" | "refused";

export type FieldEditorOptions = {
    /**
     * On a Mac, Ctrl+press is a right-click, which pans (navigation's, not the
     * editor's), and Cmd is $mod (constrain) where elsewhere Ctrl is.
     */
    isMac?: boolean;
    /** The time in milliseconds, for double-clicks. Defaults to `performance.now`. */
    now?: () => number;
    /** Where a drag puts the marchers for a pointer delta; snapping and locks are #197's. */
    moveTransform?: MoveTransform;
    /** The Snap toggle, read on every pointer event; off, a rotation turns freely. On when omitted. */
    snap?: () => boolean;
    /**
     * The ratio lock a box shape shares (`useShapeEditorStore`), read at a scale handle's press:
     * on, a selection's handles keep the ratio, and constrain frees it. Off when omitted.
     */
    ratioLocked?: () => boolean;
    /**
     * The touch pill's toggles (`onScreenToggles` in `TouchModifierStore`): its held roles count
     * as held keys for every drag, a toggle changed mid-drag re-runs it as a key does, and the
     * press rule never blocks them. `add` is the add press choice at every press, as Shift is: a
     * click, a press-drag and a marquee or lasso add to the selection.
     */
    onScreen?: FieldOnScreen;
};

/** On-screen toggles for the field editor, read live; see {@link FieldEditorOptions.onScreen}. */
export type FieldOnScreen = {
    roles(): ReadonlySet<HeldRole>;
    subscribe(changed: () => void): () => void;
    add(): boolean;
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
    /** The second press of a double-click on empty field, or on the marcher `hit`. */
    double: boolean;
    /** The pill's Add was on at the press: the add choice, as Shift is. */
    add?: boolean;
};

/**
 * The last click, for telling a double-click: on a marcher (`hit`), on empty
 * field (null), or one a mode took (`mode`).
 */
type LastClick = {
    time: number;
    screen: FieldPoint;
    hit: number | null;
    mode?: boolean;
};

export type FieldCursor =
    | "default"
    | "pointer"
    | "crosshair"
    | "move"
    | "grab"
    | ReturnType<typeof handleCursor>;

/**
 * What a field mode draws over the field, in field units: a shape's outline
 * (closed), the spots its marchers will stand on, a line from each marcher to
 * its spot, and the handles that reshape it.
 */
export type FieldModeDrawing = {
    outline: readonly FieldPoint[] | null;
    spots: readonly FieldPoint[];
    walks: readonly { from: FieldPoint; to: FieldPoint }[];
    handles: readonly FieldPoint[];
    /**
     * Where the shape's marchers start the move (08-shape-system-ux.md, "Marcher styling"), drawn
     * as faint ghosts of them (#417): at the start flag, the same points the walks leave from
     */
    rings?: readonly FieldPoint[];
    /** The marcher at each of `rings`, whose ghost is drawn in its own color */
    ringIds?: readonly number[];
    /**
     * Spots the shape leaves empty on purpose, drawn as dashed rings: an odd-count outline's gap
     * (#390), which a click on another spot between corners moves
     */
    gaps?: readonly FieldPoint[];
    /**
     * The shape's look at this stage (docs/timeline/research/shapes/08-shape-system-ux.md,
     * "Marcher styling"): while it's drawn, a dashed outline and solid spots; once open, a solid
     * outline with a faint fill. Dashed rings when absent.
     */
    stage?: "drawing" | "open";
    /** Who will stand on each spot */
    labels?: readonly { at: FieldPoint; text: string }[];
    /** The rotate knob and the foot of its stem on the shape's back edge */
    knob?: { at: FieldPoint; stem: FieldPoint };
    /** The dot that moves the whole shape */
    centerDot?: FieldPoint;
    /**
     * The shape's pivot once it's out of the center (#350): a yellow crosshair that drags on its
     * own. At the center the center dot is the pivot.
     */
    pivotMark?: FieldPoint;
    /**
     * Where the pivot a cell of the shape editor's pivot menu points at would be (#437): a
     * preview only, drawn at full strength even while the shape is calm
     */
    pivotPreview?: FieldPoint;
    /** While turning: what it turns around, and the pointer */
    pivot?: { at: FieldPoint; to: FieldPoint };
    /** A note by the pointer: the angle, or where the shape is in drill terms */
    tip?: { at: FieldPoint; text: string };
    /** The spots are part way to where they're going: a glide is running (#387) */
    gliding?: boolean;
    /**
     * The pointer is away from the shape and its controls (#403): the handles, knob, center dot,
     * pivot and gap rings are drawn faint, so the spots read clearly
     */
    calm?: boolean;
    /**
     * While a stretch, a draw or a move has the shape's corner, edge or center on one of the
     * field's lines (#425, #446): a guide
     * along each such line, drawn across the whole canvas
     */
    guides?: readonly {
        from: FieldPoint;
        to: FieldPoint;
        /** The line as the coordinate sheet writes it: "On 50", "12 BE BH" (#427) */
        label?: string;
    }[];
    /** The shape's sides that lie on a guide's line, drawn thicker in the guide's color */
    guideEdges?: readonly { from: FieldPoint; to: FieldPoint }[];
    /**
     * The shape's corners or center on a guide's line with no side along it (a turned box's
     * corner, a center), ringed in the guide's color (#446)
     */
    guideMarks?: readonly FieldPoint[];
    /** The spots standing on a guide, tinted */
    onGuides?: readonly FieldPoint[];
};

/** What the editor knows of a press it asks a {@link FieldMode} to claim. */
export type FieldModePress = {
    /**
     * Whether the press reaches inside a placed box ($mod on a member), by
     * the editor's own rule for a press it takes: its hit test (which skips
     * hidden and dimmed marchers) finds a marcher under the press, $mod is
     * held, and {@link FieldEditorPorts.reachesInside} says yes for that
     * marcher. A mode that hands such a press to the editor gets it picked
     * there; the two never decide it apart.
     */
    reachesInside(): boolean;
    /** The editor's `isMac`: on a Mac, $mod is Cmd. */
    readonly isMac: boolean;
};

/**
 * A tool that takes edit presses before the editor's own rules (the shape
 * tool, a selected placed box). The editor asks it about every edit press
 * after `takePress`; a press it claims goes to it until the release, and the
 * editor selects, drags and drops nothing. The rest go through the editor's
 * rules as usual. Navigation's presses never reach it.
 */
export interface FieldMode {
    /** Whether the mode takes this press; `press` is what the editor knows of it. */
    claims(pointer: FieldPointer, press: FieldModePress): boolean;
    /** It took the press `claims` said it would, with what the editor knows of it. */
    press(pointer: FieldPointer, press: FieldModePress): void;
    move(pointer: FieldPointer): void;
    /**
     * The press it claimed ended. `click` when it moved less than the click
     * slop; `double` when that click came soon after another click it took.
     */
    release(pointer: FieldPointer, click: { double: boolean } | null): void;
    /** The press it claimed was lost: nothing is saved. */
    cancel(): void;
    /** The cursor over `pointer` with no button down, or null for the editor's. */
    cursorAt(pointer: FieldPointer): FieldCursor | null;
    /** The pointer left the field with no button down. */
    leave?(): void;
    /** What it draws over the field, or null for nothing. */
    drawing(): FieldModeDrawing | null;
    /** Calls `listener` when its drawing or cursor changes. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
    /**
     * Whether the selection box's handles (#198), and a drag from inside the
     * box, are off while the mode is on: it has its own.
     */
    readonly ownsSelectionBox: boolean;
    /** Whether the inspector's typed rotation is refused while it's on. */
    readonly locksSelection: boolean;
    /**
     * Whether the field's menu (#315) stays shut while it's on: the open shape, being edited, is
     * what the field is about. A selected placed box leaves it open, for its marchers.
     */
    readonly blocksFieldMenu?: boolean;
    /** What `activeGesture` reports while one of its presses is held, and while it's on when `always`. */
    readonly gesture: { kind: FieldTestGesture; always: boolean };
}

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
    /** The mode taking presses first, while one is on. */
    private mode: FieldMode | null = null;
    private unsubscribeMode: (() => void) | null = null;
    /** A press the mode claimed, until its release. */
    private modePress: { start: FieldPointer; double: boolean } | null = null;
    /** The prop tool, while it's on (C2.1). */
    private propTool: PropTool | null = null;
    /** The prop tool's last press, for telling its double-clicks. */
    private lastToolPress: { time: number; screen: FieldPoint } | null = null;
    /**
     * A right press, until its release: navigation pans with it, and a click
     * (one that never moved past the slop) opens the field's menu (#315).
     */
    private rightPress: { start: FieldPointer; dragged: boolean } | null = null;
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
            isItem: (id) => ports.isItem?.(id) ?? false,
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
            // Navigation pans with it; a right-click (no drag) opens the
            // menu. A Mac's Ctrl-click only pans (#194)
            this.rightPress =
                pointer.button === 2
                    ? { start: pointer, dragged: false }
                    : null;
            return false;
        }
        this.cancelGesture();
        this.ignoredButton = null;
        const taken = this.ports.takePress?.() ?? false;
        if (this.propTool) {
            // The prop tool's presses draw and never select; its moves and
            // release are its own
            this.press = null;
            this.lastClick = null;
            if (!taken && !pointer.ctrl && !pointer.meta) {
                this.propTool.press(pointer);
                this.lastToolPress = {
                    time: this.now(),
                    screen: pointer.screen,
                };
            }
            return true;
        }
        if (taken) {
            // Captured all the same, so its moves and release do nothing either.
            // Nor is it half of a double-click: the next press can't start a lasso
            this.press = null;
            this.lastClick = null;
            this.ignoredButton = pointer.button;
            return true;
        }
        const modePress: FieldModePress = {
            reachesInside: () =>
                this.reachInside(pointer, this.marcherAt(pointer.field)) !==
                null,
            isMac: this.options.isMac ?? false,
        };
        if (this.mode?.claims(pointer, modePress)) {
            const last = this.lastClick;
            this.press = null;
            this.modePress = {
                start: pointer,
                // The first click may have been the editor's: the click
                // on a box's member that turned the mode on
                double: last !== null && this.isSoonAfter(last, pointer),
            };
            this.mode.press(pointer, modePress);
            this.emit();
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
            double: !handle && this.isDoubleClick(pointer, hit),
            add: this.options.onScreen?.add() ?? false,
        };
        return true;
    }

    pointerMove(pointer: FieldPointer): void {
        // A right press that went past the slop panned, even if it comes back
        if (this.rightPress && isPastSlop(this.rightPress.start, pointer))
            this.rightPress.dragged = true;
        if (this.propTool) {
            this.propTool.move(pointer);
            return;
        }
        if (this.modePress) {
            this.mode?.move(pointer);
            return;
        }
        if (this.gesture) {
            this.gesture.move(pointer);
            return;
        }
        if (this.ignoredButton !== null) return;
        const press = this.press;
        if (!press) {
            const modeCursor = this.mode?.cursorAt(pointer) ?? null;
            if (modeCursor) {
                this.setHover(modeCursor);
                return;
            }
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
            // A right-drag panned, and no menu opens
            if (!right || right.dragged || isPastSlop(right.start, pointer))
                return;
            // Mid-press or mid-drag of the left button, the right one does
            // nothing more; nor while the prop tool draws, a mode's press is
            // held or the open shape is being edited
            if (
                !this.gesture &&
                !this.press &&
                !this.propTool &&
                !this.modePress &&
                !this.blocksFieldMenu()
            )
                this.openMenu(pointer);
            return;
        }
        const modePress = this.modePress;
        if (modePress) {
            if (pointer.button !== modePress.start.button) return;
            this.modePress = null;
            const click = !isPastSlop(modePress.start, pointer);
            // A double-click's second click starts no third
            this.lastClick =
                click && !modePress.double
                    ? {
                          time: this.now(),
                          screen: modePress.start.screen,
                          hit: null,
                          mode: true,
                      }
                    : null;
            this.mode?.release(
                pointer,
                click ? { double: modePress.double } : null,
            );
            this.emit();
            return;
        }
        if (this.propTool) {
            if (pointer.button === 0) this.propTool.release(pointer);
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
        this.click(press, pointer.shift || press.add === true);
        if (press.double && press.hit !== null)
            this.ports.doubleClickMarcher?.(press.hit);
    }

    /** The pointer was lost (capture lost, the window lost focus): nothing is clicked or dropped. */
    pointerCancel(): void {
        // The last click stays: the renderer also cancels after every release
        if (this.modePress) {
            this.modePress = null;
            this.mode?.cancel();
            this.emit();
        }
        this.press = null;
        this.ignoredButton = null;
        this.cancelGesture();
    }

    /** The pointer left the field with no button down. */
    pointerLeave(): void {
        this.mode?.leave?.();
        this.setHover("default");
    }

    /** Ctrl/Cmd+A: every performer drawn that can be selected; items (C2.2) are left out. */
    selectAll(): void {
        const { ids, hidden } = this.ports.marchers();
        const isItem = this.ports.isItem ?? (() => false);
        this.write(
            ids.filter(
                (id, i) =>
                    !hidden?.[i] && !isItem(id) && this.ports.canSelect(id),
            ),
        );
    }

    /** Selects the marchers in `ids` that are drawn and can be selected (an app action, such as "Select box"). */
    select(ids: readonly number[]): void {
        const wanted = new Set(ids);
        const { ids: drawn, hidden } = this.ports.marchers();
        this.write(
            drawn.filter(
                (id, i) =>
                    wanted.has(id) && !hidden?.[i] && this.ports.canSelect(id),
            ),
        );
    }

    /** The gesture in progress, for the field test API and the overlay; a press that's still a click has none. */
    activeGesture(): FieldTestGesture | null {
        if (this.propTool) return "prop";
        if (this.mode && (this.modePress || this.mode.gesture.always))
            return this.mode.gesture.kind;
        return this.gesture?.kind ?? null;
    }

    /**
     * Turns a mode on, replacing any other, or off with null. A new mode ends
     * any press or gesture, and the one it replaces loses its press.
     */
    setMode(mode: FieldMode | null): void {
        if (mode === this.mode) return;
        if (this.modePress) {
            this.modePress = null;
            this.mode?.cancel();
        }
        this.unsubscribeMode?.();
        this.unsubscribeMode = null;
        this.mode = mode;
        if (mode) {
            this.cancelGesture();
            this.press = null;
            this.lastClick = null;
            this.unsubscribeMode = mode.subscribe(() => this.emit());
        }
        this.emit();
    }

    /**
     * Turns the prop tool on to draw an Outline of `outlineType` (the Props
     * panel's Draw), or off with null. Turning it on ends any press or
     * gesture; turning it on again starts the drawing over.
     */
    setPropTool(outlineType: OutlineType | null): void {
        if (outlineType === null) {
            if (!this.propTool) return;
            this.propTool = null;
            this.emit();
            return;
        }
        this.cancelGesture();
        this.press = null;
        this.lastClick = null;
        this.lastToolPress = null;
        this.propTool = new PropTool(outlineType, {
            snap: (point) => this.ports.snap?.(point) ?? point,
            finished: (outline) => this.ports.propDrawn?.(outline),
            changed: () => this.emit(),
            isDoubleClick: (pointer) => {
                const last = this.lastToolPress;
                return (
                    last !== null &&
                    this.now() - last.time <= DOUBLE_CLICK_MS &&
                    Math.hypot(
                        pointer.screen.x - last.screen.x,
                        pointer.screen.y - last.screen.y,
                    ) <= DOUBLE_CLICK_SLOP
                );
            },
        });
        this.emit();
    }

    /** The prop tool's Outline being drawn, or null when it's off. */
    propToolShape(): PropToolShape | null {
        return this.propTool?.shape() ?? null;
    }

    /** What the mode draws over the field, or null with no mode or nothing drawn. */
    modeDrawing(): FieldModeDrawing | null {
        return this.mode?.drawing() ?? null;
    }

    /** Whether a mode (the open shape) keeps the field's menu shut (#315). */
    blocksFieldMenu(): boolean {
        return this.mode?.blocksFieldMenu ?? false;
    }

    /** Whether a mode with its own handles is on, so the selection box has none. */
    modeOwnsSelectionBox(): boolean {
        return this.mode?.ownsSelectionBox ?? false;
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
     * Turns the selection `degrees` clockwise about its box's center (or the
     * point `around` picks on that box, the Transform section's pivot), from
     * where it was when the typing started, as the rotate handle does (user
     * story 54). Drawn until {@link endRotation} saves it. Refused during a
     * drag and while a mode that locks the selection is on. Over a drop still
     * saving it starts from where that drop is drawn, and is dropped if that
     * drop is refused.
     */
    rotateSelection(
        degrees: number,
        around: (box: FieldRect) => FieldPoint = centerOf,
    ): void {
        if (this.gesture || this.modePress || this.mode?.locksSelection) return;
        if (!this.typed) {
            const starts = this.drawnPositions(this.ports.selection.get());
            const box = boundsOf(starts);
            if (starts.length < 2 || !box) return;
            this.typed = { starts, center: around(box), degrees: 0 };
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
        return this.propTool ? "crosshair" : this.hover;
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
     * empty field inside a multi-selection's box (owner decision, #196) with
     * no add or subtract choice; marquee and lasso (#195) start from the rest
     * of the empty field, and from inside the box with one: a lasso
     * after a double-click, else a marquee. A press on a marcher that moves
     * nothing (Shift took a group or a box's member out) is done, and starts
     * no marquee.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected startDrag(press: FieldPress, pointer: FieldPointer) {
        return (
            this.startTransform(press) ??
            this.startMove(press) ??
            (press.hit === null ? this.startArea(press) : null)
        );
    }

    /** Scaling or rotating the selection from one of its box's handles (#198). */
    private startTransform(press: FieldPress): FieldGesture | null {
        if (!press.handle) return null;
        const item = this.selectedItem();
        if (item) return this.startItemTransform(press, press.handle, item);
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
        const keys = this.keysFor(press.start);
        return press.handle === "rot"
            ? new RotateGesture(
                  press.start,
                  starts,
                  host,
                  box,
                  keys,
                  this.options.snap,
              )
            : new ScaleGesture(
                  press.start,
                  starts,
                  host,
                  press.handle,
                  box,
                  keys,
                  this.options.ratioLocked?.() ?? false,
              );
    }

    /**
     * The selection box's frame, for its handles: around the selected
     * marchers as drawn, or null with fewer than two.
     */
    private selectionFrame(): SelectionFrame | null {
        if (this.modeOwnsSelectionBox()) return null;
        const item = this.selectedItem();
        if (item) return itemSelectionFrame(item.frame);
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

    /**
     * The one item selected and drawn, with its Outline: its handles resize
     * and turn it (C2.1) instead of scaling or rotating a selection. Null for
     * any other selection.
     */
    private selectedItem(): { id: number; frame: ItemFrame } | null {
        const selection = this.ports.selection.get();
        if (selection.length !== 1) return null;
        const [id] = selection;
        if (!this.ports.isItem?.(id)) return null;
        const frame = this.ports.itemFrame?.(id) ?? null;
        return frame && { id, frame };
    }

    /**
     * Resizing or turning the selected item from a handle. Drawn at the size
     * given until its save settles, as a drop's marchers are.
     */
    private startItemTransform(
        press: FieldPress,
        handle: HandleId,
        { id, frame }: { id: number; frame: ItemFrame },
    ): FieldGesture {
        const preview = (size: ItemSize | null) =>
            this.ports.previewItem?.(id, size);
        const host = {
            show: (size: ItemSize) => preview(size),
            cancel: () => preview(null),
            save: (size: ItemSize) => {
                const unchanged =
                    size.width === frame.width &&
                    size.depth === frame.depth &&
                    size.rotation === frame.rotation;
                if (unchanged || !this.ports.saveItem) {
                    preview(null);
                    return;
                }
                preview(size);
                this.ports.saveItem(id, size).then(
                    () => preview(null),
                    () => preview(null),
                );
            },
        };
        const keys = this.keysFor(press.start);
        return handle === "rot"
            ? new ItemRotateGesture(
                  press.start,
                  frame,
                  host,
                  keys,
                  this.options.snap,
              )
            : new ItemResizeGesture(press.start, frame, host, handle, keys);
    }

    /** A marquee, or a lasso after a double-click, from empty field. */
    private startArea(press: FieldPress): FieldGesture {
        const start = this.areaStart(press);
        const isMac = this.options.isMac ?? false;
        this.area = press.double
            ? startLasso(this.areaPorts, start, isMac)
            : startMarquee(this.areaPorts, start, isMac);
        return this.area;
    }

    /** The keys an area from `press` starts with: the pill's Add adds, as Shift at the press does. */
    private areaStart(press: FieldPress): FieldPointer {
        return press.add ? { ...press.start, shift: true } : press.start;
    }

    /** Whether a press on `hit` (null: empty field) is the second of a double-click. */
    private isDoubleClick(pointer: FieldPointer, hit: number | null) {
        const last = this.lastClick;
        return (
            last !== null &&
            !last.mode &&
            last.hit === hit &&
            this.isSoonAfter(last, pointer)
        );
    }

    private isSoonAfter(last: LastClick, pointer: FieldPointer) {
        return (
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
     * - pressing another marcher selects it (Shift adds it, or its whole
     *   group when the app says so) and moves the selection;
     * - Shift on a marcher that takes it out (a group, or a box's member)
     *   moves nothing: the press is done;
     * - pressing empty field inside a multi-selection's box moves the
     *   selection, unless the press adds or subtracts (Shift, the pill's Add,
     *   or Alt): that starts a marquee or lasso (owner decision, 2026-10-30).
     *
     * A Shift that added the marcher was the press's (the press rule): the
     * drag goes at full speed until Shift is released and pressed again. So is
     * a $mod that reached inside a placed box for the marcher: it picks the
     * marcher alone, and the drag is free until $mod is released and pressed
     * again. Shift+$mod is Shift inside the box: it adds the marcher and drags,
     * or takes a selected one out and the press is done.
     */
    private startMove(press: FieldPress): FieldGesture | null {
        const selection = this.ports.selection.get();
        let ids: readonly number[];
        let usedByPress: readonly RoleKey[] = [];
        if (press.hit !== null) {
            // The pill's Add is Shift at the press, with no key
            const adding = press.start.shift || press.add === true;
            const reach = this.reachInside(press.start, press.hit);
            const chosen = this.ports.pressSelection?.(
                press.hit,
                adding,
                reach !== null,
            );
            const shiftChose = chosen != null && adding;
            if (shiftChose && !chosen.includes(press.hit)) {
                // Shift took a group (or a box's member) out; the press is done
                this.write(chosen);
                return null;
            }
            // The add choice applies only when the press adds the marcher (or
            // Shift adds its group, or the rest of a partly selected box);
            // then its key is the press's, no role until pressed again. The
            // pill's Add uses no key, so nothing waits on the press rule
            const applies = shiftChose
                ? chosen.some((id) => !selection.includes(id))
                : !chosen && !selection.includes(press.hit);
            const add = pressChoiceOf(press.start, "field", {
                applicable: new Set<PressChoice>(applies ? ["add"] : []),
                isMac: this.options.isMac ?? false,
            });
            usedByPress = [add, reach].flatMap((c) => (c ? [c.key] : []));
            // Reaching inside takes the marcher out of a selected box, to move
            // it alone (Shift+$mod on a selected one was the app's choice)
            const keeps = selection.includes(press.hit) && reach === null;
            ids =
                chosen ??
                (keeps
                    ? selection
                    : add || (applies && press.add)
                      ? [...selection, press.hit]
                      : [press.hit]);
            this.write(ids);
        } else if (
            !this.modeOwnsSelectionBox() &&
            areaChoice(this.areaStart(press), this.options.isMac) === null &&
            this.insideSelectionBox(selection, press.start.field)
        ) {
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
            this.keysFor(press.start, usedByPress),
        );
    }

    /**
     * The reach inside choice of a press with `keys` on marcher `hit`: $mod
     * (Cmd on a Mac, Ctrl elsewhere) on a member of a placed box ({@link
     * FieldEditorPorts.reachesInside}). Null elsewhere, so $mod stays
     * constrain. A Mac's Ctrl pans and never gets here. The one rule for it:
     * a mode asks it too ({@link FieldModePress.reachesInside}).
     */
    private reachInside(keys: FieldPointer, hit: number | null) {
        if (hit === null) return null;
        const reach = pressChoiceOf(keys, "field", {
            applicable: REACH_INSIDE,
            isMac: this.options.isMac ?? false,
        });
        return reach && this.ports.reachesInside?.(hit) ? reach : null;
    }

    /** The held roles of a gesture from `press`, with the keys a selection choice used. */
    private keysFor(
        press: FieldPointer,
        usedByPress: readonly RoleKey[] = [],
    ): FieldKeys {
        return fieldKeys(press, {
            usedByPress,
            isMac: this.options.isMac ?? false,
            onScreen: this.options.onScreen,
        });
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

    /**
     * The field's menu at a right-click (#315): it acts on the selection, so a
     * marcher clicked that isn't selected is selected first. Empty field (a
     * dimmed marcher, a handle) keeps the selection. A paused preview is
     * cleared first, as a press clears it (story 60), so the marcher is found
     * where it stands at the playhead, the count the menu's actions edit.
     */
    private openMenu(pointer: FieldPointer) {
        this.ports.takePress?.();
        const hit = this.handleAt(pointer.field)
            ? null
            : this.marcherAt(pointer.field);
        if (hit !== null && !this.ports.selection.get().includes(hit))
            this.write([hit]);
        this.ports.openMenu?.(pointer);
    }

    private click(press: FieldPress, shift: boolean) {
        const chosen =
            press.hit === null
                ? null
                : this.ports.pressSelection?.(
                      press.hit,
                      shift,
                      this.reachInside(press.start, press.hit) !== null,
                  );
        // Alt on empty field keeps the selection too, as Shift does, so an
        // Alt double-click-and-drag lasso has something to subtract from
        const keeps =
            shift ||
            (press.hit === null &&
                areaChoice(press.start, this.options.isMac ?? false) ===
                    "subtract");
        this.write(
            chosen ??
                selectionAfterClick(
                    this.ports.selection.get(),
                    press.hit,
                    keeps,
                ),
        );
    }

    private write(ids: readonly number[]) {
        if (!sameIds(ids, this.ports.selection.get()))
            this.ports.selection.set(ids);
    }

    /**
     * The marcher a press at `point` lands on: a performer's dot, else an
     * item whose Outline holds it, so a performer on a platform is still
     * pressed.
     */
    private marcherAt(point: FieldPoint) {
        const isItem = this.ports.isItem ?? (() => false);
        const performer = marcherAt(
            this.ports.marchers(),
            point,
            hitRadius(this.ports.zoom()),
            (id) => !isItem(id) && this.ports.canSelect(id),
        );
        if (performer !== null) return performer;
        const item = this.ports.itemAt?.(point) ?? null;
        return item !== null && this.ports.canSelect(item) ? item : null;
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

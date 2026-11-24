import type { FieldTestGesture } from "@/field/fieldTestApi";
import {
    pressChoiceOf,
    type HeldRole,
    REACH_INSIDE,
    type PressChoice,
    type RoleKey,
    type Roles,
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
    frameEdges,
    centerOf,
    handleAt,
    handleCursor,
    handlePoints,
    wideHandleWins,
    rotatePositions,
    type HandleId,
    type SelectionFrame,
} from "./groupTransform";
import { fieldKeys, type FieldKeys } from "./fieldKeys";
import { hitRadius, marcherAt, type DrawnMarchers } from "./hitTest";
import { thresholdsFor, type PointerKind } from "./pointerThresholds";
import {
    ItemResizeGesture,
    ItemRotateGesture,
    itemSelectionFrame,
    type ItemFrame,
    type ItemSize,
} from "./itemTransform";
import { PropTool, type PropToolShape, type PropToolStamp } from "./propTool";
import type { OutlineType } from "@/db-functions/items";
import type { DrawnOutline } from "@/items/itemOutlines";
import {
    MoveGesture,
    type MarcherPosition,
    type MoveTransform,
} from "./moveGesture";
import type { FieldRect } from "./selectionArea";
import { selectionAfterClick } from "./selectionRules";
import {
    anchorPoint,
    BOX_POINT_KEYS,
    boxPoint,
    isCenter,
    PIVOT_REACH_PX,
    PivotGesture,
    snapPivot,
    uniformShift,
    type BoxPointKey,
    type PivotAnchor,
    type PivotTarget,
} from "./selectionPivot";
import { RotateGesture, ScaleGesture } from "./transformGestures";
import { linesUnder, type LinePull } from "./linePull";
import { lineCoordinate } from "@/shapes/field/lineCoordinate";
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

/**
 * An item Outline narrower on screen than this many handle reaches is small: a press inside it
 * moves the item rather than taking a size handle (`pressMovesSmallItem`).
 */
const SMALL_ITEM_REACHES = 6;

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
    /**
     * What made the press (`PointerEvent.pointerType`). Slops, hit radii and handle reach
     * depend on it (`pointerThresholds.ts`); a mouse's are the field's usual ones.
     */
    kind: PointerKind;
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    /**
     * What a drag of this press draws if it starts on empty field, as the
     * pill's drag mode chose for a finger or pen (tablet 1.3). Unset (a mouse,
     * always): the Select bar's tool ({@link FieldEditor.setAreaTool}), or a
     * lasso after a double-click.
     */
    area?: AreaKind;
};

/** What a drag from empty field draws: a marquee (box) or a lasso. */
export type AreaKind = "marquee" | "lasso";

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
     * True for a marcher hidden so the shape it's in is seen on its own (#558): no press or hover
     * lands on it, as if it weren't there. Everyone else, and items, are hit as usual.
     */
    marcherHidden?(id: number): boolean;
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
     * Ground the selection box also stands clear of, in field units: the order
     * lane drawn on the selection, with its tip and its marchers' names (pathways
     * step 4j). The box grows to take it in, a drag from inside it moves the
     * selection, and its handles sit on its edges. Null or omitted: none.
     */
    selectionCovers?(): FieldRect | null;
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
    /**
     * Whether item `id` is locked to one position for the whole show (the pit's equipment): a
     * marquee and a lasso never take it, a click still selects it.
     */
    isLocked?(id: number): boolean;
    /** The item whose Outline holds `point`, topmost first, or null. */
    itemAt?(point: FieldPoint): number | null;
    /** Item `id`'s Outline as drawn, or null when it isn't drawn. */
    itemFrame?(id: number): ItemFrame | null;
    /** Draws item `id` at this size and turn while a handle drags it; null draws it as stored. */
    previewItem?(id: number, size: ItemSize | null): void;
    /**
     * Saves item `id`'s new size and turn at the playhead, and its new center
     * when the resize moved it (`size.center`), as a drop of the item there, in
     * the same edit. Resolves "saved" once the field can draw it, or "refused"
     * when nothing was saved.
     */
    saveItem?(id: number, size: ItemSize): Promise<DropResult>;
    /** A point snapped as a marcher's coordinates are (the prop tool's corners). */
    snap?(point: FieldPoint): FieldPoint;
    /** The prop tool finished an Outline: for the app to make the prop. */
    propDrawn?(outline: DrawnOutline): void;
    /**
     * A right-click (a right press released under the click slop, with no
     * open shape) asks for the field's menu here (#315), after selecting the
     * marcher clicked if it wasn't selected. `hit` is the marcher under it, or null (tablet 1.5:
     * the menu's "Go inside box" goes in at that marcher). `actions`, when a mode gave them
     * ({@link FieldMode.fieldMenuAt}), are what the menu offers there instead of its own (a
     * marcher's path, pathways).
     */
    openMenu?(
        at: FieldPointer,
        hit: number | null,
        actions?: readonly string[],
    ): void;
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
     * The field's lines a resized selection's side lands on (#585), read on every pointer event;
     * while a move or a resize has the selection on one, a guide is drawn along it. None when
     * omitted. A move's own landing is the {@link moveTransform}'s.
     */
    pull?: () => LinePull | null;
    /**
     * The touch pill's toggles (`onScreenToggles` in `TouchModifierStore`): its held roles count
     * as held keys for every drag, a toggle changed mid-drag re-runs it as a key does, and the
     * press rule never blocks them. `add` is the add press choice at every press, as Shift is: a
     * click, a press-drag and a marquee or lasso add to the selection. `subtract` is Alt's: a
     * marquee or lasso takes what it covers out of the selection (add wins when both are on).
     */
    onScreen?: FieldOnScreen;
};

/** On-screen toggles for the field editor, read live; see {@link FieldEditorOptions.onScreen}. */
export type FieldOnScreen = {
    roles(): ReadonlySet<HeldRole>;
    subscribe(changed: () => void): () => void;
    add(): boolean;
    subtract?(): boolean;
};

/**
 * A mouse press that moves less than this far, in screen pixels, is a click:
 * it never moves anything. There's no time limit (rules table: Click vs
 * drag). Other pointers have their own (`thresholdsFor(kind).moveThreshold`).
 */
export const CLICK_SLOP = thresholdsFor("mouse").clickSlop;

/** How long a drop may take to save before the editor logs that it hasn't settled. */
const DROP_SETTLE_WARNING_MS = 30_000;

/**
 * A press within this many milliseconds and screen pixels of a click on empty
 * field is its double-click: dragged, it draws a lasso (rules table: Lasso).
 */
export const DOUBLE_CLICK_MS = 500;
/** The mouse's; other pointers have their own (`thresholdsFor(kind).doubleClickSlop`). */
export const DOUBLE_CLICK_SLOP = thresholdsFor("mouse").doubleClickSlop;

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
    /**
     * The press is on the selection's pivot crosshair: a drag moves the pivot. A click leaves
     * the selection be, but on the center pivot over a marcher it's the click on that marcher.
     */
    pivot?: boolean;
    /** The second press of a double-click on empty field, or on the marcher `hit`. */
    double: boolean;
    /** The pill's Add was on at the press: the add choice, as Shift is. */
    add?: boolean;
    /** The pill's Subtract was on at the press: the subtract choice, as Alt is. */
    subtract?: boolean;
    /** What a drag from empty field draws, when a drag mode chose it ({@link FieldPointer.area}). */
    area?: AreaKind;
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
    /** A mode's `takeClick` took it: a change of mode that follows doesn't end the double-click */
    taken?: boolean;
    /** It was on the selection's pivot crosshair: a second click there sends it back to the center */
    pivot?: boolean;
    /**
     * The selection just after it. Anything else that changes the selection before the next
     * press (Escape, Select all, an undo) means that press is a click of its own, not the
     * second of a double-click (#628).
     */
    selection?: readonly number[];
};

export type FieldCursor =
    | "default"
    /** Empty field with the Lasso tool: the DOM layer draws a lasso (`fieldPointerInput.ts`). */
    | "lasso"
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
    /** Handles that add a point (a line's segment midpoints, #524), drawn smaller and round */
    addHandles?: readonly FieldPoint[];
    /** Handles selected by a click (a line's point, #557), drawn filled over `handles` */
    selectedHandles?: readonly FieldPoint[];
    /**
     * Handles on the ends of a selected point's bar (its tangent, #557): each drawn round at `at`,
     * at the end of a line from `from`
     */
    barHandles?: readonly { at: FieldPoint; from: FieldPoint }[];
    /** The outline is open: drawn without joining its last point to its first (a line, #524) */
    openOutline?: boolean;
    /**
     * The outline is a drawn path (pathways): drawn solid and heavier than a shape's outline, so it
     * reads over a group's faint lanes; heaviest while drawn or open (`edited`), a little lighter
     * while only shown (`shown`, closed: Paths All's lines); `quiet` for the selected marchers'
     * path while it's closed, in the faint path color, so only a line being edited is deep
     * (pathways interaction round 3); `selected` while the path is selected as an object
     * (pathways step 3a), drawn in the selection color with a halo; `context` thin and grey behind
     * the one lane being worked on (pathways step 3b)
     */
    pathLine?: "shown" | "quiet" | "edited" | "selected" | "context";
    /**
     * Circles the shape is drawn on, quiet solid lines under it: an Arc's whole circle (#634)
     */
    construction?: readonly {
        center: FieldPoint;
        rx: number;
        ry: number;
        /** Radians: the way `rx` points */
        rotation: number;
        /** Points a line goes to from its center, when angle lines are shown (#634) */
        spokes?: readonly FieldPoint[];
    }[];
    /**
     * Where the shape's marchers start the move (08-shape-system-ux.md, "Marcher styling"), drawn
     * as faint ghosts of them (#417): at the start flag, the same points the walks leave from
     */
    rings?: readonly FieldPoint[];
    /** The marcher at each of `rings`, whose ghost is drawn in its own color */
    ringIds?: readonly number[];
    /**
     * The real marchers drawn somewhere else than the show has them, full size (pathways step 4c,
     * DL-16): the Follow tool's line at its end spots (`spots`, which then aren't drawn as spots),
     * or, with `walk`, looping the walk (▶ Preview, DL-17: `walk(p)` is where each is at progress
     * `p` of the move, 0 to 1). `ids` and the points are in the same order.
     */
    marchersAt?: {
        readonly ids: readonly number[];
        readonly spots: readonly FieldPoint[];
        readonly walk?: (p: number) => readonly FieldPoint[];
    };
    /**
     * Thin, faint lines (pathways step 15): each member's lane of a group path, from its start
     * along its copy of the path to its end spot
     */
    lanes?: readonly (readonly FieldPoint[])[];
    /** The marcher who walks each of `lanes`, in the same order (pathways), when known */
    laneIds?: readonly number[];
    /**
     * How `lanes` are drawn: `faint` (thin, under a group path's line, the default) or `quiet`
     * (each one the line a marcher walks, at a shown path's weight in the faint path color: a
     * quiet group path's selected marchers, or every member while the group path is edited, so
     * only the line being edited is deep; pathways interaction rounds 2 and 3)
     */
    lanesWeight?: "faint" | "quiet";
    /** Which of `lanes` the pointer is on: tinted, lighter than a picked lane (pathways step 3b) */
    laneHighlights?: readonly number[];
    /** Which of `lanes` is being worked on: the only heavy line, over the path's (pathways step 3b) */
    lanePicked?: number;
    /**
     * Which of `lanes` have an adjustment (pathways, interaction system rule 5): drawn in the
     * group ring's color, so who bends off the group path reads whenever it shows
     */
    lanesAdjusted?: readonly number[];
    /** An adjusted lane's keys, small round handles while its path is open (pathways step 3b) */
    adjustHandles?: readonly { at: FieldPoint; selected: boolean }[];
    /**
     * Rings round marchers' starts (pathways step 15): `group` on each member of the group path
     * shown ("Follows the group path"), `own` on a selected marcher in the move that isn't on it
     * ("Own path" when it walks one); `label` is the ring's tooltip
     */
    memberRings?: readonly {
        at: FieldPoint;
        /** The marcher it rings, whose shape it takes */
        marcherId: number;
        kind: "group" | "own";
        label: string;
        /** Pulses, asking to be pressed: the Follow tool's ends (pathways step 4b) */
        pulse?: boolean;
        /** Drawn dashed: a marcher detached from the group path shown (pathways step 3c) */
        dashed?: boolean;
    }[];
    /**
     * The Follow tool's grab cue (pathways step 4d): on each end of the line, chevrons pointing
     * out along `dir` (a unit vector, the line's own way at that end) that slide outward and fade
     * on a loop, until an end is grabbed
     */
    pullArrows?: readonly { at: FieldPoint; dir: FieldPoint }[];
    /**
     * Spots the shape leaves empty on purpose, drawn as dashed rings: an odd-count outline's gap
     * (#390), which a click on another spot between corners moves
     */
    gaps?: readonly FieldPoint[];
    /**
     * Spots nobody will take (loose dots pasted onto fewer marchers, #961), drawn as dashed rings
     * at full strength: they're part of what's pasted, not a control
     */
    emptySpots?: readonly FieldPoint[];
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
    /**
     * A mirrored paste's mirror point (Paste mirrored): a handle that drags, with a line through
     * it side to side and front to back across the whole canvas. The lines the paste mirrors
     * across are drawn solid and named; the others faint.
     */
    mirror?: {
        at: FieldPoint;
        /** Mirrored side to side: across the line through the point that runs like a yard line */
        across: boolean;
        /** Mirrored front to back: across the line through the point that runs like the sidelines */
        deep: boolean;
        /** The upright line's name as the coordinate sheet writes it ("On 50"), when it mirrors */
        acrossLabel?: string;
        /** The level line's name ("12 BE BH"), when it mirrors */
        deepLabel?: string;
        /** The point is being dragged */
        dragging?: boolean;
    };
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
    /**
     * While the floating editor's menu of a Line's interval groups is open: each spot ringed in
     * its group's color (a CSS color), faint, or with a group pointed at that group lit and the
     * others dim
     */
    groupMarks?: readonly {
        at: FieldPoint;
        color: string;
        shade: "faint" | "lit" | "dim";
        group: number;
    }[];
    /**
     * Each gap of the group pointed at, labeled with its interval at its middle ("3", "↔ 2½"), and
     * each `seam` where it meets a neighbor with the interval there; the overlay sets them beside
     * the line, one label (`whole`, "2 at 3") for the group when its gaps are too short for one each
     */
    groupLabels?: readonly {
        at: FieldPoint;
        text: string;
        color: string;
        from: FieldPoint;
        to: FieldPoint;
        seam: boolean;
        whole: string;
    }[];
    /**
     * While a Line's Offset numbers are pointed at, focused or dragged, or an end is dragged
     * (owner on #596): the step from the first marcher to the next as a dashed right angle, across
     * to `corner` then up or down to `to`, each leg labeled ("↔ 2", "↕ −1")
     */
    offsetStep?: {
        from: FieldPoint;
        corner: FieldPoint;
        to: FieldPoint;
        across: string;
        deep: string;
    };
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
    /** Whether a marcher's dot (or an item) is under the press, so it is the dot's (P-1) */
    onDot(): boolean;
};

/** What the editor knows of the pointer when it asks a mode for its cursor. */
export type FieldModeHover = {
    /** Whether a marcher's dot (or an item) is under the pointer, so a press there is the marcher's */
    onDot(): boolean;
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
     * slop; `double` when that click came soon after another click, and
     * `ownFirst` when that first click was the mode's too, not the editor's
     * (the click on a member that turned a placed box's mode on).
     */
    release(
        pointer: FieldPointer,
        click: { double: boolean; ownFirst: boolean } | null,
    ): void;
    /** The press it claimed was lost: nothing is saved. */
    cancel(): void;
    /**
     * The cursor over `pointer` with no button down, or null for the editor's. `hover.onDot` says
     * whether a marcher's dot (or an item) is under it, which the editor's rules give the press.
     */
    cursorAt(pointer: FieldPointer, hover?: FieldModeHover): FieldCursor | null;
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
    /**
     * A right-click (a Mac's Ctrl-click, a long press on touch) at `pointer`, with no press held:
     * the mode opens its own menu there (a Line's point, #569) and returns true, or returns false
     * for the field's rules. Absent: always the field's.
     */
    openMenu?(pointer: FieldPointer): boolean;
    /**
     * A right-click or long press at `pointer` that `openMenu` didn't take: the actions the
     * field's menu offers there instead of its own (a marcher's path, pathways), or null for the
     * field's rules. Not asked over a marcher's dot, which is the dot's (pathways AP-O3).
     */
    fieldMenuAt?(pointer: FieldPointer): readonly string[] | null;
    /**
     * A click on empty field (no marcher or handle under it) at `pointer`, before the editor's
     * rules, which change the selection: the mode takes it and returns true, or returns false for
     * the editor's. `double` for a double-click's second click. Only clicks come here, so drags,
     * marquees and lassos from the same spot stay the editor's.
     */
    takeClick?(pointer: FieldPointer, double: boolean): boolean;
    /**
     * One of its presses held still for a long press (a pen or finger that has no right button,
     * tablet 1.5): true to give the press up for the menus a right-click there opens (the editor
     * then cancels it and asks {@link openMenu}), false to keep it. Absent: the press is kept, so
     * a mode only gives up presses it knows are safe to cancel.
     */
    longPress?(pointer: FieldPointer): boolean;
    /** What `activeGesture` reports while one of its presses is held, and while it's on when `always`. */
    readonly gesture: { kind: FieldTestGesture; always: boolean };
}

/** A rotation typed into the inspector (user story 54), until it's saved. */
type TypedRotation = {
    starts: readonly MarcherPosition[];
    center: FieldPoint;
    degrees: number;
};

/**
 * A plain selection's pivot once it's out of its box's center (`selectionPivot.ts`): for the
 * selection `ids`, where `anchor` is.
 */
type OwnPivot = {
    ids: readonly number[];
    anchor: PivotAnchor;
};

/** What the field draws for a plain selection's pivot; see {@link FieldEditor.selectionPivot} */
export type SelectionPivot = {
    /** Where it is */
    at: FieldPoint;
    /** It's out of the center: the crosshair drags on its own */
    own: boolean;
    /** The pivot grid's cell it's on, or null on a marcher or a free spot */
    key: BoxPointKey | null;
    /** Where the pivot grid's cell pointed at, or the pointer while picking, would put it */
    preview?: FieldPoint;
    /**
     * The pointer rests on it with no button down: on the center dot ("center"), on the center
     * dot with $mod held so a drag pulls it out ("armed"), or on a crosshair out of the center
     * ("own"). The field shows a hint for each.
     */
    hover?: PivotHover;
    /** The next click on the field sets it ("Pick on field" in the inspector) */
    picking?: boolean;
};

/** Where the pointer rests on the pivot; see {@link SelectionPivot.hover} */
export type PivotHover = "center" | "armed" | "own";

export class FieldEditor {
    private press: FieldPress | null = null;
    /** The button of a drag that became no gesture: its moves and release do nothing. */
    private ignoredButton: number | null = null;
    private gesture: FieldGesture | null = null;
    private gestureButton = 0;
    private hover: FieldCursor = "default";
    private hoverHandle: HandleId | null = null;
    /** The selection box's cover when a rotation started: the box turns with it until the release */
    private rotateCovers: FieldRect | null = null;
    /**
     * Whether a drag from the empty spot under the pointer would draw an area: false inside a
     * multi-selection's box, where it moves the selection ({@link startMove}).
     */
    private hoverDraws = true;
    /** What a drag from empty field draws when its press didn't choose (the Select bar's tool). */
    private areaTool: AreaKind = "marquee";
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
    /**
     * The last handle gesture started on each item: a save that settles after another one started
     * on the same item leaves that one's size drawn.
     */
    private readonly itemTransforms = new Map<number, object>();
    /** Where the marchers being dragged are drawn, or null with no drag. */
    private live: readonly MarcherPosition[] | null = null;
    /**
     * While a move or a resize has the selection's edge or center on one of the field's lines
     * (#585): a guide along each, drawn as a shape's are. Null otherwise.
     */
    private lineGuides: FieldModeDrawing | null = null;
    private typed: TypedRotation | null = null;
    private ownPivot: OwnPivot | null = null;
    /** Where the pivot is drawn while its crosshair is dragged */
    private pivotDrag: FieldPoint | null = null;
    /** The pivot grid's cell pointed at, previewed on the field */
    private pivotPreview: BoxPointKey | null = null;
    /** The show is playing: the pivot isn't drawn and takes no presses */
    private playing = false;
    /** Where the pointer rests on the pivot, for the field's hint */
    private pivotHover: PivotHover | null = null;
    /** The next click on the field sets the pivot ("Pick on field") */
    private picking = false;
    /** Where that click would set it, under the pointer */
    private pickAt: FieldPoint | null = null;
    /** Counts typed rotations ended, saved or not, so the inspector's input starts over after each. */
    private rotationsEnded = 0;
    /** The mode taking presses first, while one is on. */
    private mode: FieldMode | null = null;
    private unsubscribeMode: (() => void) | null = null;
    /**
     * A press the mode claimed, until its release. `dragged` once it went past
     * the slop: dragged out and back, it's no click.
     */
    private modePress: {
        start: FieldPointer;
        /** What its release tells the mode if it's a click */
        click: { double: boolean; ownFirst: boolean };
        dragged: boolean;
    } | null = null;
    /** The prop tool, while it's on (C2.1). */
    private propTool: PropTool | null = null;
    /** The prop tool's last press, for telling its double-clicks. */
    private lastToolPress: { time: number; screen: FieldPoint } | null = null;
    /**
     * A right press, until its release: navigation pans with it, and a click
     * (one that never moved past the slop) opens the field's menu (#315). A
     * Mac's Ctrl-press too, whose click opens only a mode's menu (#569).
     */
    private rightPress: { start: FieldPointer; dragged: boolean } | null = null;
    /** What made the last press: readouts by the pointer keep clear of a finger. */
    private lastPressKind: PointerKind = "mouse";
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
            // A marcher hidden with its shape (#558) is out of reach, as it is for a click
            canSelect: (id) =>
                ports.canSelect(id) && !ports.marcherHidden?.(id),
            isItem: (id) => ports.isItem?.(id) ?? false,
            isLocked: (id) => ports.isLocked?.(id) ?? false,
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
        this.lastPressKind = pointer.kind;
        if (!this.isEditButton(pointer)) {
            // Navigation pans with it; a right-click (no drag) opens the
            // menu. A Mac's Ctrl-click pans (#194), and opens only a mode's
            // menu (a Line's point, #569)
            this.rightPress =
                pointer.button === 2 || this.isMacCtrl(pointer)
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
        this.setPivotHover(null);
        if (this.pickingPivot()) {
            // "Pick on field": this click sets the pivot, and does nothing else
            this.pickPivot(pointer);
            this.press = null;
            this.lastClick = null;
            this.ignoredButton = pointer.button;
            return true;
        }
        const modePress = this.modePressFor(pointer);
        if (this.mode?.claims(pointer, modePress)) {
            const last = this.lastClick;
            this.press = null;
            this.modePress = {
                start: pointer,
                // The first click may have been the editor's: the click
                // on a box's member that turned the mode on
                click: {
                    double: last !== null && this.isSoonAfter(last, pointer),
                    ownFirst: last?.mode === true,
                },
                dragged: false,
            };
            this.mode.press(pointer, modePress);
            this.emit();
            return true;
        }
        // A press on the field saves a rotation typed in the inspector first
        this.endRotation();
        // The pivot wins over a handle and a marcher under it, as a handle does
        const pivot = this.pivotAt(pointer);
        const handle = pivot ? null : this.handleAt(pointer);
        const hit = handle ? null : this.marcherAt(pointer);
        // A press with no move before it (a pen, a tap) still shows the handle it drags
        this.setHoverHandle(handle);
        this.press = {
            start: pointer,
            hit,
            handle,
            pivot,
            double: !handle && this.isDoubleClick(pointer, hit),
            add: this.options.onScreen?.add() ?? false,
            subtract: this.options.onScreen?.subtract?.() ?? false,
            area: pointer.area,
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
            if (isPastSlop(this.modePress.start, pointer))
                this.modePress.dragged = true;
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
            const modeCursor =
                this.mode?.cursorAt(pointer, {
                    onDot: () => this.marcherAt(pointer) !== null,
                }) ?? null;
            if (modeCursor) {
                this.setHoverHandle(null);
                this.setHover(modeCursor);
                return;
            }
            if (this.pickingPivot()) {
                this.pickAt =
                    this.pivotPlacer()?.(pointer.field, {
                        fine: pointer.shift,
                        constrain: false,
                        fromCenter: false,
                    }).at ?? null;
                this.setPivotHover(null);
                this.setHoverHandle(null);
                this.setHover("crosshair");
                this.emit();
                return;
            }
            const near = this.pivotHoverAt(pointer);
            this.setPivotHover(near);
            if (near === "armed" || near === "own") {
                this.setHoverHandle(null);
                this.setHover("move");
                return;
            }
            const handle = this.handleAt(pointer);
            this.setHoverHandle(handle);
            if (handle) this.setHover(handleCursor(handle));
            else if (this.marcherAt(pointer) !== null) this.setHover("pointer");
            else this.setHover("default", !this.pressMoves(pointer));
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
        const macCtrl =
            this.rightPress !== null &&
            this.rightPress.start.button === 0 &&
            pointer.button === 0;
        if (pointer.button === 2 || macCtrl) {
            const right = this.rightPress;
            this.rightPress = null;
            // A right-drag panned, and no menu opens
            if (!right || right.dragged || isPastSlop(right.start, pointer))
                return;
            // Mid-press or mid-drag of the left button, the right one does
            // nothing more; nor while the prop tool draws or a mode's press
            // is held. A mode's own menu first; then the field's, unless the
            // open shape is being edited (a Mac's Ctrl-click has none)
            if (!this.menuFree()) return;
            if (this.modeMenu(pointer)) return;
            if (!macCtrl && !this.blocksFieldMenu()) this.openMenu(pointer);
            return;
        }
        const modePress = this.modePress;
        if (modePress) {
            if (pointer.button !== modePress.start.button) return;
            this.modePress = null;
            const click =
                !modePress.dragged && !isPastSlop(modePress.start, pointer);
            // A double-click's second click starts no third
            this.lastClick =
                click && !modePress.click.double
                    ? {
                          time: this.now(),
                          screen: modePress.start.screen,
                          hit: null,
                          mode: true,
                      }
                    : null;
            this.mode?.release(pointer, click ? modePress.click : null);
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
        if (this.pivotClick(press)) return;
        // A double-click's second click starts no third
        this.lastClick = press.double
            ? null
            : {
                  time: this.now(),
                  screen: press.start.screen,
                  hit: press.hit,
              };
        // A mode may take a click on empty field (a double-click on a marcher's path opens it)
        if (
            press.hit === null &&
            this.mode?.takeClick?.(pointer, press.double)
        ) {
            if (this.lastClick) this.lastClick.taken = true;
            return;
        }
        this.click(press, pointer.shift || press.add === true);
        this.noteClickSelection();
        if (press.double && press.hit !== null)
            this.ports.doubleClickMarcher?.(press.hit);
    }

    /**
     * A long press by a finger or pen, lifted at `pointer` (tablet 1.5; a pen and a finger have
     * no right button; held still past the long press time and released without moving): the
     * menus a right-click there opens, a mode's first, then the field's (#569, #315), selecting
     * the marcher under it if it isn't selected. Returns whether it took over; when it didn't,
     * a press it holds is left for the caller to release (a slow tap).
     *
     * A press the editor holds that hasn't become a drag (a finger or pen on a marcher) is given
     * up first, so nothing is left pressed under the menu; a mode's press only when the mode says
     * it can be ({@link FieldMode.longPress}). Nothing during a drag or while the prop tool draws:
     * then the press carries on.
     */
    longPress(pointer: FieldPointer): boolean {
        if (this.gesture || this.propTool || this.ignoredButton !== null)
            return false;
        if (this.modePress) {
            if (
                this.modePress.dragged ||
                isPastSlop(this.modePress.start, pointer) ||
                !this.mode?.longPress?.(pointer)
            )
                return false;
            this.modePress = null;
            this.mode.cancel();
            this.emit();
        } else if (this.press) {
            if (isPastSlop(this.press.start, pointer)) return false;
            // Given up, it's no click: nor half of a double-click
            this.press = null;
            this.lastClick = null;
        }
        if (this.modeMenu(pointer)) return true;
        if (this.blocksFieldMenu()) return false;
        this.openMenu(pointer);
        return true;
    }

    /**
     * Whether a single finger pressing at `pointer` edits (tablet 1.2): it
     * lands on what a drag would move. That is a marcher within the finger's
     * hit radius, a handle of the selection box, or the inside of a
     * multi-selection's box (unless the pill's Add makes that press a marquee,
     * as Shift does). Anywhere else the finger moves the view.
     *
     * While the prop tool is on, every finger draws, and while a field mode
     * is on, every press it claims is its own (tablet 1.4): the open shape
     * tool claims them all, so one finger draws and two move the view.
     */
    fingerEdits(pointer: FieldPointer): boolean {
        if (this.propTool) return true;
        if (this.mode?.claims(pointer, this.modePressFor(pointer))) return true;
        if (this.handleAt(pointer) || this.marcherAt(pointer) !== null)
            return true;
        return (
            !this.onScreenAreaChoice() &&
            !this.modeOwnsSelectionBox() &&
            this.insideSelectionBox(this.ports.selection.get(), pointer.field)
        );
    }

    /**
     * Whether a finger or pen press at `pointer` is on empty field, where the
     * pill's drag mode decides what its drag does (tablet 1.3): no tool or
     * field mode is on, and the press lands on nothing a drag would move
     * ({@link fingerEdits}).
     */
    pressOnEmptyField(pointer: FieldPointer): boolean {
        return !this.propTool && !this.mode && !this.fingerEdits(pointer);
    }

    /** The pill's Add or Subtract is on: a press inside the selection box draws an area, as Shift or Alt does */
    private onScreenAreaChoice(): boolean {
        const screen = this.options.onScreen;
        return (screen?.add() ?? false) || (screen?.subtract?.() ?? false);
    }

    /**
     * A finger tapped where it moves the view (empty field, tablet 1.2): a
     * click there, so it clears the selection as a click does (the pill's Add
     * keeps it, as Shift does). A field mode on sees it as it sees a click
     * there. Nothing while the prop tool is on: its fingers draw
     * ({@link fingerEdits}).
     */
    fingerTap(pointer: FieldPointer): void {
        if (this.propTool || !this.menuFree()) return;
        if (!this.pointerDown(pointer)) return;
        this.pointerUp(pointer);
    }

    /** What the editor tells a mode of a press at `pointer` */
    private modePressFor(pointer: FieldPointer): FieldModePress {
        return {
            reachesInside: () =>
                this.reachInside(pointer, this.marcherAt(pointer)) !== null,
            isMac: this.options.isMac ?? false,
            onDot: () => this.marcherAt(pointer) !== null,
        };
    }

    /**
     * A mode's menu at `pointer`: its own (`openMenu`), or the field's with the actions it offers
     * there (`fieldMenuAt`). Says whether one opened.
     */
    private modeMenu(pointer: FieldPointer): boolean {
        if (this.mode?.openMenu?.(pointer)) return true;
        // A marcher's dot is the dot's (pathways AP-O3): a path line under it isn't asked, so the
        // press doesn't pick that path and the marcher's own menu opens
        if (this.marcherAt(pointer) !== null) return false;
        const actions = this.mode?.fieldMenuAt?.(pointer) ?? null;
        if (!actions || actions.length === 0) return false;
        this.ports.openMenu?.(pointer, null, actions);
        return true;
    }

    /** No press, drag or prop tool that a menu would cut into */
    private menuFree(): boolean {
        return (
            !this.gesture && !this.press && !this.propTool && !this.modePress
        );
    }

    /** A Mac's Ctrl+press: a right-click there, which pans (#194) */
    private isMacCtrl(pointer: FieldPointer): boolean {
        return (
            (this.options.isMac ?? false) &&
            pointer.button === 0 &&
            pointer.ctrl
        );
    }

    /** The pointer was lost (capture lost, the window lost focus): nothing is clicked or dropped. */
    pointerCancel(): void {
        // The last click stays: the renderer also cancels after every release
        // A press the prop tool was drawing with is dropped (a second finger
        // landed to move the view): the corners already down stay
        this.propTool?.cancel();
        if (this.modePress) {
            this.modePress = null;
            this.mode?.cancel();
            this.emit();
        }
        this.press = null;
        this.ignoredButton = null;
        this.cancelGesture();
    }

    /**
     * A click on a pivot out of the center leaves the selection be, and a second one soon after
     * sends it back to the center, as on a shape. A $mod-click on the center is an ordinary
     * click. Returns whether the click was the pivot's.
     */
    private pivotClick(press: FieldPress): boolean {
        if (!press.pivot || !this.ownPivot) return false;
        const last = this.lastClick;
        if (last?.pivot && this.isSoonAfter(last, press.start)) {
            this.lastClick = null;
            this.resetSelectionPivot();
            return true;
        }
        this.lastClick = {
            time: this.now(),
            screen: press.start.screen,
            hit: null,
            pivot: true,
        };
        this.noteClickSelection();
        return true;
    }

    /** Remembers the selection the last click left, to tell when something else changes it. */
    private noteClickSelection() {
        if (this.lastClick)
            this.lastClick = {
                ...this.lastClick,
                selection: this.ports.selection.get(),
            };
    }

    /** The pointer left the field with no button down. */
    pointerLeave(): void {
        this.mode?.leave?.();
        this.setHoverHandle(null);
        this.setPivotHover(null);
        if (this.pickAt) {
            this.pickAt = null;
            this.emit();
        }
        this.setHover("default");
    }

    /**
     * Ctrl/Cmd+A: every marcher and prop drawn that can be selected; locked items (the pit) are
     * left out (props epic, fork #1239).
     */
    selectAll(): void {
        const { ids, hidden } = this.ports.marchers();
        const isLocked = this.ports.isLocked ?? (() => false);
        this.write(
            ids.filter(
                (id, i) =>
                    !hidden?.[i] &&
                    !isLocked(id) &&
                    this.ports.canSelect(id) &&
                    !this.ports.marcherHidden?.(id),
            ),
        );
    }

    /** The marchers selected now: the app's selection, as the editor reads it. */
    selected(): readonly number[] {
        return this.ports.selection.get();
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

    /**
     * What made the press in progress, or the last one: the overlay keeps its readouts clear
     * of a finger, and by a mouse or pen pointer as they always were.
     */
    pressKind(): PointerKind {
        return this.lastPressKind;
    }

    /** Whether a press on the field is under way, still a click or already a drag (#933) */
    pressing(): boolean {
        return (
            this.press !== null ||
            this.gesture !== null ||
            this.modePress !== null
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
        this.hoverHandle = null;
        if (mode) {
            this.cancelGesture();
            this.press = null;
            // A click a mode took can change the mode (a path clicked under a selected box goes
            // from the box's mode to the path's); the next click can still be its double-click
            if (!this.lastClick?.taken) this.lastClick = null;
            this.unsubscribeMode = mode.subscribe(() => this.emit());
        }
        this.emit();
    }

    /**
     * Turns the prop tool on to draw an Outline of `outlineType` (the Props
     * panel's Draw), or to place a fixed `stamp` with a click (its Front
     * ensemble), or off with null. Turning it on ends any press or gesture;
     * turning it on again starts the drawing over.
     */
    setPropTool(
        outlineType: OutlineType | null,
        stamp: PropToolStamp | null = null,
    ): void {
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
        this.propTool = new PropTool(
            outlineType,
            {
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
                        ) <= thresholdsFor(pointer.kind).doubleClickSlop
                    );
                },
            },
            stamp,
        );
        this.emit();
    }

    /** The prop tool's Outline being drawn, or null when it's off. */
    propToolShape(): PropToolShape | null {
        return this.propTool?.shape() ?? null;
    }

    /**
     * Finishes the polygon the prop tool is drawing, as a double-click does
     * (its Finish button, tablet 1.4). Returns whether it could: three
     * corners or more, and no press held.
     */
    finishPropTool(): boolean {
        return this.propTool?.finishNow() ?? false;
    }

    /**
     * Takes back the last corner the prop tool's clicks put down (its Undo
     * point button, tablet 1.4). Returns whether there was one.
     */
    removeLastPropPoint(): boolean {
        return this.propTool?.removeLastPoint() ?? false;
    }

    /** What the mode draws over the field, or null with no mode or nothing drawn. */
    modeDrawing(): FieldModeDrawing | null {
        return this.mode?.drawing() ?? this.lineGuides;
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
    rotationFrame(): {
        box: FieldRect;
        angle: number;
        covers: FieldRect | null;
        around: FieldPoint;
    } | null {
        return this.gesture instanceof RotateGesture
            ? {
                  box: this.gesture.box,
                  angle: this.gesture.angle(),
                  covers: this.rotateCovers,
                  around: this.gesture.center,
              }
            : null;
    }

    /** What the selection box stands clear of besides its marchers (step 4j), or null. */
    selectionCovers(): FieldRect | null {
        return this.ports.selectionCovers?.() ?? null;
    }

    /**
     * The selection box handle the pointer is over with no button down, or the
     * one being dragged (the hover isn't updated during a drag); null with
     * none. A box standing clear of an order lane draws its middle handles
     * only while they're pointed at (step 4j).
     */
    hoveredHandle(): HandleId | null {
        return this.hoverHandle;
    }

    /**
     * The plain selection's pivot, which the field draws as a crosshair (see `selectionPivot.ts`).
     * While a rotation is dragged or typed, it's what that turns around. Null while the selection
     * can't be turned (fewer than two marchers drawn, a mode with its own handles, the prop tool,
     * read-only) and while the show plays.
     */
    selectionPivot(): SelectionPivot | null {
        if (this.playing || this.propTool || !this.canTransform()) return null;
        if (this.modeOwnsSelectionBox()) return null;
        const own = this.currentOwnPivot();
        const turning =
            this.gesture instanceof RotateGesture
                ? this.gesture.center
                : this.typed?.center;
        if (turning) return { at: turning, own: own !== null, key: null };
        if (this.pivotDrag) return { at: this.pivotDrag, own: true, key: null };
        if (this.gesture) return this.restingPivot(own, false);
        return this.restingPivot(own, true);
    }

    /**
     * Where the plain selection's pivot was set, when it was moved off its box's center (a cell
     * picked, dragged onto a marcher or a spot): what Flip mirrors about too. Null on the center.
     */
    selectionPivotAnchor(): PivotAnchor | null {
        if (this.selectionPivot() === null) return null;
        const anchor = this.currentOwnPivot()?.anchor ?? null;
        return anchor && !isCenter(anchor) ? anchor : null;
    }

    /** The pivot where it's set; `resting` with no gesture running, so hints and previews show */
    private restingPivot(
        own: OwnPivot | null,
        resting: boolean,
    ): SelectionPivot | null {
        const starts = this.drawnPositions(this.ports.selection.get());
        const box = boundsOf(starts);
        if (!box) return null;
        const anchor = own?.anchor ?? { kind: "box", key: "c" };
        const byId = new Map(starts.map((p) => [p.id, p]));
        const preview = this.picking
            ? this.pickAt
            : this.pivotPreview && boxPoint(box, this.pivotPreview);
        return {
            at: anchorPoint(anchor, box, (id) => this.drawnPoint(id, byId)),
            own: own !== null,
            key: anchor.kind === "box" ? anchor.key : null,
            ...(resting && preview ? { preview } : {}),
            ...(resting && this.pivotHover && !this.picking
                ? { hover: this.pivotHover }
                : {}),
            ...(this.picking ? { picking: true } : {}),
        };
    }

    /**
     * "Pick on field": the next click on the field sets the pivot where it lands, snapped as a
     * drag of the crosshair snaps. Escape, or the button again, cancels it.
     */
    startPickingPivot(): void {
        if (this.picking || !this.selectionPivot()) return;
        this.picking = true;
        this.pivotPreview = null;
        this.emit();
    }

    /** Stops "Pick on field" without setting anything. */
    cancelPickingPivot(): void {
        if (!this.picking) return;
        this.picking = false;
        this.pickAt = null;
        this.emit();
    }

    /** Whether the next click on the field sets the pivot */
    pickingPivot(): boolean {
        return this.picking && this.selectionPivot() !== null;
    }

    /** The picking click at `pointer`: the pivot goes where it snaps */
    private pickPivot(pointer: FieldPointer): void {
        const place = this.pivotPlacer();
        const ids = this.ports.selection.get();
        this.picking = false;
        this.pickAt = null;
        if (place) {
            const { anchor } = place(pointer.field, {
                fine: pointer.shift,
                constrain: false,
                fromCenter: false,
            });
            this.ownPivot = isCenter(anchor) ? null : { ids: [...ids], anchor };
        }
        this.setHover("default");
        this.emit();
    }

    private setPivotHover(hover: PivotHover | null): void {
        if (this.pivotHover === hover) return;
        this.pivotHover = hover;
        this.emit();
    }

    /**
     * Sets the pivot to point `key` of the selection's box (the inspector's pivot grid); the
     * center puts it back there.
     */
    /**
     * The selection's pivot pinned to field point `at` (a spot of its own), so it stays where it is
     * whatever the marchers do: Flip pins a pivot set on a cell of the box before it mirrors about
     * it, so flipping again, or undoing, goes about the same line
     */
    pinSelectionPivot(at: FieldPoint): void {
        if (this.selectionPivot() === null) return;
        const ids = this.ports.selection.get();
        this.ownPivot = {
            ids: [...ids],
            anchor: { kind: "point", at: { x: at.x, y: at.y } },
        };
        this.emit();
    }

    setSelectionPivot(key: BoxPointKey): void {
        // None while a shape owns the selection, or a lone marcher: nothing to set
        if (this.selectionPivot() === null) return;
        const ids = this.ports.selection.get();
        this.ownPivot =
            key === "c"
                ? null
                : { ids: [...ids], anchor: { kind: "box", key } };
        this.emit();
    }

    /** Shows where pivot grid cell `key` would put the pivot; null hides it. */
    previewSelectionPivot(key: BoxPointKey | null): void {
        if (this.pivotPreview === key) return;
        this.pivotPreview = key;
        this.emit();
    }

    /** Puts the pivot back on the selection's center. */
    resetSelectionPivot(): void {
        if (!this.ownPivot) return;
        this.ownPivot = null;
        this.emit();
    }

    /**
     * The Select bar's tool (`fieldSelectTool.ts`): what a drag from empty field draws when its
     * press didn't choose. A lasso shows its cursor over empty field. A double-click and drag
     * draws a lasso with either.
     */
    setAreaTool(tool: AreaKind): void {
        if (this.areaTool === tool) return;
        this.areaTool = tool;
        this.emit();
    }

    /** The show started or stopped playing: the pivot hides while it plays. */
    setPlaying(playing: boolean): void {
        if (this.playing === playing) return;
        this.playing = playing;
        if (playing) {
            this.cancelGesture();
            this.picking = false;
            this.pickAt = null;
        }
        this.emit();
    }

    /**
     * The field shows another page: a pivot on a free spot of the field is dropped, and the
     * next press is no second half of a double-click begun on the page before (#628).
     */
    pageChanged(): void {
        this.lastClick = null;
        if (this.ownPivot?.anchor.kind !== "point") return;
        this.ownPivot = null;
        this.emit();
    }

    /** The pivot set for the current selection, or null (it's the center then). Reads only. */
    private currentOwnPivot(): OwnPivot | null {
        const own = this.ownPivot;
        return own && sameIds(own.ids, this.ports.selection.get()) ? own : null;
    }

    /** Where the pivot is for the selection drawn at `starts`, or null on the center */
    private ownPivotAt(starts: readonly MarcherPosition[]): FieldPoint | null {
        const own = this.currentOwnPivot();
        const box = boundsOf(starts);
        if (!own || !box) return null;
        const byId = new Map(starts.map((p) => [p.id, p]));
        return anchorPoint(own.anchor, box, (id) => this.drawnPoint(id, byId));
    }

    /** Where marcher `id` is drawn, from `known` or else the field */
    private drawnPoint(
        id: number,
        known: ReadonlyMap<number, FieldPoint>,
    ): FieldPoint | undefined {
        return known.get(id) ?? this.drawnPositions([id])[0];
    }

    /**
     * Whether a press or hover at `pointer` is on the pivot's crosshair: out of the center, near
     * it; on the center, only with $mod held, which pulls it out as on a shape. A plain press on
     * the center is the marcher's or the box's, as before.
     */
    private pivotAt(pointer: FieldPointer): boolean {
        const near = this.pivotHoverAt(pointer);
        return near === "armed" || near === "own";
    }

    /** What the pointer at `pointer` rests on of the pivot, if it's near it */
    private pivotHoverAt(pointer: FieldPointer): PivotHover | null {
        const pivot = this.selectionPivot();
        if (!pivot || pivot.picking) return null;
        const reach = PIVOT_REACH_PX / (this.ports.zoom() || 1);
        const { x, y } = pointer.field;
        if (Math.hypot(x - pivot.at.x, y - pivot.at.y) > reach) return null;
        if (pivot.own) return "own";
        return this.modHeld(pointer) ? "armed" : "center";
    }

    /** $mod at `pointer`: Cmd on a Mac, Ctrl elsewhere */
    private modHeld(pointer: FieldPointer): boolean {
        return this.options.isMac ? pointer.meta : pointer.ctrl;
    }

    /**
     * Dragging the pivot's crosshair: it snaps to the box's 9 points and to any marcher that can
     * be pressed within reach, else to the grid; fine or the Snap toggle off leaves it where the
     * pointer is. Set on the center, it's the center again.
     */
    private startPivot(press: FieldPress): FieldGesture | null {
        if (!press.pivot) return null;
        const ids = this.ports.selection.get();
        const place = this.pivotPlacer();
        if (!place) return null;
        return new PivotGesture(this.keysFor(press.start), place, {
            show: (at) => {
                this.pivotDrag = at;
                this.emit();
            },
            set: ({ anchor }) => {
                this.pivotDrag = null;
                this.ownPivot = isCenter(anchor)
                    ? null
                    : { ids: [...ids], anchor };
                this.emit();
            },
            cancel: () => {
                this.pivotDrag = null;
                this.emit();
            },
        });
    }

    /**
     * Where the pivot goes for the pointer at a point, with these roles held: the box's 9 points
     * and any marcher that can be pressed within reach, else the grid; fine or the Snap toggle
     * off leaves it where the pointer is. Null when the selection has no box.
     */
    private pivotPlacer():
        | ((at: FieldPoint, roles: Roles) => PivotTarget)
        | null {
        const starts = this.drawnPositions(this.ports.selection.get());
        const box = boundsOf(starts);
        if (starts.length < 2 || !box) return null;
        const zoom = this.ports.zoom() || 1;
        const targets: PivotTarget[] = BOX_POINT_KEYS.map((key) => ({
            at: boxPoint(box, key),
            anchor: { kind: "box", key },
        }));
        const { ids: drawn, positions, hidden } = this.ports.marchers();
        for (let i = 0; i < drawn.length; i++) {
            const id = drawn[i];
            if (hidden?.[i] || this.ports.marcherHidden?.(id)) continue;
            if (!this.ports.canSelect(id) || this.ports.isLocked?.(id))
                continue;
            targets.push({
                at: { x: positions[i * 2], y: positions[i * 2 + 1] },
                anchor: { kind: "marcher", id },
            });
        }
        const grid = (p: FieldPoint) => this.ports.snap?.(p) ?? p;
        const free = (at: FieldPoint): PivotTarget => ({
            at,
            anchor: { kind: "point", at },
        });
        return (at, roles) =>
            roles.fine || !(this.options.snap?.() ?? true)
                ? free(at)
                : snapPivot(at, targets, PIVOT_REACH_PX / zoom, grid);
    }

    /**
     * Whether a mode (the open shape, a selected placed box) keeps the selection from being
     * turned: the inspector's rotation is refused then, so it's shown disabled.
     */
    selectionLocked(): boolean {
        return this.mode?.locksSelection ?? false;
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
     * Turns the selection `degrees` clockwise about its pivot (its box's
     * center unless the pivot was dragged elsewhere), from where it was when
     * the typing started, as the rotate handle does (user story 54). Drawn until {@link endRotation} saves it. Refused during a
     * drag and while a mode that locks the selection is on. Over a drop still
     * saving it starts from where that drop is drawn, and is dropped if that
     * drop is refused.
     */
    rotateSelection(degrees: number): void {
        if (this.gesture || this.modePress || this.mode?.locksSelection) return;
        if (!this.typed) {
            const starts = this.drawnPositions(this.ports.selection.get());
            const box = boundsOf(starts);
            if (starts.length < 2 || !box) return;
            const center = this.ownPivotAt(starts) ?? centerOf(box);
            this.typed = { starts, center, degrees: 0 };
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

    /**
     * The selection changed: a typed rotation whose marchers aren't the selection any more is
     * dropped, and so is a last click that didn't leave this selection.
     */
    selectionChanged(): void {
        // A handle pointed at belonged to the old selection's box
        this.setHoverHandle(null);
        // Something other than the last click changed the selection: the next press starts
        // afresh (#628). The app trimming the click's own selection (members dimmed by an
        // isolated move, or hidden at this beat) is still that click's; Escape empties it.
        // A mode's clicks keep their own double-clicks
        const last = this.lastClick;
        if (
            last?.selection &&
            !sameIds(last.selection, this.ports.selection.get()) &&
            !trimmedFrom(this.ports.selection.get(), last.selection)
        )
            this.lastClick = null;
        // A pivot is the selection's: a new one starts on its center
        this.cancelPickingPivot();
        if (
            this.ownPivot &&
            !sameIds(this.ownPivot.ids, this.ports.selection.get())
        ) {
            this.ownPivot = null;
            this.emit();
        }
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
        if (this.propTool) return "crosshair";
        // Over empty field a drag would draw the lasso, unless a field mode takes the press or
        // it's inside the selection's box, where a drag moves the selection
        if (
            this.hover === "default" &&
            this.hoverDraws &&
            this.areaTool === "lasso" &&
            !this.mode
        )
            return "lasso";
        return this.hover;
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
     * after a double-click or with the Lasso tool, else a marquee. A press on a marcher that moves
     * nothing (Shift took a group or a box's member out) is done, and starts
     * no marquee.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected startDrag(press: FieldPress, pointer: FieldPointer) {
        return (
            this.startPivot(press) ??
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
        this.rotateCovers = this.selectionCovers();
        return press.handle === "rot"
            ? new RotateGesture(
                  press.start,
                  starts,
                  host,
                  box,
                  keys,
                  this.options.snap,
                  this.ownPivotAt(starts) ?? undefined,
              )
            : new ScaleGesture(
                  press.start,
                  starts,
                  host,
                  press.handle,
                  box,
                  keys,
                  (point) => this.ports.snap?.(point) ?? point,
                  this.options.snap,
                  () => this.options.pull?.() ?? null,
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
        return {
            box,
            pad: this.ports.selectionBoxPadding?.() ?? 0,
            angle: 0,
            covers: this.selectionCovers(),
        };
    }

    /**
     * The handle of the selection box `pointer` is on, within its kind's reach, or null. On a box
     * standing clear of an order lane (step 4j) a middle handle gives way to a marcher under the
     * pointer (see {@link MIDDLE_HANDLES}). A pen's
     * or finger's wider reach gives way to a move where the press is on a marcher or inside the
     * box ({@link wideHandleWins}, tablet 1.4); a mouse's is the handle as drawn, and wins there.
     */
    private handleAt(pointer: FieldPointer): HandleId | null {
        const frame = this.selectionFrame();
        if (!frame) return null;
        const zoom = this.ports.zoom();
        const handles = handlePoints(frame, zoom);
        const handle = handleAt(
            handles,
            pointer.field,
            zoom,
            thresholdsFor(pointer.kind).handleReach,
        );
        if (handle === null) return null;
        const reach = thresholdsFor(pointer.kind).handleReach;
        if (handle !== "rot" && this.pressMovesSmallItem(pointer, zoom, reach))
            return null;
        const hit = this.marcherAt(pointer);
        // A box standing clear of an order lane (step 4j) draws its middle handles only while
        // they're pointed at, so one gives way to a marcher under the pointer: the grown box's
        // sides can reach the next marcher along the line
        if (frame.covers && MIDDLE_HANDLES.has(handle) && hit !== null)
            return null;
        if (pointer.kind === "mouse") return handle;
        const [onMarcher] =
            hit !== null && !(this.ports.isItem?.(hit) ?? false)
                ? this.drawnPositions([hit])
                : [];
        return wideHandleWins({
            frame,
            handle,
            handles,
            at: pointer.field,
            zoom,
            marcherDistance: onMarcher
                ? Math.hypot(
                      onMarcher.x - pointer.field.x,
                      onMarcher.y - pointer.field.y,
                  )
                : Infinity,
        })
            ? handle
            : null;
    }

    /**
     * Whether a press inside the selected item's Outline moves it instead of taking a size handle:
     * on an Outline too small on screen for room between its handles (a cube at normal zoom), the
     * handles would cover it all and a drag meant to move it would squash it (props epic, fork
     * #1239). Its handles still take a press from outside the Outline.
     */
    private pressMovesSmallItem(
        pointer: FieldPointer,
        zoom: number,
        reach: number,
    ): boolean {
        const item = this.selectedItem();
        if (!item) return false;
        const { width, depth } = item.frame;
        if (Math.min(width, depth) * zoom >= SMALL_ITEM_REACHES * reach)
            return false;
        return this.ports.itemAt?.(pointer.field) === item.id;
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
     * given, and at its new center when the resize moved it, until its save
     * settles, as a drop's marchers are.
     */
    private startItemTransform(
        press: FieldPress,
        handle: HandleId,
        { id, frame }: { id: number; frame: ItemFrame },
    ): FieldGesture {
        const transform = {};
        this.itemTransforms.set(id, transform);
        const preview = (size: ItemSize | null) => {
            this.ports.previewItem?.(id, size);
            if (size?.center) this.showLive([{ id, ...size.center }]);
            else if (this.live) this.endLive();
        };
        const host = {
            show: (size: ItemSize) => preview(size),
            cancel: () => preview(null),
            save: (size: ItemSize) => {
                const unchanged =
                    size.width === frame.width &&
                    size.depth === frame.depth &&
                    size.rotation === frame.rotation &&
                    !size.center;
                if (unchanged || !this.ports.saveItem) {
                    preview(null);
                    return;
                }
                this.ports.previewItem?.(id, size);
                const center = size.center;
                // A moved center is drawn as a drop's marchers are, till the save settles, and
                // counts as a drop: only the last drop's answer clears what's pending
                const drop = center ? ++this.drops : null;
                if (center) {
                    this.live = null;
                    this.pending = withPositions(this.pending, [
                        { id, ...center },
                    ]);
                    this.ports.showPositions(this.pending);
                }
                const settle = () => {
                    if (this.itemTransforms.get(id) === transform) {
                        this.itemTransforms.delete(id);
                        this.ports.previewItem?.(id, null);
                    }
                    if (drop === null || drop !== this.drops) return;
                    this.pending = null;
                    this.ports.showPositions(
                        this.live && withPositions(null, this.live),
                    );
                };
                this.ports.saveItem(id, size).then(settle, settle);
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

    /** From empty field: what the press or the Select bar's tool chose, or a lasso after a double-click. */
    private startArea(press: FieldPress): FieldGesture {
        const start = this.areaStart(press);
        const isMac = this.options.isMac ?? false;
        this.area =
            press.double || (press.area ?? this.areaTool) === "lasso"
                ? startLasso(this.areaPorts, start, isMac)
                : startMarquee(this.areaPorts, start, isMac);
        return this.area;
    }

    /**
     * The keys an area from `press` starts with: the pill's Add adds, as Shift
     * at the press does, and its Subtract subtracts, as Alt does.
     */
    private areaStart(press: FieldPress): FieldPointer {
        if (!press.add && !press.subtract) return press.start;
        return {
            ...press.start,
            shift: press.start.shift || press.add === true,
            alt: press.start.alt || press.subtract === true,
        };
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
            ) <= thresholdsFor(pointer.kind).doubleClickSlop
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
        } else if (this.movesFromBox(this.areaStart(press), selection)) {
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

    /**
     * Whether a press on empty field with `keys` moves the whole selection: inside the box drawn
     * around it, with no add or subtract choice (owner decision, #196).
     */
    private movesFromBox(keys: FieldPointer, selection: readonly number[]) {
        return (
            !this.modeOwnsSelectionBox() &&
            areaChoice(keys, this.options.isMac) === null &&
            this.insideSelectionBox(selection, keys.field)
        );
    }

    /** Whether a press at empty `pointer` would move the selection, with the pill's Add and Subtract as a press reads them */
    private pressMoves(pointer: FieldPointer) {
        const screen = this.options.onScreen;
        return this.movesFromBox(
            {
                ...pointer,
                shift: pointer.shift || (screen?.add() ?? false),
                alt: pointer.alt || (screen?.subtract?.() ?? false),
            },
            this.ports.selection.get(),
        );
    }

    /** Whether `point` is inside the box drawn around a selection of two or more. */
    private insideSelectionBox(
        selection: readonly number[],
        point: FieldPoint,
    ) {
        if (selection.length < 2) return false;
        const starts = this.drawnPositions(selection);
        if (starts.length < 2) return false;
        const box = boundsOf(starts);
        if (!box) return false;
        const { left, right, top, bottom } = frameEdges({
            box,
            pad: this.ports.selectionBoxPadding?.() ?? 0,
            angle: 0,
            covers: this.selectionCovers(),
        });
        return (
            point.x >= left &&
            point.x <= right &&
            point.y >= top &&
            point.y <= bottom
        );
    }

    /** Draws the dragged marchers live, over any earlier drop still saving. */
    private showLive(positions: readonly MarcherPosition[]) {
        this.live = positions;
        this.ports.showPositions(withPositions(this.pending, positions));
        this.setLineGuides(positions);
    }

    /** The drag is over with nothing dropped: only drops still saving are drawn. */
    private endLive() {
        this.live = null;
        this.ports.showPositions(this.pending);
        this.setLineGuides(null);
    }

    /**
     * The guides for marchers drawn at `positions` while they're moved or resized: along each of
     * the field's lines their edges or center lie on, named as the coordinate sheet writes a spot
     * on it ("On 50"). None with the Snap toggle off, as a shape's (#425), or with `null`.
     */
    private setLineGuides(positions: readonly MarcherPosition[] | null) {
        const pull =
            positions &&
            (this.gesture instanceof MoveGesture ||
                this.gesture instanceof ScaleGesture) &&
            (this.options.snap?.() ?? true)
                ? this.options.pull?.()
                : null;
        const on = pull && positions ? linesUnder(positions, pull.lines) : null;
        const guides = on
            ? [
                  ...on.x.map((at) => ({
                      from: { x: at, y: 0 },
                      to: { x: at, y: 1 },
                      label: lineCoordinate("x", at) ?? undefined,
                  })),
                  ...on.y.map((at) => ({
                      from: { x: 0, y: at },
                      to: { x: 1, y: at },
                      label: lineCoordinate("y", at) ?? undefined,
                  })),
              ]
            : [];
        const before = JSON.stringify(this.lineGuides?.guides ?? []);
        if (JSON.stringify(guides) === before) return;
        this.lineGuides =
            guides.length > 0
                ? { outline: null, spots: [], walks: [], handles: [], guides }
                : null;
        this.emit();
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
        this.setLineGuides(null);
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
            // A pivot on a free spot moves with the drop only once it's saved: refused, the
            // marchers snap back and it stays put
            else this.carryPivot(starts, positions);
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
        const hit = this.handleAt(pointer) ? null : this.marcherAt(pointer);
        if (hit !== null && !this.ports.selection.get().includes(hit))
            this.write([hit]);
        this.ports.openMenu?.(pointer, hit);
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
                areaChoice(
                    this.areaStart(press),
                    this.options.isMac ?? false,
                ) === "subtract");
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
     * pressed. Every press, drag, menu and hover finds performers here, so
     * hidden ones (#558) are passed over in this one place.
     */
    private marcherAt({ field: point, kind }: FieldPointer) {
        const isItem = this.ports.isItem ?? (() => false);
        const hidden = this.ports.marcherHidden ?? (() => false);
        const performer = marcherAt(
            this.ports.marchers(),
            point,
            hitRadius(this.ports.zoom(), kind),
            (id) => !isItem(id) && !hidden(id) && this.ports.canSelect(id),
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

    private setHoverHandle(handle: HandleId | null) {
        if (handle === this.hoverHandle) return;
        this.hoverHandle = handle;
        this.emit();
    }

    /** `draws`: whether a drag from there would draw an area ({@link hoverDraws}) */
    private setHover(cursor: FieldCursor, draws = true) {
        if (cursor === this.hover && draws === this.hoverDraws) return;
        this.hover = cursor;
        this.hoverDraws = draws;
        this.emit();
    }

    /**
     * A pivot on a free spot follows a drag of the whole selection; anchored to the box or a
     * marcher, it follows by itself.
     */
    private carryPivot(
        starts: readonly MarcherPosition[],
        positions: readonly MarcherPosition[],
    ) {
        const own = this.currentOwnPivot();
        if (own?.anchor.kind !== "point") return;
        if (
            !sameIds(
                starts.map((p) => p.id),
                own.ids,
            )
        )
            return;
        const shift = uniformShift(starts, positions);
        if (!shift) return;
        const { at } = own.anchor;
        own.anchor = {
            kind: "point",
            at: { x: at.x + shift.x, y: at.y + shift.y },
        };
    }

    protected emit() {
        for (const listener of this.listeners) listener();
    }
}

/** The selection box's middle handles: drawn on a box clear of an order lane only while pointed at */
const MIDDLE_HANDLES: ReadonlySet<HandleId> = new Set(["n", "e", "s", "w"]);

/** `base` with `positions` written over it. */
const withPositions = (
    base: ReadonlyMap<number, FieldPoint> | null,
    positions: readonly MarcherPosition[],
): ReadonlyMap<number, FieldPoint> => {
    const merged = new Map(base);
    for (const { id, x, y } of positions) merged.set(id, { x, y });
    return merged;
};

/** Whether a press from `start` has become a drag: past its kind's move threshold. */
export const isPastSlop = (start: FieldPointer, pointer: FieldPointer) =>
    Math.hypot(
        pointer.screen.x - start.screen.x,
        pointer.screen.y - start.screen.y,
    ) >= thresholdsFor(start.kind).moveThreshold;

/** The same ids, in any order. */
/** Whether `ids` is some, but not none, of `from`: what's left after the app drops a few. */
const trimmedFrom = (ids: readonly number[], from: readonly number[]) => {
    if (ids.length === 0) return false;
    const set = new Set(from);
    return ids.every((id) => set.has(id));
};

const sameIds = (a: readonly number[], b: readonly number[]) => {
    if (a.length !== b.length) return false;
    const set = new Set(b);
    return a.every((id) => set.has(id));
};

import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Pivot, ShapeFrame } from "../frame/frame";
import type { ScrubMove } from "../editor/scrub";
import type { ClosedShape } from "../distribute/region";
import type { LayoutFamily } from "../distribute/distribution";
import type { AnyShapeKind, Slot, XY } from "../types";

/** The roles a kind's own drag reads beyond fine, which every shape drag reads */
export type KindHonors = Pick<HonoredRoles, "constrain" | "fromCenter">;

/**
 * What a gesture knows about the field and the roles held. Built fresh for each pointer event.
 */
export interface ToolEnv {
    /** Field units per 8-to-5 step */
    readonly stepPx: number;
    /**
     * False while `fine` is held or the Snap toggle is off: sizes and spots aren't rounded to the
     * half-step ladder
     */
    readonly snap: boolean;
    /**
     * False while the Snap toggle is off: nothing is pulled onto the field's lines either (#425,
     * #444, #446, #452), and a turn is free of its steps. `fine` keeps the pulls (owner on #453).
     * On when absent.
     */
    readonly pull?: boolean;
    /** The `fine` role is held: the ladder off and the pulls on (owner on #453), whole degrees */
    readonly fine?: boolean;
    /**
     * The `constrain` role is held: the gesture's own constraint (a box's equal spacings, or its
     * ratio lock flipped on a side handle; one axis on a move)
     */
    readonly constrain: boolean;
    /**
     * The `fromCenter` role is held: a box is drawn from its center out, and a handle resizes it
     * about its center, the opposite side moving the other way. Corner to corner when absent.
     */
    readonly fromCenter?: boolean;
    /** The nearest spot on the half-step grid */
    readonly gridSnap: (p: XY) => XY;
    /** How far from a handle a press still takes it, in field units */
    readonly hitRadius: number;
    /**
     * Screen pixels per field unit, for what depends on how far the field is zoomed in (a Line's
     * dragged interval snapping to half steps rather than whole ones); unknown when absent
     */
    readonly zoom?: number;
    /**
     * The press's `reachInside` choice: a press on the center dot pulls the pivot out (#350). Read
     * at the press only.
     */
    readonly reachInside?: boolean;
    /**
     * What a change the kind works out grows from (a new count, a spacing): the shape's pivot
     * when the host sets it, the center when absent
     */
    readonly pivot?: Pivot;
    /** Where marchers stand, for a dragged pivot to snap to (#350); none when absent */
    readonly pivotSnaps?: () => readonly XY[];
    /** The box's ratio lock: changing one spacing changes the other in proportion */
    readonly ratioLocked?: boolean;
    /**
     * Where the pivot was, on the field, when a run of size presses began (the chip's − and +):
     * each press grows from there rather than from the last one's rounding, so the shape doesn't
     * creep (#387). From the shape's own pivot when absent.
     */
    readonly anchor?: XY;
    /**
     * The user's last-used Files layout (#387), which a new box starts in; Short back when
     * absent
     */
    readonly layout?: LayoutFamily;
    /**
     * The field's lines a box's edge is pulled onto while its handle is dragged or it's drawn
     * (#425), in field units: x for lines side to side (yard lines), y for front to back (hashes,
     * sidelines). None when absent.
     */
    readonly fieldLines?: FieldLines;
    /** How near a line a moving edge must come to be pulled onto it, in field units (#425) */
    readonly pullRadius?: number;
}

/** Lines across the field at these x (side to side) and y (front to back) values */
export interface FieldLines {
    readonly x: readonly number[];
    readonly y: readonly number[];
}

/** A handle the canvas draws, and the cursor it shows on hover */
export interface ToolHandle {
    readonly key: string;
    readonly at: XY;
    readonly cursor: string;
    /** A handle that adds a point (a Line's segment midpoint, #524), drawn smaller and round */
    readonly adds?: boolean;
    /**
     * A click selects it (a Line's point, #557): the host keeps which one is selected, draws it
     * filled, and hands its key back to {@link ToolKind.handles}. A click elsewhere, or Escape,
     * clears it.
     */
    readonly selects?: boolean;
    /**
     * A handle at one end of a bar through this point (a smooth point's tangent, #557), drawn
     * round on the end of a line from here. Shown only while its point is selected, and it keeps
     * the selection when it's clicked or dragged.
     */
    readonly bar?: XY;
}

/** A parameter's direction mark: ↔ across, ↕ deep */
export type ParamGlyph = "↔" | "↕";

/**
 * One of a kind's numbers (#344, "The kind contract"), declared once so the host can show and
 * change it without knowing the kind: the floating chip shows the primary ones now, and the
 * inspector, the command bar's steps and a later API read the same list. Everything is pure.
 * `n` is the spot count, which the host gives; a kind never reads the selection.
 */
export interface ToolParam<P> {
    /** Stable for the kind: the command bar names the parameter by it */
    readonly key: string;
    /**
     * Shown as about so much ("≈1.83"): worked out from the shape rather than set, off the half
     * steps. Still dragged and typed; pressed, it goes to the nearest half step ({@link snap}).
     * An outline's spacing a drag or the other spacing left there (owner on #459).
     */
    readonly derived?: (params: P, n: number, stepPx: number) => boolean;
    /**
     * The number put on the nearest half step, as an edit of it: what pressing it does while it
     * shows as about so much ({@link ToolParam.derived}; an outline's spacing: owner on #459)
     */
    readonly snap?: (params: P, n: number, env: ToolEnv) => P;
    /** What it is, for tooltips and screen readers: "Side-to-side spacing, in steps" */
    readonly label: string;
    /**
     * Counts are whole numbers; steps and degrees are typed and shown as such; a choice is typed
     * by name (the host's mode step)
     */
    readonly unit: "count" | "steps" | "degrees" | "choice";
    /** Shown in the floating chip */
    readonly primary: boolean;
    /** Which way a drag changes it: right for more, up for more, or the first way moved */
    readonly drag: "x" | "y" | "both";
    /** A spacing between neighbors: scaling by interval changes it in half steps */
    readonly interval: boolean;
    /**
     * Can change smoothly over a move. Recorded only: nothing reads it until transforms over
     * time are built (#355).
     */
    readonly blends: boolean;
    /** The answer the command bar starts from, in `unit`; absent when it depends on the shape */
    readonly default?: number;
    /** Smallest and largest values, in `unit`; counts are also capped by the spot count */
    readonly range?: { readonly min?: number; readonly max?: number };
    /**
     * A mark before the number in the chip, so its direction reads without words: ↔ across, ↕
     * deep. Drawn as an icon (`GlyphText`), never as text a font may make an emoji. A function
     * when it depends on the shape (a Line's Measured setting); read through {@link paramGlyph}.
     */
    readonly glyph?: ParamGlyph | ((params: P, n: number) => ParamGlyph | null);
    /**
     * The mark goes after the number rather than before it: a Line's offset reads `2 ↔ 1 ↕`, each
     * number with the way it measures
     */
    readonly glyphAfter?: boolean;
    /**
     * While the number is pointed at, focused or dragged, the field draws the kind's
     * {@link ToolKind.step} and lights its pivot (a Line's offset, owner on #596)
     */
    readonly showsStep?: boolean;
    /** Hidden while this is false (a spacing with only one spot that way) */
    shown?(params: P, n: number): boolean;
    /** The number as shown: "6 × 2", "2" */
    display(params: P, n: number, stepPx: number): string;
    /**
     * The number in `unit`. Intervals declare it, and are set back through {@link set}.
     */
    value?(params: P, n: number, stepPx: number): number;
    /** A note after the number, such as "1 short"; null for none */
    note?(params: P, n: number): string | null;
    /** The params with `text` typed over the number; null when the text isn't understood */
    type(params: P, n: number, text: string, env: ToolEnv): P | null;
    /**
     * The params with the number set to `value`, in `unit`, as typing it would but without going
     * through its text, so a value the chip shows rounded (1.13 for 1⅛) comes back exact (#423).
     * The command bar's starting numbers use it; without it they type the value as shown.
     */
    set?(params: P, n: number, value: number, env: ToolEnv): P | null;
    /** The params with the number dragged by `move` from `base`, the params at the press */
    scrub(base: P, n: number, move: ScrubMove, env: ToolEnv): P;
    /**
     * The chip's − and + buttons, with what each does in words; `by` gives null where it can't
     * go that way. Absent for numbers without buttons.
     */
    readonly stepper?: {
        readonly less: string;
        readonly more: string;
        by(params: P, n: number, by: -1 | 1, env: ToolEnv): P | null;
    };
    /**
     * An interval's part in scaling (#349): the params with it `by` steps wider (closer when
     * negative), every gap of a gap list at once, kept on half steps; null where it can't go
     * (under half a step). The pivot is the host's: where the shape grows from doesn't matter.
     */
    widen?(params: P, n: number, by: number, env: ToolEnv): P | null;
}

/** The mark a number shows before it for `params`, if any ({@link ToolParam.glyph}) */
export function paramGlyph<P>(
    param: Pick<ToolParam<P>, "glyph">,
    params: P,
    n: number,
): ParamGlyph | null {
    const { glyph } = param;
    return (typeof glyph === "function" ? glyph(params, n) : glyph) ?? null;
}

/**
 * A lock on the kind's interval (a Line's, owner decision on #522), a button beside its interval
 * in the floating editor covering every group: locked, a drag keeps the interval and changes only
 * what it doesn't pin; unlocked, a typed interval is only where the shape starts from and a drag
 * changes it. Toggling is one change of the shape (one undo step). Everything is pure.
 */
export interface ToolLock<P> {
    /** Shown while this is true (a Line with an interval to lock) */
    shown(params: P, n: number): boolean;
    locked(params: P, n: number): boolean;
    /** The params locked if they're unlocked, else unlocked */
    toggle(params: P, n: number, env: ToolEnv): P;
    /** Its tooltip, as it is now */
    label(locked: boolean): string;
}

/** One group of a kind's interval list as the floating editor shows it (#526) */
export interface ToolGroup {
    /** Marchers in it as laid out: "2" */
    readonly count: string;
    /** Its interval in steps: "3", "1⅔" */
    readonly interval: string;
    /** No count was given: it takes the marchers the other groups don't */
    readonly rest: boolean;
    /** Marchers it took past its count, as the last group with no rest to take them; 0 if none */
    readonly grown: number;
    /** Too few marchers to reach it: it's dropped off the end */
    readonly dropped: boolean;
}

/** Which number of a group: how many marchers, or the steps between them */
export type GroupPart = "count" | "interval";

/**
 * A kind's mixed intervals (#526, spec #522): groups of marchers, each at its own interval, which
 * the floating editor shows as a chip each (`2 × 3 │ 4 × 2`) in place of the kind's single
 * interval. Everything is pure.
 */
export interface ToolGroups<P> {
    /** The groups, or null when the shape has one interval for everyone (its interval number) */
    shown(params: P, n: number, stepPx: number): readonly ToolGroup[] | null;
    /**
     * `text` typed over group `index`'s count or interval; a whole list typed there (`2*3+4*2`)
     * replaces the list. Null when the text isn't understood.
     */
    type(
        params: P,
        n: number,
        index: number,
        part: GroupPart,
        text: string,
        env: ToolEnv,
    ): P | null;
    /** Group `index`'s count or interval dragged by `move` from `base`, the params at the press */
    scrub(
        base: P,
        n: number,
        index: number,
        part: GroupPart,
        move: ScrubMove,
        env: ToolEnv,
    ): P;
    /**
     * The whole list as it's typed (`2*3+4*2`), what the group menu's list field starts from
     */
    text(params: P, n: number, stepPx: number): string;
    /**
     * A whole list typed in the group menu's list field: `2*3+4*2` replaces the groups, a plain
     * `2` is everyone at 2. Null when the text isn't understood.
     */
    typeList(params: P, n: number, text: string, env: ToolEnv): P | null;
    /**
     * What the intervals measure, when it's an axis rather than the line itself: `x` side to
     * side (↔), `y` front to back (↕). The field labels each gap of a group pointed at with it.
     */
    axis?(params: P): "x" | "y" | null;
    /**
     * The middle of the gap between two neighboring spots along the shape, and its length that
     * way, in field units, for its label: on the shape where it goes round a corner. Null (or
     * absent) for the straight line between them.
     */
    along?(params: P, from: Slot, to: Slot): { at: XY; length: number } | null;
    /** The params with a group added at the end (the chip's +) */
    add(params: P, n: number, env: ToolEnv): P;
    /** The params without group `index`; one group left is everyone at its interval */
    remove(params: P, n: number, index: number, env: ToolEnv): P;
}

/** A line in a {@link ToolChoicePicture} */
export interface ToolChoicePictureLine {
    readonly points: readonly XY[];
    /** Joined back to its first point */
    readonly closed?: boolean;
    /** A guide or a move rather than the shape itself: drawn light */
    readonly faint?: boolean;
    /** Where the shape would go rather than where it is: drawn dashed */
    readonly dashed?: boolean;
}

/**
 * A small sketch of what an answer does (#559), beside its name in the menu and on the menu's
 * button: lines and marchers in field units, any size, which the menu fits to its picture. A kind
 * draws it from its own geometry where it can (a sample line laid out with the answer), otherwise
 * by hand. Pure data, so kinds stay free of the UI.
 */
export interface ToolChoicePicture {
    readonly lines: readonly ToolChoicePictureLine[];
    /** Marchers where they stand */
    readonly dots: readonly XY[];
    /** Marchers where they come from, drawn light */
    readonly faintDots?: readonly XY[];
}

/** One answer in a kind's menu ({@link ToolChoice}) */
export interface ToolChoiceOption {
    /** Stable for the kind: tests and a later command step name the answer by it */
    readonly value: string;
    readonly label: string;
    /** Why it can't be picked now, shown with it greyed out; absent when it can */
    readonly disabled?: string;
    /** What it does, sketched; the menu shows the name alone when absent */
    readonly picture?: ToolChoicePicture;
}

/**
 * A menu of the kind's own (a Line's spacing, #523), declared once so the floating editor shows it
 * without knowing the kind, as it does the kind's numbers. Picking an answer is one change of the
 * shape. Everything is pure.
 */
export interface ToolChoice<P> {
    /** Stable for the kind */
    readonly key: string;
    /** What it is, for its tooltip and screen readers: "Spacing" */
    readonly label: string;
    /** The answers, in the order the menu lists them */
    options(params: P, n: number): readonly ToolChoiceOption[];
    /** The answer the shape has now: one of {@link options}' values */
    current(params: P, n: number): string;
    /** The params with `value` picked */
    pick(params: P, n: number, value: string, env: ToolEnv): P;
    /** Hidden while this is false (the corners switch on a line with no corner); shown when absent */
    shown?(params: P, n: number): boolean;
}

/** One entry in a handle's menu ({@link ToolHandleMenu}) */
export interface ToolMenuItem {
    /** Stable for the kind: tests and {@link ToolHandleMenu.pick} name the entry by it */
    readonly value: string;
    readonly label: string;
    /**
     * Whether it's the answer the shape has now, for an entry that is one of a set of answers:
     * the menu ticks it. Absent for an entry that just does something.
     */
    readonly checked?: boolean;
    /**
     * An on/off switch rather than an answer, on when `checked`: a `"follow"` section's "Follow
     * line's marchers" (#568)
     */
    readonly toggle?: true;
    /** A picture in front of the label, for an entry that does something */
    readonly icon?: "trash";
    /** It removes something: the menu draws it red when highlighted */
    readonly destructive?: boolean;
    /** Why it can't be picked now, shown with it dimmed; absent when it can */
    readonly disabled?: string;
}

/** A run of a handle menu's entries, set apart from the others, with a heading when it has one */
export interface ToolMenuSection {
    readonly label?: string;
    /**
     * `"segmented"`: its answers (entries with `checked`) are one either/or, side by side (Corner |
     * Smooth, #568), picked without closing the menu so the change shows; its other entries list
     * under them (Roundness). `"follow"`: its {@link ToolMenuItem.toggle} entry is a switch to
     * follow the shape's own answer, with {@link caption} under it, and its answers an either/or
     * under that, greyed while the switch is on with the shape's answer marked; picking one, greyed
     * or not, sets it over the shape's (a point's marcher, #568). Both stay open on a pick. A plain
     * list when absent. The label of a `"follow"` section names its answers rather than showing.
     */
    readonly look?: "segmented" | "follow";
    /** A quiet line under its either/or: another way to do the same ("Double-click a point to swap") */
    readonly hint?: string;
    /** A `"follow"` section's line under its switch: what the shape does, or why it can't be set */
    readonly caption?: string;
    readonly items: readonly ToolMenuItem[];
}

/**
 * A handle's right-click menu (#569): a Line's point or segment. Long-press opens it on touch and
 * Ctrl-click on a Mac, as everywhere on the field. Everything is pure.
 */
export interface ToolHandleMenu<P> {
    /** The menu for handle `key`, or null when it has none */
    sections(
        params: P,
        n: number,
        key: string,
    ): readonly ToolMenuSection[] | null;
    /**
     * Entry `value` picked on handle `key`: the shape after it (one undo step when it changed),
     * and the handle selected after it when that changes (null for none); absent keeps the
     * selection, as an edit does. Null when it does nothing.
     */
    pick(
        params: P,
        n: number,
        key: string,
        value: string,
        env: ToolEnv,
    ): { readonly params: P; readonly selected?: string | null } | null;
}

/**
 * Drawing by clicking point after point (#524, spec #522), for a kind that opts in. A drag still
 * draws with {@link ToolKind.draw}; a click with no drag starts a run of points, each click adds
 * one, and Enter, a double-click or a click on the last point finishes it; a click on the first
 * closes it, for a kind that can close. Everything is pure.
 */
export interface ToolClickPoints<P> {
    /**
     * Where a point clicked at `at` lands, after `previous` (the points placed so far, landed):
     * on the grid or a field line, at 45° from the last with `constrain`
     */
    land(previous: readonly XY[], at: XY, env: ToolEnv): XY;
    /** The shape through `points`, in order, or undefined while they aren't one yet */
    draw(points: readonly XY[], n: number, env: ToolEnv): P | undefined;
    /**
     * The shape through `points` closed, its last point joined to its first: what a click on the
     * first point draws once there are three (#529). Absent: that click adds a point as any does.
     */
    close?(points: readonly XY[], n: number, env: ToolEnv): P | undefined;
}

/**
 * How one kind of shape is drawn and edited with the pointer. The tool's state machine
 * (`toolMachine.ts`) owns the gestures and calls these; a kind never sees a pointer event.
 * Everything is pure.
 */
export interface ToolKind<P> {
    /** The shape kind that generates its spots and is stored in recipes */
    readonly shape: AnyShapeKind;
    /**
     * A preset of another kind's shape, named for the pickers (Curve, a Line whose points start
     * smooth, #525): its recipes are that kind's, read back as it. Absent for the kind itself.
     */
    readonly preset?: string;
    /**
     * The words the command bar finds a preset by, in place of its kind's id (the Curve's
     * "curve", "smooth" …); a kind itself is found by its shape's id
     */
    readonly keywords?: readonly string[];
    /** Its numbers, in the order the chip shows them (#344) */
    readonly params: readonly ToolParam<P>[];
    /** Its own menus, shown under the floating editor beside how it's filled (#523) */
    readonly choices?: readonly ToolChoice<P>[];
    /** Its mixed intervals, when it can be spaced by groups of marchers (#526) */
    readonly groups?: ToolGroups<P>;
    /** A lock on its interval, beside the interval in the floating editor */
    readonly lock?: ToolLock<P>;
    /**
     * The pivot a new shape of the kind starts at (a Line's leftmost end, owner on #596): it sets
     * that itself when it draws one; picking another kind carries a pivot only when it's been
     * moved by hand. The center when absent.
     */
    startPivot?(params: P): Pivot;
    /**
     * Whether `pivot` is one the kind could have put there itself, however the shape has been
     * turned, flipped or edited since (a Line's: either end, or its first point when that was the
     * leftmost). A placed shape doesn't keep whether its pivot was moved by hand, so this decides
     * whether a plain press on a handle under it takes the handle. Absent: only
     * {@link startPivot} as the shape is now.
     */
    ownPivot?(params: P, pivot: Pivot): boolean;
    /**
     * The step from one marcher to the next that its {@link ToolParam.showsStep} numbers set (a
     * Line's offset, rise over run): the field draws it as a right angle, ↔ then ↕, while they
     * are engaged or an end is dragged. Null when it has none now.
     */
    step?(params: P, n: number): { from: XY; to: XY } | null;
    /**
     * Its spots run in an order along it (a Line, #528): the host offers who goes where by Least
     * travel, Keep order or Reverse. Absent: always least travel.
     */
    readonly ordered?: boolean;
    /**
     * Whether params read back from a recipe are a shape of this kind this app can lay out. Absent:
     * they have a center, as every frame-based kind stores (ADR 0006). A kind whose frame follows
     * from its points (a Line) checks its own.
     */
    readable?(params: unknown): boolean;
    /**
     * What scaling changes (#344): `interval` kinds change their spacings in half steps,
     * `footprint` kinds (no regular spacing) their size in steps
     */
    readonly scaling: "interval" | "footprint";
    /**
     * The chip offers a lock that keeps the kind's two spacings in proportion
     * ({@link ToolEnv.ratioLocked})
     */
    readonly ratioLock?: boolean;
    /** Whether this shape offers the ratio lock, when the kind does; always when absent */
    ratioLockFor?(params: P, n: number): boolean;
    /**
     * What `constrain` and `fromCenter` do in this kind's own drags, as the chip near the cursor
     * names them: on the draw, and on a handle of the shape `params` of `n` spots by its key
     * (`ratioLocked`: the lock is on). A role left out does nothing there, so the chip leaves it
     * out.
     */
    readonly honors?: {
        readonly draw?: KindHonors;
        handle?(
            key: string,
            ratioLocked: boolean,
            params: P,
            n: number,
        ): KindHonors;
    };
    /**
     * The params a drag from `from` to `to` draws, or undefined while the drag is too short.
     * `previous` is what this same drag drew on the last pointer move.
     */
    draw(
        from: XY,
        to: XY,
        n: number,
        env: ToolEnv,
        previous?: P,
    ): P | undefined;
    /**
     * Click point after point to draw (#524); absent for kinds drawn by one drag only (the box,
     * the circle)
     */
    readonly clickPoints?: ToolClickPoints<P>;
    /**
     * The handles to draw and grab. `selected` is the key of the handle selected by a click (one
     * with {@link ToolHandle.selects}), so a kind can show more around it (#557).
     */
    handles(
        params: P,
        n: number,
        selected?: string | null,
    ): readonly ToolHandle[];
    /**
     * What a click on handle `key` does, rather than nothing: a Line's midpoint handle splits its
     * segment (#524). Null or absent: a click does nothing.
     */
    clickHandle?(params: P, n: number, key: string): P | null;
    /**
     * What a double-click on handle `key` does: a Line's point switches between a corner and
     * smooth (#557). Its first click has already done what a click does. Null or absent: nothing.
     */
    doubleClickHandle?(params: P, n: number, key: string): P | null;
    /** Right-click menus on its handles (#569); absent: the field's own menu, where it opens */
    readonly menu?: ToolHandleMenu<P>;
    /** The params with handle `key` dragged to `to`, starting from `base` (the params at press) */
    dragHandle(base: P, n: number, key: string, to: XY, env: ToolEnv): P;
    /** The shape's outline on the field; the frame's four corners when absent */
    outline?(params: P, n: number): readonly XY[];
    /** Whether the outline is open, drawn without joining its last point to its first (a line) */
    outlineOpen?(params: P, n: number): boolean;
    /**
     * The points pulled onto the field's lines while the shape is moved (#446): a box's corners,
     * then its center. None when absent, so the shape moves on the grid alone.
     */
    snapPoints?(params: P, n: number): readonly XY[];
    /**
     * Whether a press at `at` grabs the whole shape to move it. `env` gives the field's scale, for
     * kinds whose body is a reach around a line rather than an area.
     */
    contains(params: P, n: number, at: XY, env?: ToolEnv): boolean;
    /** `base` moved by `delta` */
    move(base: P, n: number, delta: XY, env: ToolEnv): P;
    /**
     * The shape's frame (08-shape-system-ux.md): center, size, turn and flip. Turning, flipping
     * and the center dot work on it, the same for every kind.
     */
    frameOf(params: P, n: number): ShapeFrame;
    /** The params with `frame`'s center, turn and flip; the kind keeps its own size */
    withFrame(params: P, n: number, frame: ShapeFrame): P;
    /**
     * How far the shape is turned as the editor reads and steps it, in radians: the knob and the
     * degrees snap this, ⟳ adds a quarter to it and typed degrees set it. The frame's rotation when
     * absent; a Line, whose frame points along it, reads the turn since it was drawn (ADR 0006,
     * decision 10), so its `withFrame` must keep this in step with the frame's turns.
     */
    turnOf?(params: P, n: number): number;
    /**
     * A `footprint` kind's part in scaling (#349): the params with the frame's half sizes set,
     * its center, turn and flip kept. Absent for `interval` kinds, which scale their spacings.
     */
    withSize?(
        params: P,
        n: number,
        half: { readonly halfWidth: number; readonly halfDepth: number },
        env: ToolEnv,
    ): P;
    /**
     * A new shape of this kind filling `frame`: its center, turn and flip, and its size as near
     * as the kind's spacing allows. Picking another kind with a shape open turns the shape into
     * this kind this way, so the frame is kept (#344).
     */
    fromFrame(frame: ShapeFrame, n: number, env: ToolEnv): P;
    /**
     * The shape its picture shows (`shapePreview`), when filling a square with {@link fromFrame}
     * wouldn't read as the kind: the Line's zigzag and the Curve's wave (owner, 2026-10-31)
     */
    pictureParams?(n: number, env: ToolEnv): P;
    /**
     * What the readout by the pointer says first while handle `key` is dragged, before the length
     * and spacing: a Line's end, the way it points from its neighbor ("15°"). Nothing when absent
     * or null.
     */
    handleTip?(params: P, n: number, key: string): string | null;
    /** After a turn or flip: the shape put back on the grid, if it snaps to one */
    settle?(params: P, n: number, env: ToolEnv): P;
    /**
     * A closed kind (spec #385): its region and the modes it can be filled in. Its shape's
     * `generate` lays its spots out through the host's distributor (`distribute/distribute.ts`).
     * Absent for open kinds (a line, an arc).
     */
    readonly closed?: ClosedShape<P>;
    /**
     * Its spots are where its marchers stood, who stands where included (a group, #603): the host
     * offers no Recalculate, and it isn't saved to the library, which keeps no spots
     */
    readonly asIs?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolKind = ToolKind<any>;

/** What the pickers know a kind by: its preset's name, else its shape's id */
export const toolId = (kind: AnyToolKind): string =>
    kind.preset ?? kind.shape.id;

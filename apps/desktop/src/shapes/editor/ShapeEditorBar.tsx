import clsx from "clsx";
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
} from "react";
import { animated, to, useSpring } from "@react-spring/web";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import { editorPlacement } from "./editorPlacement";
import { keepInView } from "./keepInView";
import { glideTo, isGliding } from "@/field/three/fieldNavigation";
import { setShapeScrubbing, useShapePointerStore } from "../field/shapePointer";
import { keepFocus } from "./keepFocus";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { getActionShortcutLabel } from "@/shortcuts/labels";
import type { ActionId } from "@/shortcuts/definitions";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { RichTips, Tip } from "./Tip";
import {
    ActionFace,
    RecalculateFace,
    useActionLook,
} from "./RecalculateButton";
import {
    FlipHorizontalIcon,
    FlipVerticalIcon,
    LinkSimpleIcon,
    MinusIcon,
    PlusIcon,
    ArrowClockwiseIcon,
    EqualsIcon,
    MagnetIcon,
    PathIcon,
} from "@phosphor-icons/react";
import {
    fieldToElement,
    useFieldViewStore,
    type FieldView,
} from "@/field/three/fieldView";
import { DEGREE, rotationDegrees, type Pivot } from "../frame/frame";
import { pivotOf, withPivot } from "../frame/pivot";
import {
    flipShape,
    frameControls,
    scrubTurn,
    shapeOutline,
    turnShape,
} from "../frame/gestures";
import { currentShapeField } from "../field/shapeFieldContext";
import {
    toggleRatioLock,
    useShapeEditorStore,
} from "../frame/shapeEditorStore";
import { HANDLE_REACH_PX, toolEnvFor } from "../tool/toolEnv";
import type { Roles } from "@/input/modifierRoles";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";
import { ShapeAwayChip } from "./ShapeAwayChip";
import { GlyphText } from "./GlyphText";
import { useShapePointerOver } from "../tool/shapeToolMode";
import "./ShapeEditorSurface.css";
import {
    chipLayout,
    quarterTurn,
    sizeRun,
    type ChipLayout,
    type ChipNumber,
    type SizeRun,
} from "./chip";
import {
    usePlacedEditTarget,
    useToolEditTarget,
    type ShapeEditTarget,
} from "./editTargets";
import { parseDegrees, scrubDistance } from "./scrub";
import { ScrubNumber, type ScrubMove } from "./ScrubNumber";
import { SaveShapeButton } from "../library/SaveShapeButton";
import { LayoutMenu } from "./LayoutPicker";
import { ReshuffleButton } from "./ReshuffleButton";
import { EdgeToggle } from "./EdgeToggle";
import { ModeMenu } from "./ModeMenu";
import { OutlineGap } from "./OutlineGap";
import { PivotMenu } from "./PivotGrid";
import { CloseUpButton } from "./CloseUpButton";
import { ScaleButtons, scaledOnce, scaleOnce } from "./ScaleButtons";
import { distributionOf, edgeSplitOf, layoutOf } from "../distribute/modes";
import { outlineGapOf } from "../distribute/outlineGap";
import type { XY } from "../types";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import tolgee from "@/global/singletons/Tolgee";

/** How long the editor stays still after a press on it ends, so a second click lands */
const PRESS_HOLD_MS = 450;
/** A gentle spring that doesn't overshoot (#437) */
const EDITOR_SPRING = { tension: 210, friction: 26, clamp: true };
/** How long after an edit in the editor its change still counts as that edit (a placed shape saves first) */
const EDIT_WINDOW_MS = 1000;

/**
 * The floating editor (08-shape-system-ux.md, "The floating editor"), the main place for editing
 * a shape: a small bar under the open shape, or the selected placed one, with the numbers people
 * change most. It moves with the shape and flips above it when there's no room below. Before a
 * shape is drawn, a hint at the top of the field says how to draw one.
 *
 * It fades with the pointer away from both the shape, open or placed (#430), and itself, so what's
 * under it shows, and it is solid while the pointer is over either, with focus inside it or a
 * menu of its open (`ShapeEditorSurface.css`). Its numbers are the kind's primary parameters (#344, `chipLayout`), so it works for any kind.
 * One row, no ⋯ (#429; owner: keep it compact), for a box:
 * `− 6 × 2 + │ ↔ 2 ↕ 2 steps 🔗 │ ↻ 0° ⌖▾ ⇋ ⇵ ⤡ ⤢ Recalculate │ ⌇ ☆ │ Place`. Every number can be
 * typed or dragged, and follows the field: across is side to side however the box is turned. ↻
 * adds a quarter turn to the degrees beside it, and ⌖▾ opens the pivot grid (#435). After the
 * flips, Shrink and Expand scale the shape keeping its proportions (#489, `ScaleButtons`).
 * Recalculate works out who goes where again by least travel, which moving and turning keep until
 * it's pressed, and shows its word only when it would change something; Close up shows for a
 * placed shape with holes (#392). Pathways and ☆ Save, which leave the shape as it is, come last
 * before Place. Its controls show the app's tooltips (`RichTips`). Under the editor, a pill of
 * its own says how the shape is filled (#435): the mode menu (Grid, Outline, Spread, each with a
 * picture of this shape in it), then after a divider the box's layout menu in Grid, the leftover
 * menu in Outline, or Reshuffle in Spread. With it, the editor has everything the inspector had
 * for a shape. Place shows only for a new shape; a selected placed
 * shape saves each edit on release. While the open shape waits out of sight (#416) the editor
 * hides, and away from its moment a chip goes back to it.
 */
export function ShapeEditor({ stepPx }: { stepPx: number }) {
    const armed = useShapeToolStore((s) =>
        s.tool !== null && s.tool.params === null ? s.tool.kind : null,
    );
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const hidden = useShapeHidden();
    const tool = useToolEditTarget();
    const placed = usePlacedEditTarget();
    if (hidden) return <ShapeAwayChip />;
    if (armed)
        return (
            <div
                className="rounded-6 border-stroke bg-bg-1 bg-modal text-body text-text shadow-modal pointer-events-none absolute top-12 left-1/2 z-10 -translate-x-1/2 border px-12 py-6"
                data-testid="shape-tool-hint"
            >
                {tolgee.t(
                    "shapes.edit.drawHint",
                    "Drag on the field to draw a {shape} · Esc to cancel",
                    { shape: armed.shape.label.toLowerCase() },
                )}
            </div>
        );
    const target = toolOpen ? tool : placed;
    if (!target) return null;
    return (
        <RichTips>
            <ShapeEditorBar
                target={target}
                stepPx={stepPx}
                testId={toolOpen ? "shape-tool-readout" : "placed-box-readout"}
            />
        </RichTips>
    );
}

/** The env an editor change is worked out with, the roles held as on the field; none by default */
const envFor = (roles?: Roles): ToolEnv | null => {
    const field = currentShapeField();
    return field ? toolEnvFor(field, roles) : null;
};

function ShapeEditorBar({
    target: shape,
    stepPx,
    testId,
}: {
    target: ShapeEditTarget;
    stepPx: number;
    testId: string;
}) {
    const { kind, params, spots } = shape;
    // The editor fades with the pointer away from it and the shape (#426, #430)
    const overShape = useShapePointerOver();
    const place = usePlacement(kind, params, spots);
    // Every edit made here is noted, so the view follows it (#441)
    const { noteEdit } = place;
    const numberDrag = useRef<NumberDrag | null>(null);
    const target = useMemo(
        () => notedTarget(shape, noteEdit, numberDrag),
        [shape, noteEdit],
    );
    // The controls below are memoized, so a drag re-renders only what it changes (#455); they
    // act on the shape as it is now through this
    const live = useLiveTarget(target);

    // A run of − and + presses grows from where it began, so the shape doesn't creep (#387)
    const run = useRef<SizeRun | null>(null);
    const anchor = sizeRun(run.current, kind, params, spots);
    const env = envFor();
    const layout = env
        ? chipLayout(kind, params, spots, { ...env, stepPx, anchor })
        : { values: [], intervals: [], ratioLock: false };
    const chips = useRef({ layout, anchor });
    // What the − and + presses act on: what this render shows
    chips.current = { layout, anchor };
    const numbers = useMemo(() => numberActions(live, run, chips), [live]);
    const frame = kind.frameOf(params, spots);

    const flip = (axis: "across" | "deep") =>
        updateWith(live, (now, env) =>
            flipShape(kind, now, spots, axis, pivotOf(now), env),
        );
    // The keys act on this shape while its editor shows (#429): mounted after the app's own
    // handlers, the flips sit on top of the marchers' flips and go back when it closes. A held
    // key doesn't repeat them (review)
    useActionHandler("flipHorizontal", () => flip("across"), {
        ignoreRepeat: true,
    });
    useActionHandler("flipVertical", () => flip("deep"), {
        ignoreRepeat: true,
    });
    useActionHandler("shapeQuarterTurn", () => turnQuarter(live), {
        ignoreRepeat: true,
    });
    // Expand and Shrink keeping the proportions (#489), one step a press
    const canShrink =
        env !== null && scaledOnce(target, params, -1, env) !== null;
    const canExpand =
        env !== null && scaledOnce(target, params, 1, env) !== null;
    useActionHandler("shapeShrink", () => scaleOnce(live, -1, envFor), {
        enabled: canShrink,
    });
    useActionHandler("shapeExpand", () => scaleOnce(live, 1, envFor), {
        enabled: canExpand,
    });
    useActionHandler("shapeRecalculate", () => target.recalculate?.(), {
        enabled: target.recalculate !== null,
        ignoreRepeat: true,
    });
    // An outline evened out in its frame (owner on #459): none where it doesn't apply
    const evenState = evenStateOf(kind, params, spots);
    useActionHandler("shapeEvenOut", () => evenOut(live), {
        enabled: evenState === "uneven",
        ignoreRepeat: true,
    });

    const whatRow = useRef<HTMLSpanElement>(null);
    const doRow = useRef<HTMLSpanElement>(null);
    const twoRows = useTwoRows(whatRow, doRow, place.fieldWidth, place.held);

    return (
        <animated.div
            ref={place.ref}
            className="shape-editor-surface text-sub text-text pointer-events-none absolute z-10 flex flex-col items-center gap-4 whitespace-nowrap *:pointer-events-auto"
            style={place.style}
            data-over={overShape}
            {...place.hold}
            data-testid={testId}
            data-shape-editor
            data-placement={place.above ? "above" : "below"}
            data-held={place.held}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                className={clsx(
                    "rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal flex items-center border px-6 py-4",
                    twoRows ? "flex-col gap-4" : "gap-6",
                )}
                data-testid={`${testId}-bar`}
                data-rows={twoRows ? 2 : 1}
            >
                {/* What the shape is, and what's done to it: side by side, or one above the
                    other when the field is too narrow for one row */}
                <span
                    ref={whatRow}
                    className="flex shrink-0 items-center gap-6"
                    data-editor-row
                >
                    <span
                        className="flex items-center gap-2"
                        data-testid={`${testId}-text`}
                    >
                        {layout.values.map((x) => (
                            <NumberChip
                                key={x.param.key}
                                param={x.param}
                                display={x.display}
                                note={x.note}
                                canLess={x.less !== null}
                                canMore={x.more !== null}
                                glyph={false}
                                actions={numbers}
                            />
                        ))}
                        {target.empty > 0 && (
                            <span className="text-text/60">
                                ·{" "}
                                {tolgee.t(
                                    "shapes.edit.empty",
                                    "{count} empty",
                                    {
                                        count: target.empty,
                                    },
                                )}
                            </span>
                        )}
                    </span>
                    {layout.intervals.length > 0 && (
                        <>
                            <Divider />
                            <span className="flex items-center gap-2">
                                {layout.intervals.map((x) => (
                                    <NumberChip
                                        key={x.param.key}
                                        param={x.param}
                                        display={x.display}
                                        note={null}
                                        canLess={false}
                                        canMore={false}
                                        glyph
                                        derived={x.derived}
                                        actions={numbers}
                                    />
                                ))}
                                <span className="text-text/60">
                                    {tolgee.t("shapes.edit.steps", "steps")}
                                </span>
                                {layout.ratioLock && <RatioLockButton />}
                            </span>
                        </>
                    )}
                    {target.drawnOn && (
                        <span className="text-text/50">
                            {tolgee.t("shapes.edit.drawnOn", "from {page}", {
                                page: target.drawnOn,
                            })}
                        </span>
                    )}
                </span>
                {!twoRows && <Divider />}
                <span
                    ref={doRow}
                    className="flex shrink-0 items-center gap-6"
                    data-editor-row
                >
                    <TurnControls
                        live={live}
                        degrees={rotationDegrees(frame.rotation)}
                        rotation={frame.rotation}
                        pivot={pivotOf(params)}
                        canRecalculate={target.recalculate !== null}
                        empty={target.empty}
                        canCloseUp={target.closeUp !== undefined}
                        evenState={evenState}
                        canShrink={canShrink}
                        canExpand={canExpand}
                    />
                    {/* What doesn't change the shape itself, at the end (owner): its pathways
                        and saving it to the library */}
                    <Divider />
                    <EndControls
                        live={live}
                        stepPx={stepPx}
                        canPlace={target.place !== undefined}
                    />
                </span>
            </div>
            <FillPill
                live={live}
                kind={kind}
                shown={fillShown(kind, params, spots)}
                canPlace={target.place !== undefined}
                testId={testId}
            />
        </animated.div>
    );
}

/**
 * A stand-in for `target` that stays the same object and reads the latest target, so memoized
 * controls act on the shape as it is now, not as they last drew it (#455)
 */
function useLiveTarget(target: ShapeEditTarget): ShapeEditTarget {
    const latest = useRef(target);
    // Read in this same render by the controls that do redraw
    latest.current = target;
    return useMemo(
        () => ({
            get kind() {
                return latest.current.kind;
            },
            get params() {
                return latest.current.params;
            },
            get spots() {
                return latest.current.spots;
            },
            get empty() {
                return latest.current.empty;
            },
            get place() {
                return latest.current.place;
            },
            get drawnOn() {
                return latest.current.drawnOn;
            },
            get recalculate() {
                return latest.current.recalculate;
            },
            get closeUp() {
                return latest.current.closeUp;
            },
            begin: () => latest.current.begin(),
            preview: (params) => latest.current.preview(params),
            end: (keep) => latest.current.end(keep),
            apply: (params) => latest.current.apply(params),
            update: (change) => latest.current.update(change),
        }),
        [],
    );
}

/** Whether a shape can be evened out in its frame: not at all, already, or yes (#459) */
type EvenState = "none" | "even" | "uneven";

function evenStateOf(
    kind: ShapeEditTarget["kind"],
    params: unknown,
    spots: number,
): EvenState {
    const env = envFor();
    const evened = env && kind.closed?.evenOut?.(params, spots, env);
    if (evened === undefined || evened === null) return "none";
    return evened === params ? "even" : "uneven";
}

/** "Even out": the shape as even as its frame allows, as one undo step (owner on #459) */
const evenOut = (target: ShapeEditTarget) =>
    applyWith(target, (env) => {
        const evened = target.kind.closed?.evenOut?.(
            target.params,
            target.spots,
            env,
        );
        return evened ?? target.params;
    });

/** One change at once, worked out with no keys held */
const applyWith = (
    target: ShapeEditTarget,
    change: (env: ToolEnv) => unknown,
) => {
    const env = envFor();
    if (env) target.apply(change(env));
};

/** A change from the shape as it is now, so quick presses add up (`ShapeEditTarget.update`) */
const updateWith = (
    target: ShapeEditTarget,
    change: (params: unknown, env: ToolEnv) => unknown,
) => {
    const env = envFor();
    if (env) target.update((now) => change(now, env));
};

const turnQuarter = (target: ShapeEditTarget) =>
    updateWith(target, (now, env) =>
        quarterTurn(target.kind, now, target.spots, env),
    );

/**
 * A number's drag: the change from the shape at the press, previewed live. `base` holds the
 * shape at the press. A spacing's (`guides`) shows the field lines a corner or the center lands
 * on while it goes (#452).
 */
const scrubWith = (
    target: ShapeEditTarget,
    base: { current: unknown },
    change: (b: unknown, m: ScrubMove, env: ToolEnv) => unknown,
    guides = false,
) => ({
    onScrubStart: () => {
        base.current = target.params;
        target.begin();
        if (guides) setShapeScrubbing(true);
    },
    onScrub: (m: ScrubMove) => {
        const env = envFor(m.roles);
        if (env) target.preview(change(base.current, m, env));
    },
    onScrubEnd: (keep: boolean) => {
        setShapeScrubbing(false);
        target.end(keep);
    },
});

type Param = ChipNumber["param"];

/** What the editor's numbers do, the same functions for the editor's life */
function numberActions(
    target: ShapeEditTarget,
    run: { current: SizeRun | null },
    chips: { current: { layout: ChipLayout; anchor: XY } },
) {
    // The shape at the press of a number's drag
    const base = { current: target.params as unknown };
    /** − or +: what the chip last worked out for that press */
    const step = (param: Param, way: "less" | "more") => {
        const { layout, anchor } = chips.current;
        const x = layout.values.find((v) => v.param.key === param.key);
        const next = x?.[way];
        if (next == null) return;
        run.current = { params: next, anchor };
        target.apply(next);
    };
    return {
        less: (param: Param) => step(param, "less"),
        more: (param: Param) => step(param, "more"),
        scrub: (param: Param) =>
            scrubWith(
                target,
                base,
                (b, m, env) => param.scrub(b, target.spots, m, env),
                param.interval === true,
            ),
        /** A "≈" number pressed: onto the nearest half step, as an edit of it (#459) */
        snap: (param: Param) => {
            const env = envFor();
            if (env && param.snap)
                target.apply(param.snap(target.params, target.spots, env));
        },
        type: (param: Param, text: string) => {
            const env = envFor();
            const next =
                env && param.type(target.params, target.spots, text, env);
            if (next == null) return false;
            target.apply(next);
            return true;
        },
    };
}

/** A declared number, typed or dragged, with its − and + when it has them */
const NumberChip = memo(function NumberChip({
    param,
    display,
    note,
    canLess,
    canMore,
    glyph,
    derived = false,
    actions,
}: {
    param: Param;
    display: string;
    note: string | null;
    canLess: boolean;
    canMore: boolean;
    /** The spacings show their glyph */
    glyph: boolean;
    /** Shown as about so much: pressing it snaps it to a half step (owner on #459) */
    derived?: boolean;
    actions: ReturnType<typeof numberActions>;
}) {
    const scrub = useMemo(() => actions.scrub(param), [actions, param]);
    return (
        <span className="flex items-center gap-2">
            {glyph && param.glyph && (
                <span className="text-text/60" aria-hidden>
                    <GlyphText text={param.glyph} />
                </span>
            )}
            {param.stepper && (
                <IconButton
                    label={param.stepper.less}
                    disabled={!canLess}
                    onClick={() => actions.less(param)}
                >
                    <MinusIcon size={12} />
                </IconButton>
            )}
            <ScrubNumber
                display={display}
                axis={param.drag}
                label={param.label}
                testId={`shape-editor-${param.key}`}
                {...scrub}
                onType={(text) => actions.type(param, text)}
                onSnap={
                    derived && param.snap
                        ? () => actions.snap(param)
                        : undefined
                }
            />

            {param.stepper && (
                <IconButton
                    label={param.stepper.more}
                    disabled={!canMore}
                    onClick={() => actions.more(param)}
                >
                    <PlusIcon size={12} />
                </IconButton>
            )}
            {note && <span className="text-text/60">· {note}</span>}
        </span>
    );
});

/** Keeps the two spacings in proportion */
const RatioLockButton = memo(function RatioLockButton() {
    const ratioLocked = useShapeEditorStore((s) => s.ratioLocked);
    return (
        <IconButton
            label={
                ratioLocked
                    ? tolgee.t(
                          "shapes.edit.ratioLock.locked",
                          "Spacings locked together: click to unlock",
                      )
                    : tolgee.t(
                          "shapes.edit.ratioLock.unlocked",
                          "Lock the two spacings together",
                      )
            }
            pressed={ratioLocked}
            onClick={toggleRatioLock}
            testId="shape-editor-ratio-lock"
        >
            {/* One chain either way, lit in the accent when locked: a broken
                link didn't read as anything (owner) */}
            <LinkSimpleIcon size={14} />
        </IconButton>
    );
});

/** The turn, its pivot, the flips, Shrink and Expand, Recalculate and Close up */
const TurnControls = memo(function TurnControls({
    live: target,
    degrees,
    rotation,
    pivot,
    canRecalculate,
    empty,
    evenState,
    canShrink,
    canExpand,
}: {
    live: ShapeEditTarget;
    degrees: number;
    rotation: number;
    pivot: Pivot;
    canRecalculate: boolean;
    empty: number;
    /** Whether "Even out" applies, and whether there's anything to even (#459) */
    evenState: EvenState;
    /** Whether Shrink and Expand can take a step (#489) */
    canShrink: boolean;
    canExpand: boolean;
    /** Only redraws it */
    canCloseUp: boolean;
}) {
    const base = useRef<unknown>(null);
    const recalculateLook = useActionLook(canRecalculate);
    const evenLook = useActionLook(evenState === "uneven");
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const keyOf = (id: ActionId) => getActionShortcutLabel(id, { overrides });
    const flip = (axis: "across" | "deep") =>
        updateWith(target, (now, env) =>
            flipShape(target.kind, now, target.spots, axis, pivotOf(now), env),
        );
    return (
        <span className="flex items-center gap-2">
            {/* The turn: ↻ adds a quarter, and the degrees beside it can be typed or
                dragged (owner) */}
            <IconButton
                label={tolgee.t(
                    "shapes.edit.quarterTurn",
                    "Turn 90° clockwise",
                )}
                shortcut={keyOf("shapeQuarterTurn")}
                onClick={() => turnQuarter(target)}
                testId="shape-editor-quarter-turn"
            >
                <ArrowClockwiseIcon size={14} />
            </IconButton>
            <ScrubNumber
                display={`${degrees}°`}
                editText={String(degrees)}
                axis="x"
                label={tolgee.t(
                    "shapes.edit.turn",
                    "Turn, in degrees clockwise",
                )}
                testId="shape-editor-rotation"
                {...scrubWith(target, base, (b, m, env) =>
                    scrubTurn(
                        target.kind,
                        b,
                        target.spots,
                        scrubDistance("x", m.dx, m.dy),
                        pivotOf(b),
                        env,
                    ),
                )}
                onType={(text) => {
                    const typed = parseDegrees(text);
                    if (typed === null) return false;
                    applyWith(target, (env) =>
                        turnShape(
                            target.kind,
                            target.params,
                            target.spots,
                            typed * DEGREE,
                            pivotOf(target.params),
                            env,
                        ),
                    );
                    return true;
                }}
            />
            <PivotMenu
                pivot={pivot}
                rotation={rotation}
                onPick={(key) =>
                    updateWith(target, (now) => withPivot(now, key))
                }
                testId="shape-editor-pivot"
            />
            <IconButton
                label={tolgee.t("shapes.edit.flipAcross", "Flip side to side")}
                shortcut={keyOf("flipHorizontal")}
                onClick={() => flip("across")}
                testId="shape-editor-flip-across"
            >
                <FlipHorizontalIcon size={14} />
            </IconButton>
            <IconButton
                label={tolgee.t("shapes.edit.flipDeep", "Flip front to back")}
                shortcut={keyOf("flipVertical")}
                onClick={() => flip("deep")}
                testId="shape-editor-flip-deep"
            >
                <FlipVerticalIcon size={14} />
            </IconButton>
            <ScaleButtons
                live={target}
                envFor={envFor}
                canShrink={canShrink}
                canExpand={canExpand}
                shrinkKey={keyOf("shapeShrink")}
                expandKey={keyOf("shapeExpand")}
            />
            <IconButton
                label={
                    canRecalculate
                        ? tolgee.t(
                              "shapes.edit.recalculate.title",
                              "Recalculate who goes where, by least travel",
                          )
                        : empty > 0
                          ? tolgee.t(
                                "shapes.edit.recalculate.closeUpFirst",
                                "Recalculate who goes where: close up the empty spots first",
                            )
                          : tolgee.t(
                                "shapes.edit.recalculate.already",
                                "Who goes where is already least travel",
                            )
                }
                disabled={!canRecalculate}
                shortcut={keyOf("shapeRecalculate")}
                className="relative"
                onClick={() => target.recalculate?.()}
                testId="shape-editor-recalculate"
            >
                {/* The word only when it can do something: greyed out, it's the widest
                    thing on the bar for nothing (owner, review round r429) */}
                <RecalculateFace look={recalculateLook} />
            </IconButton>
            {evenState !== "none" && (
                <IconButton
                    label={
                        evenState === "uneven"
                            ? tolgee.t(
                                  "shapes.edit.evenOut.tip",
                                  "Spread the marchers as evenly as the box allows",
                              )
                            : tolgee.t(
                                  "shapes.edit.evenOut.already",
                                  "The marchers are as even as the box allows",
                              )
                    }
                    shortcut={keyOf("shapeEvenOut")}
                    disabled={evenState !== "uneven"}
                    className="relative"
                    onClick={() => evenOut(target)}
                    testId="shape-editor-even-out"
                >
                    {/* As Recalculate: the word only when it can act (owner on #459) */}
                    <ActionFace
                        look={evenLook}
                        icon={<EqualsIcon size={14} />}
                        label={tolgee.t(
                            "shapes.edit.evenOut.label",
                            "Even out",
                        )}
                    />
                </IconButton>
            )}
            <CloseUpButton
                target={target}
                compact
                className="rounded-4 hover:text-accent flex min-h-24 min-w-24 items-center justify-center p-4"
                testId="shape-editor-close-up"
            />
        </span>
    );
});

/** Snap, Pathways and ☆ Save, then Place for a new shape */
const EndControls = memo(function EndControls({
    live: target,
    stepPx,
    canPlace,
}: {
    live: ShapeEditTarget;
    stepPx: number;
    canPlace: boolean;
}) {
    return (
        <>
            <span className="flex items-center gap-2">
                <SnapButton />
                {canPlace && <PathwaysButton />}
                <SaveShapeButton
                    shape={target}
                    stepPx={stepPx}
                    compact
                    className="rounded-4 hover:text-accent flex min-h-24 min-w-24 items-center justify-center p-4"
                    testId="shape-editor-save"
                />
            </span>
            {canPlace && (
                <>
                    <Divider />
                    <button
                        type="button"
                        className="bg-accent text-text-invert rounded-4 px-8 py-2 font-medium hover:opacity-90"
                        onPointerDown={keepFocus}
                        onClick={() => target.place?.()}
                        data-testid="shape-editor-place"
                    >
                        {tolgee.t("shapes.edit.place", "Place")}
                    </button>
                </>
            )}
        </>
    );
});

/**
 * What the fill pill shows, as one string: it redraws only when this changes (#455). The mode
 * menu shows the mode, the layout menu the layout and the count's catalogue, the leftover menu
 * the gap as seen through the flips, and Reshuffle the spread. A new control in the pill adds
 * what it shows here.
 */
const fillShown = (kind: AnyToolKind, params: unknown, spots: number) => {
    const { flipX, flipY } = kind.frameOf(params, spots);
    return JSON.stringify([
        spots,
        distributionOf(kind, params, spots),
        layoutOf(kind, params, spots),
        outlineGapOf(kind, params, spots),
        // Edge's tip says how many stand on the edge, which the proportions change (#450)
        edgeSplitOf(kind, params, spots),
        flipX,
        flipY,
    ]);
};

/**
 * How it's filled: a pill of its own under the editor (owner, #435), the mode switch first, then
 * what that mode has (a box's layout in Grid, the gap in Outline, Reshuffle and Edge in Spread). Hidden
 * when the kind has none of them. Only the bar and the pill take the pointer, not the empty
 * space beside the pill
 */
const FillPill = memo(function FillPill({
    live: target,
    canPlace,
    testId,
}: {
    live: ShapeEditTarget;
    /** Only redraw it */
    kind: AnyToolKind;
    shown: string;
    canPlace: boolean;
    testId: string;
}) {
    const env = () => envFor();
    return (
        <div
            className="rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal flex items-center gap-6 border px-6 py-2 empty:hidden"
            data-testid={`${testId}-fill`}
        >
            <ModeMenu target={target} envFor={env} />
            {/* What the mode has, after a divider (owner); nothing, and no divider, when it
                has none */}
            <span
                className="border-stroke flex items-center gap-6 border-l pl-6 empty:hidden"
                data-testid={`${testId}-mode-extras`}
            >
                <LayoutMenu target={target} envFor={env} />
                <OutlineGap
                    target={target}
                    envFor={env}
                    clickToMove={canPlace}
                />
                <ReshuffleButton
                    target={target}
                    envFor={env}
                    className="rounded-4 hover:text-accent hover:bg-fg-2 min-h-24 px-4 py-2"
                    testId="shape-editor-reshuffle"
                />
                <EdgeToggle
                    target={target}
                    envFor={env}
                    className="rounded-4 hover:text-accent hover:bg-fg-2 min-h-24 px-4 py-2"
                    testId="shape-editor-edge"
                />
            </span>
        </div>
    );
});

/**
 * Where the editor sits (`editorPlacement`), sprung there whenever the shape or the editor's own
 * size moves it, gently and without overshoot (#437, owner: predictable motion, no jump when the
 * pointer leaves). A pan or zoom moves it at once, as only the shape's changes animate, and so
 * does reduced motion. It holds still while a press on it is under way and a moment after, so
 * quick clicks on − or + land on the same button (owner), but never just because it's hovered.
 */
function usePlacement(kind: AnyToolKind, params: unknown, spots: number) {
    // A drag on the field: the open shape's gesture or a placed shape's
    const toolGesture = useShapeToolStore((s) => !!s.tool?.gesture);
    const placedDrag = useShapePointerStore((s) => s.dragging);
    const fieldDrag = toolGesture || placedDrag;
    const ref = useRef<HTMLDivElement>(null);
    const [room, setRoom] = useState({
        width: 0,
        height: 0,
        fieldWidth: Infinity,
        fieldHeight: Infinity,
    });
    // Its own size (the Save form opens) and the field's, as they change
    useLayoutEffect(() => {
        const el = ref.current;
        const field = el?.offsetParent;
        if (!el || !field) return;
        const measure = () =>
            setRoom({
                width: el.offsetWidth,
                height: el.offsetHeight,
                fieldWidth: field.clientWidth,
                fieldHeight: field.clientHeight,
            });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        observer.observe(field);
        return () => observer.disconnect();
    }, []);
    const outline = useMemo(
        () => shapeOutline(kind, params, spots),
        [kind, params, spots],
    );
    /** Where it goes in `view`. The view isn't subscribed to: a pan or zoom moves the editor
     * without re-rendering it (#455) */
    const targetIn = (view: FieldView) => {
        // The knob stands a fixed distance off the shape on screen, so it's found at this zoom
        const { knob } = frameControls(kind, params, spots, {
            hitRadius: HANDLE_REACH_PX / (view.zoom || 1),
        });
        return editorPlacement({
            outline: outline.map((p) => fieldToElement(view, p.x, p.y)),
            knob: fieldToElement(view, knob.x, knob.y),
            width: room.width,
            height: room.height,
            fieldWidth: room.fieldWidth,
            fieldHeight: room.fieldHeight,
        });
    };
    const [above, setAbove] = useState(
        () => targetIn(useFieldViewStore.getState()).above,
    );

    // Still while a press on the editor is under way, and a moment after it
    const [pressing, setPressing] = useState(false);
    const release = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!pressing) return;
        const up = () => {
            if (release.current) clearTimeout(release.current);
            release.current = setTimeout(
                () => setPressing(false),
                PRESS_HOLD_MS,
            );
        };
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
        };
    }, [pressing]);
    useEffect(
        () => () => {
            if (release.current) clearTimeout(release.current);
        },
        [],
    );
    const held = pressing;

    const [spring, api] = useSpring(() => {
        const { left, top } = targetIn(useFieldViewStore.getState());
        return { left, top };
    });

    // The control a press landed on, and where it was on screen. While held, an edit that widens
    // or narrows the editor (a number gets longer, "≈" shows) moves the editor so that control
    // stays under the pointer, and quick clicks keep landing on it (owner on #490: Expand)
    const pressed = useRef<{ el: Element; left: number } | null>(null);
    const heldNow = useRef(held);
    heldNow.current = held;
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const keepStill = () => {
            const p = pressed.current;
            if (!heldNow.current || !p || !p.el.isConnected) return;
            const dx = Math.round(p.el.getBoundingClientRect().left - p.left);
            if (dx === 0) return;
            const left = Math.round(spring.left.get()) - dx;
            const top = Math.round(spring.top.get());
            api.set({ left, top });
            // Now, not on the spring's next frame, so a second change before it isn't added twice
            el.style.transform = `translate(${left}px, ${top}px)`;
        };
        // Its numbers redraw on their own, so it's their size changing that's watched
        const observer = new ResizeObserver(keepStill);
        for (const child of el.children) observer.observe(child);
        // On two rows, each row is centered: one can change width while the bar doesn't
        for (const row of el.querySelectorAll("[data-editor-row]"))
            observer.observe(row);
        return () => observer.disconnect();
    }, [api, spring]);

    // After an edit made in the editor, and after a drag on the field ends, the view glides to keep
    // the shape and the editor in view, zooming out if they no longer fit (#441). Never during a
    // drag. Runs before the spring below, so the editor springs along from the first frame.
    const edited = useRef(0);
    const noteEdit = useCallback(() => {
        edited.current = performance.now();
    }, []);
    const glide = useRef<number | null>(null);
    // What a view change does, kept current before the glide below can change the view at once
    // (`follow`, further down)
    const latestFollow = useRef<(view: FieldView) => void>(() => {});
    useLayoutEffect(() => {
        latestFollow.current = follow;
    });
    const wasDragging = useRef(fieldDrag);
    useLayoutEffect(() => {
        const dragEnded = wasDragging.current && !fieldDrag;
        wasDragging.current = fieldDrag;
        if (fieldDrag || room.width === 0) return;
        const edit = performance.now() - edited.current < EDIT_WINDOW_MS;
        if (!edit && !dragEnded) return;
        edited.current = 0;
        const now = useFieldViewStore.getState();
        const from = {
            width: now.width,
            height: now.height,
            zoom: now.zoom,
            panX: now.panX,
            panY: now.panY,
        };
        const to = keepInView({
            view: from,
            outline: shapeOutline(kind, params, spots),
            width: room.width,
            height: room.height,
        });
        if (
            to.zoom === from.zoom &&
            Math.abs(to.panX - from.panX) < 1 &&
            Math.abs(to.panY - from.panY) < 1
        )
            return;
        glide.current = glideTo(to);
        // Only the shape's change and the drag's end start it
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params, fieldDrag]);

    const shown = useRef({
        view: null as unknown,
        placed: false,
        gliding: false,
        held: false,
    });
    /** Springs, or jumps, the editor to where it goes in `view` */
    const follow = (view: FieldView) => {
        const gliding = isGliding(glide.current);
        if (held || room.width === 0) {
            shown.current.held = held;
            return;
        }
        const target = targetIn(view);
        // A pan or zoom, the first placing and reduced motion jump; the shape's changes spring,
        // and so do the editor's own glide, to its end, and the end of a hold, which a view glide
        // after a click on the editor outlasts (review)
        const jump =
            !shown.current.placed ||
            (shown.current.view !== view &&
                !gliding &&
                !shown.current.gliding &&
                !shown.current.held) ||
            prefersReducedMotion();
        shown.current = { view, placed: true, gliding, held: false };
        setAbove(target.above);
        void api.start({
            left: target.left,
            top: target.top,
            immediate: jump,
            config: EDITOR_SPRING,
        });
    };
    useLayoutEffect(() => {
        follow(useFieldViewStore.getState());
        // `follow` reads only these
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, held, room, outline]);
    useLayoutEffect(
        () => useFieldViewStore.subscribe((view) => latestFollow.current(view)),
        [],
    );
    return {
        ref,
        above,
        held,
        fieldWidth: room.fieldWidth,
        noteEdit,
        // Moved by a transform, not left and top: a pan then only moves its layer, nothing is laid
        // out or painted again (#455)
        style: {
            left: 0,
            top: 0,
            willChange: "transform",
            transform: to(
                [spring.left, spring.top],
                // Whole pixels, as left and top were laid out, so its text stays sharp
                (x, y) => `translate(${Math.round(x)}px, ${Math.round(y)}px)`,
            ),
        },
        hold: {
            onPointerDownCapture: (e: ReactPointerEvent) => {
                // A right-button press opens a menu, which can take its release, and the editor
                // would stay held (#437)
                if (e.button !== 0) return;
                if (release.current) clearTimeout(release.current);
                // Stopped where it is, a glide under way included, so the press lands
                api.stop();
                const control =
                    e.target instanceof Element
                        ? (e.target.closest("button, input") ?? e.target)
                        : null;
                pressed.current = control && {
                    el: control,
                    left: control.getBoundingClientRect().left,
                };
                setPressing(true);
            },
        },
    };
}

/** A number's drag in the editor: the shape at its start and as last previewed */
interface NumberDrag {
    readonly from: unknown;
    to: unknown;
}

/** Whether two of a kind's params are the same: they're plain data */
const sameParams = (a: unknown, b: unknown) =>
    a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * `target` with each of its edits that changes the shape noted first (`usePlacement`'s
 * `noteEdit`). One that changes nothing isn't, so a following undo or selection doesn't move the
 * view (review). Recalculate and Close up are only there when they change something.
 */
function notedTarget(
    target: ShapeEditTarget,
    note: () => void,
    drag: { current: NumberDrag | null },
): ShapeEditTarget {
    const { recalculate, closeUp } = target;
    return {
        ...target,
        begin: () => {
            drag.current = { from: target.params, to: target.params };
            target.begin();
        },
        preview: (params) => {
            if (drag.current) drag.current.to = params;
            target.preview(params);
        },
        end: (keep) => {
            const moved =
                drag.current && !sameParams(drag.current.from, drag.current.to);
            drag.current = null;
            if (keep && moved) note();
            target.end(keep);
        },
        apply: (params) => {
            if (!sameParams(params, target.params)) note();
            target.apply(params);
        },
        update: (change) =>
            target.update((now) => {
                const next = change(now);
                if (!sameParams(next, now)) note();
                return next;
            }),
        recalculate: recalculate
            ? () => {
                  note();
                  recalculate();
              }
            : null,
        closeUp: closeUp
            ? () => {
                  note();
                  closeUp();
              }
            : undefined,
    };
}

/**
 * The bar's padding, border and the divider with its gaps between the rows laid side by side, in
 * px: the bar's `px-6`, `border` and `gap-6`, and `Divider`'s `w-px`. Change them together.
 */
const ONE_ROW_EXTRA_PX = 2 * 6 + 2 + 2 * 6 + 1;
/** The editor stays this far inside the field side to side (`editorPlacement`) */
const FIELD_MARGIN_PX = 4;

/**
 * Whether the editor's two rows, what the shape is and what's done to it, go one above the other:
 * only when side by side they'd be wider than the field (owner: one row whenever it fits, and
 * every control visible in a narrow window). Measured from the rows themselves, which keep their
 * width either way, so it doesn't flip back and forth.
 */
function useTwoRows(
    what: RefObject<HTMLElement | null>,
    act: RefObject<HTMLElement | null>,
    fieldWidth: number,
    held: boolean,
) {
    const [wanted, setWanted] = useState(false);
    useLayoutEffect(() => {
        const a = what.current;
        const b = act.current;
        if (!a || !b) return;
        const measure = () =>
            setWanted(
                a.offsetWidth + b.offsetWidth + ONE_ROW_EXTRA_PX >
                    fieldWidth - 2 * FIELD_MARGIN_PX,
            );
        measure();
        // Its numbers redraw on their own, so it's the rows' size that's watched
        const observer = new ResizeObserver(measure);
        observer.observe(a);
        observer.observe(b);
        return () => observer.disconnect();
    }, [what, act, fieldWidth]);
    // Held after a press, it keeps its rows: a − or + that crosses the line would otherwise
    // rearrange it under the pointer and send it a long way once let go (review of #493)
    const [twoRows, setTwoRows] = useState(wanted);
    useLayoutEffect(() => {
        if (!held) setTwoRows(wanted);
    }, [held, wanted]);
    return twoRows;
}

function Divider() {
    return <span className="bg-stroke h-16 w-px" aria-hidden />;
}

/**
 * Pathways (#403): shows or hides the open shape's walks; its start rings always show (#417).
 * Off until asked for, so the shape reads clearly while it's drawn; the choice is remembered.
 */
function PathwaysButton() {
    const shown = useUiSettingsStore((s) => s.uiSettings.shapeWalks ?? false);
    return (
        <IconButton
            label={
                shown
                    ? tolgee.t(
                          "shapes.edit.pathways.hide",
                          "Hide the pathways from the start flag",
                      )
                    : tolgee.t(
                          "shapes.edit.pathways.show",
                          "Show the pathways from the start flag",
                      )
            }
            pressed={shown}
            onClick={() => {
                const { uiSettings, setUiSettings } =
                    useUiSettingsStore.getState();
                setUiSettings({
                    ...uiSettings,
                    shapeWalks: !(uiSettings.shapeWalks ?? false),
                });
            }}
            testId="shape-editor-pathways"
        >
            <PathIcon size={14} />
        </IconButton>
    );
}

/**
 * The Snap toggle (modifier roles, version A), as in the toolbar's alignment tab: pressed while
 * snapping is off, so a forgotten off state shows on the editor of every shape. Off, the shape's
 * drags land on no half steps, are pulled onto nothing and turn freely.
 */
export function SnapButton() {
    const on = useUiSettingsStore((s) => s.uiSettings.snap);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    return (
        <IconButton
            label={
                on
                    ? tolgee.t("shapes.edit.snap.on", "Turn Snap off")
                    : tolgee.t(
                          "shapes.edit.snap.off",
                          "Snap off: turn it back on",
                      )
            }
            shortcut={getActionShortcutLabel("toggleSnap", { overrides })}
            pressed={!on}
            onClick={() => useUiSettingsStore.getState().setSnap()}
            testId="shape-editor-snap"
        >
            <MagnetIcon size={14} />
        </IconButton>
    );
}

function IconButton({
    label,
    shortcut,
    className,
    onClick,
    disabled,
    pressed,
    testId,
    children,
}: {
    label: string;
    /** Its keys, shown in the tooltip as keycaps */
    shortcut?: string;
    className?: string;
    onClick: () => void;
    disabled?: boolean;
    pressed?: boolean;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <Tip label={label} shortcut={shortcut}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                // aria-disabled, not disabled: a disabled button gets no pointer, so its tooltip
                // (which says why, as Recalculate's does) wouldn't show
                aria-disabled={disabled || undefined}
                onPointerDown={keepFocus}
                onClick={() => {
                    if (!disabled) onClick();
                }}
                data-testid={testId}
                className={clsx(
                    // At least 24 px to hit (WCAG 2.2 target size; review round r429)
                    "rounded-4 flex min-h-24 min-w-24 items-center justify-center gap-4 p-4",
                    // On: the icon in the accent on a light accent tint, so the state is plain at a
                    // glance without reading as a solid button (owner)
                    pressed ? "bg-accent/15 text-accent" : "hover:text-accent",
                    disabled && "cursor-default opacity-40 hover:text-inherit",
                    className,
                )}
            >
                {children}
            </button>
        </Tip>
    );
}

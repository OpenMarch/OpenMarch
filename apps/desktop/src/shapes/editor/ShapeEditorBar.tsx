import { T } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import { create } from "zustand";
import clsx from "clsx";
import { getButtonClassName } from "@openmarch/ui";
import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from "react";
import { animated, to, useSpring } from "@react-spring/web";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import { setShapeEditorRect } from "./shapeEditorRect";
import { MirrorControls } from "./MirrorControls";
import { clearPlacement, oneRowRoom } from "./editorPlacement";
import {
    coverInset,
    fieldLayersIn,
    MOVER_AVOIDS,
    type FieldLayerKind,
    noteFieldLayersChanged,
    subscribeFieldLayers,
    useFieldLayerRef,
    type Rect,
} from "@/components/canvas/fieldLayers";
import { usePlacedBoxPreviewStore } from "../placed/boxSelectionStore";
import { keepInView } from "./keepInView";
import { glideTo, isGliding } from "@/field/three/fieldNavigation";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import {
    engageRowsGap,
    engageStep,
    setShapeScrubbing,
    useShapePointerStore,
} from "../field/shapePointer";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { runAction } from "@/shortcuts/registry";
import type { OrderChoice } from "../assign";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { keepFocus } from "./keepFocus";
import { RichTips } from "@/components/ui/Tip";
import ActionButton from "@/shortcuts/ActionButton";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    ActionFace,
    RecalculateFace,
    useActionLook,
} from "./RecalculateButton";
import {
    FlipHorizontalIcon,
    FlipVerticalIcon,
    LinkSimpleIcon,
    LockSimpleIcon,
    LockSimpleOpenIcon,
    MinusIcon,
    PlusIcon,
    ArrowClockwiseIcon,
    EqualsIcon,
    MagnetIcon,
    PathIcon,
    EyeIcon,
    EyeSlashIcon,
    SelectionSlashIcon,
    RowsIcon,
    CaretDownIcon,
    CaretLeftIcon,
    CaretRightIcon,
    XIcon,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Tip } from "@/components/ui/Tip";
import { useEditorMenu, useMenuFocus } from "./menuFocus";
import {
    fieldToElement,
    useFieldViewStore,
    type FieldView,
} from "@/field/three/fieldView";
import {
    DEFAULT_PIVOT,
    DEGREE,
    rotationDegrees,
    type Pivot,
} from "../frame/frame";
import { pivotOf, withPivot } from "../frame/pivot";
import {
    flipShape,
    frameControls,
    scrubTurn,
    shapeOutline,
    shapeTurn,
    turnShape,
} from "../frame/gestures";
import { currentShapeField } from "../field/shapeFieldContext";
import {
    toggleRatioLock,
    toggleSizesLock,
    useShapeEditorStore,
} from "../frame/shapeEditorStore";
import { HANDLE_REACH_PX, toolEnvFor } from "../tool/toolEnv";
import type { Roles } from "@/input/modifierRoles";
import {
    paramGlyph,
    toolId,
    type AnyToolKind,
    type RowView,
    type ParamGlyph,
    type ToolEnv,
} from "../tool/toolKind";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";
import { ShapeAwayChip } from "./ShapeAwayChip";
import { PasteFitNotice } from "../clipboard/PasteFitNotice";
import { GlyphText } from "./GlyphText";
import { useShapePointerOver } from "../tool/shapeToolMode";
import "./ShapeEditorSurface.css";
import {
    Divider,
    EDITOR_BAR,
    EditorButton,
    IconButton,
} from "./EditorBarParts";
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
import { LayoutMenu } from "./LayoutPicker";
import { ReshuffleButton } from "./ReshuffleButton";
import { EdgeToggle } from "./EdgeToggle";
import { ModeMenu } from "./ModeMenu";
import { ChoiceMenus, GuidesMenu } from "./ChoiceMenu";
import { GroupChips } from "./GroupChips";
import { GROUP_MENU_ATTRIBUTE, GroupMenu } from "./GroupMenu";
import { useFocusCarry } from "./focusCarry";
import { OrderMenu } from "./OrderMenu";
import { OutlineGap } from "./OutlineGap";
import { PivotMenu } from "./PivotGrid";
import { CloseUpButton } from "./CloseUpButton";
import { ScaleButtons, scaledOnce, scaleOnce } from "./ScaleButtons";
import {
    closedOf,
    distributionOf,
    edgeSplitOf,
    layoutOf,
} from "../distribute/modes";
import { outlineGapOf } from "../distribute/outlineGap";
import type { XY } from "../types";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import tolgee from "@/global/singletons/Tolgee";
import { getActionShortcutKeys } from "@/shortcuts/labels";
import {
    isHiding,
    pressHideMarchers,
    releaseHideMarchers,
    toggleHideMarchers,
    useMarchersHiddenStore,
} from "../field/marchersHidden";

/** How long the editor stays still after a press on it ends, so a second click lands */
const PRESS_HOLD_MS = 450;
/** A gentle spring that doesn't overshoot (#437) */
const EDITOR_SPRING = { tension: 210, friction: 26, clamp: true };
/** How long after an edit in the editor its change still counts as that edit (a placed shape saves first) */
const EDIT_WINDOW_MS = 1000;
/** How long the editor stays put before the other layers hear where it settled (#927) */
const NOTE_SETTLED_MS = 150;

/** Room the floating editor leaves around a mirrored paste's pink point, in CSS px */
const MIRROR_POINT_CLEAR_PX = 18;

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
 * `− 6 × 2 + │ ↔ 2 ↕ 2 steps 🔗 │ ↻ 0° ⌖▾ ⇋ ⇵ ⤡ ⤢ Recalculate │ ⌇ ☆ │ Place` (Ungroup for a
 * placed shape). Every number can be
 * typed or dragged, and follows the field: across is side to side however the box is turned. ↻
 * adds a quarter turn to the degrees beside it, and ⌖▾ opens the pivot grid (#435). After the
 * flips, Shrink and Expand scale the shape keeping its proportions (#489, `ScaleButtons`).
 * Recalculate works out who goes where again by least travel (a Line in Keep order or Reverse: in
 * that order), which moving and turning keep until it's pressed, and shows its word only when it
 * would change something; Close up shows for a placed shape with holes (#392). Pathways, which leave the shape as it is, come last
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
    // Clicking a line's points (#524): how to go on, even once two make a line
    const clicking = useShapeToolStore(
        (s) => s.tool?.gesture?.type === "points",
    );
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const hidden = useShapeHidden();
    const tool = useToolEditTarget();
    const placed = usePlacedEditTarget();
    const touch = useIsTouchMode();
    const hintLayerRef = useFieldLayerRef<HTMLDivElement>();
    if (hidden) return <ShapeAwayChip />;
    if (armed || clicking)
        return (
            <div
                ref={hintLayerRef}
                // #927: Finish, Undo point and Discard stay reachable: the pill keeps off the
                // card, and it sits below the touch toolbar's panel when that's open
                data-field-layer="task"
                className={clsx(
                    "rounded-6 border-stroke bg-bg-1 bg-modal text-body text-text shadow-modal touch:z-30 pointer-events-none absolute top-[calc(var(--field-top-inset,0px)+12px)] left-1/2 z-10 -translate-x-1/2 border px-12 py-6",
                    // The touch layout's buttons for what Enter, Backspace and Escape do
                    touch && "flex items-center gap-12 py-4 pr-4",
                )}
                data-testid="shape-tool-hint"
            >
                {touch ? (
                    <TouchDrawHint armed={armed} clicking={clicking} />
                ) : clicking ? (
                    <RemovePointHint />
                ) : armed!.clickPoints ? (
                    <T
                        keyName="shapes.edit.drawPointsHintFor"
                        params={{
                            shape: toolId(armed!),
                            keys: () => <Shortcut binding="Escape" />,
                        }}
                    />
                ) : (
                    <T
                        keyName="shapes.edit.drawHintFor"
                        params={{
                            shape: toolId(armed!),
                            keys: () => <Shortcut binding="Escape" />,
                        }}
                    />
                )}
                {touch && <DrawButtons clicking={clicking} />}
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

/**
 * While clicking a line's points (owner, option A on #522): how to take the last one back and
 * finish, the key as keycaps
 */
function RemovePointHint() {
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const keys = getActionShortcutKeys("shapeRemoveLastPoint", { overrides });
    const esc = () => <Shortcut binding="Escape" />;
    // With the key unbound, only the right-click is said
    if (!keys)
        return (
            <T
                keyName="shapes.edit.removePointHintClick"
                defaultValue="Right-click removes the last point · Double-click to finish · <esc></esc> to cancel"
                params={{ esc }}
            />
        );
    return (
        <T
            keyName="shapes.edit.removePointHint"
            defaultValue="Right-click or <keys></keys> removes the last point · Double-click to finish · <esc></esc> to cancel"
            params={{
                keys: () => <Shortcut action="shapeRemoveLastPoint" />,
                esc,
            }}
        />
    );
}

/**
 * The touch layout's hint while a shape tool is armed or a line's points are tapped: what a
 * finger does, without the keys and right-click the desktop hint names
 */
function TouchDrawHint({
    armed,
    clicking,
}: {
    armed: AnyToolKind | null;
    clicking: boolean;
}) {
    if (clicking)
        return (
            <span>
                {tolgee.t(
                    "shapes.edit.pointsHintTouch",
                    "Tap to add points · Double-tap or Finish to end",
                )}
            </span>
        );
    return armed?.clickPoints ? (
        <T
            keyName="shapes.edit.drawPointsHintTouchFor"
            params={{ shape: toolId(armed) }}
        />
    ) : (
        <T
            keyName="shapes.edit.drawHintTouchFor"
            params={{ shape: armed ? toolId(armed) : "other" }}
        />
    );
}

/**
 * Finish, Undo point and Discard in the touch layout (tablet 1.4), where there's no Enter,
 * Backspace or Escape: the same actions the keys run. Finish and Undo point only while a line's
 * points are tapped.
 */
function DrawButtons({ clicking }: { clicking: boolean }) {
    const button = (variant: "primary" | "secondary") =>
        // text-body after twMerge, which drops it (docs/conventions/ui-styling.md)
        `${getButtonClassName({ variant, size: "compact" })} text-body`;
    return (
        <span className="pointer-events-auto flex items-center gap-6">
            {clicking && (
                <ActionButton
                    action="shapeRemoveLastPoint"
                    className={button("secondary")}
                    onPointerDown={keepFocus}
                    data-testid="shape-tool-undo-point"
                >
                    {tolgee.t("shapes.edit.undoPoint", "Undo point")}
                </ActionButton>
            )}
            <ActionButton
                action="shapeDiscard"
                className={button("secondary")}
                onPointerDown={keepFocus}
                data-testid="shape-tool-discard"
            >
                {tolgee.t("shapes.edit.discard", "Discard")}
            </ActionButton>
            {clicking && (
                <ActionButton
                    action="applyShape"
                    className={button("primary")}
                    onPointerDown={keepFocus}
                    data-testid="shape-tool-finish"
                >
                    {tolgee.t("shapes.edit.finish", "Finish")}
                </ActionButton>
            )}
        </span>
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
    // A placed shape's number drag is previewed on the field until it's saved on release: its
    // numbers show the preview meanwhile, so the dragged number moves with it
    const previewed = usePlacedBoxPreviewStore((s) =>
        s.held ? s.params : null,
    );
    const shown = !shape.place && previewed !== null ? previewed : params;
    const dragged = useDraggedNumberStore((s) => s.key);
    // An editor closed mid-drag never sees its drag end: let go of its number so later editors
    // don't keep showing it
    useEffect(() => () => useDraggedNumberStore.setState({ key: null }), []);
    const layout = env
        ? chipLayout(kind, shown, spots, { ...env, stepPx, anchor }, dragged)
        : {
              values: [],
              intervals: [],
              groups: null,
              ratioLock: false,
              lock: null,
          };
    const chips = useRef({ layout, anchor });
    // What the − and + presses act on: what this render shows
    chips.current = { layout, anchor };
    const numbers = useMemo(() => numberActions(live, run, chips), [live]);
    const frame = kind.frameOf(params, spots);

    // A mirrored paste's flip keys switch which ways it mirrors through its point (Paste mirrored)
    const flip = (axis: "across" | "deep") =>
        live.mirror
            ? live.mirror.toggle(axis)
            : updateWith(live, (now, env) =>
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
    // A mirrored paste only mirrors (owner on Paste mirrored): its keys and palette entries for
    // turning and resizing are off, saying why, and its Mirror choice is on
    const mirrored = target.mirror !== undefined;
    const mirrorOnly = () =>
        mirrored
            ? tolgee.t(
                  "actions.shape.mirrorOnlyReason",
                  "A mirrored paste only mirrors. Place it, then turn or resize it",
              )
            : undefined;
    useActionHandler("shapeQuarterTurn", () => turnQuarter(live), {
        enabled: !mirrored,
        disabledReason: mirrorOnly,
        ignoreRepeat: true,
    });
    const mirrorWay = (axes: { across: boolean; deep: boolean }) => () =>
        live.mirror?.set(axes);
    const mirrorOpen = {
        enabled: mirrored,
        disabledReason: () =>
            mirrored
                ? undefined
                : tolgee.t(
                      "actions.shape.mirrorNotOpen",
                      "Paste mirrored first",
                  ),
        ignoreRepeat: true,
    };
    useActionHandler(
        "mirrorSideToSide",
        mirrorWay({ across: true, deep: false }),
        mirrorOpen,
    );
    useActionHandler(
        "mirrorFrontToBack",
        mirrorWay({ across: false, deep: true }),
        mirrorOpen,
    );
    useActionHandler(
        "mirrorBoth",
        mirrorWay({ across: true, deep: true }),
        mirrorOpen,
    );
    // A double-click on the pivot, as the pivot menu's entry (tablet 1.5): back to the center
    useActionHandler(
        "shapeCenterPivot",
        () => pickPivotOf(live, DEFAULT_PIVOT),
        {
            enabled: !mirrored && pivotOf(params) !== DEFAULT_PIVOT,
            disabledReason: mirrorOnly,
            ignoreRepeat: true,
        },
    );
    // Expand and Shrink keeping the proportions (#489), one step a press
    const canShrink =
        env !== null && scaledOnce(target, params, -1, env) !== null;
    const canExpand =
        env !== null && scaledOnce(target, params, 1, env) !== null;
    useActionHandler("shapeShrink", () => scaleOnce(live, -1, envFor), {
        enabled: !mirrored && canShrink,
        disabledReason: mirrorOnly,
    });
    useActionHandler("shapeExpand", () => scaleOnce(live, 1, envFor), {
        enabled: !mirrored && canExpand,
        disabledReason: mirrorOnly,
    });
    useActionHandler("shapeRecalculate", () => target.recalculate?.(), {
        enabled: target.recalculate !== null,
        ignoreRepeat: true,
    });
    // An outline evened out in its frame (owner on #459): none where it doesn't apply
    const evenState = evenStateOf(kind, params, spots);
    useActionHandler("shapeEvenOut", () => evenOut(live), {
        enabled: !mirrored && evenState === "uneven",
        disabledReason: mirrorOnly,
        ignoreRepeat: true,
    });

    // The shape on its own (#558): hold H to hide the marchers, tap to keep them hidden. The
    // button and the palette turn the latch over. A key still down when the editor goes (the show
    // plays) is let go, so it doesn't stay hidden once the editor is back
    useActionHandler("shapeHideMarchers", () => toggleHideMarchers(), {
        onPress: () => pressHideMarchers(),
        onRelease: (reason) =>
            releaseHideMarchers(Date.now(), reason === "lost"),
    });
    useEffect(() => () => releaseHideMarchers(Date.now(), true), []);

    // One interval number, a single counted group's chips, or the group menu: focus stays there
    // as one becomes another (owner feedback on #526)
    const groupCount = layout.groups?.length ?? 0;
    const intervalsCarry = useFocusCarry<HTMLSpanElement>(
        groupCount > 1 ? "menu" : groupCount === 1 ? "chips" : "number",
        (el) => el.closest(`[${GROUP_MENU_ATTRIBUTE}]`) !== null,
    );

    const whatRow = useRef<HTMLSpanElement>(null);
    const doRow = useRef<HTMLSpanElement>(null);
    const twoRows = useTwoRows(whatRow, doRow, place.rowRoom, place.held);

    return (
        <animated.div
            ref={place.ref}
            // Touch: one above the Inspector's edge tab (z-30). Where the field leaves the bar no
            // spot clear of the tab, the bar covers the tab rather than the tab covering Place
            className="shape-editor-surface text-sub text-text touch:z-[31] pointer-events-none absolute z-10 flex flex-col items-center gap-4 whitespace-nowrap *:pointer-events-auto"
            style={place.style}
            data-over={overShape}
            {...place.hold}
            data-testid={testId}
            data-shape-editor
            // #927: holds Place; it keeps off the zoom box, the Inspector's tab and the toolbar
            // panel itself, and the pill keeps off it. With no clear spot it covers them, the
            // toolbar panel aside
            data-field-layer="mover"
            data-placement={place.above ? "above" : "below"}
            data-held={place.held}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                className={clsx(
                    EDITOR_BAR,
                    twoRows ? "flex-col gap-4" : "gap-6",
                )}
                data-testid={`${testId}-bar`}
                data-rows={twoRows ? 2 : 1}
            >
                {/* A mirrored paste only mirrors (owner): which way, Recalculate, then Place */}
                {target.mirror ? (
                    <span
                        ref={whatRow}
                        className="flex shrink-0 items-center gap-6"
                        data-editor-row
                    >
                        <MirrorControls axes={target.mirror} />
                        {kind.asIs !== true && (
                            <MirrorRecalculate
                                live={live}
                                canRecalculate={target.recalculate !== null}
                            />
                        )}
                    </span>
                ) : (
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
                                <Fragment key={x.param.key}>
                                    <NumberChip
                                        param={x.param}
                                        display={x.display}
                                        note={x.note}
                                        before={x.before}
                                        after={x.after}
                                        canLess={x.less !== null}
                                        canMore={x.more !== null}
                                        glyph={null}
                                        actions={numbers}
                                    />
                                    {layout.ratioLock &&
                                        x.param.ratioLockAfter === true && (
                                            <RatioLockButton sizes />
                                        )}
                                </Fragment>
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
                        <span className="contents" {...intervalsCarry}>
                            {layout.groups && layout.groups.length > 1 && (
                                <>
                                    <Divider />
                                    <GroupMenu
                                        target={live}
                                        groups={layout.groups}
                                        envFor={envFor}
                                        onScrubbing={setShapeScrubbing}
                                    />
                                    {layout.lock !== null && (
                                        <IntervalLockButton
                                            live={live}
                                            locked={layout.lock}
                                        />
                                    )}
                                </>
                            )}
                            {layout.groups?.length === 1 && (
                                <>
                                    <Divider />
                                    <GroupChips
                                        target={live}
                                        groups={layout.groups}
                                        envFor={envFor}
                                        onScrubbing={setShapeScrubbing}
                                    />
                                    <span className="text-text/60">
                                        {tolgee.t("shapes.edit.steps", "steps")}
                                    </span>
                                    {layout.lock !== null && (
                                        <IntervalLockButton
                                            live={live}
                                            locked={layout.lock}
                                        />
                                    )}
                                </>
                            )}
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
                                                glyph={paramGlyph(
                                                    x.param,
                                                    params,
                                                    spots,
                                                )}
                                                glyphAfter={
                                                    x.param.glyphAfter === true
                                                }
                                                derived={x.derived}
                                                actions={numbers}
                                            />
                                        ))}
                                        <span className="text-text/60">
                                            {tolgee.t(
                                                "shapes.edit.steps",
                                                "steps",
                                            )}
                                        </span>
                                        {layout.ratioLock &&
                                            layout.intervals.length > 1 && (
                                                <RatioLockButton />
                                            )}
                                        {layout.lock !== null && (
                                            <IntervalLockButton
                                                live={live}
                                                locked={layout.lock}
                                            />
                                        )}
                                    </span>
                                </>
                            )}
                        </span>
                        {target.drawnOn && (
                            <span className="text-text/50">
                                {tolgee.t(
                                    "shapes.edit.drawnOn",
                                    "from {page}",
                                    {
                                        page: target.drawnOn,
                                    },
                                )}
                            </span>
                        )}
                    </span>
                )}
                {!twoRows && <Divider />}
                <span
                    ref={doRow}
                    className="flex shrink-0 items-center gap-6"
                    data-editor-row
                >
                    {!target.mirror && (
                        <TurnControls
                            live={live}
                            degrees={rotationDegrees(
                                shapeTurn(kind, params, spots),
                            )}
                            rotation={frame.rotation}
                            pivot={pivotOf(params)}
                            canRecalculate={target.recalculate !== null}
                            inOrder={
                                target.order !== undefined &&
                                target.order.current !== "nearest"
                            }
                            empty={target.empty}
                            canCloseUp={target.closeUp !== undefined}
                            evenState={evenState}
                            canShrink={canShrink}
                            canExpand={canExpand}
                            asIs={kind.asIs === true}
                        />
                    )}
                    {/* What doesn't change the shape itself, at the end (owner): its pathways */}
                    {!target.mirror && <Divider />}
                    <EndControls
                        live={live}
                        canPlace={target.place !== undefined}
                    />
                </span>
            </div>
            {!target.mirror && (
                <FillPill
                    live={live}
                    kind={kind}
                    shown={fillShown(kind, params, spots)}
                    canPlace={target.place !== undefined}
                    order={target.order?.current}
                    keepOffered={target.order?.keepOffered}
                    testId={testId}
                />
            )}
            {/* An open paste that doesn't fit says so here, beside Place (#961) */}
            {testId === "shape-tool-readout" && <PasteFitNotice />}
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
            get placeLoose() {
                return latest.current.placeLoose;
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
            get order() {
                return latest.current.order;
            },
            get mirror() {
                return latest.current.mirror;
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
    const evened =
        env && closedOf(kind, params, spots)?.evenOut?.(params, spots, env);
    if (evened === undefined || evened === null) return "none";
    return evened === params ? "even" : "uneven";
}

/** "Even out": the shape as even as its frame allows, as one undo step (owner on #459) */
const evenOut = (target: ShapeEditTarget) =>
    applyWith(target, (env) => {
        const evened = closedOf(
            target.kind,
            target.params,
            target.spots,
        )?.evenOut?.(target.params, target.spots, env);
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

/** The pivot picked, as the pivot menu picks it */
const pickPivotOf = (target: ShapeEditTarget, pivot: Pivot) =>
    target.pickPivot
        ? target.pickPivot(pivot)
        : updateWith(target, (now) => withPivot(now, pivot));

const turnQuarter = (target: ShapeEditTarget) =>
    updateWith(target, (now, env) =>
        quarterTurn(target.kind, now, target.spots, env),
    );

/**
 * The number being dragged, by its key: kept in the editor for its drag even where the shape stops
 * showing it (an Arc's stretch dragged onto a circle, #634), so the drag doesn't lose its number
 */
const useDraggedNumberStore = create<{ key: string | null }>(() => ({
    key: null,
}));

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
    key: string | null = null,
) => ({
    onScrubStart: () => {
        base.current = target.params;
        target.begin();
        if (guides) setShapeScrubbing(true);
        useDraggedNumberStore.setState({ key });
    },
    onScrub: (m: ScrubMove) => {
        const env = envFor(m.roles);
        if (env) target.preview(change(base.current, m, env));
    },
    onScrubEnd: (keep: boolean) => {
        setShapeScrubbing(false);
        useDraggedNumberStore.setState({ key: null });
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
                param.key,
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
    before = null,
    after = null,
    canLess,
    canMore,
    glyph,
    glyphAfter = false,
    derived = false,
    actions,
}: {
    param: Param;
    display: string;
    note: string | null;
    /** Words just before and after the number, muted ("Circle", "steps") */
    before?: string | null;
    after?: string | null;
    canLess: boolean;
    canMore: boolean;
    /** The mark the spacings show before them, if any */
    glyph: ParamGlyph | null;
    /** The mark goes after the number (a Line's offset, `2 ↔ 1 ↕`) */
    glyphAfter?: boolean;
    /** Shown as about so much: pressing it snaps it to a half step (owner on #459) */
    derived?: boolean;
    actions: ReturnType<typeof numberActions>;
}) {
    const plain = useMemo(() => actions.scrub(param), [actions, param]);
    const showsStep = param.showsStep === true;
    // A number setting the kind's step, or the gap between its rows: the field draws it while it's
    // pointed at, focused (typing too) or dragged (owner on #596; Rows, #1190)
    const engageMark = showsStep
        ? engageStep
        : param.showsRowsGap === true
          ? engageRowsGap
          : null;
    const shows = engageMark !== null;
    const key = param.key;
    const scrub = useMemo(
        () =>
            engageMark
                ? {
                      ...plain,
                      onScrubStart: () => {
                          engageMark(`${key}:drag`, true);
                          plain.onScrubStart();
                      },
                      onScrubEnd: (keep: boolean) => {
                          engageMark(`${key}:drag`, false);
                          plain.onScrubEnd(keep);
                      },
                  }
                : plain,
        [plain, engageMark, key],
    );
    useEffect(
        () => () => {
            for (const how of ["hover", "focus", "typing", "drag"])
                engageMark?.(`${key}:${how}`, false);
        },
        [engageMark, key],
    );
    // Focused is the number itself (Tab reaches it) or typing into it: the button gives way to
    // the input and back without a blur, so a change of one clears the other
    const engage = engageMark
        ? {
              onPointerEnter: () => engageMark(`${key}:hover`, true),
              onPointerLeave: () => engageMark(`${key}:hover`, false),
              onFocus: () => engageMark(`${key}:focus`, true),
              onBlur: () => engageMark(`${key}:focus`, false),
          }
        : {};
    const onTyping = useCallback(
        (typing: boolean) => {
            engageMark?.(`${key}:focus`, false);
            engageMark?.(`${key}:typing`, typing);
        },
        [engageMark, key],
    );
    return (
        <span
            className="flex items-center gap-2"
            data-shows-step={showsStep || undefined}
            {...engage}
        >
            {before && <span className="text-text/60">{before}</span>}
            {glyph && !glyphAfter && (
                <span className="text-text/60" aria-hidden>
                    <GlyphText text={glyph} />
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
                onTyping={shows ? onTyping : undefined}
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
            {glyph && glyphAfter && (
                <span className="text-text/60" aria-hidden>
                    <GlyphText text={glyph} />
                </span>
            )}
            {after && <span className="text-text/60">{after}</span>}
            {note && <span className="text-text/60">· {note}</span>}
        </span>
    );
});

/**
 * The kind's interval lock (a Line's, owner decision on #522): locked, dragging an end keeps the
 * interval; unlocked, it changes it. A press is one change of the shape (one undo step).
 */
const IntervalLockButton = memo(function IntervalLockButton({
    live,
    locked,
}: {
    live: ShapeEditTarget;
    locked: boolean;
}) {
    const lock = live.kind.lock;
    if (!lock) return null;
    return (
        <IconButton
            label={lock.label(locked)}
            pressed={locked}
            onClick={() => {
                const env = envFor();
                if (!env) return;
                const next = lock.toggle(live.params, live.spots, env);
                if (next !== live.params) live.apply(next);
            }}
            testId="shape-editor-interval-lock"
        >
            {locked ? (
                <LockSimpleIcon size={14} />
            ) : (
                <LockSimpleOpenIcon size={14} />
            )}
        </IconButton>
    );
});

/** Keeps the two spacings in proportion */
const RatioLockButton = memo(function RatioLockButton({
    sizes = false,
}: {
    /** It locks two sizes rather than spacings: an Arc's width and height (#634) */
    sizes?: boolean;
}) {
    // Each its own: an Arc's width-and-depth lock doesn't lock a box's spacings (owner on #634)
    const ratioLocked = useShapeEditorStore((s) =>
        sizes ? s.sizesLocked : s.ratioLocked,
    );
    return (
        <IconButton
            label={
                sizes
                    ? ratioLocked
                        ? tolgee.t(
                              "shapes.edit.ratioLock.sizesLocked",
                              "Width and height locked together: click to unlock",
                          )
                        : tolgee.t(
                              "shapes.edit.ratioLock.sizesUnlocked",
                              "Lock the width and height together",
                          )
                    : ratioLocked
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
            onClick={sizes ? toggleSizesLock : toggleRatioLock}
            testId="shape-editor-ratio-lock"
        >
            {/* One chain either way, lit in the accent when locked: a broken
                link didn't read as anything (owner) */}
            <LinkSimpleIcon size={14} />
        </IconButton>
    );
});

/** Recalculate on a mirrored paste's editor, as on any shape's (Paste mirrored) */
const MirrorRecalculate = memo(function MirrorRecalculate({
    live: target,
    canRecalculate,
}: {
    live: ShapeEditTarget;
    canRecalculate: boolean;
}) {
    const look = useActionLook(canRecalculate);
    return (
        <IconButton
            label={
                canRecalculate
                    ? tolgee.t(
                          "shapes.edit.recalculate.title",
                          "Recalculate who goes where, by least travel",
                      )
                    : tolgee.t(
                          "shapes.edit.recalculate.already",
                          "Who goes where is already least travel",
                      )
            }
            disabled={!canRecalculate}
            action="shapeRecalculate"
            className="relative"
            onClick={() => target.recalculate?.()}
            testId="shape-editor-recalculate"
        >
            <RecalculateFace look={look} />
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
    inOrder,
    empty,
    evenState,
    canShrink,
    canExpand,
    asIs,
}: {
    live: ShapeEditTarget;
    degrees: number;
    rotation: number;
    pivot: Pivot;
    canRecalculate: boolean;
    /** Who goes where follows a Line's order (Keep order or Reverse, #528), not least travel */
    inOrder: boolean;
    empty: number;
    /** Whether "Even out" applies, and whether there's anything to even (#459) */
    evenState: EvenState;
    /** Whether Shrink and Expand can take a step (#489) */
    canShrink: boolean;
    canExpand: boolean;
    /** Only redraws it */
    canCloseUp: boolean;
    /** Who stands where is part of the shape (a group, #603): no Recalculate */
    asIs: boolean;
}) {
    const base = useRef<unknown>(null);
    const recalculateLook = useActionLook(canRecalculate);
    const evenLook = useActionLook(evenState === "uneven");
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
                action="shapeQuarterTurn"
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
                onPick={(key) => pickPivotOf(target, key)}
                testId="shape-editor-pivot"
            />
            <IconButton
                label={tolgee.t("shapes.edit.flipAcross", "Flip side to side")}
                action="flipHorizontal"
                onClick={() => flip("across")}
                testId="shape-editor-flip-across"
            >
                <FlipHorizontalIcon size={14} />
            </IconButton>
            <IconButton
                label={tolgee.t("shapes.edit.flipDeep", "Flip front to back")}
                action="flipVertical"
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
            />
            {!asIs && (
                <IconButton
                    label={
                        canRecalculate
                            ? inOrder
                                ? tolgee.t(
                                      "shapes.edit.recalculate.titleInOrder",
                                      "Recalculate who goes where, in order along the line",
                                  )
                                : tolgee.t(
                                      "shapes.edit.recalculate.title",
                                      "Recalculate who goes where, by least travel",
                                  )
                            : empty > 0
                              ? tolgee.t(
                                    "shapes.edit.recalculate.closeUpFirst",
                                    "Recalculate who goes where: close up the empty spots first",
                                )
                              : inOrder
                                ? tolgee.t(
                                      "shapes.edit.recalculate.alreadyInOrder",
                                      "Who goes where is already in order along the line",
                                  )
                                : tolgee.t(
                                      "shapes.edit.recalculate.already",
                                      "Who goes where is already least travel",
                                  )
                    }
                    disabled={!canRecalculate}
                    action="shapeRecalculate"
                    className="relative"
                    onClick={() => target.recalculate?.()}
                    testId="shape-editor-recalculate"
                >
                    {/* The word only when it can do something: greyed out, it's the widest
                    thing on the bar for nothing (owner, review round r429) */}
                    <RecalculateFace look={recalculateLook} />
                </IconButton>
            )}
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
                    action="shapeEvenOut"
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

/**
 * Place's second tooltip line, kept on one line: Shift-click or Shift+Enter places the marchers,
 * keeping no shape
 */
function PlaceLooseHint() {
    return (
        <span className="text-text-subtitle text-sub block whitespace-nowrap">
            <T
                keyName="shapes.edit.placeLoose"
                params={{ keys: () => <Shortcut action="applyShapeLoose" /> }}
            />
        </span>
    );
}

/**
 * The eye, Guides (#634), Snap and Pathways, then Place for a new shape or Ungroup for a placed one
 */
const EndControls = memo(function EndControls({
    live: target,
    canPlace,
}: {
    live: ShapeEditTarget;
    canPlace: boolean;
}) {
    // No Escape on a tablet: the open shape's way out, beside Place (tablet 1.4)
    const touch = useIsTouchMode();
    return (
        <>
            <span className="flex items-center gap-2">
                <HideMarchersButton />
                {/* Which guides a shape draws, beside the other view controls: an Arc's circle
                    and angle lines (#634) */}
                <GuidesMenu target={target} />
                <SnapButton />
                {canPlace && <PathwaysButton />}
            </span>
            {canPlace && (
                <>
                    <Divider />
                    {touch && (
                        <ActionButton
                            action="shapeDiscard"
                            className={`${getButtonClassName({
                                variant: "secondary",
                                size: "compact",
                            })} text-body`}
                            onPointerDown={keepFocus}
                            data-testid="shape-editor-discard"
                        >
                            {tolgee.t("shapes.edit.discard", "Discard")}
                        </ActionButton>
                    )}
                    <EditorButton
                        // Shift-click is Shift+Enter: the marchers placed, no shape kept
                        onClick={(e) =>
                            e.shiftKey
                                ? target.placeLoose?.()
                                : target.place?.()
                        }
                        testId="shape-editor-place"
                        tip={{
                            label: tolgee.t("shapes.edit.place", "Place"),
                            action: "applyShape",
                            hint: <PlaceLooseHint />,
                            hintText: tolgee.t("actions.shape.applyLoose"),
                            oneLine: true,
                        }}
                    >
                        {tolgee.t("shapes.edit.place", "Place")}
                    </EditorButton>
                </>
            )}
            {!canPlace && (
                <>
                    <Divider />
                    <IconButton
                        label={tolgee.t(
                            "shapes.edit.ungroup",
                            "Ungroup: the marchers stay where they are",
                        )}
                        action="shapeUngroup"
                        onClick={() => runAction("shapeUngroup")}
                        testId="shape-editor-ungroup"
                    >
                        <SelectionSlashIcon size={14} />
                    </IconButton>
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
        // The kind's own menus show the answer the shape has (#523), and only while they apply
        // (a Line's Open or closed from its third point, #529)
        kind.choices?.map((c) => [
            c.current(params, spots),
            c.shown?.(params, spots) ?? true,
        ]),
        flipX,
        flipY,
        // The Rows menu lists every row, and shows its spacing (spec #1190)
        kind.rows ? kind.rows.view(params, spots) : null,
        kind.rows ? (params as { rows?: unknown }).rows : null,
    ]);
};

/**
 * How it's filled: a pill of its own under the editor (owner, #435), the kind's own menus (a
 * Line's spacing, #523), who goes where on a Line (#528) and the mode switch first, then what that mode has (a box's layout in Grid, the gap in Outline, Reshuffle and Edge in Spread). Hidden
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
    /** Only redraw it: who goes where, and whether Keep order is offered */
    order: OrderChoice | undefined;
    keepOffered: boolean | undefined;
    testId: string;
}) {
    const env = () => envFor();
    return (
        <div
            className="rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal flex items-center gap-6 border px-6 py-2 empty:hidden"
            data-testid={`${testId}-fill`}
        >
            {/* The kind's own menus (a Line's spacing, #523) */}
            <ChoiceMenus target={target} envFor={env} />
            {/* The marchers split into rows alongside the shape (spec #1190) */}
            <RowsMenu target={target} />
            {/* Who goes where on a Line (#528) */}
            <OrderMenu target={target} />
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
                    className="rounded-4 hover:text-accent hover:bg-text/10 min-h-24 px-4 py-2"
                    testId="shape-editor-reshuffle"
                />
                <EdgeToggle
                    target={target}
                    envFor={env}
                    className="rounded-4 hover:text-accent hover:bg-text/10 min-h-24 px-4 py-2"
                    testId="shape-editor-edge"
                />
            </span>
        </div>
    );
});

/**
 * The Rows menu (spec #1190): the marchers of a Line, Curve or Arc split into rows alongside it,
 * one shape with it. Its button says how many rows; it lists them in field order, each with its
 * spots (a press leaves one empty), its marchers (typed, dragged or stepped, one at a time from or
 * to another row, so nobody is ever left out) and, once there's more than one row, arrows that
 * move it half a spot along the line, a full row as well as a short one. Each change is one undo step (one save for a placed shape). None for a kind without.
 */
function RowsMenu({ target }: { target: ShapeEditTarget }) {
    const [open, setOpen] = useEditorMenu();
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>("[data-testid^='shape-rows-']"),
    );
    const run = useRef<SizeRun | null>(null);
    const chips = useRef<{ layout: ChipLayout; anchor: XY }>({
        layout: {
            values: [],
            intervals: [],
            groups: null,
            ratioLock: false,
            lock: null,
        },
        anchor: { x: 0, y: 0 },
    });
    const rows = target.kind.rows;
    const said = useRef<string | null>(null);
    const actions = useMemo(() => {
        const base = numberActions(target, run, chips);
        const step = (param: Param, by: -1 | 1) => {
            const env = envFor();
            const next =
                env && param.stepper?.by(target.params, target.spots, by, env);
            if (next) target.apply(next);
        };
        return {
            ...base,
            less: (param: Param) => step(param, -1),
            more: (param: Param) => step(param, 1),
        };
    }, [target]);
    if (!rows) return null;
    const { params, spots } = target;
    const view = rows.view(params, spots);
    if (!view) return null;
    const env = envFor();
    const stepPx = env?.stepPx ?? 1;
    const many = view.rows.length > 1;
    const label = tolgee.t("shapes.rows.label", "Rows");
    const summary = many
        ? tolgee.t("shapes.rows.summary", "Rows · {count}", {
              count: view.rows.length,
          })
        : label;
    // The button keeps what it said while its menu is open, so the menu doesn't slide out from
    // under the pointer as its rows change the button's width (sim study of #1190)
    if (!open) said.current = summary;
    const across = view.words === "across";
    const apply = (next: unknown) => {
        if (next) target.apply(next);
    };
    const can = (param: Param, by: -1 | 1) =>
        env !== null &&
        (param.stepper?.by(params, spots, by, env) ?? null) !== null;
    const canAdd = env !== null && rows.add(params, spots, "far", env) !== null;
    const addTip = canAdd
        ? null
        : tolgee.t(
              "shapes.rows.addNone",
              "No room for another row: every row needs a marcher",
          );
    const longest = Math.max(...view.rows.map((r) => r.spots.length));
    const dot = Math.max(4, Math.min(8, Math.floor(132 / longest) - 3));
    const removable = many || view.empty > 0;
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip
                label={tolgee.t(
                    "shapes.rows.tip",
                    "Split these marchers into rows alongside the line",
                )}
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={summary}
                        {...focus.trigger}
                        data-testid="shape-rows"
                        className="rounded-4 hover:bg-text/10 flex min-h-24 items-center gap-4 px-4 py-2"
                    >
                        <RowsIcon size={14} />
                        <span>{said.current ?? summary}</span>
                        <CaretDownIcon size={10} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    {...focus.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 flex w-[360px] flex-col gap-2 border p-8"
                    data-testid="shape-rows-content"
                >
                    <div className="flex min-h-24 items-center justify-between gap-8 px-4">
                        <span
                            className={many ? "" : "text-text/60"}
                            data-testid="shape-rows-heading"
                        >
                            {many
                                ? view.empty > 0
                                    ? tolgee.t(
                                          "shapes.rows.headingEmpty",
                                          "{count} marchers in {rows} rows · {empty, plural, one {# empty spot} other {# empty spots}}",
                                          {
                                              count: spots,
                                              rows: view.rows.length,
                                              empty: view.empty,
                                          },
                                      )
                                    : tolgee.t(
                                          "shapes.rows.heading",
                                          "{count} marchers in {rows} rows",
                                          {
                                              count: spots,
                                              rows: view.rows.length,
                                          },
                                      )
                                : tolgee.t(
                                      "shapes.rows.splits",
                                      "Splits your {count} marchers. Adds none.",
                                      { count: spots },
                                  )}
                        </span>
                    </div>
                    {view.picks.length > 0 && (
                        <div className="flex flex-wrap items-center gap-4 px-4">
                            <span className="text-text/60">
                                {tolgee.t("shapes.rows.picks", "Quick picks")}
                            </span>
                            {view.picks.map((pick) => (
                                <Tip
                                    key={pick.perRow}
                                    label={
                                        pick.last === pick.perRow
                                            ? tolgee.t(
                                                  "shapes.rows.pickTip",
                                                  "{perRow} in a row, {rows} rows",
                                                  pick,
                                              )
                                            : tolgee.t(
                                                  "shapes.rows.pickTipLast",
                                                  "{perRow} in a row, {rows} rows, the last row {last}",
                                                  pick,
                                              )
                                    }
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            env &&
                                            apply(
                                                rows.pick(
                                                    target.params,
                                                    target.spots,
                                                    pick.perRow,
                                                    env,
                                                ),
                                            )
                                        }
                                        data-testid={`shape-rows-pick-${pick.perRow}`}
                                        aria-pressed={pick.on}
                                        className={clsx(
                                            "border-stroke bg-fg-2 rounded-full border px-8 py-1 tabular-nums",
                                            pick.on
                                                ? "border-accent text-accent"
                                                : "hover:text-accent",
                                        )}
                                    >
                                        {`${pick.perRow} × ${pick.rows}`}
                                    </button>
                                </Tip>
                            ))}
                        </div>
                    )}
                    <div className="bg-stroke my-4 h-px" />
                    <div className="flex min-h-24 items-center justify-between gap-8 pl-4">
                        <span className="text-text/60">{label}</span>
                        <span className="flex items-center gap-2">
                            {(["far", "near"] as const).map((side) => (
                                <Tip
                                    key={side}
                                    label={
                                        addTip ??
                                        (side === "far"
                                            ? across
                                                ? tolgee.t(
                                                      "shapes.rows.addBehindTip",
                                                      "A row behind, the marchers shared out again",
                                                  )
                                                : tolgee.t(
                                                      "shapes.rows.addLeftTip",
                                                      "A row to the left, the marchers shared out again",
                                                  )
                                            : across
                                              ? tolgee.t(
                                                    "shapes.rows.addFrontTip",
                                                    "A row in front, the marchers shared out again",
                                                )
                                              : tolgee.t(
                                                    "shapes.rows.addRightTip",
                                                    "A row to the right, the marchers shared out again",
                                                ))
                                    }
                                >
                                    <button
                                        type="button"
                                        aria-disabled={!canAdd || undefined}
                                        onClick={() =>
                                            canAdd &&
                                            env &&
                                            apply(
                                                rows.add(
                                                    target.params,
                                                    target.spots,
                                                    side,
                                                    env,
                                                ),
                                            )
                                        }
                                        data-testid={`shape-rows-add-${side}`}
                                        className={clsx(
                                            "rounded-4 flex min-h-24 items-center gap-4 px-4 py-2",
                                            canAdd
                                                ? "hover:text-accent"
                                                : "opacity-40",
                                        )}
                                    >
                                        <PlusIcon size={12} />
                                        {side === "far"
                                            ? across
                                                ? tolgee.t(
                                                      "shapes.rows.addBehind",
                                                      "Behind",
                                                  )
                                                : tolgee.t(
                                                      "shapes.rows.addLeft",
                                                      "Left",
                                                  )
                                            : across
                                              ? tolgee.t(
                                                    "shapes.rows.addFront",
                                                    "In front",
                                                )
                                              : tolgee.t(
                                                    "shapes.rows.addRight",
                                                    "Right",
                                                )}
                                    </button>
                                </Tip>
                            ))}
                        </span>
                    </div>
                    {/* One grid for every row and its headings, so the columns line up */}
                    <div className="grid grid-cols-[52px_minmax(0,1fr)_auto_72px_24px] gap-x-4">
                        <div
                            className="text-text/60 col-span-full grid grid-cols-subgrid items-end pl-4 text-center"
                            data-testid="shape-rows-columns"
                        >
                            <span />
                            <span />
                            <span className="truncate">
                                {tolgee.t(
                                    "shapes.rows.colMarchers",
                                    "Marchers",
                                )}
                            </span>
                            <span className="truncate">
                                {many &&
                                    tolgee.t("shapes.rows.colOffset", "Offset")}
                            </span>
                            <span />
                        </div>
                        {view.rows.map((row, i) => {
                            const param = rows.count(row.index);
                            const name = rowName(row, across);
                            // Any row moves along once there are others to move against: a full one
                            // staggers as a short one does (owner on #1190)
                            const moves = view.rows.length > 1;
                            return (
                                <div
                                    key={row.index}
                                    className="rounded-4 hover:bg-text/5 col-span-full grid min-h-24 grid-cols-subgrid items-center pl-4"
                                    data-testid={`shape-rows-row-${i}`}
                                >
                                    <span
                                        className={clsx(
                                            "truncate",
                                            row.side === null && "text-accent",
                                        )}
                                    >
                                        {name}
                                    </span>
                                    <span
                                        className="flex items-center justify-center overflow-hidden"
                                        style={{
                                            transform: `translateX(${(row.shift * (dot + 2)) / 2}px)`,
                                        }}
                                    >
                                        {row.spots.map((filled, j) => (
                                            <button
                                                key={j}
                                                type="button"
                                                aria-label={
                                                    filled
                                                        ? tolgee.t(
                                                              "shapes.rows.leaveEmpty",
                                                              "Leave this spot empty",
                                                          )
                                                        : tolgee.t(
                                                              "shapes.rows.fillSpot",
                                                              "Empty spot: press to take it out",
                                                          )
                                                }
                                                title={
                                                    filled
                                                        ? tolgee.t(
                                                              "shapes.rows.leaveEmpty",
                                                              "Leave this spot empty",
                                                          )
                                                        : tolgee.t(
                                                              "shapes.rows.fillSpot",
                                                              "Empty spot: press to take it out",
                                                          )
                                                }
                                                onClick={() =>
                                                    env &&
                                                    apply(
                                                        rows.toggleSpot(
                                                            target.params,
                                                            target.spots,
                                                            row.index,
                                                            j,
                                                            env,
                                                        ),
                                                    )
                                                }
                                                data-testid={`shape-rows-dot-${i}-${j}`}
                                                className={clsx(
                                                    "group flex h-24 items-center justify-center px-1",
                                                    row.side === null
                                                        ? "text-accent"
                                                        : "text-text",
                                                )}
                                            >
                                                <span
                                                    className={clsx(
                                                        "block rounded-full group-hover:scale-125",
                                                        filled
                                                            ? "bg-current"
                                                            : "border border-current opacity-60",
                                                    )}
                                                    style={{
                                                        width: dot,
                                                        height: dot,
                                                    }}
                                                />
                                            </button>
                                        ))}
                                    </span>
                                    <NumberChip
                                        param={param}
                                        display={param.display(
                                            params,
                                            spots,
                                            stepPx,
                                        )}
                                        note={null}
                                        canLess={can(param, -1)}
                                        canMore={can(param, 1)}
                                        glyph={null}
                                        actions={actions}
                                    />
                                    <span className="flex items-center justify-center">
                                        {moves &&
                                            ([-1, 1] as const).map((by) => (
                                                <Fragment key={by}>
                                                    {by > 0 && (
                                                        <span
                                                            className={clsx(
                                                                "min-w-20 text-center tabular-nums",
                                                                row.shift ===
                                                                    0 &&
                                                                    "text-text/60",
                                                            )}
                                                            data-testid={`shape-rows-offset-${i}`}
                                                        >
                                                            {offsetText(
                                                                row.shift,
                                                            )}
                                                        </span>
                                                    )}
                                                    <IconButton
                                                        label={sitsTip(
                                                            row.shift,
                                                            by,
                                                            across,
                                                        )}
                                                        onClick={() =>
                                                            apply(
                                                                rows.shift(
                                                                    target.params,
                                                                    target.spots,
                                                                    row.index,
                                                                    by,
                                                                ),
                                                            )
                                                        }
                                                        testId={`shape-rows-sits-${by < 0 ? "less" : "more"}-${i}`}
                                                    >
                                                        {by < 0 ? (
                                                            <CaretLeftIcon
                                                                size={10}
                                                            />
                                                        ) : (
                                                            <CaretRightIcon
                                                                size={10}
                                                            />
                                                        )}
                                                    </IconButton>
                                                </Fragment>
                                            ))}
                                    </span>
                                    {row.side === null ? (
                                        <span />
                                    ) : (
                                        <IconButton
                                            label={tolgee.t(
                                                "shapes.rows.remove",
                                                "Remove {name}: its marchers go to the shortest rows",
                                                { name },
                                            )}
                                            onClick={() =>
                                                apply(
                                                    rows.remove(
                                                        target.params,
                                                        target.spots,
                                                        row.index,
                                                    ),
                                                )
                                            }
                                            testId={`shape-rows-remove-${i}`}
                                        >
                                            <XIcon size={10} />
                                        </IconButton>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <span className="text-text/60 px-4">
                        {tolgee.t(
                            "shapes.rows.dotHint",
                            "Press a dot to leave that spot empty",
                        )}
                    </span>
                    {many && (
                        <>
                            <div className="bg-stroke my-4 h-px" />
                            <span className="text-text/60 px-4">
                                {tolgee.t("shapes.rows.spacing", "Spacing")}
                            </span>
                            {[rows.apart, rows.slant].map((param) => (
                                <div
                                    key={param.key}
                                    className="flex min-h-24 items-center justify-between gap-8 pl-4"
                                >
                                    <span>
                                        {param === rows.apart
                                            ? tolgee.t(
                                                  "shapes.rows.rowApart",
                                                  "Rows apart",
                                              )
                                            : tolgee.t(
                                                  "shapes.rows.rowSlant",
                                                  "Slant",
                                              )}
                                    </span>
                                    <NumberChip
                                        param={param}
                                        display={param.display(
                                            params,
                                            spots,
                                            stepPx,
                                        )}
                                        note={null}
                                        after={tolgee.t(
                                            "shapes.edit.steps",
                                            "steps",
                                        )}
                                        canLess={false}
                                        canMore={false}
                                        glyph={null}
                                        actions={actions}
                                    />
                                </div>
                            ))}
                        </>
                    )}
                    <div className="bg-stroke my-4 h-px" />
                    <Tip
                        label={
                            removable
                                ? tolgee.t(
                                      "shapes.rows.clearTip",
                                      "Back to the one line you drew",
                                  )
                                : tolgee.t(
                                      "shapes.rows.clearNone",
                                      "No rows yet",
                                  )
                        }
                    >
                        <button
                            type="button"
                            aria-disabled={!removable || undefined}
                            onClick={() => {
                                if (!removable) return;
                                apply(rows.clear(target.params));
                                setOpen(false);
                            }}
                            data-testid="shape-rows-clear"
                            className={clsx(
                                "rounded-4 min-h-24 px-4 py-2 text-left",
                                removable ? "hover:text-accent" : "opacity-40",
                            )}
                        >
                            {tolgee.t("shapes.rows.clear", "Remove rows")}
                        </button>
                    </Tip>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** A row's name in the Rows menu: the drawn line, or so many behind, in front, left or right */
function rowName(row: RowView, across: boolean): string {
    if (row.side === null) return tolgee.t("shapes.rows.drawn", "Drawn");
    const count = { count: row.away };
    if (row.side === "far")
        return across
            ? tolgee.t("shapes.rows.behindN", "Behind {count}", count)
            : tolgee.t("shapes.rows.leftN", "Left {count}", count);
    return across
        ? tolgee.t("shapes.rows.frontN", "Front {count}", count)
        : tolgee.t("shapes.rows.rightN", "Right {count}", count);
}

/** Where a row sits along the line, in spots: 0, or ±½, ±1, ±1½… (a shift counts half spots) */
function offsetText(shift: number): string {
    if (shift === 0) return "0";
    const whole = Math.floor(Math.abs(shift) / 2);
    const half = Math.abs(shift) % 2 === 1 ? "½" : "";
    return `${shift < 0 ? "−" : "+"}${whole || !half ? whole : ""}${half}`;
}

/** What a row's arrow does, and where the row sits now */
function sitsTip(shift: number, by: -1 | 1, across: boolean): string {
    const way =
        by > 0
            ? across
                ? tolgee.t("shapes.rows.sitsRight", "Half a spot to the right")
                : tolgee.t(
                      "shapes.rows.sitsBack",
                      "Half a spot toward the back",
                  )
            : across
              ? tolgee.t("shapes.rows.sitsLeft", "Half a spot to the left")
              : tolgee.t(
                    "shapes.rows.sitsForward",
                    "Half a spot toward the front",
                );
    if (shift === 0)
        return tolgee.t(
            "shapes.rows.sitsCentered",
            "{way}. It sits centered now",
            {
                way,
            },
        );
    return tolgee.t(
        "shapes.rows.sitsNow",
        "{way}. It sits {half, plural, one {# half spot} other {# half spots}} {side} now",
        {
            way,
            half: Math.abs(shift),
            side:
                shift > 0
                    ? across
                        ? tolgee.t("shapes.rows.sideRight", "right")
                        : tolgee.t("shapes.rows.sideBack", "back")
                    : across
                      ? tolgee.t("shapes.rows.sideLeft", "left")
                      : tolgee.t("shapes.rows.sideForward", "forward"),
        },
    );
}

/** The field less the covers over its top (the touch toolbar's panel), in the field's px */
function visibleField(
    width: number,
    height: number,
    covers: readonly Rect[],
): Rect {
    const top = coverInset({ left: 0, top: 0, width, height }, covers);
    return { left: 0, top, width, height: Math.max(0, height - top) };
}

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
    // #927, touch layout: the controls and covers over the field it keeps clear of, in the field
    // element's px. None on the desktop
    const touch = useIsTouchMode();
    const obstacles = useRef<{
        all: Rect[];
        covers: Rect[];
        /** The controls' edge tabs leave this much of the field's width for one row (#936) */
        rowRoom: number;
    }>({
        all: [],
        covers: [],
        rowRoom: Infinity,
    });
    const [rowRoom, setRowRoom] = useState(Infinity);
    /** Where it last settled, as told to the other layers */
    const noted = useRef<string | null>(null);
    /** Where it was last sent, in the field's px */
    const lastTarget = useRef<{ left: number; top: number } | null>(null);
    const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const measureObstacles = useCallback(() => {
        const el = ref.current;
        const field = el?.offsetParent;
        const of = (kinds: readonly FieldLayerKind[]) =>
            touch && el && field ? fieldLayersIn(field, kinds, el) : [];
        // The covers on their own too: `clearPlacement` can go over a control, never a cover
        const covers = of(MOVER_AVOIDS.filter((kind) => kind === "cover"));
        const controls = of(MOVER_AVOIDS.filter((kind) => kind !== "cover"));
        const next = {
            all: [...controls, ...covers],
            covers,
            rowRoom:
                touch && field
                    ? oneRowRoom(field.clientWidth, controls)
                    : Infinity,
        };
        setRowRoom(next.rowRoom);
        if (JSON.stringify(next) === JSON.stringify(obstacles.current))
            return false;
        obstacles.current = next;
        return true;
    }, [touch]);
    const [room, setRoom] = useState({
        width: 0,
        height: 0,
        fieldWidth: Infinity,
        fieldHeight: Infinity,
    });
    // Its own size and the field's, as they change
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
            stemUnit: HANDLE_REACH_PX / (view.zoom || 1),
        });
        // A mirrored paste's pink point (Paste mirrored) is kept clear too: it's what's dragged
        const tool = useShapeToolStore.getState().tool;
        const point =
            tool?.mirror && tool.params === params
                ? fieldToElement(view, tool.mirror.point.x, tool.mirror.point.y)
                : null;
        const clearOfPoint = point
            ? [
                  {
                      left: point.x - MIRROR_POINT_CLEAR_PX,
                      top: point.y - MIRROR_POINT_CLEAR_PX,
                      width: 2 * MIRROR_POINT_CLEAR_PX,
                      height: 2 * MIRROR_POINT_CLEAR_PX,
                  },
              ]
            : [];
        return clearPlacement(
            {
                outline: outline.map((p) => fieldToElement(view, p.x, p.y)),
                knob: fieldToElement(view, knob.x, knob.y),
                handles: kind
                    .handles(params, spots, null)
                    .map(({ at }) => fieldToElement(view, at.x, at.y)),
                // #933, touch layout: its slots as the field draws them, which it keeps off when it
                // can only sit on the shape
                spots: touch
                    ? (activeFieldEditor()?.modeDrawing()?.spots ?? []).map(
                          (p) => fieldToElement(view, p.x, p.y),
                      )
                    : [],
                width: room.width,
                height: room.height,
                fieldWidth: room.fieldWidth,
                fieldHeight: room.fieldHeight,
            },
            [...obstacles.current.all, ...clearOfPoint],
            obstacles.current.covers,
            // #936, touch layout: never off the field or under the toolbar panel, so Place and
            // Discard can always be tapped
            touch && Number.isFinite(room.fieldWidth)
                ? visibleField(
                      room.fieldWidth,
                      room.fieldHeight,
                      obstacles.current.covers,
                  )
                : undefined,
            // Where it is now: kept while it's still as good, so a pan doesn't hop it (#936)
            lastTarget.current,
        );
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
        lastTarget.current = { left: target.left, top: target.top };
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
        // Where it's going, for the path bar to stack clear of (pathways interaction round 4)
        setShapeEditorRect({
            left: target.left,
            top: target.top,
            width: room.width,
            height: room.height,
        });
        const started = api.start({
            left: target.left,
            top: target.top,
            immediate: jump,
            config: EDITOR_SPRING,
        });
        // Touch layout: once it has settled somewhere new, the pill keeps clear of it. Not on the
        // desktop, which has no pill; and once the moves stop, not on every pan or zoom frame
        if (!touch) return;
        const settledAt = `${Math.round(target.left)},${Math.round(target.top)}`;
        void Promise.all(started).then(() => {
            if (noteTimer.current !== null) clearTimeout(noteTimer.current);
            noteTimer.current = setTimeout(() => {
                noteTimer.current = null;
                if (noted.current === settledAt) return;
                noted.current = settledAt;
                noteFieldLayersChanged();
            }, NOTE_SETTLED_MS);
        });
    };
    useLayoutEffect(() => {
        measureObstacles();
        follow(useFieldViewStore.getState());
        // `follow` reads only these
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, held, room, outline, measureObstacles]);
    // A control or cover appearing, going or moving (the toolbar panel opening): placed again
    useLayoutEffect(
        () =>
            subscribeFieldLayers(() => {
                if (measureObstacles())
                    latestFollow.current(useFieldViewStore.getState());
            }),
        [measureObstacles],
    );
    // Gone: the pill can have its spot back
    useEffect(
        () => () => {
            if (noteTimer.current !== null) clearTimeout(noteTimer.current);
            noteFieldLayersChanged();
        },
        [],
    );
    useLayoutEffect(
        () => useFieldViewStore.subscribe((view) => latestFollow.current(view)),
        [],
    );
    useEffect(() => () => setShapeEditorRect(null), []);
    return {
        ref,
        above,
        held,
        fieldWidth: room.fieldWidth,
        rowRoom: Math.min(room.fieldWidth, rowRoom),
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
 * every control visible in a narrow window). `room` is the field's width, less its edge tabs in the
 * touch layout (`oneRowRoom`, #936). Measured from the rows themselves, which keep their width
 * either way, so it doesn't flip back and forth.
 */
function useTwoRows(
    what: RefObject<HTMLElement | null>,
    act: RefObject<HTMLElement | null>,
    room: number,
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
                    room - 2 * FIELD_MARGIN_PX,
            );
        measure();
        // Its numbers redraw on their own, so it's the rows' size that's watched
        const observer = new ResizeObserver(measure);
        observer.observe(a);
        observer.observe(b);
        return () => observer.disconnect();
    }, [what, act, room]);
    // Held after a press, it keeps its rows: a − or + that crosses the line would otherwise
    // rearrange it under the pointer and send it a long way once let go (review of #493)
    const [twoRows, setTwoRows] = useState(wanted);
    useLayoutEffect(() => {
        if (!held) setTwoRows(wanted);
    }, [held, wanted]);
    return twoRows;
}

/**
 * The eye (#558): shows whether the marchers, the shape's spots and its walks are hidden, held or
 * latched, and turns the latch over. Its tooltip shows the key, which is held to peek.
 */
function HideMarchersButton() {
    const hidden = useMarchersHiddenStore(isHiding);
    return (
        <IconButton
            label={
                hidden
                    ? tolgee.t(
                          "shapes.edit.hideMarchers.show",
                          "Show the marchers",
                      )
                    : tolgee.t(
                          "shapes.edit.hideMarchers.hide",
                          "Hide the marchers",
                      )
            }
            action="shapeHideMarchers"
            pressed={hidden}
            onClick={toggleHideMarchers}
            testId="shape-editor-hide-marchers"
        >
            {hidden ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
        </IconButton>
    );
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
            action="toggleSnap"
            pressed={!on}
            onClick={() => runAction("toggleSnap")}
            testId="shape-editor-snap"
        >
            <MagnetIcon size={14} />
        </IconButton>
    );
}

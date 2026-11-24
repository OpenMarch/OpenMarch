/**
 * The timeline's Equipment lane (ADR 0015 D-7; fork #991 option E, #992): under the drill rows,
 * shown while the show has Equipment cues or the user added it from the Lanes row. One row per group of performers with the same
 * Equipment history (a cue for the whole guard is one row of bars), folding into a stacked summary
 * of how many hold each thing.
 *
 * - A lasting cue is a bar to the performer's next cue, a momentary one a rounded pill; the
 *   section's usual (not a cue) is a dashed bar.
 * - Click a cue to pick it: the cue commands (Add selected to this cue, Remove selected from this
 *   cue, lasting or momentary, Move cue to playhead, Delete cue) act on it. Right-click or
 *   long-press a cue for its menu.
 * - Drag a cue sideways to move it to another count, as a move's clip moves: whole beats, pulled to
 *   page lines (Alt drags free of them). Drag a momentary cue's end to change its length. Each drag
 *   is one undo step, and a cue whose performers span several rows moves in all of them.
 * - Click a row's name to select its performers.
 * - Presses stay in the lane: the timeline under it doesn't scrub or select. Cue bars and grips are
 *   timeline controls (`data-timeline-interactive`), so a finger drags them rather than panning.
 */
import {
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CaretDownIcon,
    CaretRightIcon,
    EyeSlashIcon,
} from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { PerformerCarry } from "@openmarch/core";
import type {
    TimelineBand,
    TimelineBandGeometry,
} from "@/components/timeline/TimelineBand";
import {
    KEEP_MENU_EVENTS,
    MenuItemWithReason,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import {
    clamp,
    isPageSnapDisabled,
    snapBoundary,
    snapRangeOffset,
} from "@/components/timeline/TimelineGeometry";
import { clipHandleWidth } from "@/components/timeline/TimelineClipResize";
import { TouchHitArea } from "@/components/timeline/TouchHitArea";
import {
    clipEdgeHitInside,
    TOUCH_HIT_SIZE,
} from "@/components/timeline/touchTargets";
import { cueEdgeDrag, cueNeighbours } from "@/cues/cueEdges";
import { withEquipmentSet } from "@/cues/equipment";
import { compileShowCues } from "@/cues/showCues";
import type { CueEdit } from "@/hooks/queries/useCues";
import { fingerDragSlop } from "@/components/timeline/timelineGestures";
import {
    MENU_ITEM_CLASS,
    MENU_LABEL_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { editCuesMutationOptions } from "@/hooks/queries/useCues";
import { createTimelineBeatAxis } from "@/timeline/timelineViewModel";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import {
    actionDisabledReason,
    runAction,
    isActionChecked,
    isActionEnabled,
} from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useShowCues, type EditorCues } from "@/cues/useShowCues";
import { pickedCueIn, useCueSelectionStore } from "@/cues/cueSelectionStore";
import { describePerformers } from "@/cues/cueLabel";
import { cueChangeEdit } from "@/cues/useCueCommands";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { beatWhere } from "@/timeline/timelineRangeWords";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { itemKeyOf } from "@/cues/equipmentItems";
import {
    setLaneFolded,
    useLaneFolded,
    useLaneShown,
} from "@/timeline/timelineLanes";
import { LANES_ROW_HEIGHT, LanesRow, useLaneNameMenu } from "./LanesMenu";
import {
    countToSpecBeat,
    equipmentLane,
    type EquipmentLane as LaneData,
    type LanePiece,
    type LaneRow,
} from "@/cues/equipmentLane";

const HEADER = 20;
const ROW = 20;
const SUMMARY = 24;
const EMPTY = 22;
const PAD = 4;
/** A mouse press on a cue moves this far before it drags, as a move's clip does */
const DRAG_SLOP_PX = 3;

/** Each thing held, as a lane color. */
const FILL: Readonly<Record<PerformerCarry, string>> = {
    flag: "bg-accent/60",
    rifle: "bg-yellow/70",
    sabre: "bg-green/70",
    winds: "bg-text/20",
    battery: "bg-red/30",
    none: "bg-text/10",
};

const MOMENTARY_LENGTHS = [1, 2, 4, 8, 16] as const;

/** The lane's height: its header, then its rows, the summary, or the empty hint. */
export function equipmentLaneHeight(
    lane: LaneData | null,
    folded: boolean,
): number {
    if (!lane || lane.rows.length === 0) return HEADER + EMPTY + PAD;
    return HEADER + (folded ? SUMMARY : lane.rows.length * ROW) + PAD;
}

/**
 * The Equipment lane as the timeline's `lanes`, or undefined while it's hidden (the Lanes menu and
 * the `toggleEquipmentLane` action, saved in the UI settings).
 */
export function useEquipmentLaneBand(): TimelineBand | undefined {
    const shown = useLaneShown("equipment");
    const folded = useLaneFolded("equipment");
    const show = useShowCues();
    const beats = useTimingObjects()?.beats;
    const lane = useMemo(
        () =>
            show
                ? equipmentLane({
                      compiled: show.compiled,
                      cues: show.cues,
                      usual: show.usual,
                  })
                : null,
        [show],
    );
    return useMemo(() => {
        if (!beats) return undefined;
        // The lanes area: the cue lanes that show, then the Lanes row, always last
        const equipmentHeight = shown ? equipmentLaneHeight(lane, folded) : 0;
        return {
            height: equipmentHeight + LANES_ROW_HEIGHT,
            render: (geometry) => (
                <>
                    {shown && (
                        <EquipmentLaneView
                            geometry={geometry}
                            lane={lane}
                            show={show}
                            beats={beats}
                            folded={folded}
                        />
                    )}
                    <div
                        data-testid="timeline-lanes-row-area"
                        className="absolute left-0 flex items-center"
                        style={{
                            top: geometry.top + equipmentHeight,
                            width: geometry.width,
                            height: LANES_ROW_HEIGHT,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="sticky left-0 z-[5] px-4">
                            <LanesRow />
                        </div>
                    </div>
                </>
            ),
        };
    }, [shown, folded, lane, show, beats]);
}

type CueMenu = { x: number; y: number; cueId: number };
/** A cue being dragged: moved by `delta` beats, or its length changed by `delta` counts. */
/**
 * A cue being dragged: its body (`move`), or its start or end edge, and how far each end of its bar
 * has gone, in beats
 */
type LaneDrag = {
    cueId: number;
    mode: "move" | "start" | "end";
    /** What the drop would write, drawn as the preview; null while it would change nothing */
    edit: CueEdit | null;
};

function EquipmentLaneView({
    geometry,
    lane,
    show,
    beats,
    folded,
}: {
    geometry: TimelineBandGeometry;
    lane: LaneData | null;
    show: EditorCues | null;
    beats: readonly { id: number; duration: number; position: number }[];
    folded: boolean;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    // Like move clips, cues don't drag or resize while the show plays
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const { mutate: edit } = useMutation(editCuesMutationOptions(queryClient));
    // The picked cue, if it's one of this show's (ids are per file)
    const pickedCueId = useCueSelectionStore((s) => s.cueId);
    const pickedAt = useCueSelectionStore((s) => s.createdAt);
    const picked = show
        ? (pickedCueIn(show.cues, { cueId: pickedCueId, createdAt: pickedAt })
              ?.id ?? null)
        : null;
    const pickCue = useCueSelectionStore((s) => s.pick);
    const pick = (cueId: number | null) =>
        pickCue(
            cueId === null
                ? null
                : (show?.cues.find((c) => c.id === cueId) ?? null),
        );
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const [menu, setMenu] = useState<CueMenu | null>(null);
    const [drag, setDrag] = useState<LaneDrag | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const ppb = geometry.pixelsPerBeat;
    const { xOf, axis, specOf } = useMemo(() => {
        const axis = createTimelineBeatAxis(beats);
        const specOf = new Map(beats.map((b, i) => [b.id, i]));
        const ids = show?.beatIds ?? [];
        return {
            axis,
            specOf,
            xOf: (count: number) =>
                axis.toView(countToSpecBeat(count, ids, specOf)) * ppb,
        };
    }, [beats, show, ppb]);
    // While dragging, the lane as the drop would leave it: the same planned edit, compiled
    const previewLane = useMemo(() => {
        if (!drag?.edit || !show) return null;
        const cues = withEquipmentSet(show.cues, drag.edit);
        const compiled = compileShowCues(show.marchers, beats, cues);
        return equipmentLane({
            compiled: compiled.compiled,
            cues,
            usual: compiled.usual,
        });
    }, [drag, show, beats]);
    const rows = (previewLane ?? lane)?.rows ?? [];
    const valueName = (value: string | null) => {
        const key = value === null ? "none" : itemKeyOf(value);
        if (key === "none" || key === "winds" || key === "battery")
            return t(`cues.value.${key}`);
        return key ? t(`cues.item.${key}`) : (value ?? "");
    };
    const words = {
        performers: (n: number) => t("cues.label.performers", { count: n }),
    };
    const rowName = (ids: readonly number[], label: string | null) =>
        label ??
        describePerformers({ ids, marchers: show?.marchers ?? [], words });
    /** The count a cue starts on */
    const startCountOf = (cueId: number) => {
        const cue = show?.cues.find((c) => c.id === cueId);
        return cue ? show?.countOfBeat.get(cue.beatId) : undefined;
    };
    /** A cue's name, what it sets and where, for a mark that only shows its color */
    const cueWords = (cueId: number) => {
        const cue = show?.cues.find((c) => c.id === cueId);
        if (!cue || !show) return "";
        const where = beatWhere(specOf.get(cue.beatId) ?? 0, pageBoxes);
        return t("cues.lane.markLabel", {
            name: rowName(cue.marcherIds, cue.label),
            value: valueName(cue.value),
            where: where ? translateTimelineText(where) : "",
        });
    };

    const openMenu = (cueId: number, clientX: number, clientY: number) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        pick(cueId);
        setMenu({ x: clientX - rect.left, y: clientY - rect.top, cueId });
    };

    /**
     * A press on a cue's body (`move`) or one of its edges (`start`, `end`), as on a move's clip:
     * past the slop it drags, pulled to page flags and measures (Alt: any count), and on release it
     * writes the new start or length as one undo step, its performers winning where it lands. The
     * end edge of a lasting cue makes it momentary; dragged back to the row's next cue it lasts
     * again. Short of the slop it's a click, which only picks the cue.
     */
    const startDrag = (
        e: ReactPointerEvent<HTMLElement>,
        piece: LanePiece,
        row: LaneRow,
        mode: LaneDrag["mode"],
    ) => {
        if (isPlaying || piece.cueId === null) return;
        const cueId = piece.cueId;
        const cue = show?.cues.find((c) => c.id === cueId);
        const at = cue ? specOf.get(cue.beatId) : undefined;
        if (!cue || !show || at === undefined || e.button !== 0) return;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const slop = fingerDragSlop(e.pointerType, DRAG_SLOP_PX);
        const specAt = (count: number) =>
            countToSpecBeat(count, show.beatIds, specOf);
        // Its performers' cues around it: a lasting cue runs until their next lasting cue (or the
        // show's end); a momentary one stops at their next momentary cue; a start edge stops just
        // after the cue before it
        const near = cueNeighbours({
            cues: show.cues,
            cue,
            countOf: (beatId) => show.countOfBeat.get(beatId),
        });
        const until = specAt(near.nextLasting ?? show.beatIds.length);
        const pieceEnd = specAt(piece.to);
        const span = { start: at, length: cue.length };
        let dragging = false;
        let result = { ...span, end: pieceEnd };
        const resultAt = (ev: PointerEvent) => {
            const offset = (ev.clientX - startX) / ppb;
            if (mode === "move") {
                const view = axis.toView(at);
                const requested = snapRangeOffset({
                    range: { startBeatIndex: view, endBeatIndex: view },
                    offset,
                    snapBeats: isPageSnapDisabled(ev) ? [] : geometry.snapBeats,
                    pixelsPerBeat: ppb,
                });
                // Home and the fixed first beat are one moment: a cue goes no earlier than beat 1
                const delta = clamp(requested, 1 - at, beats.length - 1 - at);
                return { ...span, start: at + delta, end: pieceEnd + delta };
            }
            // An edge lands on a page flag or measure near it, as a clip's edge does
            const edgeAt =
                mode === "start"
                    ? at
                    : span.length !== null
                      ? at + span.length
                      : until;
            const view = axis.toView(edgeAt);
            const landed = isPageSnapDisabled(ev)
                ? Math.round(view + offset)
                : snapBoundary({
                      beat: view + offset,
                      snapBeats: geometry.snapBeats,
                      pixelsPerBeat: ppb,
                  });
            const edged = cueEdgeDrag({
                edge: mode,
                cue: span,
                until,
                nextMomentary:
                    near.nextMomentary === null
                        ? null
                        : specAt(near.nextMomentary),
                previous: near.previous === null ? null : specAt(near.previous),
                delta: landed - view,
            });
            return {
                ...edged,
                start: Math.min(edged.start, beats.length - 1),
            };
        };
        /** The one write the drop makes, its performers winning where it lands; null for none */
        const planned = () => {
            const change = {
                ...(result.start !== at && {
                    beatId: beats[result.start]!.id,
                }),
                ...(result.length !== cue.length && { length: result.length }),
            };
            return Object.keys(change).length === 0
                ? null
                : cueChangeEdit(show, cueId, change, words);
        };
        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== e.pointerId) return;
            if (!dragging && Math.abs(ev.clientX - startX) < slop) return;
            dragging = true;
            result = resultAt(ev);
            // Drawn from the same edit the drop writes, so the preview is what lands
            setDrag({ cueId, mode, edit: planned() });
        };
        const done = (commit: boolean) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
            const plan = dragging && commit ? planned() : null;
            if (!plan) {
                setDrag(null);
                return;
            }
            // The preview stays as dropped until the cues reload
            edit(plan, { onSettled: () => setDrag(null) });
        };
        const onUp = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) done(true);
        };
        const onCancel = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) done(false);
        };
        // On the window: the preview may draw the dragged bar anew, and its element with it
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
    };

    const nameMenu = useLaneNameMenu("equipment");
    const height = equipmentLaneHeight(lane, folded);
    return (
        <div
            ref={rootRef}
            data-testid="equipment-lane"
            className="border-stroke absolute left-0 border-t"
            style={{ top: geometry.top, width: geometry.width, height }}
            // The timeline under the lane neither scrubs nor selects on a press here
            onPointerDown={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) pick(null);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <div
                data-testid="equipment-lane-header"
                className="text-micro text-text-subtitle sticky left-0 z-10 flex w-fit items-center gap-4 px-4"
                style={{ height: HEADER }}
                // Right-click (or a long press) on the lane's name: hide it, fold it, or the lanes
                onContextMenu={nameMenu.onContextMenu}
            >
                {nameMenu.menu}
                <button
                    type="button"
                    data-testid="equipment-lane-fold"
                    // The same words as the lane name's menu
                    aria-label={t(
                        folded
                            ? "cues.lane.expandRows"
                            : "cues.lane.collapseRows",
                    )}
                    title={t(
                        folded
                            ? "cues.lane.expandRows"
                            : "cues.lane.collapseRows",
                    )}
                    aria-expanded={!folded}
                    className="hover:text-text touch:size-44 flex size-16 items-center justify-center rounded-full"
                    onClick={() => setLaneFolded("equipment", !folded)}
                >
                    {folded ? (
                        <CaretRightIcon size={12} />
                    ) : (
                        <CaretDownIcon size={12} />
                    )}
                </button>
                <span className="text-text font-medium">
                    {t("cues.lane.equipment")}
                </span>
                {folded && rows.length > 0 && (
                    <span>
                        {t("cues.lane.foldedCount", {
                            groups: rows.length,
                            count: lane?.marcherIds.length ?? 0,
                        })}
                    </span>
                )}
                <button
                    type="button"
                    data-testid="equipment-lane-hide"
                    aria-label={t("cues.lane.hide")}
                    title={t("cues.lane.hide")}
                    className="hover:text-text touch:size-44 flex size-16 items-center justify-center rounded-full"
                    onClick={() => runAction("toggleEquipmentLane")}
                >
                    <EyeSlashIcon size={12} />
                </button>
            </div>
            {rows.length === 0 ? (
                <div
                    className="text-micro text-text-subtitle sticky left-0 flex w-fit items-center px-24"
                    style={{ height: EMPTY }}
                >
                    {t("cues.lane.empty")}
                </div>
            ) : folded ? (
                <Summary
                    lane={lane!}
                    xOf={xOf}
                    picked={picked}
                    pick={pick}
                    nameOf={cueWords}
                    onMenu={openMenu}
                />
            ) : (
                rows.map((row) => (
                    <div
                        key={row.key}
                        data-testid="equipment-lane-row"
                        data-marchers={row.marcherIds.join(",")}
                        className="relative"
                        style={{ height: ROW }}
                    >
                        {row.pieces.map((piece) => {
                            const dragged =
                                drag !== null && drag.cueId === piece.cueId;
                            return (
                                <Piece
                                    key={`${piece.from}-${piece.cueId ?? "d"}`}
                                    piece={piece}
                                    left={xOf(piece.from)}
                                    width={xOf(piece.to) - xOf(piece.from)}
                                    dragging={dragged}
                                    name={valueName(piece.value)}
                                    // A start edge only where the cue starts (not a later row's
                                    // continuation of it)
                                    startsHere={
                                        piece.cueId !== null &&
                                        startCountOf(piece.cueId) === piece.from
                                    }
                                    lockedReason={
                                        isPlaying
                                            ? t("cues.reason.paused")
                                            : undefined
                                    }
                                    picked={
                                        piece.cueId !== null &&
                                        piece.cueId === picked
                                    }
                                    onPress={(e, mode) => {
                                        if (piece.cueId === null) return;
                                        if (e.button === 0) pick(piece.cueId);
                                        startDrag(e, piece, row, mode);
                                    }}
                                    onMenu={(x, y) =>
                                        piece.cueId !== null &&
                                        openMenu(piece.cueId, x, y)
                                    }
                                />
                            );
                        })}
                        <button
                            type="button"
                            data-testid="equipment-lane-row-name"
                            title={t("cues.lane.selectRow")}
                            className="bg-bg-1/80 text-micro text-text hover:text-accent touch:min-h-44 sticky left-0 z-[5] flex h-full max-w-160 items-center gap-4 truncate rounded-full px-6 backdrop-blur-sm"
                            onClick={() =>
                                activeFieldEditor()?.select(row.marcherIds)
                            }
                        >
                            <span className="truncate">
                                {rowName(row.marcherIds, row.label)}
                            </span>
                            <span className="text-text-subtitle">
                                {row.marcherIds.length}
                            </span>
                        </button>
                    </div>
                ))
            )}
            {menu && show && (
                <CueMenuView
                    menu={menu}
                    show={show}
                    onClose={() => setMenu(null)}
                />
            )}
        </div>
    );
}

/** How long a finger holds still on a cue to open its menu. */
const LONG_PRESS_MS = 500;
/** How far a finger may drift during a long press. */
const LONG_PRESS_SLOP = 10;

/**
 * A finger held still on a cue (a bar or a mark) opens its menu, as a right-click does. `start`
 * goes in the press handler, the rest on the element.
 */
function useLongPressMenu(onMenu: (clientX: number, clientY: number) => void) {
    const press = useRef<{
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const end = () => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
    };
    return {
        start: (e: ReactPointerEvent<HTMLElement>) => {
            if (e.pointerType === "mouse") return;
            const { clientX, clientY } = e;
            end();
            press.current = {
                x: clientX,
                y: clientY,
                timer: setTimeout(() => {
                    press.current = null;
                    onMenu(clientX, clientY);
                }, LONG_PRESS_MS),
            };
        },
        handlers: {
            onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
                const p = press.current;
                if (
                    p &&
                    Math.hypot(e.clientX - p.x, e.clientY - p.y) >
                        LONG_PRESS_SLOP
                )
                    end();
            },
            onPointerUp: end,
            onPointerCancel: end,
            onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
                e.preventDefault();
                e.stopPropagation();
                end();
                onMenu(e.clientX, e.clientY);
            },
        },
    };
}

/** One piece of a row: a cue's bar or pill, or the dashed default. */
function Piece({
    piece,
    left,
    width,
    dragging,
    name,
    startsHere,
    lockedReason,
    picked,
    onPress,
    onMenu,
}: {
    piece: LanePiece;
    left: number;
    width: number;
    dragging: boolean;
    name: string;
    /** Whether the cue starts at this bar's start, so its start edge can be dragged here */
    startsHere: boolean;
    /** Why it can't be dragged now (while playing), or undefined when it can */
    lockedReason?: string;
    picked: boolean;
    onPress: (
        e: ReactPointerEvent<HTMLElement>,
        mode: LaneDrag["mode"],
    ) => void;
    onMenu: (clientX: number, clientY: number) => void;
}) {
    const { t } = useTranslate();
    const isCue = piece.cueId !== null;
    const momentary = piece.kind === "momentary";
    const longPress = useLongPressMenu(onMenu);
    const drawnWidth = Math.max(width - 1, 4);
    // As a move's clip: up to 6 px handles inside each edge, none on a very short bar
    const handleWidth = clipHandleWidth(drawnWidth);
    const edges = isCue && !lockedReason && handleWidth > 0;
    /** One edge's handle: an ew-resize cursor, a bar on hover, and a finger's 44 px while picked */
    const edge = (side: "start" | "end") => {
        const label = t(
            side === "start" ? "cues.lane.dragStart" : "cues.lane.dragEnd",
        );
        return (
            <span
                data-testid={`equipment-lane-cue-${side}`}
                data-timeline-interactive=""
                title={label}
                aria-label={label}
                className="group/resize absolute top-0 z-[1] h-full cursor-ew-resize touch-none"
                style={{
                    width: handleWidth,
                    ...(side === "start" ? { left: 0 } : { right: 0 }),
                }}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onPress(e, side);
                }}
            >
                <span
                    data-touch-drawn=""
                    className={clsx(
                        "bg-text/60 pointer-events-none absolute inset-y-[2px] hidden w-[2px] rounded-full group-hover/resize:block",
                        side === "start" ? "left-0" : "right-0",
                        picked && "touch:block",
                    )}
                />
                {picked && (
                    <TouchHitArea
                        selected
                        className="touch:block pointer-events-auto absolute top-1/2 hidden h-full min-h-44 -translate-y-1/2"
                        style={{
                            width: TOUCH_HIT_SIZE,
                            left:
                                side === "start"
                                    ? clipEdgeHitInside(
                                          drawnWidth,
                                          handleWidth,
                                      ) - TOUCH_HIT_SIZE
                                    : handleWidth -
                                      clipEdgeHitInside(
                                          drawnWidth,
                                          handleWidth,
                                      ),
                        }}
                    />
                )}
            </span>
        );
    };
    return (
        <div
            data-testid={
                isCue ? "equipment-lane-cue" : "equipment-lane-default"
            }
            data-cue-id={piece.cueId ?? undefined}
            data-holds={piece.holds}
            data-value={piece.value ?? undefined}
            data-timeline-interactive={isCue ? "" : undefined}
            title={isCue ? lockedReason : undefined}
            className={clsx(
                "text-micro absolute top-2 flex items-center px-4 leading-none whitespace-nowrap",
                momentary ? "rounded-full" : "rounded-4",
                isCue
                    ? clsx(
                          FILL[piece.holds],
                          "text-text touch-none font-medium",
                          !lockedReason && "cursor-grab",
                      )
                    : "border-stroke text-text-subtitle border border-dashed",
                picked && "ring-accent ring-2",
                dragging && "z-[6] cursor-grabbing opacity-90 shadow-lg",
            )}
            style={{
                left,
                width: drawnWidth,
                height: ROW - 4,
            }}
            {...(isCue
                ? longPress.handlers
                : {
                      onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
                          e.preventDefault();
                          e.stopPropagation();
                      },
                  })}
            onPointerDown={(e) => {
                e.stopPropagation();
                if (!isCue) return;
                onPress(e, "move");
                longPress.start(e);
            }}
        >
            <span className="min-w-0 truncate">{name}</span>
            {edges && startsHere && edge("start")}
            {edges && edge("end")}
        </div>
    );
}

/** The folded lane: how many hold each thing, slice by slice, and a mark on every cue. */
function Summary({
    lane,
    xOf,
    picked,
    pick,
    nameOf,
    onMenu,
}: {
    lane: LaneData;
    xOf: (count: number) => number;
    picked: number | null;
    pick: (cueId: number | null) => void;
    /** A cue's name, what it sets and where, for its mark's label */
    nameOf: (cueId: number) => string;
    /** Opens a cue's menu at a point (a right-click or a long press on its mark) */
    onMenu: (cueId: number, clientX: number, clientY: number) => void;
}) {
    const total = lane.marcherIds.length || 1;
    return (
        <div
            data-testid="equipment-lane-summary"
            className="relative"
            style={{ height: SUMMARY }}
        >
            {lane.summary.map((slice) => (
                <div
                    key={slice.from}
                    className="rounded-4 absolute top-4 flex flex-col overflow-hidden"
                    style={{
                        left: xOf(slice.from),
                        width: Math.max(xOf(slice.to) - xOf(slice.from) - 1, 2),
                        height: SUMMARY - 6,
                    }}
                >
                    {slice.counts.map(({ holds, count }) => (
                        <div
                            key={holds}
                            className={FILL[holds]}
                            style={{ flexGrow: count / total }}
                        />
                    ))}
                </div>
            ))}
            {lane.marks.map((mark) => (
                <SummaryMarkButton
                    key={mark.cueId}
                    mark={mark}
                    left={xOf(mark.count)}
                    picked={mark.cueId === picked}
                    label={nameOf(mark.cueId)}
                    onPick={() => pick(mark.cueId)}
                    onMenu={(x, y) => onMenu(mark.cueId, x, y)}
                />
            ))}
        </div>
    );
}

/**
 * A cue's mark in the folded lane: a diamond in what it sets' color. A click picks the cue, and a
 * right-click or a long press opens its menu, as on a bar. A finger gets the timeline's 44 px
 * target around it.
 */
function SummaryMarkButton({
    mark,
    left,
    picked,
    label,
    onPick,
    onMenu,
}: {
    mark: LaneData["marks"][number];
    left: number;
    picked: boolean;
    label: string;
    onPick: () => void;
    onMenu: (clientX: number, clientY: number) => void;
}) {
    const longPress = useLongPressMenu(onMenu);
    return (
        <button
            type="button"
            data-testid="equipment-lane-mark"
            data-cue-id={mark.cueId}
            data-timeline-interactive=""
            aria-label={label}
            title={label}
            className="touch:size-44 absolute top-4 flex size-16 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
            style={{ left }}
            {...longPress.handlers}
            onPointerDown={(e) => {
                e.stopPropagation();
                onPick();
                longPress.start(e);
            }}
        >
            <span
                className={clsx(
                    "size-8 rotate-45",
                    FILL[mark.holds],
                    picked && "ring-accent ring-2",
                )}
            />
        </button>
    );
}

/** A cue's menu: the cue commands, which act on the picked cue, and selecting its performers. */
function CueMenuView({
    menu,
    show,
    onClose,
}: {
    menu: CueMenu;
    show: EditorCues;
    onClose: () => void;
}) {
    const { t } = useTranslate();
    const cue = show.cues.find((c) => c.id === menu.cueId);
    const label = (id: ActionId) =>
        getActionLabel(id, (key, params) => t(key, params as never));
    /** A cue command: runnable, greyed out with its reason (#1039), or left out without one */
    const item = (id: ActionId, args?: Record<string, number>) => {
        // In effect (a lasting cue's Make cue lasting) it shows chosen, not greyed out
        const checked = isActionChecked(id);
        const reason =
            isActionEnabled(id) || checked
                ? null
                : (actionDisabledReason(id) ?? undefined);
        if (reason === undefined) return null;
        return (
            <MenuItemWithReason
                key={`${id}${args ? JSON.stringify(args) : ""}`}
                testId={`cue-menu-${id}`}
                reason={reason}
                reasonTestId={`cue-menu-${id}-reason`}
                checked={checked || undefined}
                onSelect={() => !checked && runAction(id, args)}
            >
                {label(id)}
            </MenuItemWithReason>
        );
    };
    return (
        <DropdownMenu.Root
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DropdownMenu.Trigger asChild>
                <div
                    aria-hidden
                    className="pointer-events-none absolute h-0 w-0"
                    style={{ left: menu.x, top: menu.y }}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="cue-menu"
                    align="start"
                    collisionPadding={8}
                    {...KEEP_MENU_EVENTS}
                    className={TIMELINE_MENU_CONTENT_CLASS}
                >
                    {cue?.label && (
                        <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                            {cue.label}
                        </DropdownMenu.Label>
                    )}
                    {item("cueAddSelected")}
                    {item("cueRemoveSelected")}
                    <DropdownMenu.Item
                        data-testid="cue-menu-select"
                        disabled={!cue}
                        onSelect={() =>
                            cue && activeFieldEditor()?.select(cue.marcherIds)
                        }
                        className={MENU_ITEM_CLASS}
                    >
                        {t("cues.lane.selectPerformers")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
                    {item("cueMoveToPlayhead")}
                    {item("cueEndAtPlayhead")}
                    {item("cueMakeLasting")}
                    <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                        {label("cueMakeMomentary")}
                    </DropdownMenu.Label>
                    {MOMENTARY_LENGTHS.map((length) => (
                        // The length in effect shows chosen; greyed out, the reason says why
                        <MenuItemWithReason
                            key={length}
                            testId={`cue-menu-momentary-${length}`}
                            reason={
                                isActionEnabled("cueMakeMomentary")
                                    ? null
                                    : (actionDisabledReason(
                                          "cueMakeMomentary",
                                      ) ?? null)
                            }
                            reasonTestId={`cue-menu-momentary-${length}-reason`}
                            checked={cue?.length === length}
                            onSelect={() =>
                                cue?.length !== length &&
                                runAction("cueMakeMomentary", { length })
                            }
                        >
                            {t("cues.lane.forCounts", { count: length })}
                        </MenuItemWithReason>
                    ))}
                    <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
                    {item("cueDelete")}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

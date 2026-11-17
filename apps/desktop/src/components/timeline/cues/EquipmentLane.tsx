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
    type PointerEvent as ReactPointerEvent,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CaretDownIcon,
    CaretRightIcon,
    EyeSlashIcon,
} from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { PerformerCarry } from "@openmarch/core";
import type {
    TimelineBand,
    TimelineBandGeometry,
} from "@/components/timeline/TimelineBand";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import {
    clamp,
    isPageSnapDisabled,
    snapRangeOffset,
} from "@/components/timeline/TimelineGeometry";
import { fingerDragSlop } from "@/components/timeline/timelineGestures";
import {
    MENU_ITEM_CLASS,
    MENU_LABEL_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { cueKeys } from "@/hooks/queries/useCues";
import { createTimelineBeatAxis } from "@/timeline/timelineViewModel";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { runAction, isActionEnabled } from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import { conToastError } from "@/utilities/utils";
import { useShowCues, type EditorCues } from "@/cues/useShowCues";
import { useCueSelectionStore } from "@/cues/cueSelectionStore";
import { describePerformers } from "@/cues/cueLabel";
import { writeCueDrag } from "@/cues/useCueCommands";
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
type LaneDrag = { cueId: number; mode: "move" | "resize"; delta: number };

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
    beats: readonly { id: number; duration: number }[];
    folded: boolean;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const picked = useCueSelectionStore((s) => s.cueId);
    const pick = useCueSelectionStore((s) => s.pick);
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
    const rows = lane?.rows ?? [];
    const valueName = (value: string | null) => {
        const key = value === null ? "none" : itemKeyOf(value);
        if (key === "none" || key === "winds" || key === "battery")
            return t(`cues.value.${key}`);
        return key ? t(`cues.item.${key}`) : (value ?? "");
    };
    const rowName = (ids: readonly number[], label: string | null) =>
        label ??
        describePerformers({
            ids,
            marchers: show?.marchers ?? [],
            words: {
                performers: (n) => t("cues.label.performers", { count: n }),
            },
        });

    const openMenu = (cueId: number, clientX: number, clientY: number) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        pick(cueId);
        setMenu({ x: clientX - rect.left, y: clientY - rect.top, cueId });
    };

    /**
     * A press on a cue (`move`) or a momentary cue's end (`resize`): past the slop it drags, and
     * on release it writes the new count or length as one undo step. Short of the slop it's a
     * click, which only picks the cue.
     */
    const startDrag = (
        e: ReactPointerEvent<HTMLElement>,
        cueId: number,
        mode: LaneDrag["mode"],
    ) => {
        const cue = show?.cues.find((c) => c.id === cueId);
        const at = cue ? specOf.get(cue.beatId) : undefined;
        if (!cue || at === undefined || e.button !== 0) return;
        if (mode === "resize" && cue.length === null) return;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const slop = fingerDragSlop(e.pointerType, DRAG_SLOP_PX);
        const view = axis.toView(at);
        let dragging = false;
        let delta = 0;
        const deltaAt = (ev: PointerEvent) => {
            const offset = (ev.clientX - startX) / ppb;
            if (mode === "resize")
                return Math.max(1 - cue.length!, Math.round(offset));
            const requested = snapRangeOffset({
                range: { startBeatIndex: view, endBeatIndex: view },
                offset,
                snapBeats: isPageSnapDisabled(ev) ? [] : geometry.snapBeats,
                pixelsPerBeat: ppb,
            });
            // Home and the fixed first beat are one moment: a cue goes no earlier than beat 1
            return clamp(requested, 1 - at, beats.length - 1 - at);
        };
        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== e.pointerId) return;
            if (!dragging && Math.abs(ev.clientX - startX) < slop) return;
            dragging = true;
            delta = deltaAt(ev);
            setDrag({ cueId, mode, delta });
        };
        const done = (commit: boolean) => {
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerup", onUp);
            target.removeEventListener("pointercancel", onCancel);
            if (!dragging || !commit || delta === 0) {
                setDrag(null);
                return;
            }
            const change =
                mode === "move"
                    ? { beatId: beats[at + delta]!.id }
                    : { length: cue.length! + delta };
            void writeCueDrag(cueId, change, (error) =>
                conToastError(t("cues.errors.update"), error),
            )
                .then(() =>
                    queryClient.invalidateQueries({ queryKey: cueKeys.all() }),
                )
                .finally(() => setDrag(null));
        };
        const onUp = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) done(true);
        };
        const onCancel = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) done(false);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onCancel);
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
                    aria-label={t(
                        folded ? "cues.lane.unfold" : "cues.lane.fold",
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
                <Summary lane={lane!} xOf={xOf} picked={picked} pick={pick} />
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
                                    shift={
                                        dragged && drag.mode === "move"
                                            ? drag.delta * ppb
                                            : 0
                                    }
                                    extend={
                                        dragged && drag.mode === "resize"
                                            ? drag.delta * ppb
                                            : 0
                                    }
                                    dragging={dragged}
                                    name={valueName(piece.value)}
                                    resizeLabel={t("cues.lane.resize")}
                                    picked={
                                        piece.cueId !== null &&
                                        piece.cueId === picked
                                    }
                                    onPress={(e, mode) => {
                                        if (piece.cueId === null) return;
                                        if (e.button === 0) pick(piece.cueId);
                                        startDrag(e, piece.cueId, mode);
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

/** One piece of a row: a cue's bar or pill, or the dashed default. */
function Piece({
    piece,
    left,
    width,
    shift,
    extend,
    dragging,
    name,
    resizeLabel,
    picked,
    onPress,
    onMenu,
}: {
    piece: LanePiece;
    left: number;
    width: number;
    /** How far a drag has moved the cue, in pixels */
    shift: number;
    /** How far a drag of its end has stretched it, in pixels */
    extend: number;
    dragging: boolean;
    name: string;
    resizeLabel: string;
    picked: boolean;
    onPress: (
        e: ReactPointerEvent<HTMLElement>,
        mode: "move" | "resize",
    ) => void;
    onMenu: (clientX: number, clientY: number) => void;
}) {
    const press = useRef<{
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const isCue = piece.cueId !== null;
    const momentary = piece.kind === "momentary";
    const end = () => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
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
            className={clsx(
                "text-micro absolute top-2 flex items-center overflow-hidden px-4 leading-none whitespace-nowrap",
                momentary ? "rounded-full" : "rounded-4",
                isCue
                    ? clsx(
                          FILL[piece.holds],
                          "text-text cursor-grab touch-none font-medium",
                      )
                    : "border-stroke text-text-subtitle border border-dashed",
                picked && "ring-accent ring-2",
                dragging && "z-[6] cursor-grabbing opacity-90 shadow-lg",
            )}
            style={{
                left: left + shift,
                width: Math.max(width - 1 + extend, 4),
                height: ROW - 4,
            }}
            onPointerDown={(e) => {
                e.stopPropagation();
                if (!isCue) return;
                onPress(e, "move");
                if (e.pointerType !== "mouse") {
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
                }
            }}
            onPointerMove={(e) => {
                const p = press.current;
                if (
                    p &&
                    Math.hypot(e.clientX - p.x, e.clientY - p.y) >
                        LONG_PRESS_SLOP
                )
                    end();
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                end();
                if (isCue) onMenu(e.clientX, e.clientY);
            }}
        >
            <span className="truncate">{name}</span>
            {isCue && momentary && (
                // The end of a momentary cue: drag it to change how many counts it lasts. A
                // finger gets a 44 px target over the pill's end
                <span
                    data-testid="equipment-lane-cue-end"
                    data-timeline-interactive=""
                    title={resizeLabel}
                    aria-label={resizeLabel}
                    className="touch:w-44 absolute top-0 right-0 h-full w-6 cursor-ew-resize touch-none"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        onPress(e, "resize");
                    }}
                />
            )}
        </div>
    );
}

/** The folded lane: how many hold each thing, slice by slice, and a mark on every cue. */
function Summary({
    lane,
    xOf,
    picked,
    pick,
}: {
    lane: LaneData;
    xOf: (count: number) => number;
    picked: number | null;
    pick: (cueId: number | null) => void;
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
                <button
                    key={mark.cueId}
                    type="button"
                    data-testid="equipment-lane-mark"
                    data-cue-id={mark.cueId}
                    aria-label={String(mark.cueId)}
                    className={clsx(
                        "absolute top-0 size-8 -translate-x-1/2 rotate-45",
                        FILL[mark.holds],
                        mark.cueId === picked && "ring-accent ring-2",
                    )}
                    style={{ left: xOf(mark.count) }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        pick(mark.cueId);
                    }}
                />
            ))}
        </div>
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
    const item = (id: ActionId, args?: Record<string, number>) => (
        <DropdownMenu.Item
            key={`${id}${args ? JSON.stringify(args) : ""}`}
            data-testid={`cue-menu-${id}`}
            disabled={!isActionEnabled(id)}
            onSelect={() => runAction(id, args)}
            className={MENU_ITEM_CLASS}
        >
            {label(id)}
        </DropdownMenu.Item>
    );
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
                    {item("cueMakeLasting")}
                    <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                        {label("cueMakeMomentary")}
                    </DropdownMenu.Label>
                    {MOMENTARY_LENGTHS.map((length) => (
                        <DropdownMenu.Item
                            key={length}
                            data-testid={`cue-menu-momentary-${length}`}
                            disabled={
                                !isActionEnabled("cueMakeMomentary") ||
                                cue?.length === length
                            }
                            onSelect={() =>
                                runAction("cueMakeMomentary", { length })
                            }
                            className={MENU_ITEM_CLASS}
                        >
                            {t("cues.lane.forCounts", { count: length })}
                        </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
                    {item("cueDelete")}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

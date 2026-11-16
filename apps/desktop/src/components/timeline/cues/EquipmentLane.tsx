/**
 * The timeline's Equipment lane (ADR 0015 D-7; fork #991 option E, #992): under the drill rows,
 * hidden until shown. One row per group of performers with the same Equipment history (a cue for
 * the whole guard is one row of bars), folding into a stacked summary of how many hold each thing.
 *
 * - A lasting cue is a bar to the performer's next cue, a momentary one a rounded pill; the
 *   section's usual (not a cue) is a dashed bar.
 * - Click a cue to pick it: the cue commands (Add selected to this cue, Remove selected from this
 *   cue, lasting or momentary, Delete cue) act on it. Right-click or long-press a cue for its menu.
 * - Click a row's name to select its performers.
 * - Presses stay in the lane: the timeline under it doesn't scrub or select.
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
    FlagPennantIcon,
} from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
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
    MENU_ITEM_CLASS,
    MENU_LABEL_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { createTimelineBeatAxis } from "@/timeline/timelineViewModel";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { runAction, isActionEnabled } from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import ActionButton from "@/shortcuts/ActionButton";
import { useShowCues, type EditorCues } from "@/cues/useShowCues";
import { useCueSelectionStore } from "@/cues/cueSelectionStore";
import { describePerformers } from "@/cues/cueLabel";
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

/** Each thing held, as a lane color. */
const FILL: Readonly<Record<PerformerCarry, string>> = {
    flag: "bg-accent/60",
    rifle: "bg-yellow/70",
    sabre: "bg-green/70",
    winds: "bg-text/20",
    battery: "bg-text/20",
    none: "bg-red/40",
};

/** How long a finger holds still on a cue to open its menu. */
const LONG_PRESS_MS = 500;
/** How far a finger may drift during a long press. */
const LONG_PRESS_SLOP = 10;

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
 * The Equipment lane as the timeline's `lanes`, or undefined while it's hidden (the
 * `toggleEquipmentLane` action, saved in the UI settings).
 */
export function useEquipmentLaneBand(): TimelineBand | undefined {
    const shown = useUiSettingsStore((s) => s.uiSettings.timelineEquipmentLane);
    const folded = useUiSettingsStore(
        (s) => s.uiSettings.timelineEquipmentLaneFolded,
    );
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
        if (!shown || !beats) return undefined;
        return {
            height: equipmentLaneHeight(lane, folded),
            render: (geometry) => (
                <EquipmentLaneView
                    geometry={geometry}
                    lane={lane}
                    show={show}
                    beats={beats}
                    folded={folded}
                />
            ),
        };
    }, [shown, folded, lane, show, beats]);
}

const setFolded = (folded: boolean) => {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({ ...uiSettings, timelineEquipmentLaneFolded: folded });
};

type CueMenu = { x: number; y: number; cueId: number };

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
    const picked = useCueSelectionStore((s) => s.cueId);
    const pick = useCueSelectionStore((s) => s.pick);
    const [menu, setMenu] = useState<CueMenu | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const xOf = useMemo(() => {
        const axis = createTimelineBeatAxis(beats);
        const specOf = new Map(beats.map((b, i) => [b.id, i]));
        const ids = show?.beatIds ?? [];
        return (count: number) =>
            axis.toView(countToSpecBeat(count, ids, specOf)) *
            geometry.pixelsPerBeat;
    }, [beats, show, geometry.pixelsPerBeat]);
    const rows = lane?.rows ?? [];
    const valueName = (holds: PerformerCarry) => t(`cues.value.${holds}`);
    const rowName = (ids: readonly number[], label: string | null) =>
        label ??
        describePerformers({
            ids,
            marchers: show?.marchers ?? [],
            words: {
                holding: (c) => t(`cues.label.holding.${c}`),
                performers: (n) => t("cues.label.performers", { count: n }),
            },
        });

    const openMenu = (cueId: number, clientX: number, clientY: number) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        pick(cueId);
        setMenu({ x: clientX - rect.left, y: clientY - rect.top, cueId });
    };

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
                className="text-micro text-text-subtitle sticky left-0 z-10 flex w-fit items-center gap-4 px-4"
                style={{ height: HEADER }}
            >
                <button
                    type="button"
                    data-testid="equipment-lane-fold"
                    aria-label={t(
                        folded ? "cues.lane.unfold" : "cues.lane.fold",
                    )}
                    aria-expanded={!folded}
                    className="hover:text-text touch:size-44 flex size-16 items-center justify-center rounded-full"
                    onClick={() => setFolded(!folded)}
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
                    aria-label={t("actions.cues.hideEquipmentLane")}
                    title={t("actions.cues.hideEquipmentLane")}
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
                        {row.pieces.map((piece) => (
                            <Piece
                                key={`${piece.from}-${piece.cueId ?? "d"}`}
                                piece={piece}
                                left={xOf(piece.from)}
                                width={xOf(piece.to) - xOf(piece.from)}
                                name={valueName(piece.holds)}
                                picked={
                                    piece.cueId !== null &&
                                    piece.cueId === picked
                                }
                                onPick={() => pick(piece.cueId)}
                                onMenu={(x, y) =>
                                    piece.cueId !== null &&
                                    openMenu(piece.cueId, x, y)
                                }
                            />
                        ))}
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

/** One piece of a row: a cue's bar or pill, or the dashed default. */
function Piece({
    piece,
    left,
    width,
    name,
    picked,
    onPick,
    onMenu,
}: {
    piece: LanePiece;
    left: number;
    width: number;
    name: string;
    picked: boolean;
    onPick: () => void;
    onMenu: (clientX: number, clientY: number) => void;
}) {
    const press = useRef<{
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
    } | null>(null);
    const isCue = piece.cueId !== null;
    const end = () => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
    };
    const onPointerDown = (e: ReactPointerEvent) => {
        e.stopPropagation();
        if (!isCue) return;
        if (e.button === 0) onPick();
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
    };
    return (
        <div
            data-testid={
                isCue ? "equipment-lane-cue" : "equipment-lane-default"
            }
            data-cue-id={piece.cueId ?? undefined}
            data-holds={piece.holds}
            className={clsx(
                "text-micro absolute top-2 flex items-center overflow-hidden px-4 leading-none whitespace-nowrap",
                piece.kind === "momentary" ? "rounded-full" : "rounded-4",
                isCue
                    ? clsx(FILL[piece.holds], "text-text font-medium")
                    : "border-stroke text-text-subtitle border border-dashed",
                picked && "ring-accent ring-2",
            )}
            style={{
                left,
                width: Math.max(width - 1, 4),
                height: ROW - 4,
            }}
            onPointerDown={onPointerDown}
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
                if (isCue) onMenu(e.clientX, e.clientY);
            }}
        >
            <span>{name}</span>
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

/**
 * The transport's Equipment lane button: shows or hides the lane (`toggleEquipmentLane`), lit
 * while it shows.
 */
export function EquipmentLaneButton() {
    const shown = useUiSettingsStore((s) => s.uiSettings.timelineEquipmentLane);
    const { t } = useTranslate();
    return (
        <ActionButton
            action="toggleEquipmentLane"
            toggleState={shown ? "off" : "on"}
            caption={t("cues.lane.equipment")}
            data-testid="timeline-equipment-lane"
            aria-pressed={shown}
            onMouseDown={(event) => event.preventDefault()}
            className={clsx(
                "rounded-4 enabled:hover:bg-fg-2 focus-visible:ring-accent touch:size-44 flex size-24 items-center justify-center outline-hidden duration-150 ease-out focus-visible:ring-2",
                shown
                    ? "text-accent bg-accent/10"
                    : "text-text enabled:hover:text-accent",
            )}
        >
            <FlagPennantIcon size={16} weight={shown ? "fill" : "regular"} />
        </ActionButton>
    );
}

/**
 * The compact touch transport (tablet 3.5, #888): the timeline's header row in the touch layout.
 * Previous page, Play and Next page and the readout always show, then the zoom's ± and a "…"
 * holding the rest of the desktop row and its modifier clicks: stepping by a count or to the
 * show's ends, Loop, speed, sound, Fit, Edit music, and adding a page or subset at the playhead.
 * A long press on Play opens its variants (plan decision 6): Play on, Play from here, and Pause
 * while playing (`touchPlayVariants`).
 *
 * Every control runs a registered action (`ActionButton`/`runAction`), the one the desktop row's
 * click or key runs, so nothing here behaves differently from the mouse layout. Speed and Sound
 * are the desktop row's own buttons, at a finger's size; a tap on Speed opens its popover.
 */
import {
    type ReactNode,
    useCallback,
    useState,
    useSyncExternalStore,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import {
    ArrowLineLeftIcon,
    ArrowLineRightIcon,
    ArrowsOutLineHorizontalIcon,
    CaretLeftIcon,
    CaretRightIcon,
    DotsThreeIcon,
    MusicNotesIcon,
    PlayIcon,
    PlusIcon,
    PlusSquareIcon,
    RepeatIcon,
    SkipBackIcon,
    SkipForwardIcon,
    StopIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { useTranslate } from "@tolgee/react";
import { useLongPress } from "@openmarch/ui";
import ActionButton from "@/shortcuts/ActionButton";
import type { ActionId } from "@/shortcuts/definitions";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useIsPreviewMode } from "@/stores/PreviewModeStore";
import { useTempoModeStore } from "@/tempo/tempoModeStore";
import {
    MENU_BUTTON_CLASS,
    MENU_CONTENT_CLASS,
    POPOVER_CLASS,
} from "@/components/ui/popupClasses";
import {
    TimelineCompactButton,
    TimelineSoundButton,
    TimelineSpeedButton,
} from "./TimelineControls";
import { TimelineTouchZoom } from "./TimelineTouchZoom";
import { playGuideRows, playOnlyGuide } from "./TransportButtons";
import { touchPlayVariants } from "./touchPlayMenu";
import { START_INK } from "./startFlagInk";

/** A finger-sized button in the row */
const ROW_BUTTON_CLASS =
    "rounded-4 text-text flex size-44 shrink-0 touch-none items-center justify-center select-none enabled:active:bg-fg-2 aria-pressed:text-accent";

/** One of the "…" panel's buttons: the icon over its caption */
const CELL_CLASS =
    "rounded-4 text-text flex min-h-56 min-w-0 flex-col items-center justify-center gap-4 px-2 py-4 touch-none select-none enabled:active:bg-fg-2 aria-pressed:text-accent [&_[data-touch-caption]]:text-center [&_[data-touch-caption]]:leading-tight [&_[data-touch-caption]]:whitespace-normal";
// (A caption wraps under its icon when a translation is longer than the cell)

export function TimelineTouchTransport({
    isPlaying,
    playLoops,
    playsOn,
    fromPlayhead,
    playOnly,
    clock,
    readout,
    canFit,
    fitted,
}: {
    isPlaying: boolean;
    playLoops: boolean;
    /** The desktop Play's Alt+click plays on (Expert, UI-26) */
    playsOn: boolean;
    /** The desktop Play's Shift+click plays from the playhead, or pauses while playing */
    fromPlayhead: boolean;
    /** Tempo mode: Play's one action, as its tooltip names it */
    playOnly?: string;
    /** The playback clock, beside the readout as on desktop */
    clock?: ReactNode;
    /** The readout, which is also the go-to box */
    readout: ReactNode;
    /** The timeline owns its zoom, so ± and Fit work */
    canFit: boolean;
    fitted: boolean;
}) {
    const { t } = useTranslate();
    return (
        <div
            role="group"
            aria-label={t("timeline.transport.label")}
            data-testid="timeline-transport"
            data-touch-transport=""
            // Room at the end for the Inspector's edge tab (`InspectorDock`), whose finger-sized hit
            // area reaches over the timeline's right edge and would otherwise cover the "…"
            className="border-stroke flex h-52 min-w-0 shrink-0 items-center gap-4 border-b pr-40 pl-4"
        >
            <div className="flex shrink-0 items-center gap-2">
                <ActionButton
                    action="previousPage"
                    data-testid="timeline-previous"
                    className={ROW_BUTTON_CLASS}
                >
                    <SkipBackIcon size={20} />
                </ActionButton>
                <TouchPlayButton
                    isPlaying={isPlaying}
                    playLoops={playLoops}
                    playsOn={playsOn}
                    fromPlayhead={fromPlayhead}
                    playOnly={playOnly}
                />
                <ActionButton
                    action="nextPage"
                    data-testid="timeline-next"
                    className={ROW_BUTTON_CLASS}
                >
                    <SkipForwardIcon size={20} />
                </ActionButton>
            </div>
            <span aria-hidden="true" className="bg-stroke h-24 w-px shrink-0" />
            <div className="text-text-subtitle flex min-w-0 flex-1 items-center gap-8">
                {clock}
                {readout}
            </div>
            {canFit && <TimelineTouchZoom inline />}
            <TouchTransportMore canFit={canFit} fitted={fitted} />
        </div>
    );
}

/** Whether each of the Play menu's actions can run now, as one string so it re-renders on change */
const useEnabledActions = (actions: readonly ActionId[]) =>
    useSyncExternalStore(subscribeToActionHandlers, () =>
        actions.map((a) => (isActionEnabled(a) ? "1" : "0")).join(""),
    );

/**
 * Play, or Stop while playing: a tap runs Space's action. A long press opens the variants the
 * desktop Play gets from Alt and Shift (`touchPlayVariants`), named as its tooltip's guide names
 * them; where there are none (tempo mode, Preview) a long press does nothing more than a tap.
 */
function TouchPlayButton({
    isPlaying,
    playLoops,
    playsOn,
    fromPlayhead,
    playOnly,
}: {
    isPlaying: boolean;
    playLoops: boolean;
    playsOn: boolean;
    fromPlayhead: boolean;
    playOnly?: string;
}) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const variants = touchPlayVariants({
        isPlaying,
        playsOn,
        fromPlayhead,
        playOnly: playOnly !== undefined,
    });
    const guide = playGuideRows(isPlaying, playLoops, playsOn, t);
    const enabled = useEnabledActions([
        "playPause",
        ...variants.map((v) => v.action),
    ]);
    const canPlay = enabled[0] === "1";
    const hasMenu = variants.length > 0;
    const longPress = useLongPress(useCallback(() => setOpen(true), []));
    // Tempo mode's one Play names what it does now ("Stop here" while playing), as on desktop
    const label = (
        playOnly !== undefined ? playOnlyGuide(playOnly, isPlaying) : guide
    ).find((row) => row.mode === "play")?.label;
    return (
        <Popover.Root open={open && hasMenu} onOpenChange={setOpen}>
            <Popover.Anchor asChild>
                <button
                    type="button"
                    data-testid="timeline-play"
                    aria-label={label}
                    aria-pressed={isPlaying}
                    aria-haspopup={hasMenu ? "menu" : undefined}
                    aria-expanded={hasMenu ? open : undefined}
                    disabled={!canPlay}
                    // Only with a menu to open: a long press with nothing to show (tempo mode,
                    // Preview) would otherwise eat the tap that follows it
                    data-own-long-press={hasMenu || undefined}
                    {...(hasMenu ? longPress : {})}
                    onClick={() => runAction("playPause")}
                    className={clsx(
                        ROW_BUTTON_CLASS,
                        "touch:[-webkit-touch-callout:none] disabled:opacity-30",
                    )}
                >
                    {isPlaying ? (
                        <StopIcon size={20} weight="fill" />
                    ) : (
                        <PlayIcon size={20} weight="fill" />
                    )}
                </button>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    role="menu"
                    aria-label={t("timeline.touchTransport.playMenu")}
                    data-testid="timeline-play-menu"
                    // Focus stays off the menu, so a keyboard's Space still plays
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    // The finger lifting off Play focuses it, which isn't leaving the menu; a press
                    // outside still closes it
                    onFocusOutside={(event) => event.preventDefault()}
                    // Over the field's touch pill, which sits right above the row
                    className={twMerge(MENU_CONTENT_CLASS, "z-[100] min-w-256")}
                >
                    {variants.map((variant, index) => {
                        const row = guide.find((r) => r.mode === variant.mode);
                        if (!row) return null;
                        return (
                            <button
                                key={variant.action}
                                type="button"
                                role="menuitem"
                                data-testid={`timeline-play-menu-${variant.action}`}
                                aria-label={row.label}
                                disabled={enabled[index + 1] !== "1"}
                                onClick={() => {
                                    setOpen(false);
                                    runAction(variant.action);
                                }}
                                className={clsx(
                                    MENU_BUTTON_CLASS,
                                    "touch:min-h-44",
                                )}
                            >
                                <span aria-hidden="true" className="flex">
                                    {row.icon}
                                </span>
                                <span className="flex items-center gap-4">
                                    {row.content ?? row.label}
                                </span>
                            </button>
                        );
                    })}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** A heading over a group of the "…" panel's buttons */
function MoreGroup({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-col gap-4">
            <span className="text-sub text-text-subtitle px-4">{label}</span>
            <div className="grid grid-cols-4 gap-4">{children}</div>
        </div>
    );
}

/** A control that isn't an `ActionButton` (Speed, Sound), with a caption under it */
function MoreCell({
    caption,
    children,
}: {
    caption: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-h-56 min-w-0 flex-col items-center justify-center gap-4">
            {children}
            <span aria-hidden className="text-sub text-center leading-tight">
                {caption}
            </span>
        </div>
    );
}

/**
 * The "…": what the desktop row shows beside Play and its modifier clicks reach. The groups:
 * Go to (the show's start, a count back or on, its end), Playback (Loop, speed, sound), View
 * (Fit, Edit music) and At the playhead (a new page or subset). Each shows where the desktop row
 * has it: no Loop in Basic or tempo mode, nothing to add or edit in Preview or tempo mode.
 */
function TouchTransportMore({
    canFit,
    fitted,
}: {
    canFit: boolean;
    fitted: boolean;
}) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const basic = useIsBasicMode();
    const preview = useIsPreviewMode();
    const tempoMode = useTempoModeStore((s) => s.on);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const looping = useTimelineSelectionStore(
        (s) => s.loop !== null || s.isolation !== null,
    );
    const editing = !preview && !tempoMode;
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    data-testid="timeline-touch-more"
                    aria-label={t("timeline.transport.more")}
                    className={ROW_BUTTON_CLASS}
                >
                    <DotsThreeIcon size={24} weight="bold" />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                    data-testid="timeline-touch-more-panel"
                    aria-label={t("timeline.transport.more")}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    className={clsx(
                        POPOVER_CLASS,
                        // Scrolls on a short screen (a phone-sized window, a tablet with its
                        // keyboard up) rather than running off it
                        "z-[100] flex max-h-[var(--radix-popover-content-available-height)] w-[min(352px,calc(100vw-16px))] flex-col gap-8 overflow-y-auto overscroll-contain",
                    )}
                >
                    <MoreGroup label={t("timeline.touchTransport.goTo")}>
                        <ActionButton
                            action="firstPage"
                            caption={t("timeline.touchTransport.start")}
                            data-testid="timeline-touch-first"
                            className={CELL_CLASS}
                        >
                            <ArrowLineLeftIcon size={20} />
                        </ActionButton>
                        <ActionButton
                            action="previousBeat"
                            caption={t("timeline.touchTransport.countBack")}
                            data-testid="timeline-touch-previous-beat"
                            className={CELL_CLASS}
                        >
                            <CaretLeftIcon size={20} weight="bold" />
                        </ActionButton>
                        <ActionButton
                            action="nextBeat"
                            caption={t("timeline.touchTransport.countOn")}
                            data-testid="timeline-touch-next-beat"
                            className={CELL_CLASS}
                        >
                            <CaretRightIcon size={20} weight="bold" />
                        </ActionButton>
                        <ActionButton
                            action="lastPage"
                            caption={t("timeline.touchTransport.end")}
                            data-testid="timeline-touch-last"
                            className={CELL_CLASS}
                        >
                            <ArrowLineRightIcon size={20} />
                        </ActionButton>
                    </MoreGroup>
                    <MoreGroup label={t("timeline.touchTransport.playback")}>
                        {!basic && !tempoMode && !preview && (
                            <ActionButton
                                action="toggleLoop"
                                caption={t("timeline.loop.label")}
                                tooltip={
                                    isolated
                                        ? t("timeline.loop.hintIsolated")
                                        : undefined
                                }
                                data-testid="timeline-touch-loop"
                                aria-pressed={looping}
                                // An isolated move always loops (UI-17), as the desktop Loop says
                                disabled={isolated}
                                className={clsx(
                                    CELL_CLASS,
                                    looping && START_INK.text,
                                )}
                            >
                                <RepeatIcon
                                    size={20}
                                    weight={looping ? "bold" : "regular"}
                                />
                            </ActionButton>
                        )}
                        <MoreCell caption={t("timeline.touchTransport.speed")}>
                            <TimelineSpeedButton />
                        </MoreCell>
                        <MoreCell caption={t("timeline.touchTransport.sound")}>
                            <TimelineSoundButton />
                        </MoreCell>
                    </MoreGroup>
                    {(canFit || !preview) && (
                        <MoreGroup label={t("timeline.touchTransport.view")}>
                            {canFit && (
                                <ActionButton
                                    action="timelineFit"
                                    caption={t("timeline.touchTransport.fit")}
                                    data-testid="timeline-touch-fit"
                                    aria-pressed={fitted}
                                    className={CELL_CLASS}
                                >
                                    <ArrowsOutLineHorizontalIcon size={20} />
                                </ActionButton>
                            )}
                            {!preview && (
                                <ActionButton
                                    action="toggleTempoMode"
                                    caption={t("tempoMode.button.text")}
                                    data-testid="timeline-touch-tempo-mode"
                                    aria-pressed={tempoMode}
                                    onRun={close}
                                    className={CELL_CLASS}
                                >
                                    <MusicNotesIcon
                                        size={20}
                                        weight={tempoMode ? "bold" : "regular"}
                                    />
                                </ActionButton>
                            )}
                            {/* Expert's Compact (UI-12), as the desktop row's view controls have it */}
                            {editing && !basic && (
                                <MoreCell
                                    caption={t(
                                        "timeline.touchTransport.compact",
                                    )}
                                >
                                    <TimelineCompactButton />
                                </MoreCell>
                            )}
                        </MoreGroup>
                    )}
                    {editing && (
                        <MoreGroup
                            label={t("timeline.touchTransport.atPlayhead")}
                        >
                            <ActionButton
                                action="timelineCreatePageAtPlayhead"
                                caption={t("timeline.touchTransport.newPage")}
                                data-testid="timeline-touch-add-page"
                                onRun={close}
                                className={CELL_CLASS}
                            >
                                <PlusIcon size={20} weight="bold" />
                            </ActionButton>
                            <ActionButton
                                action="timelineCreateSubsetAtPlayhead"
                                caption={t("timeline.touchTransport.newSubset")}
                                data-testid="timeline-touch-add-subset"
                                onRun={close}
                                className={CELL_CLASS}
                            >
                                <PlusSquareIcon size={20} />
                            </ActionButton>
                        </MoreGroup>
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

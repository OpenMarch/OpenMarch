// cspell:ignore priya
/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): tempo mode's header row: Fit, Tap, the
 * metronome, snapping, the status line and Done.
 */
import clsx from "clsx";
import {
    CheckIcon,
    HandTapIcon,
    MagicWandIcon,
    MagnetIcon,
    GaugeIcon,
    MetronomeIcon,
    PushPinSlashIcon,
    TimerIcon,
} from "@phosphor-icons/react";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { getActionShortcutKeys } from "@/shortcuts/labels";
import { readTapCheck } from "./TapCheck";
import { useTempoModeStore } from "./tempoModeStore";
import { TempoHelp } from "./TempoHelp";
import { useTempoUi } from "./tempoUi";

/** A tool button in tempo mode's header, lit when `on` (its colors are either/or, not overrides) */
export const toolButton = (on = false, iconOnly = false) =>
    clsx(
        "pointer-events-auto rounded-6 bg-fg-1 hover:border-accent focus-visible:ring-accent flex h-22 shrink-0 items-center gap-4 border text-[11px] whitespace-nowrap outline-hidden focus-visible:ring-2 disabled:opacity-50",
        iconOnly ? "px-4" : "px-8",
        on ? "border-accent text-accent" : "border-stroke text-text",
    );

/**
 * Tempo mode's header row: the mode's name, its tools, a line of status, help and Done. Narrow, the
 * tools drop their words for their icons (the full name is the tooltip) and the status shortens.
 */
export function TempoToolbar(props: {
    status: string | null;
    busy: boolean;
    tapping: boolean;
    draftCount: number;
    range: { from: number; to: number } | null;
    /** The selection in measures ("m. 11–12") */
    rangeText: string | null;
    lockCount: number;
    onFit: () => void;
    onTap: () => void;
    onCheckTapping: () => void;
    onApplyDraft: () => void;
    onDiscardDraft: () => void;
    onClearPins: () => void;
}) {
    const ui = useTempoUi();
    const click = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleClick = useMetronomeStore((s) => s.toggleMetronome);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const metronomeKey = getActionShortcutKeys("toggleMetronome", {
        overrides,
    })?.join(" + ");
    const fitName = props.range
        ? `Fit to the music: ${props.rangeText}`
        : "Fit to the music";
    return (
        // A tooltip closes as soon as the pointer leaves its button or presses it, so none stays
        // up over a menu or the help card opened next (dana, priya)
        <TransportTooltipProvider disableHoverableContent>
            <div
                className="@container flex min-w-0 flex-1 items-center gap-6 px-8"
                // In a portal: the band's own pointer handling mustn't see these
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
            >
                <span className="text-accent flex shrink-0 items-center gap-4 text-[12px] font-bold whitespace-nowrap">
                    <GaugeIcon size={14} weight="bold" aria-hidden />
                    <span className="@max-[640px]:hidden">Tempo mode</span>
                </span>
                <span className="bg-stroke h-16 w-px shrink-0" aria-hidden />
                {props.draftCount > 0 ? (
                    <>
                        <span
                            className="min-w-0 truncate text-[11px]"
                            title="Click a tap in the music to drop it"
                        >
                            {props.draftCount} taps to check
                            <span className="text-text-subtitle @max-[720px]:hidden">
                                {" "}
                                · click one to drop it
                            </span>
                        </span>
                        <ShortcutTooltip
                            closeOnPress
                            label="Apply the taps"
                            shortcut="Enter"
                        >
                            <button
                                type="button"
                                className={toolButton(true)}
                                onClick={props.onApplyDraft}
                            >
                                <CheckIcon
                                    size={12}
                                    weight="bold"
                                    aria-hidden
                                />
                                Apply
                            </button>
                        </ShortcutTooltip>
                        <ShortcutTooltip
                            closeOnPress
                            label="Discard the taps"
                            shortcut="Esc"
                        >
                            <button
                                type="button"
                                className={toolButton()}
                                onClick={props.onDiscardDraft}
                            >
                                Discard
                            </button>
                        </ShortcutTooltip>
                    </>
                ) : (
                    <>
                        <ShortcutTooltip
                            closeOnPress
                            label={fitName}
                            hint={
                                props.range
                                    ? `Lines up just the selected counts (${props.rangeText}) with the hits in the music. Counts you dragged onto the music stay where they are.`
                                    : "Lines up the counts with the hits in the music, across the whole show. To fit only some counts, drag along Measures to select them first. Counts you dragged onto the music stay where they are."
                            }
                        >
                            <button
                                type="button"
                                aria-label={fitName}
                                className={toolButton()}
                                disabled={props.busy}
                                onClick={props.onFit}
                            >
                                <MagicWandIcon size={12} aria-hidden />
                                <span className="@max-[860px]:hidden">
                                    {props.range
                                        ? `Fit ${props.rangeText}`
                                        : "Fit to the music"}
                                </span>
                            </button>
                        </ShortcutTooltip>
                        <ShortcutTooltip
                            closeOnPress
                            label={
                                props.tapping
                                    ? "Tapping: stop to review"
                                    : "Tap along"
                            }
                            shortcut="T"
                            hint={
                                props.tapping
                                    ? "Space stops to review the taps; Enter applies them"
                                    : `Plays from a measure before the playhead; taps there count too. Tap T on each count, then Space to review or Enter to apply.${readTapCheck() ? "" : " Check tapping (on the right) measures how late your taps land, so they can be moved to match."}`
                            }
                        >
                            <button
                                type="button"
                                aria-label={
                                    props.tapping ? "Stop tapping" : "Tap (T)"
                                }
                                className={toolButton(props.tapping)}
                                onClick={props.onTap}
                            >
                                <HandTapIcon size={12} aria-hidden />
                                <span className="@max-[860px]:hidden">
                                    {props.tapping ? "Stop" : "Tap"}
                                </span>
                            </button>
                        </ShortcutTooltip>
                    </>
                )}
                {/* The metronome, up front: editing tempo is listening to the counts against the
                    music (owner, 2026-11-01: not hidden in the audio menu). Its label stays on
                    narrow windows too */}
                <ShortcutTooltip
                    closeOnPress
                    label={click ? "Metronome: on" : "Metronome: off"}
                    shortcut={metronomeKey}
                    hint="A click on every count, to hear whether the counts sit on the music"
                >
                    <button
                        type="button"
                        aria-label="Metronome"
                        aria-pressed={click}
                        className={toolButton(click)}
                        onClick={toggleClick}
                    >
                        <MetronomeIcon
                            size={12}
                            weight={click ? "fill" : "regular"}
                            aria-hidden
                        />
                        <span>Metronome</span>
                    </button>
                </ShortcutTooltip>
                <ShortcutTooltip
                    closeOnPress
                    label={ui.snap ? "Snap to hits: on" : "Snap to hits: off"}
                    hint="Dragged counts and taps land on hits in the music. Hold Alt while dragging to place freely."
                >
                    <button
                        type="button"
                        aria-label="Snap to hits"
                        aria-pressed={ui.snap}
                        className={toolButton(ui.snap)}
                        onClick={() => ui.setSnap(!ui.snap)}
                    >
                        <MagnetIcon size={12} aria-hidden />
                        <span className="@max-[860px]:hidden">Snap</span>
                    </button>
                </ShortcutTooltip>
                {props.lockCount > 0 && (
                    <ShortcutTooltip
                        closeOnPress
                        label={`Unpin all ${props.lockCount} pinned counts`}
                        hint="Pinned counts stay where they are when you fit or drag"
                    >
                        <button
                            type="button"
                            aria-label={`Unpin all (${props.lockCount})`}
                            className={toolButton()}
                            onClick={props.onClearPins}
                        >
                            <PushPinSlashIcon size={12} aria-hidden />
                            <span className="@max-[860px]:hidden">
                                Unpin all
                            </span>
                            <span className="text-text-subtitle tabular-nums">
                                {props.lockCount}
                            </span>
                        </button>
                    </ShortcutTooltip>
                )}
                <span
                    className="text-text-subtitle min-w-0 flex-1 truncate text-[11px]"
                    title={props.status ?? DRAG_HINT}
                >
                    {props.status ?? DRAG_HINT}
                </span>
                <ShortcutTooltip
                    closeOnPress
                    label="Check tapping"
                    hint="Tap along to a click for 10 seconds: measures how late your taps land on this computer, and how even they are"
                >
                    <button
                        type="button"
                        aria-label="Check tapping"
                        className={toolButton()}
                        onClick={props.onCheckTapping}
                    >
                        <TimerIcon size={12} aria-hidden />
                        <span className="@max-[1100px]:hidden">
                            Check tapping
                        </span>
                    </button>
                </ShortcutTooltip>
                <TempoHelp />
                <ShortcutTooltip
                    closeOnPress
                    label="Done: leave tempo mode"
                    shortcut="Esc"
                >
                    <button
                        type="button"
                        aria-label="Done"
                        className="bg-accent text-text-invert rounded-6 focus-visible:ring-accent pointer-events-auto flex h-22 shrink-0 items-center gap-4 px-10 text-[11px] font-bold whitespace-nowrap outline-hidden hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-1"
                        onClick={() =>
                            useTempoModeStore.getState().setOn(false)
                        }
                    >
                        <CheckIcon size={12} weight="bold" aria-hidden />
                        Done
                    </button>
                </ShortcutTooltip>
            </div>
        </TransportTooltipProvider>
    );
}

/** The toolbar's line when there's nothing to report: the main gesture */
export const DRAG_HINT = "Drag a hit in the music onto its count";

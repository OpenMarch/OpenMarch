// cspell:ignore priya
/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): tempo mode's header row: Tap tempo, the
 * metronome, a hint and Done.
 */
import clsx from "clsx";
import {
    CheckIcon,
    GaugeIcon,
    MetronomeIcon,
    PushPinSlashIcon,
} from "@phosphor-icons/react";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { getActionShortcutKeys } from "@/shortcuts/labels";
import { TapTempo } from "./TapTempo";
import { useTempoModeStore } from "./tempoModeStore";
import { TempoHelp } from "./TempoHelp";

/** A tool button in tempo mode's header, lit when `on` (its colors are either/or, not overrides) */
export const toolButton = (on = false, iconOnly = false) =>
    clsx(
        "pointer-events-auto rounded-6 bg-fg-1 hover:border-accent focus-visible:ring-accent flex h-22 shrink-0 items-center gap-4 border text-[11px] whitespace-nowrap outline-hidden focus-visible:ring-2 disabled:opacity-50",
        iconOnly ? "px-4" : "px-8",
        on ? "border-accent text-accent" : "border-stroke text-text",
    );

/**
 * Tempo mode's header row: the mode's name, its tools, a hint, help and Done. Narrow, the tools
 * drop their words for their icons (the full name is the tooltip) and the hint shortens.
 */
export function TempoToolbar(props: {
    lockCount: number;
    /** What Tap tempo's "Use" sets, in words, or null */
    tapTarget: string | null;
    onUseTap: (bpm: number) => void;
    onClearPins: () => void;
}) {
    const click = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleClick = useMetronomeStore((s) => s.toggleMetronome);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const metronomeKey = getActionShortcutKeys("toggleMetronome", {
        overrides,
    })?.join(" + ");
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
                <TapTempo target={props.tapTarget} onUse={props.onUseTap} />
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
                {props.lockCount > 0 && (
                    <ShortcutTooltip
                        closeOnPress
                        label={`Unpin all ${props.lockCount} pinned counts`}
                        hint="Pinned counts stay where they are when you drag or tap"
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
                    title={DRAG_HINT}
                >
                    {DRAG_HINT}
                </span>
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

// cspell:ignore priya
/**
 * Tempo mode: tempo mode's header row: Tap tempo, the
 * metronome, Import MusicXML, help and Done.
 */
import clsx from "clsx";
import { CheckIcon, GaugeIcon, MetronomeIcon } from "@phosphor-icons/react";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import tolgee from "@/global/singletons/Tolgee";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { TapTempo } from "./TapTempo";
import { useTempoModeStore } from "./tempoModeStore";
import { TempoHelp } from "./TempoHelp";
import { TempoImportScore } from "./TempoImportScore";

/** A tool button in tempo mode's header, lit when `on` (its colors are either/or, not overrides) */
export const toolButton = (on = false, iconOnly = false) =>
    clsx(
        "pointer-events-auto rounded-6 bg-fg-1 hover:border-accent focus-visible:ring-accent flex h-22 shrink-0 items-center gap-4 border text-[11px] whitespace-nowrap outline-hidden focus-visible:ring-2 disabled:opacity-50",
        iconOnly ? "px-4" : "px-8",
        on ? "border-accent text-accent" : "border-stroke text-text",
    );

/**
 * Tempo mode's header row: the mode's name, its tools, help and Done. Narrow, the tools drop
 * their words for their icons (the full name is the tooltip).
 */
export function TempoToolbar(props: {
    /** What Tap tempo's "Use" sets, in words, or null */
    tapTarget: string | null;
    onUseTap: (bpm: number) => void;
}) {
    const click = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleClick = useMetronomeStore((s) => s.toggleMetronome);
    const metronome = tolgee.t("tempoMode.toolbar.metronome", "Metronome");
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
                    <span className="@max-[640px]:hidden">
                        {tolgee.t("tempoMode.toolbar.title", "Tempo mode")}
                    </span>
                </span>
                <span className="bg-stroke h-16 w-px shrink-0" aria-hidden />
                <TapTempo target={props.tapTarget} onUse={props.onUseTap} />
                {/* The metronome, up front: editing tempo is listening to the counts against the
                    music (owner, 2026-11-01: not hidden in the audio menu). Its label stays on
                    narrow windows too */}
                <ShortcutTooltip
                    closeOnPress
                    label={
                        click
                            ? tolgee.t(
                                  "tempoMode.toolbar.metronomeOn",
                                  "Metronome: on",
                              )
                            : tolgee.t(
                                  "tempoMode.toolbar.metronomeOff",
                                  "Metronome: off",
                              )
                    }
                    action="toggleMetronome"
                    hint={tolgee.t(
                        "tempoMode.toolbar.metronomeHint",
                        "A click on every count, to hear whether the counts sit on the music",
                    )}
                >
                    <button
                        type="button"
                        aria-label={metronome}
                        aria-pressed={click}
                        className={toolButton(click)}
                        onClick={toggleClick}
                    >
                        <MetronomeIcon
                            size={12}
                            weight={click ? "fill" : "regular"}
                            aria-hidden
                        />
                        <span>{metronome}</span>
                    </button>
                </ShortcutTooltip>
                <span className="min-w-0 flex-1" aria-hidden />
                <TempoImportScore />
                <TempoHelp />
                <ShortcutTooltip
                    closeOnPress
                    label={tolgee.t(
                        "tempoMode.toolbar.doneLabel",
                        "Done: leave tempo mode",
                    )}
                    shortcut="Esc"
                >
                    <button
                        type="button"
                        aria-label={tolgee.t("tempoMode.toolbar.done", "Done")}
                        className="bg-accent text-text-invert rounded-6 focus-visible:ring-accent pointer-events-auto flex h-22 shrink-0 items-center gap-4 px-10 text-[11px] font-bold whitespace-nowrap outline-hidden hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-1"
                        onClick={() =>
                            useTempoModeStore.getState().setOn(false)
                        }
                    >
                        <CheckIcon size={12} weight="bold" aria-hidden />
                        {tolgee.t("tempoMode.toolbar.done", "Done")}
                    </button>
                </ShortcutTooltip>
            </div>
        </TransportTooltipProvider>
    );
}

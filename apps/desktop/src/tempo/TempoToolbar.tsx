// cspell:ignore priya
/**
 * Edit music: the mode's header row: Tap tempo, the
 * music file, metronome, Import (audio or MusicXML), help and Done.
 */
import clsx from "clsx";
import { getButtonClassName } from "@openmarch/ui";
import {
    CheckIcon,
    MetronomeIcon,
    MusicNotesIcon,
} from "@phosphor-icons/react";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import tolgee from "@/global/singletons/Tolgee";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { TapTempo } from "./TapTempo";
import { useTempoModeStore } from "./tempoModeStore";
import { TempoHelp } from "./TempoHelp";
import { TempoImport } from "./TempoImport";
import { TempoMusicFile } from "./TempoMusicFile";

/**
 * A tool button in tempo mode's header: the app's compact secondary button (a pill), lit when
 * `on`. Extra classes go through `className` so they win over the button's own.
 */
export const toolButton = (on = false, iconOnly = false, className?: string) =>
    withTextBody(
        getButtonClassName({
            variant: "secondary",
            size: "compact",
            content: iconOnly ? "icon" : "text",
            className: clsx(
                "pointer-events-auto shrink-0 whitespace-nowrap enabled:hover:border-accent focus-visible:ring-accent focus-visible:ring-2",
                on && "border-accent text-accent",
                className,
            ),
        }),
    );

/**
 * Adds `text-body` after getButtonClassName's twMerge, which reads `text-body` as a text color
 * and drops it in favour of the variant's color. See docs/conventions/ui-styling.md.
 */
export const withTextBody = (className: string) => `${className} text-body`;

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
                <span className="text-accent text-body flex shrink-0 items-center gap-4 font-medium whitespace-nowrap">
                    <MusicNotesIcon size={14} weight="bold" aria-hidden />
                    <span className="@max-[640px]:hidden">
                        {tolgee.t("tempoMode.toolbar.title", "Editing music")}
                    </span>
                </span>
                <span className="bg-stroke h-16 w-px shrink-0" aria-hidden />
                {/* The music file, by the mode's name, like a document's name in a title bar */}
                <TempoMusicFile />
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
                <TempoImport />
                <TempoHelp />
                <ShortcutTooltip
                    closeOnPress
                    label={tolgee.t(
                        "tempoMode.toolbar.doneLabel",
                        "Done: stop editing music",
                    )}
                    shortcut="Esc"
                >
                    <button
                        type="button"
                        aria-label={tolgee.t("tempoMode.toolbar.done", "Done")}
                        className={withTextBody(
                            getButtonClassName({
                                variant: "primary",
                                size: "compact",
                                className:
                                    "focus-visible:ring-accent pointer-events-auto shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-offset-1",
                            }),
                        )}
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

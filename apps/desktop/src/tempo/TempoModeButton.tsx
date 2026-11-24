/**
 * Edit music: the timeline bar's "Edit music" button turns tempo mode on (Shift+T). Tempo mode is
 * the code's name; the app calls it editing the music (owner, 2026-11-04). While the mode is on the
 * bar leaves this button out: the mode's header has Done, the one way out (owner, 2026-11-24).
 * Shift+T and tempo mode's key guard are the timeline panel's (`useTempoModeKeys`), so they work
 * in the touch layout too, where this button isn't shown.
 */
import { MusicNotesIcon } from "@phosphor-icons/react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import tolgee from "@/global/singletons/Tolgee";
import { useTempoModeStore } from "./tempoModeStore";

export function TempoModeButton() {
    const setOn = useTempoModeStore((s) => s.setOn);
    return (
        <ShortcutTooltip
            label={tolgee.t("tempoMode.button.label", "Edit music")}
            shortcut="Shift + T"
            hint={tolgee.t(
                "tempoMode.button.hint",
                "The music file, and lining the counts up with it: tempo, time signatures, rehearsal marks",
            )}
        >
            <button
                type="button"
                data-testid="timeline-tempo-mode"
                aria-label={tolgee.t("tempoMode.button.label", "Edit music")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOn(true)}
                className="rounded-4 focus-visible:ring-accent hover:bg-fg-2 text-text hover:text-accent flex h-24 items-center justify-center gap-4 px-6 outline-hidden duration-150 focus-visible:ring-2"
            >
                <MusicNotesIcon size={16} />
                <span className="text-sub">
                    {tolgee.t("tempoMode.button.text", "Edit music")}
                </span>
            </button>
        </ShortcutTooltip>
    );
}

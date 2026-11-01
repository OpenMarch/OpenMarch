/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): turns tempo mode on and off (Shift+T). Lit
 * while on.
 */
import { GaugeIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useEffect } from "react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import { useTempoModeStore } from "./tempoModeStore";
import { installTempoKeyGuard } from "./tempoShortcuts";

export function TempoModeButton() {
    const on = useTempoModeStore((s) => s.on);
    const toggle = useTempoModeStore((s) => s.toggle);
    // Tempo mode leaves only navigation keys on (and its own)
    useEffect(() => installTempoKeyGuard(), []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key !== "T" && e.key !== "t") return;
            const target = e.target as HTMLElement | null;
            if (target?.closest("input, textarea, [contenteditable=true]"))
                return;
            e.preventDefault();
            useTempoModeStore.getState().toggle();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    return (
        <ShortcutTooltip
            label={on ? "Tempo mode: on" : "Tempo mode"}
            shortcut="Shift + T"
            hint={
                on
                    ? "Line the counts up with the music. Esc or Shift + T leaves."
                    : "Line the counts up with the music: tempo, time signatures, rehearsal marks"
            }
        >
            <button
                type="button"
                data-testid="timeline-tempo-mode"
                aria-label="Tempo mode"
                aria-pressed={on}
                onMouseDown={(event) => event.preventDefault()}
                onClick={toggle}
                className={clsx(
                    "rounded-4 focus-visible:ring-accent hover:bg-fg-2 flex h-24 items-center justify-center gap-4 px-6 outline-hidden duration-150 focus-visible:ring-2",
                    on ? "text-accent bg-fg-2" : "text-text hover:text-accent",
                )}
            >
                <GaugeIcon size={16} weight={on ? "bold" : "regular"} />
                <span className="text-[11px]">Tempo</span>
            </button>
        </ShortcutTooltip>
    );
}

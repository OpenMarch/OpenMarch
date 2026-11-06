/**
 * Edit music: the timeline bar's "Edit music" button turns tempo mode on and off (Shift+T). Lit
 * while on. Tempo mode is the code's name; the app calls it editing the music (owner, 2026-11-04).
 */
import { MusicNotesIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useEffect } from "react";
import { T } from "@tolgee/react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import Shortcut from "@/components/ui/Shortcut";
import tolgee from "@/global/singletons/Tolgee";
import { useTempoModeStore } from "./tempoModeStore";
import { dialogHasKeys, installTempoKeyGuard } from "./tempoShortcuts";

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
            // not behind a dialog, nor from a held key flicking it on and off
            if (dialogHasKeys(target)) return;
            e.preventDefault();
            if (e.repeat) return;
            useTempoModeStore.getState().toggle();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    return (
        <ShortcutTooltip
            label={
                on
                    ? tolgee.t("tempoMode.button.labelOn", "Editing music")
                    : tolgee.t("tempoMode.button.label", "Edit music")
            }
            shortcut="Shift + T"
            hint={
                on ? (
                    <span className="text-text-subtitle text-sub block">
                        <T
                            keyName="tempoMode.button.hintOn"
                            defaultValue="Line the counts up with the music. <escape></escape> or <toggle></toggle> leaves."
                            params={{
                                escape: () => <Shortcut binding="Escape" />,
                                toggle: () => <Shortcut binding="Shift + T" />,
                            }}
                        />
                    </span>
                ) : (
                    tolgee.t(
                        "tempoMode.button.hint",
                        "The music file, and lining the counts up with it: tempo, time signatures, rehearsal marks",
                    )
                )
            }
        >
            <button
                type="button"
                data-testid="timeline-tempo-mode"
                aria-label={tolgee.t("tempoMode.button.label", "Edit music")}
                aria-pressed={on}
                onMouseDown={(event) => event.preventDefault()}
                onClick={toggle}
                className={clsx(
                    "rounded-4 focus-visible:ring-accent hover:bg-fg-2 flex h-24 items-center justify-center gap-4 px-6 outline-hidden duration-150 focus-visible:ring-2",
                    on ? "text-accent bg-fg-2" : "text-text hover:text-accent",
                )}
            >
                <MusicNotesIcon size={16} weight={on ? "bold" : "regular"} />
                <span className="text-sub">
                    {tolgee.t("tempoMode.button.text", "Edit music")}
                </span>
            </button>
        </ShortcutTooltip>
    );
}

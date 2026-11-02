/**
 * PROTOTYPE (tempo mode, branch tempo/tap-widget): the Tap tempo button in tempo mode's header and
 * its panel. Tap along to music you know to see roughly what tempo it is (owner, 2026-11-01). It
 * only measures; the one button that edits, setting that tempo on the selected counts or the
 * stretch under the playhead, is set apart below a rule and says what it changes.
 */
import * as Popover from "@radix-ui/react-popover";
import { HandTapIcon } from "@phosphor-icons/react";
import {
    Keycaps,
    ShortcutTooltip,
} from "@/components/timeline/ShortcutTooltip";
import { tapBpm } from "./tapTempo";
import { toolButton } from "./TempoToolbar";
import { useTempoUi } from "./tempoUi";

export function TapTempo(props: {
    /** The counts "Set" changes, in words ("m. 3–12"), or null when there's nowhere to put it */
    target: string | null;
    onUse: (bpm: number) => void;
}) {
    const open = useTempoUi((s) => s.tapOpen);
    const taps = useTempoUi((s) => s.tapTimes);
    const setOpen = useTempoUi((s) => s.setTapOpen);
    const tap = useTempoUi((s) => s.tap);
    const reset = useTempoUi((s) => s.resetTaps);
    const bpm = tapBpm(taps);
    const rounded = bpm === null ? null : Math.round(bpm);
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <ShortcutTooltip
                closeOnPress
                label="Tap tempo"
                shortcut="T"
                hint="Tap along to measure a tempo. It only measures: nothing in the show changes."
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label="Tap tempo"
                        className={toolButton(open)}
                    >
                        <HandTapIcon size={12} aria-hidden />
                        <span className="@max-[860px]:hidden">Tap tempo</span>
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    data-testid="tap-tempo"
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-[100] flex w-[240px] flex-col gap-8 border px-12 py-10 backdrop-blur-md"
                    onPointerDown={(e) => e.stopPropagation()}
                    // the T key taps; focus stays where it was so Space still plays
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="flex items-center justify-between gap-6">
                        <span className="text-[12px] font-bold">Tap tempo</span>
                        {/* It measures, it doesn't edit: said up front (owner, 2026-11-01) */}
                        <span
                            data-testid="tap-tempo-measuring"
                            className="border-stroke text-text-subtitle rounded-full border px-6 text-[10px] leading-[16px] whitespace-nowrap"
                        >
                            Measuring only
                        </span>
                    </div>
                    <div
                        data-testid="tap-tempo-bpm"
                        className="text-center text-[28px] leading-[32px] font-bold tabular-nums"
                    >
                        {rounded === null ? "♩ –" : `♩${rounded}`}
                    </div>
                    <div className="text-text-subtitle -mt-4 text-center text-[11px]">
                        {bpm === null ? (
                            <span className="inline-flex items-center gap-4">
                                Tap <Keycaps shortcut="T" /> or the button on
                                each beat
                            </span>
                        ) : (
                            `${taps.length} taps · average ${bpm.toFixed(1)} · starts over after 2 s`
                        )}
                    </div>
                    <div className="flex gap-6">
                        <button
                            type="button"
                            aria-label="Tap"
                            className="border-accent text-accent hover:bg-accent/10 rounded-6 h-40 flex-1 border text-[12px] font-medium select-none"
                            // on press, not on release: a click lands later than the beat it's for
                            onPointerDown={(e) => {
                                e.preventDefault();
                                tap(performance.now());
                            }}
                        >
                            Tap
                        </button>
                        <button
                            type="button"
                            className={`${toolButton()} h-40 self-stretch`}
                            disabled={taps.length === 0}
                            onClick={reset}
                        >
                            Reset
                        </button>
                    </div>
                    {/* The only thing here that edits the show, set apart below a rule */}
                    <div className="border-stroke -mx-12 flex flex-col gap-6 border-t px-12 pt-8">
                        <span className="text-text-subtitle text-[11px]">
                            Nothing in the show changes until you set it:
                        </span>
                        <ShortcutTooltip
                            closeOnPress
                            label="Set the tempo"
                            hint="Edits the show: a steady tempo on the selected counts, or else on the tempo stretch under the playhead. Undo puts it back."
                        >
                            <button
                                type="button"
                                data-testid="tap-tempo-use"
                                className={`${toolButton()} justify-center`}
                                disabled={rounded === null || !props.target}
                                onClick={() => {
                                    if (rounded !== null) props.onUse(rounded);
                                }}
                            >
                                {props.target
                                    ? `Set ${props.target} to ♩${rounded ?? "–"}`
                                    : "Select counts to set their tempo"}
                            </button>
                        </ShortcutTooltip>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

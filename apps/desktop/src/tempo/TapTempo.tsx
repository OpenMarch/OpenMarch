/**
 * PROTOTYPE (tempo mode, branch tempo/tap-widget): the Tap tempo button in tempo mode's header and
 * its panel. Tap along to music you know to see roughly what tempo it is (owner, 2026-11-01), then
 * put that tempo on the selected counts or the stretch under the playhead.
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
    /** The counts "Use" sets, in words ("m. 3–12"), or null when there's nowhere to put it */
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
                hint="Tap along to find roughly what tempo the music is"
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
                    <div className="flex items-baseline justify-between">
                        <span className="text-[12px] font-bold">Tap tempo</span>
                        <span className="text-text-subtitle text-[11px]">
                            {taps.length === 0
                                ? ""
                                : `${taps.length} tap${taps.length === 1 ? "" : "s"}`}
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
                            `Average ${bpm.toFixed(1)} · starts over after 2 s`
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Tap"
                        className="border-accent text-accent hover:bg-accent/10 rounded-6 h-40 border text-[12px] font-medium select-none"
                        // on press, not on release: a click lands later than the beat it's for
                        onPointerDown={(e) => {
                            e.preventDefault();
                            tap(performance.now());
                        }}
                    >
                        Tap
                    </button>
                    <div className="flex gap-6">
                        <button
                            type="button"
                            className={toolButton()}
                            disabled={taps.length === 0}
                            onClick={reset}
                        >
                            Reset
                        </button>
                        <ShortcutTooltip
                            closeOnPress
                            label={
                                props.target
                                    ? `Set ${props.target} to ♩${rounded ?? "–"}`
                                    : "Select some counts first"
                            }
                            hint="A steady tempo on the selected counts, or else on the tempo stretch under the playhead"
                        >
                            <button
                                type="button"
                                data-testid="tap-tempo-use"
                                className={`${toolButton(true)} flex-1 justify-center`}
                                disabled={rounded === null || !props.target}
                                onClick={() => {
                                    if (rounded !== null) props.onUse(rounded);
                                }}
                            >
                                {rounded === null ? "Use" : `Use ♩${rounded}`}
                                {props.target && (
                                    <span className="text-text-subtitle font-normal">
                                        on {props.target}
                                    </span>
                                )}
                            </button>
                        </ShortcutTooltip>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

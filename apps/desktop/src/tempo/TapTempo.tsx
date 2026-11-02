/**
 * PROTOTYPE (tempo mode, branch tempo/tap-widget): the Tap tempo button in tempo mode's header and
 * its panel. Tap along to music you know to see roughly what tempo it is (owner, 2026-11-01), then
 * put that tempo on the selected counts or the stretch under the playhead.
 */
import * as Popover from "@radix-ui/react-popover";
import { HandTapIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import Shortcut from "@/components/ui/Shortcut";
import tolgee from "@/global/singletons/Tolgee";
import { tapBpm } from "./tapTempoMath";
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
    const name = tolgee.t("tempoMode.tap.name", "Tap tempo");
    // "Use ♩120", then the counts it goes on in a lighter span, as one sentence
    const muted = (chunk: React.ReactNode) => (
        <span className="text-text-subtitle font-normal">{chunk}</span>
    );
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <ShortcutTooltip
                closeOnPress
                label={name}
                shortcut="T"
                hint={tolgee.t(
                    "tempoMode.tap.hint",
                    "Tap along to find roughly what tempo the music is",
                )}
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={name}
                        className={toolButton(open)}
                    >
                        <HandTapIcon size={12} aria-hidden />
                        <span className="@max-[860px]:hidden">{name}</span>
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    data-testid="tap-tempo"
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-[100] flex w-[240px] flex-col gap-8 border px-12 py-10 backdrop-blur-md"
                    onPointerDown={(e) => e.stopPropagation()}
                    // the T key taps; focus stays where it was so Space still plays
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    // it stays open (above the toolbar, clear of the lanes) while counts are
                    // selected and played: the toolbar button or Esc closes it
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <div className="flex items-baseline justify-between">
                        <span className="text-[12px] font-bold">{name}</span>
                        <span className="text-text-subtitle text-[11px]">
                            {taps.length === 0
                                ? ""
                                : tolgee.t(
                                      "tempoMode.tap.count",
                                      "{count, plural, one {# tap} other {# taps}}",
                                      { count: taps.length },
                                  )}
                        </span>
                    </div>
                    <div
                        data-testid="tap-tempo-bpm"
                        className="text-center text-[28px] leading-[32px] font-bold tabular-nums"
                    >
                        {/* i18n-ignore: a quarter note and a number (or a dash), the same in every language */}
                        {rounded === null ? "♩ –" : `♩${rounded}`}
                    </div>
                    <div className="text-text-subtitle -mt-4 text-center text-[11px]">
                        {bpm === null ? (
                            <span className="inline-flex items-center gap-4">
                                <T
                                    keyName="tempoMode.tap.instructions"
                                    defaultValue="Tap <key></key> or the button on each beat"
                                    params={{
                                        key: () => <Shortcut binding="T" />,
                                    }}
                                />
                            </span>
                        ) : (
                            tolgee.t(
                                "tempoMode.tap.average",
                                "Average {bpm} · starts over after 2 s",
                                { bpm: bpm.toFixed(1) },
                            )
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label={tolgee.t("tempoMode.tap.tap", "Tap")}
                        className="border-accent text-accent hover:bg-accent/10 rounded-6 h-40 border text-[12px] font-medium select-none"
                        // on press, not on release: a click lands later than the beat it's for
                        onPointerDown={(e) => {
                            e.preventDefault();
                            tap(e.timeStamp);
                        }}
                    >
                        {tolgee.t("tempoMode.tap.tap", "Tap")}
                    </button>
                    <div className="flex gap-6">
                        <button
                            type="button"
                            className={toolButton()}
                            disabled={taps.length === 0}
                            onClick={(e) => {
                                reset();
                                // Space plays, never re-presses this
                                e.currentTarget.blur();
                            }}
                        >
                            {tolgee.t("tempoMode.tap.reset", "Reset")}
                        </button>
                        <ShortcutTooltip
                            closeOnPress
                            label={
                                props.target
                                    ? tolgee.t(
                                          "tempoMode.tap.setTarget",
                                          "Set {target} to ♩{bpm}",
                                          {
                                              target: props.target,
                                              bpm: rounded ?? "–",
                                          },
                                      )
                                    : tolgee.t(
                                          "tempoMode.tap.selectFirst",
                                          "Select some counts first",
                                      )
                            }
                            hint={tolgee.t(
                                "tempoMode.tap.useHint",
                                "A steady tempo on the selected counts, or else on the tempo stretch under the playhead",
                            )}
                        >
                            <button
                                type="button"
                                data-testid="tap-tempo-use"
                                className={`${toolButton(true)} flex-1 justify-center`}
                                disabled={rounded === null || !props.target}
                                onClick={(e) => {
                                    e.currentTarget.blur();
                                    if (rounded !== null) props.onUse(rounded);
                                }}
                            >
                                {rounded === null && !props.target ? (
                                    tolgee.t("tempoMode.tap.use", "Use")
                                ) : rounded === null ? (
                                    <T
                                        keyName="tempoMode.tap.useOn"
                                        defaultValue="Use <muted>on {target}</muted>"
                                        params={{
                                            target: props.target,
                                            muted,
                                        }}
                                    />
                                ) : !props.target ? (
                                    tolgee.t(
                                        "tempoMode.tap.useBpm",
                                        "Use ♩{bpm}",
                                        { bpm: rounded },
                                    )
                                ) : (
                                    <T
                                        keyName="tempoMode.tap.useBpmOn"
                                        defaultValue="Use ♩{bpm} <muted>on {target}</muted>"
                                        params={{
                                            bpm: rounded,
                                            target: props.target,
                                            muted,
                                        }}
                                    />
                                )}
                            </button>
                        </ShortcutTooltip>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

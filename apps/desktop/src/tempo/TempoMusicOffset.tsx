/**
 * Edit music: "Count 1 in the music…" in the music file's menu opens this box, to type the time
 * in the music file where count 1 falls. In Edit music the clock shows the time in the music, so
 * the playhead on the first hit gives the number to type (owner, 2026-11-04: instead of a "Start
 * the music here" command). It is the audio offset turned around: count 1 at 3.25 s in the
 * music is an offset of -3.25 s. One undo step, the same as Show settings' Audio Offset.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    Input,
} from "@openmarch/ui";
import tolgee from "@/global/singletons/Tolgee";
import { conToastError } from "@/utilities/utils";
import { tempoSettingsKey, writeAudioOffset } from "./audioOffset";
import { countOneAt, parseSeconds } from "./musicTime";

/** "3.25 s", as the menu shows where count 1 is */
export const offsetText = (seconds: number) =>
    tolgee.t("tempoMode.music.offsetValue", "{seconds} s", {
        // + 0 turns -0 into 0
        seconds: Number(seconds.toFixed(3)) + 0,
    });

export function TempoMusicOffset(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The audio offset in effect */
    offset: number;
}) {
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const value = parseSeconds(text);
    const current = countOneAt(props.offset);
    // Each time it opens, the field starts at where count 1 is now
    useEffect(() => {
        if (props.open) setText(String(Number(current.toFixed(3)) + 0));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening
    }, [props.open]);

    const save = async () => {
        if (value === null) return;
        props.onOpenChange(false);
        if (value === current) return;
        try {
            await writeAudioOffset(countOneAt(value));
            await queryClient.invalidateQueries({ queryKey: tempoSettingsKey });
        } catch (error) {
            conToastError(tolgee.t("workspaceSettings.updateFailed"), error);
        }
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="w-[24rem]">
                <DialogTitle>
                    {tolgee.t(
                        "tempoMode.music.offsetTitle",
                        "Count 1 in the music",
                    )}
                </DialogTitle>
                <DialogDescription>
                    {tolgee.t(
                        "tempoMode.music.offsetHelp",
                        "Where count 1 falls in the music file. While you edit music the clock shows the time in the music: put the playhead on the first hit and type the time it shows. A negative time leaves that much silence before the music starts.",
                    )}
                </DialogDescription>
                <form
                    className="flex flex-col gap-16"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                >
                    <label className="text-body flex flex-wrap items-center gap-8">
                        <span className="whitespace-nowrap">
                            {tolgee.t(
                                "tempoMode.music.countOneIsAt",
                                "Count 1 is at",
                            )}
                        </span>
                        <Input
                            compact
                            autoFocus
                            inputMode="decimal"
                            className="w-[5.5rem] tabular-nums"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-invalid={value === null}
                            data-testid="tempo-music-offset-input"
                        />
                        <span className="whitespace-nowrap">
                            {tolgee.t(
                                "tempoMode.music.secondsInTheMusic",
                                "seconds in the music",
                            )}
                        </span>
                    </label>
                    <div className="flex justify-end gap-8">
                        <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            onClick={() => props.onOpenChange(false)}
                        >
                            {tolgee.t("music.cancel")}
                        </Button>
                        <Button
                            type="submit"
                            size="compact"
                            disabled={value === null}
                            data-testid="tempo-music-offset-set"
                        >
                            {tolgee.t("tempoMode.music.offsetSet", "Set")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Edit music: "Music offset…" in the music file's menu opens this box, to type how many seconds
 * after count 1 the music starts. One undo step, the same as Show settings' Audio Offset.
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
import { parseSeconds } from "./musicTime";

/** "0.25 s", as the menu shows the offset */
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
    const current = props.offset;
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
            await writeAudioOffset(value);
            await queryClient.invalidateQueries({ queryKey: tempoSettingsKey });
        } catch (error) {
            conToastError(tolgee.t("workspaceSettings.updateFailed"), error);
        }
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="w-[24rem]">
                <DialogTitle>
                    {tolgee.t("tempoMode.music.offsetTitle", "Music offset")}
                </DialogTitle>
                <DialogDescription>
                    {tolgee.t(
                        "tempoMode.music.offsetHelp",
                        "Seconds after count 1 that the music starts. Negative skips into the music.",
                    )}
                </DialogDescription>
                <form
                    className="flex flex-col gap-16"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                >
                    <label className="text-body flex items-center gap-8">
                        <Input
                            compact
                            autoFocus
                            inputMode="decimal"
                            className="w-[5.5rem] tabular-nums"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-invalid={value === null}
                            aria-label={tolgee.t(
                                "tempoMode.music.offsetTitle",
                                "Music offset",
                            )}
                            data-testid="tempo-music-offset-input"
                        />
                        {tolgee.t("tempoMode.music.seconds", "seconds")}
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

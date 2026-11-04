/**
 * Edit music: "Music offset…" in the music file's menu opens this box, to type where the music
 * sits against the counts in seconds (Start the music here sets it by ear). One undo step, the
 * same as Show settings' Audio Offset.
 */
import { useState } from "react";
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

/** "0.25 s", as the menu shows the offset */
export const offsetText = (seconds: number) =>
    tolgee.t("tempoMode.music.offsetValue", "{seconds} s", {
        seconds: Number(seconds.toFixed(3)),
    });

export function TempoMusicOffset(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The offset in effect */
    seconds: number;
}) {
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const value = Number(text);
    const valid = text.trim() !== "" && Number.isFinite(value);

    const save = async () => {
        if (!valid) return;
        props.onOpenChange(false);
        if (value === props.seconds) return;
        try {
            await writeAudioOffset(value);
            await queryClient.invalidateQueries({ queryKey: tempoSettingsKey });
        } catch (error) {
            conToastError(tolgee.t("workspaceSettings.updateFailed"), error);
        }
    };

    return (
        <Dialog
            open={props.open}
            onOpenChange={(open) => {
                if (open) setText(String(props.seconds));
                props.onOpenChange(open);
            }}
        >
            <DialogContent
                className="w-[24rem]"
                onOpenAutoFocus={() => setText(String(props.seconds))}
            >
                <DialogTitle>
                    {tolgee.t("tempoMode.music.offsetTitle", "Music offset")}
                </DialogTitle>
                <DialogDescription>
                    {tolgee.t(
                        "tempoMode.music.offsetHelp",
                        "How many seconds after count 1 the music starts. Negative starts count 1 that far into the music. To set it by ear, right-click the music and choose Start the music here.",
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
                            type="number"
                            step="0.01"
                            className="w-[8rem]"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
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
                            disabled={!valid}
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

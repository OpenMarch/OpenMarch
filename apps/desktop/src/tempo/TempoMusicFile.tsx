/**
 * Edit music: the music file, in the header after the mode's name. With no music it offers
 * "Add music…"; with music it names the file, and its menu switches to another of the show's
 * audio files, imports one, or deletes it. (The Music sidebar used to hold these; owner,
 * 2026-11-04: in Edit music, and in its header rather than over the waveform.)
 */
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CaretDownIcon,
    CheckIcon,
    MusicNotesIcon,
    PlusIcon,
    TimerIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import tolgee from "@/global/singletons/Tolgee";
import { runAction } from "@/shortcuts/registry";
import { useAudioOffsetSeconds } from "./audioOffset";
import { countOneAt } from "./musicTime";
import { offsetText, TempoMusicOffset } from "./TempoMusicOffset";
import { toolButton } from "./TempoToolbar";

export const MENU_CLASS =
    "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text z-50 flex min-w-[16rem] max-w-[24rem] flex-col border p-4";
export const MENU_ITEM_CLASS =
    "rounded-4 text-body data-[highlighted]:bg-text/10 data-[disabled]:text-text/40 flex h-28 cursor-pointer items-center gap-8 px-8 whitespace-nowrap outline-hidden select-none data-[disabled]:cursor-default";

/** Opens the file picker for an audio file; the new file becomes the show's music */
export const importAudioFile = () => runAction("launchInsertAudioFileDialogue");

/** The show's audio files, and the one it plays */
function useAudioFiles() {
    const context = useSelectedAudioFile();
    const selected = context?.selectedAudioFile ?? null;
    const setSelected = context?.setSelectedAudioFile;
    const [files, setFiles] = useState<AudioFile[] | null>(null);
    const refresh = useCallback(() => {
        void AudioFile.getAudioFilesDetails().then(setFiles);
    }, []);
    useEffect(() => {
        refresh();
    }, [refresh, selected]);
    useEffect(() => {
        window.addEventListener("audioFilesUpdated", refresh);
        return () => window.removeEventListener("audioFilesUpdated", refresh);
    }, [refresh]);

    const select = (id: number) => {
        void AudioFile.setSelectedAudioFile(id).then((f) => setSelected?.(f));
    };
    const remove = async (file: AudioFile) => {
        const next = await AudioFile.deleteAudioFile(file.id);
        // The last one gone, the show plays silence again
        setSelected?.(next ?? (await AudioFile.getSelectedAudioFile()));
        refresh();
        toast.success(
            tolgee.t("music.deleteSuccess", { fileName: file.nickname }),
        );
    };
    return { files, selected, select, remove };
}

/** In the header, after the mode's name: the music file, or "Add music…" */
export function TempoMusicFile() {
    const { files, selected, select, remove } = useAudioFiles();
    const [deleting, setDeleting] = useState<AudioFile | null>(null);
    const [offsetOpen, setOffsetOpen] = useState(false);
    const offset = useAudioOffsetSeconds();
    if (files === null) return null;
    const current = files.find((f) => f.id === selected?.id) ?? null;

    return (
        <div className="flex min-w-0 shrink">
            {files.length === 0 ? (
                <button
                    type="button"
                    data-testid="tempo-add-music"
                    className={toolButton(true)}
                    onClick={importAudioFile}
                >
                    <PlusIcon size={12} weight="bold" aria-hidden />
                    <span className="@max-[640px]:hidden">
                        {tolgee.t("tempoMode.music.add", "Add music…")}
                    </span>
                </button>
            ) : (
                <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger
                        data-testid="tempo-music-file"
                        aria-label={tolgee.t(
                            "tempoMode.music.menuLabel",
                            "Music file",
                        )}
                        className={clsx(toolButton(false), "min-w-0")}
                    >
                        <MusicNotesIcon
                            size={12}
                            className="shrink-0"
                            aria-hidden
                        />
                        <span className="max-w-[14rem] truncate @max-[640px]:max-w-[6rem]">
                            {current?.nickname ??
                                tolgee.t("tempoMode.music.pick", "Pick music")}
                        </span>
                        <CaretDownIcon
                            size={10}
                            className="text-text/60"
                            aria-hidden
                        />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            align="start"
                            sideOffset={4}
                            className={MENU_CLASS}
                            data-testid="tempo-music-menu"
                        >
                            {files.map((f) => (
                                <DropdownMenu.Item
                                    key={f.id}
                                    className={MENU_ITEM_CLASS}
                                    onSelect={() => {
                                        if (f.id !== current?.id) select(f.id);
                                    }}
                                >
                                    <CheckIcon
                                        size={12}
                                        className={
                                            f.id === current?.id
                                                ? "shrink-0"
                                                : "invisible shrink-0"
                                        }
                                        aria-hidden
                                    />
                                    <span className="truncate">
                                        {f.nickname}
                                    </span>
                                </DropdownMenu.Item>
                            ))}
                            <DropdownMenu.Separator className="bg-stroke mx-4 my-4 h-px" />
                            <DropdownMenu.Item
                                className={MENU_ITEM_CLASS}
                                onSelect={() => setOffsetOpen(true)}
                                data-testid="tempo-music-offset"
                            >
                                <TimerIcon size={12} aria-hidden />
                                <span className="flex-1 whitespace-nowrap">
                                    {tolgee.t(
                                        "tempoMode.music.offset",
                                        "Count 1 in the music…",
                                    )}
                                </span>
                                <span className="text-text/60 tabular-nums">
                                    {offsetText(countOneAt(offset))}
                                </span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                className={MENU_ITEM_CLASS}
                                onSelect={importAudioFile}
                            >
                                <PlusIcon size={12} aria-hidden />
                                {tolgee.t(
                                    "tempoMode.music.importAnother",
                                    "Import another audio file…",
                                )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                                className={MENU_ITEM_CLASS}
                                disabled={!current}
                                data-testid="tempo-music-delete"
                                onSelect={() => setDeleting(current)}
                            >
                                <TrashIcon
                                    size={12}
                                    className="text-red"
                                    aria-hidden
                                />
                                {tolgee.t(
                                    "tempoMode.music.delete",
                                    "Delete this audio file…",
                                )}
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            )}
            <TempoMusicOffset
                open={offsetOpen}
                onOpenChange={setOffsetOpen}
                offset={offset}
            />
            <AlertDialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {tolgee.t("music.deleteAudioFile")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {tolgee.t("music.deleteAudioFileDescription")}
                        <span className="bg-bg-1 border-stroke text-text mt-8 block overflow-auto rounded-md border p-16 font-mono text-wrap">
                            {deleting?.nickname}
                        </span>
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8">
                        <AlertDialogCancel>
                            <Button variant="secondary" size="compact">
                                {tolgee.t("music.cancel")}
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="red"
                                size="compact"
                                data-testid="tempo-music-delete-confirm"
                                onClick={() => {
                                    if (deleting) void remove(deleting);
                                }}
                            >
                                {tolgee.t("music.delete")}
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

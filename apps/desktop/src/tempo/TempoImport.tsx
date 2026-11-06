/**
 * Edit music: the header's Import menu: an audio file, or a MusicXML score. The score says what
 * it replaces before anything happens, then picks the file and takes its timing in
 * (`scoreImport.ts`), one undo step.
 */
import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CaretDownIcon,
    FileArrowDownIcon,
    MusicNotesIcon,
    MusicNotesSimpleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { ShortcutTooltip } from "@/components/timeline/ShortcutTooltip";
import { parseMusicXmlFile } from "@/components/music/MusicXmlImport";
import { importChecks } from "@/components/music/musicXmlImportChecks";
import { showMusicXmlImportResult } from "@/components/music/MusicXmlSelector";
import { useTimingObjects } from "@/hooks";
import { touchSafeAccept } from "@/utilities/fileAccept";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { importScoreTiming } from "./scoreImport";
import { toolButton } from "./TempoToolbar";
import { MENU_ITEM_CLASS } from "@/components/ui/popupClasses";
import { importAudioFile, MUSIC_MENU_CLASS } from "./TempoMusicFile";

export function TempoImport() {
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { fetchTimingObjects } = useTimingObjects();
    const label = tolgee.t("tempoMode.import.button", "Import");

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Picking the same file again imports it again
        e.target.value = "";
        if (!file) return;
        setBusy(true);
        try {
            const parsed = await parseMusicXmlFile(file);
            await importScoreTiming(parsed.measures);
            await queryClient.invalidateQueries({ queryKey: ["beats"] });
            await fetchTimingObjects();
            showMusicXmlImportResult(file.name, {
                message: tolgee.t("music.importSuccess", {
                    fileName: file.name,
                }),
                checks: importChecks(parsed),
            });
        } catch (error) {
            conToastError(tolgee.t("music.importError"), error);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DropdownMenu.Root modal={false}>
                <ShortcutTooltip
                    closeOnPress
                    label={label}
                    hint={tolgee.t(
                        "tempoMode.import.hint",
                        "Bring in the music file, or a score's tempos, time signatures, measures and rehearsal marks",
                    )}
                >
                    <DropdownMenu.Trigger
                        aria-label={label}
                        className={toolButton(false)}
                        disabled={busy}
                        data-testid="tempo-import"
                    >
                        <FileArrowDownIcon size={12} aria-hidden />
                        <span className="@max-[640px]:hidden">
                            {busy ? tolgee.t("music.importing") : label}
                        </span>
                        <CaretDownIcon
                            size={10}
                            className="text-text/60"
                            aria-hidden
                        />
                    </DropdownMenu.Trigger>
                </ShortcutTooltip>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className={MUSIC_MENU_CLASS}
                    >
                        <DropdownMenu.Item
                            className={MENU_ITEM_CLASS}
                            onSelect={importAudioFile}
                            data-testid="tempo-import-audio"
                        >
                            <MusicNotesIcon size={12} aria-hidden />
                            {tolgee.t("tempoMode.import.audio", "Audio file…")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            className={MENU_ITEM_CLASS}
                            onSelect={() => setAsking(true)}
                            data-testid="tempo-import-score"
                        >
                            <MusicNotesSimpleIcon size={12} aria-hidden />
                            {tolgee.t(
                                "tempoMode.import.score",
                                "MusicXML score…",
                            )}
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <input
                ref={fileRef}
                type="file"
                accept={touchSafeAccept(".xml,.musicxml,.mxl")}
                className="hidden"
                onChange={(e) => void onFile(e)}
            />
            <AlertDialog open={asking} onOpenChange={setAsking}>
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {tolgee.t(
                            "tempoMode.importScore.title",
                            "Use a score's timing?",
                        )}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="flex flex-col gap-8">
                            <span>
                                {tolgee.t(
                                    "tempoMode.importScore.replaces",
                                    "The score's tempos, time signatures, measures and rehearsal marks replace the show's, including what you changed here.",
                                )}
                            </span>
                            <span>
                                {tolgee.t(
                                    "tempoMode.importScore.keeps",
                                    "Pages, drill, cues and props stay on their counts, so they play at the score's tempos. Undo puts it all back.",
                                )}
                            </span>
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
                                size="compact"
                                data-testid="tempo-import-score-choose"
                                // In the press, so the file picker may open
                                onClick={() => fileRef.current?.click()}
                            >
                                {tolgee.t(
                                    "tempoMode.importScore.choose",
                                    "Choose a file…",
                                )}
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

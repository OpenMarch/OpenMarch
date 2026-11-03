import { useRef } from "react";
import { touchSafeAccept } from "@/utilities/fileAccept";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { useTimingObjects } from "@/hooks";
import { useImportMusicXml, type ImportResult } from "./MusicXmlImport";
import { useMusicXmlChecksStore } from "@/stores/MusicXmlChecksStore";

/** The toast that offers an import's checks; a new import replaces it. */
const CHECKS_TOAST_ID = "musicxml-import-checks";

export default function MusicXmlSelector() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslate();
    const { measures, pages: allPages, beats: allBeats } = useTimingObjects();

    const importMusicXmlMutation = useImportMusicXml();

    // XML import handler
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            if (!allPages || !allBeats) {
                toast.error(t("music.importDataMissing"));
                return;
            }
            const result = await importMusicXmlMutation.mutateAsync({
                file,
                allPages,
                measures,
                allBeats,
            });
            if (result.success) showResult(file.name, result);
        } catch {
            // The mutation's onError already logged the error and showed a toast
        } finally {
            // Clear the file input, so picking the same file again imports it again
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const showResult = (fileName: string, result: ImportResult) => {
        const { checks } = result;
        // One checks toast at a time: a new import's result replaces the last one's
        if (checks.length === 0) {
            toast.dismiss(CHECKS_TOAST_ID);
            toast.success(result.message);
            return;
        }
        // Kept until dismissed: the list says what to check in the score. The same id updates
        // an open checks toast in place (dismissing it first would remove the new one too)
        toast.warning(result.message, {
            id: CHECKS_TOAST_ID,
            description: t("music.importChecksCount", {
                count: checks.length,
            }),
            duration: Infinity,
            action: {
                label: t("music.importChecksShow"),
                // This import's checks, whatever was imported since
                onClick: () =>
                    useMusicXmlChecksStore
                        .getState()
                        .showChecks(fileName, checks),
            },
        });
    };

    return (
        <div className="mt-8 flex items-center gap-8 px-12">
            <label className="text-body text-text/80 w-full">
                <T keyName="music.importLabel" />
            </label>
            <input
                ref={fileInputRef}
                type="file"
                accept={touchSafeAccept(".xml,.musicxml,.mxl")}
                className="hidden"
                onChange={handleFileChange}
            />
            <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importMusicXmlMutation.isPending}
                className="whitespace-nowrap"
            >
                {importMusicXmlMutation.isPending
                    ? t("music.importing")
                    : t("music.importButton")}
            </Button>
        </div>
    );
}

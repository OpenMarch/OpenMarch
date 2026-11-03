import { T, useTranslate } from "@tolgee/react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@openmarch/ui";
import { useMusicXmlChecksStore } from "@/stores/MusicXmlChecksStore";
import { formatList } from "@/utilities/formatList";

/** Measures as a short list: "m4", "m4, m9", or "m4, m9, m12 and 3 more". */
const SHOWN_MEASURES = 6;

/**
 * What to check in the score after a MusicXML import: what the importer guessed, couldn't read,
 * or found contradicting itself, with the measures to look at. Opened from the import's toast.
 */
export default function MusicXmlChecksDialog() {
    const { t } = useTranslate();
    const { fileName, checks, open, setOpen } = useMusicXmlChecksStore();

    const measures = (labels: string[]) => {
        const shown = formatList(
            labels
                .slice(0, SHOWN_MEASURES)
                .map((label) => t("music.importChecksMeasure", { label })),
        );
        const more = labels.length - SHOWN_MEASURES;
        return more > 0
            ? t("music.importChecksMoreMeasures", { measures: shown, more })
            : shown;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[34rem]">
                <DialogTitle>
                    <T keyName="music.importChecksTitle" />
                </DialogTitle>
                <DialogDescription>
                    <T
                        keyName="music.importChecksIntro"
                        params={{ fileName }}
                    />
                </DialogDescription>
                <ul
                    className="flex flex-col gap-12 overflow-y-auto"
                    aria-label={t("music.importChecksTitle")}
                >
                    {checks.map((check) => (
                        <li
                            key={`${check.code}-${check.message}`}
                            className="flex flex-col gap-2"
                        >
                            {check.measures.length > 0 && (
                                <span className="text-sub text-text-subtitle">
                                    {measures(check.measures)}
                                </span>
                            )}
                            <span className="text-body text-text">
                                {check.message}
                            </span>
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
}

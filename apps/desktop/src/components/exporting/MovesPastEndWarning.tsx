import { useTranslate } from "@tolgee/react";
import { Button, WarningNote } from "@openmarch/ui";
import { useTimingObjects } from "@/hooks";
import { usePagesToEnd } from "@/hooks/queries/useAppendPages";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { movesPastEnd } from "@/timeline/endlessTimeline";
import { pageEndBeat } from "@/timeline/pageEndBeat";

/**
 * Exports end at the show's end, the last page's flag (docs/timeline/endless-counts.md rule 4), so a
 * move placed past it isn't in them (rule 9). Each export tab says so, offers pages every "new page
 * counts" counts up to the end of the last move (one undoable edit), and can still export as it is.
 * Nothing shows when every move ends by the show's end.
 */
export default function MovesPastEndWarning() {
    const { t } = useTranslate();
    const { pages } = useTimingObjects();
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const { counts, addPagesToEnd, isPending } = usePagesToEnd();
    const lastPage = pages[pages.length - 1];
    if (!lastPage || !storedTimelines) return null;
    const past = movesPastEnd(storedTimelines, pageEndBeat(lastPage));
    if (past.count === 0) return null;
    return (
        <div
            data-testid="export-moves-past-end"
            className="border-stroke bg-fg-1 rounded-6 mb-12 flex flex-wrap items-center justify-between gap-8 border p-8"
        >
            <WarningNote>
                {t("exportCoordinates.movesPastEnd", {
                    count: past.count,
                    page: lastPage.name,
                })}
            </WarningNote>
            <Button
                size="compact"
                variant="secondary"
                disabled={isPending}
                title={t("exportCoordinates.addPagesToEndTitle", { counts })}
                onClick={() => addPagesToEnd(past.lastEndBeat)}
            >
                {t("exportCoordinates.addPagesToEnd")}
            </Button>
        </div>
    );
}

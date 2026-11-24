import { useEffect } from "react";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { subscribeCueCarry, type CueCarryNotice } from "@/db-functions/cues";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { beatWhere } from "@/timeline/timelineRangeWords";
import { translateTimelineText } from "@/timeline/translateTimelineText";

/** How long to wait for the page boxes to follow the deletion before wording the notice anyway. */
const BOXES_WAIT_MS = 1500;

/** The notice's words, with the page boxes after the deletion (ADR 0004 amendment of 2026-10-15). */
export function cueCarryMessages(
    notice: CueCarryNotice,
    boxes: Parameters<typeof beatWhere>[1],
): string[] {
    const out: string[] = [];
    if (notice.moved > 0) {
        const where =
            notice.movedTo.length === 1
                ? beatWhere(notice.movedTo[0], boxes)
                : null;
        out.push(
            where
                ? tolgee.t("cues.carry.movedTo", {
                      count: notice.moved,
                      where: translateTimelineText(where),
                  })
                : tolgee.t("cues.carry.moved", { count: notice.moved }),
        );
    }
    if (notice.dropped > 0)
        out.push(tolgee.t("cues.carry.dropped", { count: notice.dropped }));
    return out;
}

/**
 * Says what deleting counts did to the cues on them: "2 cues moved to Page 3 count 4", and how
 * many were deleted (ADR 0004 amendment of 2026-10-15). Worded once the page boxes have followed
 * the deletion, so the place is where the cues are now.
 */
export function useCueCarryNotices() {
    useEffect(
        () =>
            subscribeCueCarry((notice) => {
                const store = useTimelineSelectionStore;
                const before = store.getState().pageBoxes;
                let done = false;
                const show = () => {
                    if (done) return;
                    done = true;
                    unsubscribe();
                    clearTimeout(timer);
                    for (const message of cueCarryMessages(
                        notice,
                        store.getState().pageBoxes,
                    ))
                        toast.info(message);
                };
                const unsubscribe = store.subscribe((state) => {
                    if (state.pageBoxes !== before) show();
                });
                const timer = setTimeout(show, BOXES_WAIT_MS);
            }),
        [],
    );
}

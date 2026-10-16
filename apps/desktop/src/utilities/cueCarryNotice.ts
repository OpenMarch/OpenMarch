/**
 * The notice after deleting beats, a measure or a tempo group moved or removed cues (ADR 0004
 * amendment of 2026-10-15): non-blocking, with Undo, which undoes the whole deletion.
 */
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import type { CueCarryResult } from "@/db-functions";
import tolgee from "@/global/singletons/Tolgee";
import { runAction } from "@/shortcuts/registry";
import { invalidateCueQueries } from "@/hooks/queries/useCues";

/** How long the notice stays, so there's time to reach Undo. */
const NOTICE_MS = 10_000;

/** The notice's text, or null when the deletion touched no cues. */
export function cueCarryNoticeMessage(result: CueCarryResult): string | null {
    const parts: string[] = [];
    const moved = result.moved.length;
    if (moved > 0) {
        const counts = new Set(result.moved.map((m) => m.toPosition));
        parts.push(
            counts.size === 1
                ? tolgee.t("cues.carryNotice.movedTo", {
                      count: moved,
                      at: [...counts][0],
                  })
                : tolgee.t("cues.carryNotice.movedLater", { count: moved }),
        );
    }
    if (result.dropped.length > 0)
        parts.push(
            tolgee.t("cues.carryNotice.removed", {
                count: result.dropped.length,
            }),
        );
    return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Refreshes the cue queries (the 3D View gets them relayed) and, when cues moved or went, says
 * so with Undo.
 */
export function showCueCarryNotice(
    result: CueCarryResult,
    queryClient: QueryClient,
): void {
    void invalidateCueQueries(queryClient);
    const message = cueCarryNoticeMessage(result);
    if (!message) return;
    toast.info(message, {
        duration: NOTICE_MS,
        action: {
            label: tolgee.t("actions.edit.undo"),
            onClick: () => {
                runAction("performUndo");
            },
        },
    });
}

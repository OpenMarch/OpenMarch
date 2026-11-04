/**
 * The bottom-left readout (ui.md UI-2, UI-5): the page and count and the show
 * time. It stays visible, larger, when fullscreen hides
 * the rest of the overlay.
 *
 * The show time is written every frame through a ref; React re-renders only
 * when the page or count changes. The test ids are the ones P1.4's debug
 * readout used.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import type { CountClock } from "@/timeline/countGrid";
import {
    countsPastEnd,
    pageCountAt,
    pausedPageCount,
    type PageCount,
    type ReadoutPage,
} from "./readoutMath";

/** Formats show milliseconds as `m:ss.mmm`. */
export function formatShowTime(showMs: number): string {
    const totalMs = Math.max(0, Math.round(showMs));
    const minutes = Math.floor(totalMs / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** The page and count at the show time, or past the show's end how far (END +n, EC-8) */
type ReadoutCount = PageCount | { pastEnd: number };

const samePageCount = (a: ReadoutCount | null, b: ReadoutCount | null) =>
    a === b ||
    (!!a &&
        !!b &&
        ("pastEnd" in a
            ? "pastEnd" in b && a.pastEnd === b.pastEnd
            : !("pastEnd" in b) &&
              a.pageId === b.pageId &&
              a.pageName === b.pageName &&
              a.count === b.count &&
              a.total === b.total));

/**
 * The page and count at the show time, re-rendering only when they change,
 * and writes the show time into `timeRef` every frame. Paused, it is the
 * selected page, counted at the held time.
 */
function useLivePageCount(
    pages: readonly ReadoutPage[],
    timeRef: React.RefObject<HTMLSpanElement | null>,
    clock: CountClock,
): ReadoutCount | null {
    const [live, setLive] = useState<ReadoutCount | null>(null);
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const clockRef = useRef(clock);
    clockRef.current = clock;

    useEffect(() => {
        let frame = 0;
        const update = () => {
            const sync = useView3dSyncStore.getState();
            const showMs = sync.showMs();
            const el = timeRef.current;
            if (el) {
                el.textContent = formatShowTime(showMs);
                el.dataset.showMs = String(Math.round(showMs));
            }
            const clock = clockRef.current;
            // Past the show's end the counts belong to no page (endless counts, EC-8)
            const pastEnd = countsPastEnd(pagesRef.current, showMs, clock);
            const next: ReadoutCount | null =
                (pastEnd !== null && { pastEnd }) ||
                (!sync.clock?.playing &&
                    pausedPageCount(
                        pagesRef.current,
                        sync.selection.selectedPageId,
                        showMs,
                    )) ||
                pageCountAt(pagesRef.current, showMs);
            setLive((prev) => (samePageCount(prev, next) ? prev : next));
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [timeRef]);

    return live;
}

export function Readout({ large }: { large: boolean }) {
    const { t } = useTranslate();
    const timeRef = useRef<HTMLSpanElement>(null);
    const { pages, countGrid } = useTimingObjects();
    const selectedPageId = useView3dSyncStore(
        (s) => s.selection.selectedPageId,
    );
    const playing = useView3dSyncStore((s) => !!s.clock?.playing);

    const current = useLivePageCount(pages, timeRef, countGrid);

    return (
        <div
            className={clsx(
                "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-none flex w-fit flex-col border font-mono tabular-nums",
                large
                    ? "text-h5 gap-4 px-16 py-10"
                    : "text-sub gap-2 px-10 py-6",
            )}
            data-testid="view3d-sync-readout"
            data-playing={playing}
            data-selected-page-id={selectedPageId ?? ""}
        >
            <div className="flex items-baseline gap-12">
                <span
                    className="text-text font-medium"
                    data-testid="view3d-selected-page"
                    data-page-id={
                        current && !("pastEnd" in current) ? current.pageId : ""
                    }
                >
                    {!current
                        ? t("view3d.readout.noPages")
                        : "pastEnd" in current
                          ? t("view3d.readout.pastEnd", {
                                count: current.pastEnd,
                            })
                          : t("view3d.readout.page", {
                                page: current.pageName,
                            })}
                </span>
                {current && !("pastEnd" in current) && (
                    <span data-testid="view3d-count">
                        {t("view3d.readout.count", {
                            count: current.count,
                            total: current.total,
                        })}
                    </span>
                )}
                <span
                    className="text-text/60"
                    aria-label={t("view3d.readout.showTime")}
                >
                    <span ref={timeRef} data-testid="view3d-show-time">
                        {formatShowTime(0)}
                    </span>
                </span>
            </div>
        </div>
    );
}

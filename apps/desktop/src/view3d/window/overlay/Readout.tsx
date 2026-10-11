/**
 * The bottom-left readout (ui.md UI-2, UI-5): the page and count, the show
 * time, and the camera's eye height and distance to the field center in the
 * field's measurement system. It stays visible, larger, when fullscreen hides
 * the rest of the overlay.
 *
 * The show time is written every frame through a ref; React re-renders only
 * when the page or count changes. The test ids are the ones P1.4's debug
 * readout used.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { useCameraStore } from "../camera/cameraStore";
import {
    formatLength,
    pageAtSet,
    pageCountAt,
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

const samePageCount = (a: PageCount | null, b: PageCount | null) =>
    a === b ||
    (!!a &&
        !!b &&
        a.pageId === b.pageId &&
        a.pageName === b.pageName &&
        a.count === b.count &&
        a.total === b.total);

/**
 * The page and count at the show time, re-rendering only when they change,
 * and writes the show time into `timeRef` every frame.
 */
function useLivePageCount(
    pages: readonly ReadoutPage[],
    timeRef: React.RefObject<HTMLSpanElement | null>,
): PageCount | null {
    const [live, setLive] = useState<PageCount | null>(null);
    const pagesRef = useRef(pages);
    pagesRef.current = pages;

    useEffect(() => {
        let frame = 0;
        const update = () => {
            const showMs = useView3dSyncStore.getState().showMs();
            const el = timeRef.current;
            if (el) {
                el.textContent = formatShowTime(showMs);
                el.dataset.showMs = String(Math.round(showMs));
            }
            const next = pageCountAt(pagesRef.current, showMs);
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
    const { pages } = useTimingObjects();
    const selectedPageId = useView3dSyncStore(
        (s) => s.selection.selectedPageId,
    );
    const playing = useView3dSyncStore((s) => !!s.clock?.playing);
    const { eyeHeightM, distanceToFocusM } = useCameraStore((s) => s.readout);
    const field = useQuery(fieldPropertiesQueryOptions());
    const system = field.data?.measurementSystem ?? "imperial";

    const live = useLivePageCount(pages, timeRef);
    // Paused, the editor shows the selected page's set.
    const current = (!playing && pageAtSet(pages, selectedPageId)) || live;

    const length = (meters: number) => {
        const { value, unit } = formatLength(meters, system);
        return t(unit === "ft" ? "view3d.unit.feet" : "view3d.unit.meters", {
            value,
        });
    };

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
                    data-page-id={current?.pageId ?? ""}
                >
                    {current
                        ? t("view3d.readout.page", { page: current.pageName })
                        : t("view3d.readout.noPages")}
                </span>
                {current && (
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
            <div className="text-text/60" data-testid="view3d-camera-readout">
                {t("view3d.readout.camera", {
                    eye: length(eyeHeightM),
                    distance: length(distanceToFocusM),
                })}
            </div>
        </div>
    );
}

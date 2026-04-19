import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import { useCallback, useMemo } from "react";
import clsx from "clsx";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    allLightingScenesQueryOptions,
    lightingScenePositionByLightingSceneIdMapQueryOptions,
} from "@/hooks/queries/lighting/queries";
import { createLightingScenesMutationOptions } from "@/hooks/queries/lighting/mutations";
import {
    buildSceneTimelineSegments,
    timelineLeftPxAtPageStart,
    totalTimelineWidthPx,
} from "./SceneTimeline.utils";

const SPACING = 4;

export default function SceneTimeline() {
    const { isPlaying } = useIsPlaying()!;
    const { uiSettings } = useUiSettingsStore();
    const { pages } = useTimingObjects()!;
    const { data: positionMap = {} } = useQuery(
        lightingScenePositionByLightingSceneIdMapQueryOptions(),
    );
    const pps = uiSettings.timelinePixelsPerSecond;

    const { data: scenes = [] } = useQuery(allLightingScenesQueryOptions());
    const { mutate: createScenes } = useMutation(
        createLightingScenesMutationOptions(),
    );

    const segments = useMemo(
        () => buildSceneTimelineSegments(pages, scenes, pps),
        [pages, scenes, pps],
    );

    const totalWidthPx = useMemo(
        () => totalTimelineWidthPx(pages, pps),
        [pages, pps],
    );

    const splitAtPageIndex = useCallback(
        (pageIndex: number) => {
            const page = pages[pageIndex];
            if (!page) return;
            if (scenes.some((s) => s.start_page_id === page.id)) return;
            createScenes([{ start_page_id: page.id, name: null }]);
        },
        [createScenes, pages, scenes],
    );

    if (pages.length === 0) {
        return null;
    }

    return (
        <div
            className="relative h-fit shrink-0"
            style={{ width: `${totalWidthPx}px`, minHeight: "2.5rem" }}
            aria-label="lighting scenes"
        >
            {segments.map((seg) => {
                const barLeftPx = seg.leftPx + SPACING;
                return (
                    <div
                        key={seg.sceneId}
                        className={clsx(
                            "bg-accent text-body text-text-invert border-stroke absolute top-0 flex h-[2rem] items-center justify-center overflow-clip rounded-full border px-8 py-4 font-mono",
                        )}
                        style={{
                            left: `${barLeftPx}px`,
                            width: `${seg.widthPx - SPACING * 2}px`,
                        }}
                    >
                        <span className="pointer-events-none">
                            {positionMap[seg.sceneId] ?? seg.sceneId}
                        </span>
                        {!isPlaying &&
                            seg.internalSplitPageIndices.map((pageIndex) => {
                                const boundaryAbsPx = timelineLeftPxAtPageStart(
                                    pages,
                                    pageIndex,
                                    pps,
                                );
                                const leftInSegment = boundaryAbsPx - barLeftPx;
                                return (
                                    <button
                                        key={`split-${seg.sceneId}-${pageIndex}`}
                                        type="button"
                                        className="hover:bg-text-invert/10 absolute top-0 z-10 flex h-full w-[10px] -translate-x-1/2 cursor-pointer items-stretch justify-center border-0 bg-transparent p-0"
                                        style={{ left: `${leftInSegment}px` }}
                                        aria-label="Split scene at page boundary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            splitAtPageIndex(pageIndex);
                                        }}
                                        onPointerDown={(e) =>
                                            e.stopPropagation()
                                        }
                                    >
                                        <span
                                            className="border-text-invert/40 pointer-events-none h-full shrink-0 border-l border-dashed"
                                            aria-hidden
                                        />
                                    </button>
                                );
                            })}
                    </div>
                );
            })}
        </div>
    );
}

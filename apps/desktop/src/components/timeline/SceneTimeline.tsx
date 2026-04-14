import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import { useMemo } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { allLightingScenesQueryOptions } from "@/hooks/queries/lighting/queries";
import {
    buildSceneTimelineSegments,
    totalTimelineWidthPx,
} from "./SceneTimeline.utils";

const SPACING = 4;

export default function SceneTimeline() {
    const { uiSettings } = useUiSettingsStore();
    const { pages } = useTimingObjects()!;
    const pps = uiSettings.timelinePixelsPerSecond;

    const { data: scenes = [] } = useQuery(allLightingScenesQueryOptions());

    const segments = useMemo(
        () => buildSceneTimelineSegments(pages, scenes, pps),
        [pages, scenes, pps],
    );

    const totalWidthPx = useMemo(
        () => totalTimelineWidthPx(pages, pps),
        [pages, pps],
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
            {segments.map((seg) => (
                <div
                    key={seg.sceneId}
                    className={clsx(
                        "bg-accent text-body text-text-invert border-stroke absolute top-0 flex h-[2rem] items-center justify-center overflow-clip rounded-full border px-8 py-4 font-mono",
                    )}
                    style={{
                        left: `${seg.leftPx + SPACING}px`,
                        width: `${seg.widthPx - SPACING * 2}px`,
                    }}
                >
                    {seg.sceneId}
                </div>
            ))}
        </div>
    );
}

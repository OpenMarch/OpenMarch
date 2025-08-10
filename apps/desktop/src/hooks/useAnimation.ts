import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Page from "@/global/classes/Page";
import {
    CoordinateDefinition,
    getCoordinatesAtTime,
    MarcherTimeline,
} from "@/utilities/Keyframes";
import { getByMarcherId } from "@/global/classes/MarcherPage";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { Midset, useMidsets } from "./queries";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { useMarcherStore } from "@/stores/MarcherStore";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
}

export const useAnimation = ({ canvas }: UseAnimationProps) => {
    const { pages } = useTimingObjectsStore()!;
    const { marchers } = useMarcherStore()!;
    const { setSelectedPage } = useSelectedPage()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marcherPages } = useMarcherPageStore()!;

    const { data: midsets, isSuccess: midsetsLoaded } = useMidsets();

    const animationFrameRef = useRef<number | null>(null);

    const marcherTimelines = useMemo(() => {
        if (!midsetsLoaded || !midsets)
            return new Map<number, MarcherTimeline>();

        const pagesMap = pages.reduce(
            (acc, page) => {
                acc[page.id] = page;
                return acc;
            },
            {} as Record<number, Page>,
        );

        // Organize midsets by marcher page ID for efficient lookup
        const midsetsByMarcherPage = midsets.reduce(
            (acc: Record<number, Midset[]>, midset: Midset) => {
                if (!acc[midset.mp_id]) {
                    acc[midset.mp_id] = [];
                }
                acc[midset.mp_id].push(midset);
                return acc;
            },
            {} as Record<number, Midset[]>,
        );

        const timelines = new Map<number, MarcherTimeline>();
        if (!marchers.length || !pages.length) return timelines;

        for (const marcher of marchers) {
            const coordinateMap = new Map<number, CoordinateDefinition>();
            const marcherPagesForMarcher = getByMarcherId(
                marcherPages,
                marcher.id,
            );

            for (const marcherPage of marcherPagesForMarcher) {
                const page = pagesMap[marcherPage.page_id];
                if (page) {
                    // Get midsets for this marcher page
                    const midsetsForMarcherPage =
                        midsetsByMarcherPage[marcherPage.id] || [];

                    // Add the marcher page position as the base coordinate
                    coordinateMap.set((page.timestamp + page.duration) * 1000, {
                        x: marcherPage.x,
                        y: marcherPage.y,
                        path: marcherPage.path_data || undefined,
                    });

                    // Add midset positions at their progress placements
                    for (const midset of midsetsForMarcherPage) {
                        const progressTime =
                            page.timestamp +
                            page.duration * midset.progress_placement;
                        coordinateMap.set(progressTime, {
                            x: midset.x,
                            y: midset.y,
                            path: midset.path_data || undefined,
                        });
                    }
                }
            }

            const sortedTimestamps = Array.from(coordinateMap.keys()).sort(
                (a, b) => a - b,
            );
            timelines.set(marcher.id, {
                pathMap: coordinateMap,
                sortedTimestamps,
            });
        }
        return timelines;
    }, [midsetsLoaded, midsets, pages, marchers, marcherPages]);

    const setMarcherPositionsAtTime = useCallback(
        (timeMilliseconds: number) => {
            if (!canvas) return;

            const canvasMarchers = canvas.getCanvasMarchers();
            for (const canvasMarcher of canvasMarchers) {
                const timeline = marcherTimelines.get(
                    canvasMarcher.marcherObj.id,
                );

                if (timeline) {
                    try {
                        const coords = getCoordinatesAtTime(
                            timeMilliseconds,
                            timeline,
                        );
                        canvasMarcher.setLiveCoordinates(coords);
                    } catch (e) {
                        // Ignore errors, as they can happen when scrubbing before the first page
                    }
                }
            }

            canvas.requestRenderAll();
        },
        [canvas, marcherTimelines],
    );

    // Update the selected page based on playback timestamp
    const updateSelectedPage = useCallback(
        (currentTime: number) => {
            if (!pages.length || !canvas) return;

            const currentPage = pages.find(
                (p) =>
                    currentTime >= p.timestamp * 1000 &&
                    currentTime < (p.timestamp + p.duration) * 1000,
            );
            if (!currentPage) {
                // We're past the end, set the selected page to the last one and stop playing
                setSelectedPage(pages[pages.length - 1]);
                setIsPlaying(false);
            } else {
                const previousPage =
                    (currentPage &&
                        currentPage.previousPageId != null &&
                        pages.find(
                            (p) => p.id === currentPage?.previousPageId,
                        )) ??
                    pages[0];
                if (!previousPage)
                    throw new Error(
                        "Could not find any page to select. This should not happen",
                    );

                setSelectedPage(previousPage);
            }
        },
        [pages, canvas, setSelectedPage, setIsPlaying],
    );

    // Animate the canvas based on playback timestamp
    useEffect(() => {
        // Helper to sync the animation with the live playback position
        const animate = () => {
            if (!canvas) return;

            const currentTime = getLivePlaybackPosition() * 1000; // s to ms
            setMarcherPositionsAtTime(currentTime);
            updateSelectedPage(currentTime);

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        // Start the animation loop
        if (isPlaying) {
            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }

        // Cleanup
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying, canvas, setMarcherPositionsAtTime, updateSelectedPage]);

    return { setMarcherPositionsAtTime };
};

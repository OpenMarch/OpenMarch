import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Page from "@/global/classes/Page";
import Marcher from "@/global/classes/Marcher";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import {
    CoordinateDefinition,
    getCoordinatesAtTime,
    MarcherTimeline,
} from "@/utilities/Keyframes";
import MarcherPage from "@/global/classes/MarcherPage";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
    pages: Page[];
    marchers: Marcher[];
    marcherPages: MarcherPageMap;
    selectedPage: Page | null;
    setSelectedPage: (page: Page) => void;
}

export const useAnimation = ({
    canvas,
    pages,
    marchers,
    marcherPages,
    selectedPage,
    setSelectedPage,
}: UseAnimationProps) => {
    const playbackTimestamp = useAudioStore((state) => state.playbackTimestamp);
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const animationFrameRef = useRef<number | null>(null);
    const currentPlayback = useRef(playbackTimestamp);

    const marcherTimelines = useMemo(() => {
        const pagesMap = pages.reduce(
            (acc, page) => {
                acc[page.id] = page;
                return acc;
            },
            {} as Record<number, Page>,
        );

        const timelines = new Map<number, MarcherTimeline>();
        if (!marchers.length || !pages.length) return timelines;

        for (const marcher of marchers) {
            const coordinateMap = new Map<number, CoordinateDefinition>();
            const marcherPagesForMarcher = MarcherPage.getByMarcherId(
                marcherPages,
                marcher.id,
            );

            for (const marcherPage of marcherPagesForMarcher) {
                const page = pagesMap[marcherPage.page_id];
                if (page) {
                    coordinateMap.set((page.timestamp + page.duration) * 1000, {
                        x: marcherPage.x,
                        y: marcherPage.y,
                        svg: marcherPage.svg_path,
                    });
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
    }, [marchers, pages, marcherPages]);

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

    // Update the playback timestamp reference
    useEffect(() => {
        currentPlayback.current = playbackTimestamp;
    }, [playbackTimestamp]);

    // Animate the canvas based on playback timestamp
    useEffect(() => {
        const animate = () => {
            if (!isPlaying || !canvas) return;

            const currentTime = currentPlayback.current * 1000; // Convert seconds to milliseconds
            setMarcherPositionsAtTime(currentTime);
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        if (isPlaying) {
            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [
        isPlaying,
        canvas,
        pages,
        selectedPage,
        setSelectedPage,
        marcherTimelines,
        setMarcherPositionsAtTime,
        setIsPlaying,
    ]);

    return { setMarcherPositionsAtTime };
};

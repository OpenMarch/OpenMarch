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
import { useMarcherPages } from "./queries";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useCollisionStore } from "@/stores/CollisionStore";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
}

export const useAnimation = ({ canvas }: UseAnimationProps) => {
    const { pages } = useTimingObjectsStore()!;
    const { marchers } = useMarcherStore()!;
    const { setSelectedPage, selectedPage } = useSelectedPage()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const {
        collisions: pageCollisions,
        setCollisions,
        setCurrentCollision,
    } = useCollisionStore();

    // const { data: midsets, isSuccess: midsetsLoaded } = useMidsets();
    const { data: marcherPages, isSuccess: marcherPagesLoaded } =
        useMarcherPages({ pages });

    const animationFrameRef = useRef<number | null>(null);

    const marcherTimelines = useMemo(() => {
        if (
            // !midsetsLoaded ||
            !marcherPagesLoaded ||
            // midsets == null ||
            marcherPages == null
        ) {
            // console.debug("not loading timeline");
            // console.debug("midsetsLoaded", midsetsLoaded);
            // console.debug("midsets", midsets);
            // console.debug("marcherPagesLoaded", marcherPagesLoaded);
            // console.debug("marcherPages", marcherPages);
            return new Map<number, MarcherTimeline>();
        }

        const pagesMap = pages.reduce(
            (acc, page) => {
                acc[page.id] = page;
                return acc;
            },
            {} as Record<number, Page>,
        );

        // Organize midsets by marcher page ID for efficient lookup
        // const midsetsByMarcherPage = midsets.reduce(
        //     (acc: Record<number, Midset[]>, midset: Midset) => {
        //         if (!acc[midset.mp_id]) {
        //             acc[midset.mp_id] = [];
        //         }
        //         acc[midset.mp_id].push(midset);
        //         return acc;
        //     },
        //     {} as Record<number, Midset[]>,
        // );

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
                    // // Get midsets for this marcher page
                    // const midsetsForMarcherPage =
                    //     midsetsByMarcherPage[marcherPage.id] || [];

                    // Add the marcher page position as the base coordinate
                    coordinateMap.set((page.timestamp + page.duration) * 1000, {
                        x: marcherPage.x,
                        y: marcherPage.y,
                        path: marcherPage.path_data || undefined,
                        previousPathPosition:
                            marcherPage.path_start_position || 0,
                        nextPathPosition: marcherPage.path_end_position || 1,
                    });

                    // // Add midset positions at their progress placements
                    // for (const midset of midsetsForMarcherPage) {
                    //     const progressTime =
                    //         page.timestamp +
                    //         page.duration * midset.progress_placement;
                    //     coordinateMap.set(progressTime, {
                    //         x: midset.x,
                    //         y: midset.y,
                    //         path: midset.path_data || undefined,
                    //     });
                    // }
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
    }, [marcherPagesLoaded, marcherPages, pages, marchers]);

    // Incremental collision calculation with caching
    useEffect(() => {
        setCollisions(marchers, marcherTimelines, pages, marcherPages);
    }, [marchers, marcherTimelines, pages, marcherPages]);

    // Get collisions for the currently selected page
    const getCollisionsForSelectedPage = useCallback(() => {
        if (!selectedPage) {
            return [];
        }

        // this looks stupid but empty array if nothing is returned
        const collisions = selectedPage.nextPageId
            ? pageCollisions.get(selectedPage.nextPageId)
            : [];

        return collisions ?? [];
    }, [pageCollisions, selectedPage]);

    // Update collisions when selected page changes
    useEffect(() => {
        setCurrentCollision(selectedPage);
    }, [selectedPage, getCollisionsForSelectedPage]);

    // Set marcher positions at a specific time
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
                const lastPage = pages[pages.length - 1];
                if (lastPage !== selectedPage) {
                    setSelectedPage(lastPage);
                }
            }
        },
        [canvas, pages, selectedPage, setSelectedPage, setIsPlaying],
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

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { getCoordinatesAtTime } from "@/utilities/Keyframes";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { useTimingObjects } from "@/hooks";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import { useManyCoordinateData } from "./queries/useCoordinateData";
import Page from "@/global/classes/Page";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
}

// eslint-disable-next-line max-lines-per-function
export const useAnimation = ({ canvas }: UseAnimationProps) => {
    const { pages } = useTimingObjects()!;
    const pagesById: Record<number, Page> = useMemo(() => {
        return pages.reduce(
            (acc, page) => {
                acc[page.id] = page;
                return acc;
            },
            {} as Record<number, Page>,
        );
    }, [pages]);
    const { setSelectedPage, selectedPage } = useSelectedPage()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const {
        collisions: pageCollisions,
        // setCollisions,
        setCurrentCollision,
    } = useCollisionStore();

    // The number of pages +/- to fetch
    const PAGE_DELTA = 2;
    const { data: marcherTimelines } = useManyCoordinateData(
        selectedPage
            ? pages.filter(
                  (p) => Math.abs(p.order - selectedPage.order) <= PAGE_DELTA,
              )
            : [],
    );

    const animationFrameRef = useRef<number | null>(null);

    // const marcherTimelines = useMemo(() => {
    //     if (
    //         // !midsetsLoaded ||
    //         !marcherPagesLoaded ||
    //         // midsets == null ||
    //         marcherPages == null
    //     ) {
    //         // console.debug("not loading timeline");
    //         // console.debug("midsetsLoaded", midsetsLoaded);
    //         // console.debug("midsets", midsets);
    //         // console.debug("marcherPagesLoaded", marcherPagesLoaded);
    //         // console.debug("marcherPages", marcherPages);
    //         return new Map<number, MarcherTimeline>();
    //     }

    //     const pagesMap = pages.reduce(
    //         (acc, page) => {
    //             acc[page.id] = page;
    //             return acc;
    //         },
    //         {} as Record<number, Page>,
    //     );

    //     // Organize midsets by marcher page ID for efficient lookup
    //     // const midsetsByMarcherPage = midsets.reduce(
    //     //     (acc: Record<number, Midset[]>, midset: Midset) => {
    //     //         if (!acc[midset.mp_id]) {
    //     //             acc[midset.mp_id] = [];
    //     //         }
    //     //         acc[midset.mp_id].push(midset);
    //     //         return acc;
    //     //     },
    //     //     {} as Record<number, Midset[]>,
    //     // );

    //     const timelines = new Map<number, MarcherTimeline>();
    //     if (!marchers.length || !pages.length) return timelines;

    //     for (const marcher of marchers) {
    //         const coordinateMap = new Map<number, CoordinateDefinition>();
    //         const marcherPagesForMarcher = getByMarcherId(
    //             marcherPages,
    //             marcher.id,
    //         );

    //         for (const marcherPage of marcherPagesForMarcher) {
    //             const page = pagesMap[marcherPage.page_id];
    //             if (page) {
    //                 // // Get midsets for this marcher page
    //                 // const midsetsForMarcherPage =
    //                 //     midsetsByMarcherPage[marcherPage.id] || [];

    //                 // Add the marcher page position as the base coordinate
    //                 coordinateMap.set((page.timestamp + page.duration) * 1000, {
    //                     x: marcherPage.x,
    //                     y: marcherPage.y,
    //                     path: marcherPage.path_data || undefined,
    //                     previousPathPosition:
    //                         marcherPage.path_start_position || 0,
    //                     nextPathPosition: marcherPage.path_end_position || 1,
    //                 });

    //                 // // Add midset positions at their progress placements
    //                 // for (const midset of midsetsForMarcherPage) {
    //                 //     const progressTime =
    //                 //         page.timestamp +
    //                 //         page.duration * midset.progress_placement;
    //                 //     coordinateMap.set(progressTime, {
    //                 //         x: midset.x,
    //                 //         y: midset.y,
    //                 //         path: midset.path_data || undefined,
    //                 //     });
    //                 // }
    //             }
    //         }

    //         const sortedTimestamps = Array.from(coordinateMap.keys()).sort(
    //             (a, b) => a - b,
    //         );
    //         timelines.set(marcher.id, {
    //             pathMap: coordinateMap,
    //             sortedTimestamps,
    //         });
    //     }
    //     return timelines;
    // }, [marcherPagesLoaded, marcherPages, pages, marchers]);

    // Incremental collision calculation with caching
    // TODO - make collisions a query and put this back
    // useEffect(() => {
    //     setCollisions(marchers, marcherTimelines, pages, marcherPages);
    // }, [marchers, marcherTimelines, pages, marcherPages]);

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
    }, [selectedPage, getCollisionsForSelectedPage, setCurrentCollision]);

    // Set marcher positions at a specific time
    const setMarcherPositionsAtTime = useCallback(
        (timeMilliseconds: number) => {
            if (!canvas) return;
            let output = true;

            const canvasMarchers = canvas.getCanvasMarchers();
            for (const canvasMarcher of canvasMarchers) {
                const timeline = marcherTimelines.get(
                    canvasMarcher.marcherObj.id,
                );

                if (timeline) {
                    // try {
                    const coords = getCoordinatesAtTime(
                        timeMilliseconds,
                        timeline,
                    );
                    if (!coords) output = false;
                    else canvasMarcher.setLiveCoordinates(coords);
                } else {
                    console.debug(
                        `Marcher ${canvasMarcher.marcherObj.id} has no timeline at time ${timeMilliseconds}`,
                    );
                    output = false;
                }
            }

            canvas.requestRenderAll();
            return output;
        },
        [canvas, marcherTimelines],
    );

    // Update the selected page based on playback timestamp
    const updateSelectedPage = useCallback(
        async (currentTime: number) => {
            if (!pages.length || !canvas) return;

            const currentPage = pages.find((p) => {
                const nextPage = p.nextPageId ? pagesById[p.nextPageId] : null;
                if (nextPage == null) return false;
                return (
                    currentTime >= (p.timestamp + p.duration) * 1000 &&
                    currentTime <
                        (nextPage.timestamp + nextPage.duration) * 1000
                );
            });
            if (!currentPage) {
                // We're past the end, set the selected page to the last one and stop playing
                setSelectedPage(pages[pages.length - 1]);
                setIsPlaying(false);
                const lastPage = pages[pages.length - 1];
                if (lastPage !== selectedPage) {
                    setSelectedPage(lastPage);
                }
            } else if (currentPage?.id !== selectedPage?.id) {
                // We're on a different page, set the selected page to the current page
                setSelectedPage(currentPage);
            }
        },
        [pages, canvas, selectedPage, pagesById, setSelectedPage, setIsPlaying],
    );

    // Animate the canvas based on playback timestamp
    useEffect(() => {
        // Helper to sync the animation with the live playback position
        const animate = () => {
            if (!canvas) return;

            try {
                const currentTime = getLivePlaybackPosition() * 1000; // s to ms
                const continueAnimation =
                    setMarcherPositionsAtTime(currentTime);
                void updateSelectedPage(currentTime);
                animationFrameRef.current = requestAnimationFrame(animate);
                if (!continueAnimation) setIsPlaying(false);
            } catch (e) {
                console.error(e);
                setIsPlaying(false);
            }
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
    }, [
        isPlaying,
        canvas,
        setMarcherPositionsAtTime,
        updateSelectedPage,
        marcherTimelines,
        setIsPlaying,
    ]);

    return {
        setMarcherPositionsAtTime,
        _selectedPage: selectedPage,
        _isPlaying: isPlaying,
        _setIsPlaying: setIsPlaying,
    };
};

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
import { useTimelineMode } from "./queries/useWorkspaceSettings";
import {
    playbackBeat,
    TimelinePositionBuffer,
} from "@/timeline/timelineCanvas";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
    /**
     * Timeline mode: called each playback frame with the live beat, before the frame renders, to
     * style the marchers there (`useTimelineAppearance`)
     */
    onTimelineBeat?: (
        beat: number,
        canvasMarchers: ReturnType<OpenMarchCanvas["getLiveCanvasMarchers"]>,
    ) => unknown;
}

// eslint-disable-next-line max-lines-per-function
export const useAnimation = ({ canvas, onTimelineBeat }: UseAnimationProps) => {
    const { pages, beats } = useTimingObjects()!;
    const timelineMode = useTimelineMode();
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
    // Page-mode keyframes from marcher_pages; timeline mode plays from the resolver, so it fetches
    // none (P7.13)
    const { data: marcherTimelines } = useManyCoordinateData(
        selectedPage && !timelineMode
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

    // Move the marchers to their positions at a time, without drawing
    const placePageMarchersAtTime = useCallback(
        (timeMilliseconds: number) => {
            if (!canvas) return;
            let output = true;

            const canvasMarchers = canvas.getLiveCanvasMarchers();
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

            return output;
        },
        [canvas, marcherTimelines],
    );

    // Timeline mode (P5.4): one reused buffer, filled from the resolver each frame
    const timelineBufferRef = useRef<TimelinePositionBuffer | null>(null);
    const placeTimelineMarchersAtTime = useCallback(
        (timeMilliseconds: number) => {
            if (!canvas) return;
            const buffer = (timelineBufferRef.current ??=
                new TimelinePositionBuffer());
            const beat = playbackBeat(beats, timeMilliseconds);
            const canvasMarchers = canvas.getLiveCanvasMarchers();
            // Not ready (or rebuilding with a new marcher count): leave marchers where they are
            if (buffer.fill(beat)) {
                const coords = { x: 0, y: 0 };
                buffer.forEachMarcher(canvasMarchers, (canvasMarcher, x, y) => {
                    coords.x = x;
                    coords.y = y;
                    canvasMarcher.setLiveCoordinates(coords);
                });
            }
            onTimelineBeat?.(beat, canvasMarchers);
            // The resolver has a position at every beat; the end of the show stops playback
            // through useTimelinePlaybackDriver (UI-9)
            return true;
        },
        [canvas, beats, onTimelineBeat],
    );

    const placeMarchersAtTime = timelineMode
        ? placeTimelineMarchersAtTime
        : placePageMarchersAtTime;

    // Set marcher positions at a specific time, and draw them on the next frame
    const setMarcherPositionsAtTime = useCallback(
        (timeMilliseconds: number) => {
            const output = placeMarchersAtTime(timeMilliseconds);
            canvas?.requestRenderAll();
            return output;
        },
        [canvas, placeMarchersAtTime],
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

    // The effect below restarts whenever its inputs change, which in page mode is every page
    // playback enters (the selected page and the keyframes around it). Its end-of-playback work
    // (every marcher's setCoords, freeing the frame atlas) runs only when playback really stops:
    // `isPlaying` goes false, the canvas changes, or the hook unmounts.
    const playingNow = useRef(isPlaying);
    playingNow.current = isPlaying;
    const canvasNow = useRef(canvas);
    canvasNow.current = canvas;
    const unmounted = useRef(false);
    useEffect(() => {
        unmounted.current = false;
        return () => {
            unmounted.current = true;
        };
    }, []);
    // setLiveCoordinates skips the control corners; refreshed once playback stops
    const liveCoordsStale = useRef(false);

    // Animate the canvas based on playback timestamp
    useEffect(() => {
        // Helper to sync the animation with the live playback position
        const animate = () => {
            if (!canvas) return;

            try {
                const currentTime = getLivePlaybackPosition() * 1000; // s to ms
                const continueAnimation = placeMarchersAtTime(currentTime);
                liveCoordsStale.current = true;
                // Draw now, in this frame; requestRenderAll would draw a frame late
                canvas.renderPlaybackFrame();
                // Timeline mode: useTimelinePlaybackDriver loops and stops; no page follows playback
                if (!timelineMode) void updateSelectedPage(currentTime);
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
            const continuing =
                playingNow.current &&
                canvasNow.current === canvas &&
                !unmounted.current;
            if (liveCoordsStale.current && canvas && !continuing) {
                liveCoordsStale.current = false;
                for (const marcher of canvas.getLiveCanvasMarchers())
                    marcher.setCoords();
                canvas.endPlaybackFrames();
            }
        };
    }, [
        isPlaying,
        canvas,
        placeMarchersAtTime,
        updateSelectedPage,
        timelineMode,
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

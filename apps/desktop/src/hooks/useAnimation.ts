import { useCallback, useEffect, useMemo, useRef } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { getCoordinatesAtTime } from "@/utilities/Keyframes";
import { useTimingObjects } from "@/hooks";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import { useManyCoordinateData } from "./queries/useCoordinateData";
import Page from "@/global/classes/Page";
import { useRenderingCallback } from "./rendering/useRenderingData";
import {
    subscribeToFrameClock,
    useFrameClockStore,
    useIsPlaying,
} from "@/services/clock/frame-clock";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
}

export const useAnimationNew = ({ canvas }: UseAnimationProps) => {
    const { renderingCallback, marcherIds } = useRenderingCallback();

    const updateCoordinates = useCallback(
        (timeMs: number) => {
            if (canvas == null) {
                console.warn("Canvas is null! This should not happen");
                return;
            }

            if (marcherIds == null) {
                console.warn("marcherIds is null! This should not happen");
                return;
            }

            const coordinates = renderingCallback(timeMs);

            if (coordinates == null) {
                console.warn("coordinates are null! This should not happen!");
                return;
            }

            canvas.updateMarcherCoordinates(coordinates, marcherIds);
            canvas.requestRenderAll();
        },
        [canvas, marcherIds, renderingCallback],
    );

    useEffect(() => {
        const unsubscribe = subscribeToFrameClock((timeMs) =>
            updateCoordinates(timeMs),
        );

        return () => unsubscribe();
    }, [updateCoordinates]);
};

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
    const isPlaying = useIsPlaying();
    const pause = useFrameClockStore.use.pause;
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
                    // try <></>{
                    const coords = getCoordinatesAtTime(
                        timeMilliseconds,
                        timeline,
                    );
                    if (!coords) output = false;
                    else canvasMarcher.setLiveCoordinates(coords.x, coords.y);
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
                pause();
                const lastPage = pages[pages.length - 1];
                if (lastPage !== selectedPage) {
                    setSelectedPage(lastPage);
                }
            } else if (currentPage?.id !== selectedPage?.id) {
                // We're on a different page, set the selected page to the current page
                setSelectedPage(currentPage);
            }
        },
        [pages, canvas, selectedPage, pagesById, setSelectedPage, pause],
    );

    // Animate the canvas based on playback timestamp
    useEffect(() => {
        // Helper to sync the animation with the live playback position
        const animate = () => {
            if (!canvas) return;

            try {
                const clockTime = useFrameClockStore.getState().currentTime;
                const currentTime = clockTime * 1000; // s to ms
                const continueAnimation =
                    setMarcherPositionsAtTime(currentTime);
                void updateSelectedPage(currentTime);
                animationFrameRef.current = requestAnimationFrame(animate);
                if (!continueAnimation) pause();
            } catch (e) {
                console.error(e);
                pause();
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
        pause,
    ]);

    return {
        setMarcherPositionsAtTime,
        _selectedPage: selectedPage,
        _isPlaying: isPlaying,
    };
};

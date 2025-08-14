import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getByMarcherId } from "@/global/classes/MarcherPage";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";

// Collision detection types
interface CollisionData {
    marcher1Id: number;
    marcher2Id: number;
    x: number;
    y: number;
    distance: number;
}

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
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const animationFrameRef = useRef<number | null>(null);
    const [currentCollisions, setCurrentCollisions] = useState<CollisionData[]>(
        [],
    );

    // Collision detection radius (in field units)
    const COLLISION_RADIUS = 15;
    const COLLISION_CHECK_INTERVAL = 100; // Check every 100ms for performance

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
            const marcherPagesForMarcher = getByMarcherId(
                marcherPages,
                marcher.id,
            );

            for (const marcherPage of marcherPagesForMarcher) {
                const page = pagesMap[marcherPage.page_id];
                if (page) {
                    coordinateMap.set((page.timestamp + page.duration) * 1000, {
                        x: marcherPage.x,
                        y: marcherPage.y,
                        path: marcherPage.path_data || undefined,
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

    // Pre-calculate collisions for each page
    const pageCollisions = useMemo(() => {
        if (!marchers.length || !pages.length || marcherTimelines.size === 0) {
            return new Map<number, CollisionData[]>();
        }

        // Start performance timer
        const collisionsMap = new Map<number, CollisionData[]>();
        for (const page of pages) {
            const collisionPairs = new Set<string>();
            const collisions: CollisionData[] = [];
            const pageStartTime = page.timestamp * 1000; //convert to ms for more precision
            const pageEndTime = (page.timestamp + page.duration) * 1000;

            // pre calculate positions
            for (
                let time = pageStartTime;
                time < pageEndTime;
                time += COLLISION_CHECK_INTERVAL
            ) {
                const marcherPositionsAtTime: Array<{
                    id: number;
                    x: number;
                    y: number;
                }> = [];

                for (const marcher of marchers) {
                    const timeline = marcherTimelines.get(marcher.id);
                    if (!timeline) continue;

                    try {
                        const position = getCoordinatesAtTime(time, timeline);
                        marcherPositionsAtTime.push({
                            id: marcher.id,
                            x: position.x,
                            y: position.y,
                        });
                    } catch (e) {
                        // Skip if marcher doesn't have position at this time
                        continue;
                    }
                }

                // detect collisions for this time slice
                for (let i = 0; i < marcherPositionsAtTime.length; i++) {
                    for (
                        let j = i + 1;
                        j < marcherPositionsAtTime.length;
                        j++
                    ) {
                        const marcher1 = marcherPositionsAtTime[i];
                        const marcher2 = marcherPositionsAtTime[j];

                        // find the magnitude
                        const mag = Math.sqrt(
                            Math.pow(marcher1.x - marcher2.x, 2) +
                                Math.pow(marcher1.y - marcher2.y, 2),
                        );

                        if (mag > COLLISION_RADIUS) continue;

                        // Create collision pair key (order independent)
                        const collisionString =
                            marcher1.id < marcher2.id
                                ? `${marcher1.id}-${marcher2.id}`
                                : `${marcher2.id}-${marcher1.id}`;

                        // if these two have gotten into a collision before ignore it
                        if (collisionPairs.has(collisionString)) continue;

                        collisionPairs.add(collisionString);
                        collisions.push({
                            x: (marcher1.x + marcher2.x) / 2,
                            y: (marcher1.y + marcher2.y) / 2,
                            distance: mag,
                            marcher1Id: marcher1.id,
                            marcher2Id: marcher2.id,
                        });
                    }
                }
            }

            collisionsMap.set(page.id, collisions);
        }
        return collisionsMap;
    }, [marchers, pages, marcherPages, marcherTimelines]);

    // Get collisions for the currently selected page
    const getCollisionsForSelectedPage = useCallback(() => {
        if (!selectedPage) {
            console.log("No selected page, returning empty collisions");
            return [];
        }

        const collisions = pageCollisions.get(selectedPage.id + 1) || [];
        console.log(
            "Collisions for selected page:",
            selectedPage.id,
            ":",
            collisions.length,
        );
        return collisions;
    }, [pageCollisions, selectedPage]);

    // Update collisions when selected page changes
    useEffect(() => {
        const collisions = getCollisionsForSelectedPage();
        setCurrentCollisions(collisions);
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
        [pages, selectedPage, setSelectedPage, setIsPlaying],
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

    return { setMarcherPositionsAtTime, currentCollisions };
};

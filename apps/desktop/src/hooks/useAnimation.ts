import { useCallback, useEffect, useRef } from "react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { useTimingObjects } from "@/hooks";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import {
    playbackBeat,
    TimelinePositionBuffer,
} from "@/timeline/timelineCanvas";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
    /**
     * Called each playback frame with the live beat, before the frame renders, to
     * style the marchers there (`useTimelineAppearance`)
     */
    onTimelineBeat?: (
        beat: number,
        canvasMarchers: ReturnType<OpenMarchCanvas["getLiveCanvasMarchers"]>,
    ) => unknown;
}

// eslint-disable-next-line max-lines-per-function
export const useAnimation = ({ canvas, onTimelineBeat }: UseAnimationProps) => {
    const { beats } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const {
        collisions: pageCollisions,
        // setCollisions,
        setCurrentCollision,
    } = useCollisionStore();

    const animationFrameRef = useRef<number | null>(null);

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

    // P5.4: one reused buffer, filled from the resolver each frame
    const timelineBufferRef = useRef<TimelinePositionBuffer | null>(null);
    // Move the marchers to their positions at a time, without drawing
    const placeMarchersAtTime = useCallback(
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

    // Set marcher positions at a specific time, and draw them on the next frame
    const setMarcherPositionsAtTime = useCallback(
        (timeMilliseconds: number) => {
            const output = placeMarchersAtTime(timeMilliseconds);
            canvas?.requestRenderAll();
            return output;
        },
        [canvas, placeMarchersAtTime],
    );

    // The effect below restarts whenever its inputs change. Its end-of-playback work
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
                // useTimelinePlaybackDriver loops and stops; no page follows playback
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
    }, [isPlaying, canvas, placeMarchersAtTime, setIsPlaying]);

    return {
        setMarcherPositionsAtTime,
        _selectedPage: selectedPage,
        _isPlaying: isPlaying,
        _setIsPlaying: setIsPlaying,
    };
};

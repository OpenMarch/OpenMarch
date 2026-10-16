/**
 * Editor side of the 3D View sync (ADR 0002 D-4, docs/3d/design.md §7).
 *
 * Mounted once in the editor. While a 3D View window is open it publishes:
 * - `clock` on play, pause, seek and page change, and every second while
 *   playing;
 * - `selection` on change;
 * - `invalidate` for every query the editor invalidates (writes, undo, redo
 *   and rolled-back transactions all end in `invalidateQueries`), and of
 *   `VIEW3D_TIMELINE_QUERY_KEY` after every committed timeline change.
 *
 * It answers the window's `hello` and handles its venue-change and playback
 * requests (playback runs the editor's own actions). With no window open it does nothing, except that it opens the
 * window when the show opens if the app setting
 * `VIEW3D_AUTO_OPEN_SETTING` is on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
    useMutation,
    useQueryClient,
    type QueryClient,
} from "@tanstack/react-query";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    getLivePlaybackPosition,
    getLivePlaybackRate,
    playbackStartInfoRef,
} from "@/components/timeline/audio/AudioPlayer";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { timeAtBeat, type BeatTiming } from "@/timeline/timeMap";
import { loopBounds } from "@/timeline/timelineTransport";
import {
    effectivePlaybackSpeed,
    usePlaybackSpeedStore,
} from "@/stores/PlaybackSpeedStore";
import { updateVenueSettingsMutationOptions } from "@/hooks/queries/useVenueSettings";
import { venueSettingsSchema } from "@/view3d/core/venueSettings";
import { pressAction } from "@/shortcuts/registry";
import { subscribeTimelineChanges } from "@/db-functions/timelineChanges";
import {
    VIEW3D_AUTO_OPEN_SETTING,
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    VIEW3D_TIMELINE_QUERY_KEY,
    isView3dPlaybackAction,
    VIEW3D_SET_SPEED,
    wallNowMs,
    type View3dClock,
    type View3dPlaybackAction,
    type View3dSelection,
} from "./protocol";

/** How often the clock is re-sent while playing, to correct drift. */
export const CLOCK_HEARTBEAT_MS = 1000;
/**
 * Playback starts a moment after `isPlaying` turns on (the audio player
 * schedules it), so the clock is sent again shortly after play.
 */
const PLAY_SETTLE_MS = 150;

/**
 * The show time to anchor the clock at, in milliseconds: the live audio
 * position while playing, otherwise the time at the timeline's displayed
 * beat (the playhead, or the cursor while a scrub suspends playback), where
 * the editor's clock and the 2D canvas hold when paused.
 */
export function currentAnchorShowMs(
    isPlaying: boolean,
    beats: readonly BeatTiming[],
    pausedBeat: number,
): number {
    if (isPlaying && playbackStartInfoRef.current) {
        return getLivePlaybackPosition() * 1000;
    }
    return timeAtBeat(beats, pausedBeat) * 1000;
}

/**
 * Forwards every `invalidateQueries` call on `queryClient` to `send`, batched
 * per microtask and de-duplicated. A call without a query key (a predicate or
 * no filter) forwards `[]`, which means "everything".
 *
 * @returns a function that restores the client's own `invalidateQueries`.
 */
export function relayInvalidations(
    queryClient: QueryClient,
    send: (queryKeys: unknown[][]) => void,
): () => void {
    const original = queryClient.invalidateQueries;
    let pending: Map<string, unknown[]> | null = null;

    const flush = () => {
        if (!pending) return;
        const keys = [...pending.values()];
        pending = null;
        send(keys.some((key) => key.length === 0) ? [[]] : keys);
    };

    const relayed = function (
        this: QueryClient,
        ...args: Parameters<QueryClient["invalidateQueries"]>
    ) {
        const queryKey = args[0]?.queryKey;
        const key = Array.isArray(queryKey) ? [...queryKey] : [];
        if (!pending) {
            pending = new Map();
            queueMicrotask(flush);
        }
        pending.set(JSON.stringify(key), key);
        return original.apply(this, args);
    } as QueryClient["invalidateQueries"];

    queryClient.invalidateQueries = relayed;
    return () => {
        if (queryClient.invalidateQueries === relayed) {
            queryClient.invalidateQueries = original;
        }
        pending = null;
    };
}

// eslint-disable-next-line max-lines-per-function
export function useView3dPublisher() {
    const queryClient = useQueryClient();
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const selectedPage = useSelectedPage()?.selectedPage ?? null;
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers;
    const { beats } = useTimingObjects();
    const pausedBeat = useTimelineSelectionStore(displayedBeat);
    // The playhead also moves while playing; only a paused one re-anchors the clock
    const heldBeat = isPlaying ? null : pausedBeat;
    const playbackSpeed = usePlaybackSpeedStore(effectivePlaybackSpeed);
    const chosenSpeed = usePlaybackSpeedStore((s) => s.speed);
    // What Play does, for the window's Play tooltip, as the editor's transport reads it
    const playLoops = useTimelineSelectionStore((s) => loopBounds(s) !== null);
    const { mutate: updateVenue } = useMutation(
        updateVenueSettingsMutationOptions(queryClient),
    );
    const [windowOpen, setWindowOpen] = useState(false);

    // Starts above any earlier editor session's numbers, so a reloaded
    // editor's clocks aren't ignored by a window that stayed open.
    const seqRef = useRef(Date.now());

    const selectedPageId = selectedPage?.id ?? null;
    const selectedMarcherIdsKey = (selectedMarchers ?? [])
        .map((marcher) => marcher.id)
        .join(",");

    // The latest state, for callbacks that outlive a render.
    const latest = useRef({
        isPlaying,
        selectedPage,
        selectedMarcherIdsKey,
        beats,
        pausedBeat,
        playLoops,
    });
    latest.current = {
        isPlaying,
        selectedPage,
        selectedMarcherIdsKey,
        beats,
        pausedBeat,
        playLoops,
    };

    const sendClock = useCallback(() => {
        const {
            isPlaying: playing,
            beats: b,
            pausedBeat: beat,
            playLoops: loops,
        } = latest.current;
        const clock: View3dClock = {
            seq: ++seqRef.current,
            playing,
            anchorShowMs: currentAnchorShowMs(playing, b, beat),
            anchorWallMs: wallNowMs(),
            // The window's clock runs at the speed the audio plays at, which takes a speed
            // change when the audio does (1 until playback has started)
            rate: playing ? getLivePlaybackRate() : 1,
            speed: effectivePlaybackSpeed(usePlaybackSpeedStore.getState()),
            chosenSpeed: usePlaybackSpeedStore.getState().speed,
            playLoops: loops,
        };
        window.electron.publishToView3d(VIEW3D_CLOCK_CHANNEL, clock);
    }, []);

    const sendSelection = useCallback(() => {
        const { selectedPage: page, selectedMarcherIdsKey: ids } =
            latest.current;
        const selection: View3dSelection = {
            selectedPageId: page?.id ?? null,
            selectedMarcherIds: ids ? ids.split(",").map(Number) : [],
        };
        window.electron.publishToView3d(VIEW3D_SELECTION_CHANNEL, selection);
    }, []);

    // Window state, hello and venue requests. Main pushes the state when the
    // window opens or closes; a hello also means it's open.
    useEffect(() => {
        const electron = window.electron;
        if (!electron?.onView3dWindowState) return;
        const cleanups = [
            electron.onView3dWindowState(setWindowOpen),
            electron.onView3dHello(() => {
                setWindowOpen(true);
                sendClock();
                sendSelection();
            }),
            electron.onView3dVenueChangeRequest((request) => {
                const parsed = venueSettingsSchema.safeParse(request?.settings);
                if (!parsed.success) {
                    console.warn(
                        "3D View: ignored an invalid venue change request",
                        parsed.error,
                    );
                    return;
                }
                // Writes with history, then invalidates ["view3d_venue"],
                // which the relay below forwards to the window.
                updateVenue(parsed.data);
            }),
        ];
        return () => cleanups.forEach((cleanup) => cleanup());
    }, [sendClock, sendSelection, updateVenue]);

    // Opens the window with the show when the app setting asks for it, in
    // the background so the editor keeps focus. This runs after the effect
    // above, so the window-state push and the window's hello aren't missed.
    useEffect(() => {
        const electron = window.electron;
        if (!electron?.openView3d || !electron.invoke) return;
        let cancelled = false;
        void Promise.resolve(
            electron.invoke("settings:get", VIEW3D_AUTO_OPEN_SETTING),
        ).then((autoOpen) => {
            if (!cancelled && autoOpen === true) {
                void electron.openView3d({ background: true });
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Clock: on play, pause, a move of the paused playhead, a tempo or speed
    // change, looping turned on or off, and a heartbeat while playing.
    useEffect(() => {
        if (!windowOpen) return;
        sendClock();
        if (!isPlaying) return;
        // Again after the audio player's effects in this commit, so a speed change has reached
        // the live clock
        let current = true;
        queueMicrotask(() => {
            if (current) sendClock();
        });
        const settle = setTimeout(sendClock, PLAY_SETTLE_MS);
        const heartbeat = setInterval(sendClock, CLOCK_HEARTBEAT_MS);
        return () => {
            current = false;
            clearTimeout(settle);
            clearInterval(heartbeat);
        };
    }, [
        windowOpen,
        isPlaying,
        heldBeat,
        beats,
        playbackSpeed,
        chosenSpeed,
        playLoops,
        sendClock,
    ]);

    useEffect(() => {
        if (windowOpen) sendSelection();
    }, [windowOpen, selectedPageId, selectedMarcherIdsKey, sendSelection]);

    useEffect(() => {
        if (!windowOpen) return;
        return relayInvalidations(queryClient, (queryKeys) =>
            window.electron.publishToView3d(VIEW3D_INVALIDATE_CHANNEL, {
                queryKeys,
            }),
        );
    }, [windowOpen, queryClient]);

    useEffect(() => {
        if (!windowOpen) return;
        return relayTimelineChanges(() =>
            window.electron.publishToView3d(VIEW3D_INVALIDATE_CHANNEL, {
                queryKeys: [[...VIEW3D_TIMELINE_QUERY_KEY]],
            }),
        );
    }, [windowOpen]);
}

/**
 * Calls `send` once per microtask in which timeline changes were committed,
 * so the window rebuilds its resolver (`VIEW3D_TIMELINE_QUERY_KEY`).
 *
 * @returns a function that stops relaying
 */
export function relayTimelineChanges(send: () => void): () => void {
    let pending = false;
    let stopped = false;
    const unsubscribe = subscribeTimelineChanges(() => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
            pending = false;
            if (!stopped) send();
        });
    });
    return () => {
        stopped = true;
        unsubscribe();
    };
}

/** Mount point for `useView3dPublisher`; renders nothing. */
/**
 * Playback buttons and shortcuts in the 3D View window run the same actions
 * as the editor's own (ADR 0002 D-4, `view3d:playback-request`). An action
 * that is disabled right now does nothing, as in the editor. A held action (a
 * playback speed key) lasts until the window lets go of its key, or closes.
 */
export function useView3dPlaybackRequests() {
    useEffect(() => {
        const electron = window.electron;
        if (!electron?.onView3dPlaybackRequest) return;
        const held = new Map<View3dPlaybackAction, () => void>();
        const letGo = (action: View3dPlaybackAction) => {
            const release = held.get(action);
            held.delete(action);
            release?.();
        };
        const letGoAll = () => [...held.keys()].forEach(letGo);
        const cleanups = [
            electron.onView3dPlaybackRequest((request) => {
                if (request?.action === VIEW3D_SET_SPEED) {
                    const { speed } = request;
                    if (typeof speed === "number" && Number.isFinite(speed))
                        usePlaybackSpeedStore.getState().setSpeed(speed);
                    return;
                }
                if (!isView3dPlaybackAction(request?.action)) return;
                // A release, or a second press without one
                letGo(request.action);
                if (request.release === true) return;
                const release = pressAction(request.action);
                if (release) held.set(request.action, release);
            }),
        ];
        if (electron.onView3dWindowState)
            cleanups.push(
                electron.onView3dWindowState((open) => {
                    if (!open) letGoAll();
                }),
            );
        return () => {
            cleanups.forEach((cleanup) => cleanup());
            letGoAll();
        };
    }, []);
}

export function View3dPublisher() {
    useView3dPublisher();
    useView3dPlaybackRequests();
    return null;
}

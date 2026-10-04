/**
 * Editor side of the 3D View sync (ADR 0002 D-4, docs/3d/design.md §7).
 *
 * Mounted once in the editor. While a 3D View window is open it publishes:
 * - `clock` on play, pause, seek and page change, and every second while
 *   playing;
 * - `selection` on change;
 * - `invalidate` for every query the editor invalidates (writes, undo, redo
 *   and rolled-back transactions all end in `invalidateQueries`).
 *
 * It answers the window's `hello` and handles its venue-change requests.
 * With no window open it does nothing.
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
    getPausedPlaybackSeconds,
    playbackStartInfoRef,
} from "@/components/timeline/audio/AudioPlayer";
import { updateVenueSettingsMutationOptions } from "@/hooks/queries/useVenueSettings";
import { venueSettingsSchema } from "@/view3d/core/venueSettings";
import type Page from "@/global/classes/Page";
import {
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    wallNowMs,
    type View3dClock,
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
 * position while playing, otherwise the selected page's end (where the 2D
 * canvas holds when paused).
 */
export function currentAnchorShowMs(
    isPlaying: boolean,
    selectedPage: Pick<Page, "timestamp" | "duration"> | null,
): number {
    if (isPlaying && playbackStartInfoRef.current) {
        return getLivePlaybackPosition() * 1000;
    }
    return getPausedPlaybackSeconds(selectedPage as Page | null) * 1000;
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
    const latest = useRef({ isPlaying, selectedPage, selectedMarcherIdsKey });
    latest.current = { isPlaying, selectedPage, selectedMarcherIdsKey };

    const sendClock = useCallback(() => {
        const { isPlaying: playing, selectedPage: page } = latest.current;
        const clock: View3dClock = {
            seq: ++seqRef.current,
            playing,
            anchorShowMs: currentAnchorShowMs(playing, page),
            anchorWallMs: wallNowMs(),
            rate: 1,
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

    // Clock: on play, pause and page change (a seek selects a page), and a
    // heartbeat while playing.
    useEffect(() => {
        if (!windowOpen) return;
        sendClock();
        if (!isPlaying) return;
        const settle = setTimeout(sendClock, PLAY_SETTLE_MS);
        const heartbeat = setInterval(sendClock, CLOCK_HEARTBEAT_MS);
        return () => {
            clearTimeout(settle);
            clearInterval(heartbeat);
        };
    }, [windowOpen, isPlaying, selectedPage, sendClock]);

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
}

/** Mount point for `useView3dPublisher`; renders nothing. */
export function View3dPublisher() {
    useView3dPublisher();
    return null;
}

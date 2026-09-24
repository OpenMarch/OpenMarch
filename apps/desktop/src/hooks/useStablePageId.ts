import { useRef } from "react";

/**
 * Freezes `pageId` while `isPlaying` is true, returning the id of the page that was
 * selected when playback started (or last paused on) instead of following the live
 * playback page. Resumes tracking `pageId` the instant `isPlaying` becomes false.
 *
 * Intended for `useQuery` calls keyed by the selected page id whose data only feeds
 * editing UI/canvas work that's already skipped during playback (see the `!isPlaying`
 * checks around their consumers) — without this, every page boundary during playback
 * introduces a brand-new query key, firing a real DB fetch (over Electron IPC) the
 * first time playback reaches a page that isn't cached yet.
 */
export function useStablePageId<T extends number | null | undefined>(
    pageId: T,
    isPlaying: boolean,
): T {
    const frozen = useRef(pageId);
    if (!isPlaying) frozen.current = pageId;
    return frozen.current;
}

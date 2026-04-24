import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import type Page from "@/global/classes/Page";

/**
 * Global show time in ms — matches coordinate sampling: live audio clock when playing,
 * end of selected page when paused (see AudioClock).
 */
export function getCurrentShowTimeMs(
    isPlaying: boolean,
    selectedPage: Pick<Page, "timestamp" | "duration"> | null | undefined,
): number {
    if (isPlaying) {
        return Math.round(getLivePlaybackPosition() * 1000);
    } else if (selectedPage) {
        return Math.round(
            (selectedPage.timestamp + selectedPage.duration) * 1000,
        );
    }
    return 0;
}

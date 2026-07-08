import { describe, expect, it } from "vitest";
import {
    MAX_PLACEHOLDER_AUDIO_SECONDS,
    computePlaceholderAudioDurationFromPages,
} from "../AudioFile";

describe("computePlaceholderAudioDurationFromPages", () => {
    it("returns 10 seconds when there are no pages", () => {
        expect(computePlaceholderAudioDurationFromPages([])).toBe(10);
    });

    it("returns last page end plus 10 seconds", () => {
        const pages = [
            { timestamp: 0, duration: 30 },
            { timestamp: 30, duration: 45 },
        ];
        expect(computePlaceholderAudioDurationFromPages(pages)).toBe(85);
    });

    it("caps duration at MAX_PLACEHOLDER_AUDIO_SECONDS", () => {
        const pages = [
            {
                timestamp: 0,
                duration: MAX_PLACEHOLDER_AUDIO_SECONDS,
            },
        ];
        expect(computePlaceholderAudioDurationFromPages(pages)).toBe(
            MAX_PLACEHOLDER_AUDIO_SECONDS,
        );
    });
});

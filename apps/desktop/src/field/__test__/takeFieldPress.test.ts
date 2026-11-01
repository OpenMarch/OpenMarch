// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { takeFieldPress } from "../takeFieldPress";

const timeline = () => useTimelineSelectionStore.getState();

beforeEach(() => {
    timeline().reset();
    timeline().setShowEndBeat(16);
});

describe("takeFieldPress (#202)", () => {
    it("leaves an ordinary press to the editor", () => {
        expect(takeFieldPress()).toBe(false);
    });

    it("takes the first press after a paused preview, which only clears it (story 60)", () => {
        timeline().cue(5);
        expect(takeFieldPress()).toBe(true);
        expect(timeline().cursorBeat).toBeNull();
        expect(takeFieldPress()).toBe(false);
    });

    it("leaves presses alone while playing: the cursor there is the playback's", () => {
        timeline().cue(5);
        timeline().setPlayback({ kind: "on" });
        expect(takeFieldPress()).toBe(false);
        expect(timeline().cursorBeat).toBe(5);
    });
});

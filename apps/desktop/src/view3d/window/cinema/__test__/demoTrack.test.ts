// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILTIN_PRESETS } from "@openmarch/core";
import { demoTrack, DEMO_SHOT_COUNTS } from "../demoTrack";

const halfSecondCounts = (count: number) => count * 500;

describe("demoTrack", () => {
    it("puts a shot every 16 counts", () => {
        const track = demoTrack(64, halfSecondCounts);
        expect(DEMO_SHOT_COUNTS).toBe(16);
        expect(track.map((shot) => shot.startMs)).toEqual([
            0, 8000, 16000, 24000,
        ]);
    });

    it("never puts the same rig twice in a row", () => {
        const track = demoTrack(16 * 40, halfSecondCounts);
        expect(track).toHaveLength(40);
        for (let i = 1; i < track.length; i++)
            expect(track[i].rig).not.toEqual(track[i - 1].rig);
    });

    it("takes each shot from the built-in presets, in their order", () => {
        const track = demoTrack(64, halfSecondCounts);
        const rigs = track.map((shot) =>
            shot.rig.kind === "builtin" ? shot.rig.id : "pose",
        );
        // the side 2 25 follows the side 1 25 on the same rig, so it is skipped
        expect(rigs).toEqual(["pressBox", "yard25", "topDown", "endZone"]);
        expect(track[1].transition).toBe(BUILTIN_PRESETS[1].shot.transition);
        expect(track[1].rigSettings).toEqual({ side: 1 });
    });

    it("gives every shot its own id", () => {
        const track = demoTrack(16 * 40, halfSecondCounts);
        expect(new Set(track.map((shot) => shot.id)).size).toBe(track.length);
    });

    it("gives a show with no counts, or a count total that isn't a number, one shot", () => {
        expect(demoTrack(0, halfSecondCounts)).toHaveLength(1);
        expect(demoTrack(Number.NaN, halfSecondCounts)).toHaveLength(1);
        expect(demoTrack(-8, halfSecondCounts)[0].startMs).toBe(0);
    });

    it("starts a last shot in a show that ends partway through 16 counts", () => {
        expect(demoTrack(40, halfSecondCounts)).toHaveLength(3);
    });
});

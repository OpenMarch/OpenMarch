import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { restoreStillPose, STILL_POSE } from "../marchers/stillPose";

const still = new THREE.AnimationClip(STILL_POSE, 1, [
    new THREE.VectorKeyframeTrack("spine.position", [0, 1], [0, 1, 2, 0, 1, 2]),
    new THREE.QuaternionKeyframeTrack(
        "thigh.quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
    ),
]);

describe("restoreStillPose", () => {
    it("adds the still tracks a clip lacks, over the clip's length", () => {
        const walk = new THREE.AnimationClip("walk", -1, [
            new THREE.QuaternionKeyframeTrack(
                "thigh.quaternion",
                [0, 0.25, 0.5],
                [0, 0, 0, 1, 0.1, 0, 0, 0.99, 0, 0, 0, 1],
            ),
        ]);
        const [got, ...rest] = restoreStillPose([still, walk]);
        expect(rest).toEqual([]);
        expect(got).toBe(walk);
        expect(got.duration).toBe(0.5);
        expect(got.tracks.map((t) => t.name)).toEqual([
            "thigh.quaternion",
            "spine.position",
        ]);
        // the clip's own track wins
        expect(got.tracks[0].times).toHaveLength(3);
        const spine = got.tracks[1];
        expect([...spine.times]).toEqual([0, 0.5]);
        expect([...spine.values]).toEqual([0, 1, 2, 0, 1, 2]);
        expect(spine).toBeInstanceOf(THREE.VectorKeyframeTrack);
        expect(spine).not.toBe(still.tracks[0]);
    });

    it("leaves a pack without a still pose alone", () => {
        const walk = new THREE.AnimationClip("walk", 0.5, []);
        const clips = [walk];
        expect(restoreStillPose(clips)).toBe(clips);
        expect(walk.tracks).toEqual([]);
    });
});

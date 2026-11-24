// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    hiddenPropsOf,
    isView3dCameraWanted,
    isView3dClock,
    isView3dHiddenProps,
    isView3dInvalidate,
    isView3dSelection,
    newerClock,
    parseCameraMove,
    parseCameraPose,
    showTimeAt,
    VIEW3D_CAMERA_MOVE_CHANNEL,
    VIEW3D_CAMERA_WANTED_CHANNEL,
    VIEW3D_HIDDEN_PROPS_CHANNEL,
    VIEW3D_PUBLISH_CHANNELS,
    type View3dClock,
} from "../protocol";

const clock = (overrides: Partial<View3dClock> = {}): View3dClock => ({
    seq: 1,
    playing: false,
    anchorShowMs: 12_000,
    anchorWallMs: 1_000_000,
    rate: 1,
    speed: 1,
    chosenSpeed: 1,
    playLoops: false,
    ...overrides,
});

describe("showTimeAt", () => {
    it("advances from the anchor while playing", () => {
        const playing = clock({ playing: true });
        expect(showTimeAt(playing, 1_000_000)).toBe(12_000);
        expect(showTimeAt(playing, 1_000_250)).toBe(12_250);
        expect(showTimeAt(playing, 1_003_000)).toBe(15_000);
    });

    it("holds the anchor while paused", () => {
        const paused = clock({ playing: false });
        expect(showTimeAt(paused, 1_000_000)).toBe(12_000);
        expect(showTimeAt(paused, 1_060_000)).toBe(12_000);
    });

    it("scales elapsed wall time by the rate", () => {
        expect(showTimeAt(clock({ playing: true, rate: 0.5 }), 1_002_000)).toBe(
            13_000,
        );
        expect(showTimeAt(clock({ playing: true, rate: 2 }), 1_002_000)).toBe(
            16_000,
        );
    });

    it("holds at the anchor when the wall time is before it", () => {
        expect(showTimeAt(clock({ playing: true }), 999_990)).toBe(12_000);
    });
});

describe("newerClock", () => {
    it("takes the first clock", () => {
        const first = clock({ seq: 5 });
        expect(newerClock(null, first)).toBe(first);
    });

    it("takes a newer seq", () => {
        const current = clock({ seq: 5 });
        const next = clock({ seq: 6, playing: true });
        expect(newerClock(current, next)).toBe(next);
    });

    it("ignores an older or repeated seq that arrives out of order", () => {
        const current = clock({ seq: 7, anchorShowMs: 20_000 });
        const late = clock({ seq: 6, anchorShowMs: 1_000 });
        expect(newerClock(current, late)).toBe(current);
        expect(newerClock(current, clock({ seq: 7 }))).toBe(current);
    });

    it("keeps the newest of a shuffled stream", () => {
        const stream = [3, 1, 4, 2, 5].map((seq) =>
            clock({ seq, anchorShowMs: seq * 1000 }),
        );
        const kept = stream.reduce<View3dClock | null>(newerClock, null);
        expect(kept?.seq).toBe(5);
        expect(kept?.anchorShowMs).toBe(5000);
    });
});

describe("payload guards", () => {
    it("accepts well-formed payloads", () => {
        expect(isView3dClock(clock())).toBe(true);
        expect(
            isView3dSelection({ selectedPageId: 3, selectedMarcherIds: [1] }),
        ).toBe(true);
        expect(
            isView3dSelection({ selectedPageId: null, selectedMarcherIds: [] }),
        ).toBe(true);
        expect(isView3dInvalidate({ queryKeys: [[]] })).toBe(true);
        expect(isView3dInvalidate({ queryKeys: [["pages"], ["x", 1]] })).toBe(
            true,
        );
    });

    it("rejects malformed payloads", () => {
        expect(isView3dClock(null)).toBe(false);
        expect(isView3dClock({ ...clock(), seq: "1" })).toBe(false);
        expect(isView3dClock({ ...clock(), anchorShowMs: NaN })).toBe(false);
        expect(
            isView3dSelection({ selectedPageId: 3, selectedMarcherIds: ["1"] }),
        ).toBe(false);
        expect(isView3dSelection({ selectedMarcherIds: [] })).toBe(false);
        expect(isView3dInvalidate({ queryKeys: ["pages"] })).toBe(false);
    });
});

describe("hidden props", () => {
    it("lists the hidden props' item ids, ascending, from the UI setting", () => {
        expect(hiddenPropsOf({ 9: true, 3: true, 4: false })).toEqual({
            hiddenItemIds: [3, 9],
        });
        expect(hiddenPropsOf({})).toEqual({ hiddenItemIds: [] });
    });

    it("checks a payload the window receives", () => {
        expect(isView3dHiddenProps({ hiddenItemIds: [1, 2] })).toBe(true);
        expect(isView3dHiddenProps({ hiddenItemIds: [] })).toBe(true);
        expect(isView3dHiddenProps({ hiddenItemIds: ["1"] })).toBe(false);
        expect(isView3dHiddenProps({})).toBe(false);
        expect(isView3dHiddenProps(null)).toBe(false);
    });

    it("is a channel the editor publishes", () => {
        expect(VIEW3D_PUBLISH_CHANNELS).toContain(VIEW3D_HIDDEN_PROPS_CHANNEL);
    });
});

describe("parseCameraPose", () => {
    const pose = {
        position: [1, 2, 3],
        direction: [0, -0.5, -0.8],
        fov: 50,
        aspect: 1.6,
    };

    it("accepts a pose", () => {
        expect(parseCameraPose(pose)).toEqual(pose);
    });

    it("rejects anything else", () => {
        for (const bad of [
            null,
            "pose",
            { ...pose, position: [1, 2] },
            { ...pose, direction: [0, Number.NaN, 1] },
            { ...pose, fov: 0 },
            { ...pose, fov: 180 },
            { ...pose, aspect: -1 },
            { ...pose, aspect: Number.POSITIVE_INFINITY },
        ])
            expect(parseCameraPose(bad)).toBeNull();
    });
});

describe("parseCameraMove", () => {
    it("accepts a move", () => {
        expect(
            parseCameraMove({ position: [0, 15, 20], target: [0, 0, -20] }),
        ).toEqual({ position: [0, 15, 20], target: [0, 0, -20] });
    });

    it("rejects a camera looking at itself, or anything else", () => {
        expect(
            parseCameraMove({ position: [1, 2, 3], target: [1, 2, 3] }),
        ).toBeNull();
        expect(
            parseCameraMove({ position: [0, 1], target: [0, 0, 0] }),
        ).toBeNull();
        expect(parseCameraMove(null)).toBeNull();
    });

    it("is a channel the editor publishes, with camera-wanted", () => {
        expect(VIEW3D_PUBLISH_CHANNELS).toContain(VIEW3D_CAMERA_MOVE_CHANNEL);
        expect(VIEW3D_PUBLISH_CHANNELS).toContain(VIEW3D_CAMERA_WANTED_CHANNEL);
        expect(isView3dCameraWanted({ wanted: true })).toBe(true);
        expect(isView3dCameraWanted({ wanted: "yes" })).toBe(false);
    });
});

describe("the preloads' copies of the publish channels", () => {
    // Preloads keep their own list (they can't import the app's code at run time): a channel
    // missing there throws in the 3D View, or never reaches it
    it.each(["index.ts", "view3d.ts"])(
        "electron/preload/%s lists every channel",
        (file) => {
            const source = readFileSync(
                resolve(__dirname, "../../../../electron/preload", file),
                "utf8",
            );
            for (const channel of VIEW3D_PUBLISH_CHANNELS)
                expect(source).toContain(`"${channel}"`);
        },
    );
});

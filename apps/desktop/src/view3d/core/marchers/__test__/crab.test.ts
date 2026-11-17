import { describe, expect, it } from "vitest";
import {
    familySizes,
    pickBlend,
    type Manifest,
} from "../../../render/step-blend.js";
import { crabDirection, isPercussionSection } from "../crab";

const deg = (d: number) => (d * Math.PI) / 180;
/** Travel at `d` degrees off straight forward (toward the performer's left, +x). */
const toward = (d: number): [number, number] => [
    Math.sin(deg(d)),
    Math.cos(deg(d)),
];

describe("isPercussionSection", () => {
    it.each(["Snare", "Tenors", "Bass Drum", "Cymbals", "Flub Drum"])(
        "the battery crabs: %s",
        (name) => expect(isPercussionSection(name)).toBe(true),
    );
    it.each(["Marimba", "Vibraphone", "Xylophone", "Aux Percussion"])(
        "the pit crabs: %s",
        (name) => expect(isPercussionSection(name)).toBe(true),
    );
    it.each(["Trumpet", "Flute", "Color Guard", "Drum Major", "Other", ""])(
        "nobody else does: %s",
        (name) => expect(isPercussionSection(name)).toBe(false),
    );
    it("ignores case and spaces at the ends", () => {
        expect(isPercussionSection("  bass drum ")).toBe(true);
    });
});

describe("crabDirection", () => {
    it("names the side and the angle off straight forward", () => {
        expect(crabDirection(...toward(90), 0).family).toBe("crabL090");
        expect(crabDirection(...toward(-90), 0).family).toBe("crabR090");
        expect(crabDirection(...toward(45), 0).family).toBe("crabL045");
        expect(crabDirection(...toward(135), 0).family).toBe("crabL135");
        expect(crabDirection(...toward(-160), 0).family).toBe("crabR160");
    });

    it("picks the nearest angle with its own clips", () => {
        expect(crabDirection(...toward(13), 0).family).toBe("crabL010");
        expect(crabDirection(...toward(53), 0).family).toBe("crabL060");
        expect(crabDirection(...toward(52), 0).family).toBe("crabL045");
    });

    it("marches straight forward and back", () => {
        expect(crabDirection(...toward(3), 0).family).toBe("forward");
        expect(crabDirection(...toward(177), 0).family).toBe("backward");
    });

    it.each([3, 13, 45, 90, 135, 177, -45, -90])(
        "never turns the legs, which would turn the hips (%d degrees)",
        (d) => expect(crabDirection(...toward(d), 0).legYaw).toBe(0),
    );

    it("reads the angle against the facing, not the field", () => {
        // facing the performer's left (+x), travel toward +x is straight ahead
        expect(crabDirection(1, 0, deg(90)).family).toBe("forward");
        // and travel toward the audience is to the performer's right
        expect(crabDirection(0, 1, deg(90)).family).toBe("crabR090");
    });

    it("is nothing for no travel", () => {
        expect(crabDirection(0, 0, 0).family).toBe("none");
    });
});

describe("crab clips in the step-size families", () => {
    const loop = (name: string, step: number, extra: object) => ({
        name,
        base: name,
        height: 1,
        step_m: step,
        loop: true,
        ...extra,
    });
    const manifest = [
        loop("slideL8to5", 0.57, { dir: [1, 0] }),
        loop("crabL090_8to5", 0.57, {
            dir: [1, 0],
            family: "crabL090",
            gait: "crab",
        }),
        loop("crabL090_6to5", 0.76, {
            dir: [1, 0],
            family: "crabL090",
            gait: "crab",
        }),
    ] as unknown as Manifest;

    it("keeps a crab's sideways clips out of the slides", () => {
        expect(familySizes(manifest, "slideL").map((c) => c.name)).toEqual([
            "slideL8to5",
        ]);
    });

    it("blends a crab's own sizes", () => {
        const p = pickBlend(manifest, "crabL090", 0.665);
        expect([p.a, p.b]).toEqual(["crabL090_8to5", "crabL090_6to5"]);
        expect(p.weight).toBeCloseTo(0.5, 5);
    });
});

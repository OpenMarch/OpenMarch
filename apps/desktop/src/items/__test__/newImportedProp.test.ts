import { expect, it } from "vitest";
import { newImportedProp } from "../newImportedProp";

const args = (height: number) => ({
    modelValue: "library:abc@" + "0".repeat(64),
    footprint: { width: 1.2, depth: 0.8, height },
    name: "Chair 1",
    home: [10, 20] as [number, number],
    beatId: 3,
    rotation: 90,
});

it("names the model and takes its footprint, as an unlocked prop", () => {
    expect(newImportedProp(args(0.9))).toEqual({
        kind: "prop",
        name: "Chair 1",
        surfaceType: "obstacle",
        model: "library:abc@" + "0".repeat(64),
        home: [10, 20],
        beatId: 3,
        geometry: {
            outlineType: "rectangle",
            width: 1.2,
            depth: 0.8,
            height: 0.9,
            rotation: 90,
        },
    });
});

it("makes a flat model a Floor prop", () => {
    expect(newImportedProp(args(0.01)).surfaceType).toBe("floor");
});

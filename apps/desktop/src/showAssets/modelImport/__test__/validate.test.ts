// @vitest-environment node
/** Which checker errors the import drops along with what it drops (#1168) */
import { describe, expect, it } from "vitest";
import { droppedContent } from "../validate";

/** A mesh drawing accessors 0 and 1, an animation reading 2 and 3, and a skin reading 3 */
const json = {
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    animations: [{ samplers: [{ input: 2, output: 3 }] }],
    skins: [{ inverseBindMatrices: 4 }],
    accessors: [
        { bufferView: 0 },
        { bufferView: 0 },
        { bufferView: 1 },
        { bufferView: 2 },
        { bufferView: 2 },
    ],
};

describe("errors in what the import drops", () => {
    it("keeps errors in a buffer view a picture reads, though an animation reads it too", () => {
        const withImage = {
            ...json,
            images: [{ bufferView: 1, mimeType: "image/png" }],
        };
        expect(droppedContent(withImage)("/bufferViews/1")).toBe(false);
    });

    const dropped = droppedContent(json);

    it("drops errors in the animations", () => {
        expect(dropped("/animations/0/samplers/0/input")).toBe(true);
    });

    it("drops errors in an accessor only an animation reads, and in its buffer view", () => {
        expect(dropped("/accessors/2")).toBe(true);
        expect(dropped("/accessors/2/min")).toBe(true);
        expect(dropped("/bufferViews/1")).toBe(true);
    });

    it("keeps errors in what the model draws, or shares with it", () => {
        expect(dropped("/accessors/0")).toBe(false);
        expect(dropped("/accessors/3")).toBe(true);
        // Accessor 3's buffer view also holds the skin's matrices
        expect(dropped("/bufferViews/2")).toBe(false);
        expect(dropped("/bufferViews/0")).toBe(false);
        expect(dropped("/meshes/0")).toBe(false);
        expect(dropped(undefined)).toBe(false);
    });
});

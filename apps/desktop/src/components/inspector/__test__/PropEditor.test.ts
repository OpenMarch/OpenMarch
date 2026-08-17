import { describe, expect, it } from "vitest";
import { OUTLINE_KEYS } from "../PropEditor";
import { PROP_OUTLINES } from "@/global/classes/canvasObjects/propOutlines";

describe("OUTLINE_KEYS", () => {
    it("has a translation key for every outline type", () => {
        // PROP_OUTLINES is the single source of truth for what outlines exist.
        // Any outline missing here renders its raw value in the inspector.
        expect(Object.keys(OUTLINE_KEYS).sort()).toEqual(
            Object.keys(PROP_OUTLINES).sort(),
        );
    });

    it("has no keys for outlines that do not exist", () => {
        for (const outline of Object.keys(OUTLINE_KEYS)) {
            expect(PROP_OUTLINES).toHaveProperty(outline);
        }
    });
});

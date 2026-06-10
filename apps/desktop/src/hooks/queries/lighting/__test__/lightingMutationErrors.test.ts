import { describe, expect, it } from "vitest";
import {
    getLightingEffectBatchUpdateErrorMessage,
    getLightingEffectUpdateErrorMessage,
    isLightingEffectGroupOverlapError,
} from "../lightingMutationErrors";

const OVERLAP_MESSAGE =
    "This change overlaps another effect that uses the same group. Adjust timing or remove the group from the conflicting effect.";

describe("lightingMutationErrors", () => {
    describe("isLightingEffectGroupOverlapError", () => {
        it("detects overlap errors from Error instances", () => {
            expect(
                isLightingEffectGroupOverlapError(
                    new Error(
                        "Lighting group 3 is already controlled by overlapping effect 1 while effect 2 is active.",
                    ),
                ),
            ).toBe(true);
        });

        it("detects overlap errors from string values", () => {
            expect(
                isLightingEffectGroupOverlapError(
                    "already controlled by overlapping effect",
                ),
            ).toBe(true);
        });

        it("returns false for unrelated errors", () => {
            expect(
                isLightingEffectGroupOverlapError(
                    new Error("Lighting effect 5 not found after update."),
                ),
            ).toBe(false);
        });
    });

    describe("getLightingEffectUpdateErrorMessage", () => {
        it("returns overlap message for group exclusivity failures", () => {
            expect(
                getLightingEffectUpdateErrorMessage(
                    new Error(
                        "Lighting group 1 is already controlled by overlapping effect 2 while effect 3 is active.",
                    ),
                ),
            ).toBe(OVERLAP_MESSAGE);
        });

        it("returns generic message for other failures", () => {
            expect(
                getLightingEffectUpdateErrorMessage(
                    new Error("Something else went wrong"),
                ),
            ).toBe("Error updating lighting effect");
        });
    });

    describe("getLightingEffectBatchUpdateErrorMessage", () => {
        it("returns overlap message for group exclusivity failures", () => {
            expect(
                getLightingEffectBatchUpdateErrorMessage(
                    new Error("already controlled"),
                ),
            ).toBe(OVERLAP_MESSAGE);
        });

        it("returns generic batch message for other failures", () => {
            expect(
                getLightingEffectBatchUpdateErrorMessage("network error"),
            ).toBe("Error updating lighting effects");
        });
    });
});

import { describe, expect, it } from "vitest";
import {
    getLightingEffectBatchUpdateErrorMessage,
    getLightingEffectCreateErrorMessage,
    getLightingEffectLayerUpdateErrorMessage,
    getLightingEffectUpdateErrorMessage,
    isLightingEffectGroupOverlapError,
    isLightingEffectLayerOverlapError,
} from "../lightingMutationErrors";

const GROUP_OVERLAP_MESSAGE =
    "This change overlaps another effect that uses the same group. Adjust timing or remove the group from the conflicting effect.";

const LAYER_OVERLAP_MESSAGE =
    "Effect layers cannot overlap. Adjust positions or sizes.";

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

    describe("isLightingEffectLayerOverlapError", () => {
        it("detects layer overlap errors from Error instances", () => {
            expect(
                isLightingEffectLayerOverlapError(
                    new Error("Effect layers overlap within lighting effect."),
                ),
            ).toBe(true);
        });

        it("returns false for unrelated errors", () => {
            expect(
                isLightingEffectLayerOverlapError(
                    new Error("Lighting effect 5 not found after update."),
                ),
            ).toBe(false);
        });
    });

    describe("getLightingEffectLayerUpdateErrorMessage", () => {
        it("returns layer overlap message for layer exclusivity failures", () => {
            expect(
                getLightingEffectLayerUpdateErrorMessage(
                    new Error("Effect layers overlap within lighting effect."),
                ),
            ).toBe(LAYER_OVERLAP_MESSAGE);
        });

        it("returns generic message for other failures", () => {
            expect(
                getLightingEffectLayerUpdateErrorMessage(
                    new Error("Something else went wrong"),
                ),
            ).toBe("Error updating effect layers");
        });
    });

    describe("getLightingEffectUpdateErrorMessage", () => {
        it("returns layer overlap message before group overlap", () => {
            expect(
                getLightingEffectUpdateErrorMessage(
                    new Error("Effect layers overlap within lighting effect."),
                ),
            ).toBe(LAYER_OVERLAP_MESSAGE);
        });

        it("returns overlap message for group exclusivity failures", () => {
            expect(
                getLightingEffectUpdateErrorMessage(
                    new Error(
                        "Lighting group 1 is already controlled by overlapping effect 2 while effect 3 is active.",
                    ),
                ),
            ).toBe(GROUP_OVERLAP_MESSAGE);
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
        it("returns layer overlap message for layer exclusivity failures", () => {
            expect(
                getLightingEffectBatchUpdateErrorMessage(
                    new Error("Effect layers overlap within lighting effect."),
                ),
            ).toBe(LAYER_OVERLAP_MESSAGE);
        });

        it("returns overlap message for group exclusivity failures", () => {
            expect(
                getLightingEffectBatchUpdateErrorMessage(
                    new Error("already controlled"),
                ),
            ).toBe(GROUP_OVERLAP_MESSAGE);
        });

        it("returns generic batch message for other failures", () => {
            expect(
                getLightingEffectBatchUpdateErrorMessage("network error"),
            ).toBe("Error updating lighting effects");
        });
    });

    describe("getLightingEffectCreateErrorMessage", () => {
        it("returns layer overlap message for layer exclusivity failures", () => {
            expect(
                getLightingEffectCreateErrorMessage(
                    new Error("Effect layers overlap within lighting effect."),
                ),
            ).toBe(LAYER_OVERLAP_MESSAGE);
        });

        it("returns generic message for other failures", () => {
            expect(
                getLightingEffectCreateErrorMessage(
                    new Error("Something else went wrong"),
                ),
            ).toBe("Error creating lighting effects");
        });
    });
});

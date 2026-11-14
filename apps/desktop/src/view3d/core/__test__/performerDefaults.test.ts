import { describe, expect, it } from "vitest";
import {
    BUILT_IN_PERFORMER_DEFAULTS,
    performerDefaults,
    performerDefaultsSchema,
} from "../performerDefaults";

describe("performerDefaults", () => {
    it("is left foot, foot on the dot, round the corner, mark time, drums crab", () => {
        expect(performerDefaults(undefined)).toEqual({
            stepOffFoot: "left",
            dotMode: "foot",
            directionChange: "corner",
            holdWhileBandMoves: "markTime",
            percussionTravel: "crab",
        });
        expect(performerDefaults({})).toEqual(BUILT_IN_PERFORMER_DEFAULTS);
    });

    it("takes each saved field and leaves the rest built in", () => {
        expect(
            performerDefaults({ dotMode: "body", directionChange: undefined }),
        ).toEqual({ ...BUILT_IN_PERFORMER_DEFAULTS, dotMode: "body" });
    });

    it("reads a value it doesn't know as unset", () => {
        expect(
            performerDefaultsSchema.parse({
                dotMode: "hip",
                stepOffFoot: "right",
            }),
        ).toEqual({ dotMode: undefined, stepOffFoot: "right" });
    });
});

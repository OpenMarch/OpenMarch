import { describe, it, expect } from "vitest";
import { parseLateral, parseFrontBack } from "../normalize";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";

const field = FootballTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

describe("coordinate grammar contract", () => {
    it("accepts lateral with steps inside yardline", () => {
        const result = parseLateral("Side 1: 4.0 steps Inside 25 yd ln", field);
        expect(result.ok).toBe(true);
    });

    it("accepts front-back with behind/front hash and HS tag", () => {
        const result = parseFrontBack(
            "4.0 steps Behind Front Hash (HS)",
            field,
        );
        expect(result.ok).toBe(true);
    });

    it("supports Side A/B synonyms", () => {
        const xA = parseLateral("Side A: 2.0 steps Inside 45 yd ln", field);
        const x1 = parseLateral("Side 1: 2.0 steps Inside 45 yd ln", field);
        expect(xA.ok).toBe(true);
        expect(x1.ok).toBe(true);
        if (xA.ok && x1.ok) expect(xA.steps).toBeCloseTo(x1.steps, 5);
    });

    it("supports Left/Right synonyms", () => {
        const xL = parseLateral("Left: On 50 yd ln", field);
        const x1 = parseLateral("Side 1: On 50 yd ln", field);
        expect(xL.ok).toBe(true);
        expect(x1.ok).toBe(true);
        if (xL.ok && x1.ok) expect(xL.steps).toBeCloseTo(x1.steps, 5);
    });
});

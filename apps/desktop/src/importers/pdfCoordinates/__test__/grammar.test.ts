import { describe, it, expect } from "vitest";
import { parseLateral } from "../normalize";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";

const field = FootballTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

describe("coordinate grammar contract", () => {
    it("accepts lateral with steps inside yardline", () => {
        const sample = "Side 1: 4.0 steps Inside 25 yd ln";
        expect(sample).toMatch(
            /Side\s+[12]:\s+(On|\d+(?:\.\d+)\s+steps\s+(Inside|Outside)\s+\d+\s+yd\s+ln)/i,
        );
    });

    it("accepts front-back with behind/front hash and HS tag", () => {
        const sample = "4.0 steps Behind Front Hash (HS)";
        expect(sample).toMatch(
            /(On|\d+(?:\.\d+)\s+steps\s+(In Front Of|Behind)\s+(Front|Back)\s+Hash(?:\s*\((HS|CO|PRO)\))?)/i,
        );
    });

    it("supports Side A/B synonyms", () => {
        const xA = parseLateral("Side A: 2.0 steps Inside 45 yd ln", field);
        const x1 = parseLateral("Side 1: 2.0 steps Inside 45 yd ln", field);
        expect(xA).toBeCloseTo(x1, 5);
    });

    it("supports Left/Right synonyms", () => {
        const xL = parseLateral("Left: On 50 yd ln", field);
        const x1 = parseLateral("Side 1: On 50 yd ln", field);
        expect(xL).toBeCloseTo(x1, 5);
    });
});

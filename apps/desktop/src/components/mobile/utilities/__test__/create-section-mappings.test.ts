import { describe, expect, it } from "vitest";
import { _createSectionMappings } from "../create-section-mappings";

describe("_createSectionMappings", () => {
    it("maps each drill prefix to its most common section", () => {
        const result = _createSectionMappings([
            { drill_prefix: "T", section: "Trumpet" },
            { drill_prefix: "T", section: "Trumpet" },
            { drill_prefix: "T", section: "Trombone" },
            { drill_prefix: "C", section: "Clarinet" },
            { drill_prefix: "C", section: "Clarinet" },
            { drill_prefix: "C", section: "Flute" },
            { drill_prefix: "P", section: "Percussion" },
        ]);

        expect(result).toEqual({
            T: "Trumpet",
            C: "Clarinet",
            P: "Percussion",
        });
    });

    it("ignores null sections and still picks the most common section name", () => {
        const result = _createSectionMappings([
            { drill_prefix: "T", section: null },
            { drill_prefix: "T", section: "Trumpet" },
            { drill_prefix: "T", section: "Trumpet" },
            { drill_prefix: "T", section: "Trombone" },
            { drill_prefix: "C", section: null },
            { drill_prefix: "C", section: null },
            { drill_prefix: "C", section: "Clarinet" },
        ]);

        expect(result).toEqual({
            T: "Trumpet",
            C: "Clarinet",
        });
    });

    it("omits prefixes that only have null sections", () => {
        const result = _createSectionMappings([
            { drill_prefix: "B", section: null },
            { drill_prefix: "B", section: null },
            { drill_prefix: "F", section: "Flute" },
        ]);

        expect(result).toEqual({
            F: "Flute",
        });
    });
});

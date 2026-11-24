// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cueSectionsOf } from "../cueSections";

describe("cueSectionsOf", () => {
    it("gives a section whose performers all carry one model that model's catalog item", () => {
        const sections = cueSectionsOf([
            { section: "Trumpet", model: "trumpet" },
            { section: "Color Guard", model: "flag6" },
            { section: "Color Guard", model: "flag6" },
            { section: "Swing", model: "swingFlag" },
            { section: "Tuba", model: "contra" },
            { section: "Mixed", model: "flag6" },
            { section: "Mixed", model: "rifle" },
            { section: "Drum Major", model: null },
        ]);

        expect(sections.map((s) => [s.name, s.equipment?.id])).toEqual([
            ["Trumpet", "builtin:equipment.trumpet"],
            ["Color Guard", "builtin:equipment.flag"],
            ["Swing", "builtin:equipment.swingFlag"],
            ["Tuba", "builtin:equipment.tuba"],
        ]);
        expect(sections[1]!.equipment).toMatchObject({ holds: "flag" });
        expect(sections[0]!.equipment).toMatchObject({ holds: "winds" });
    });
});

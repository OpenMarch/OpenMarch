// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cueSectionsOf, flagEquipmentOf } from "../cueSections";

describe("cueSectionsOf", () => {
    it("gives a section whose performers all carry one flag that flag", () => {
        const sections = cueSectionsOf([
            { section: "Trumpet", family: "trumpet" },
            { section: "Color Guard", family: "flag" },
            { section: "Color Guard", family: "flag" },
            { section: "Swing", family: "swingFlag" },
            { section: "Mixed", family: "flag" },
            { section: "Mixed", family: "rifle" },
        ]);

        expect(sections.map((s) => [s.name, s.equipment?.id])).toEqual([
            ["Color Guard", "builtin:model.flag6"],
            ["Swing", "builtin:model.swingFlag"],
        ]);
        expect(sections[0]!.equipment).toMatchObject({ holds: "flag" });
    });

    it("gives no equipment for anything but a flag", () => {
        expect(flagEquipmentOf("rifle")).toBeUndefined();
        expect(flagEquipmentOf(null)).toBeUndefined();
    });
});

import { describe, expect, it } from "vitest";
import {
    compileCues,
    cueValueAt,
    equipmentCatalog,
    heldAt,
    EQUIPMENT_FAMILIES,
    EQUIPMENT_USUAL,
    type CueEquipment,
} from "../index";

const beats = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    duration: 1,
}));
const TRUMPET: CueEquipment = {
    id: "builtin:equipment.trumpet",
    name: "Trumpet",
    holds: "winds",
};

describe("the Equipment catalog (#992)", () => {
    it("groups real items in four families, each holding what its family plays", () => {
        expect(EQUIPMENT_FAMILIES).toEqual([
            "guard",
            "brass",
            "woodwinds",
            "drums",
        ]);
        expect(equipmentCatalog("guard").map((v) => v.id)).toContain(
            "builtin:equipment.rifle",
        );
        expect(new Set(equipmentCatalog("brass").map((v) => v.holds))).toEqual(
            new Set(["winds"]),
        );
        expect(new Set(equipmentCatalog("drums").map((v) => v.holds))).toEqual(
            new Set(["battery"]),
        );
        expect(equipmentCatalog().every((v) => v.family)).toBe(true);
        expect(equipmentCatalog().map((v) => v.id)).not.toContain(
            EQUIPMENT_USUAL,
        );
    });

    it("lets any performer hold any item, and resolves their own instrument to their section's", () => {
        const compiled = compileCues({
            beats,
            marchers: [{ id: 1, section: "Trumpet", carries: "winds" }],
            sections: [{ name: "Trumpet", equipment: TRUMPET }],
            cues: [
                {
                    id: 1,
                    type: "equipment",
                    beatId: 3,
                    value: "builtin:equipment.rifle",
                    marcherIds: [1],
                },
                {
                    id: 2,
                    type: "equipment",
                    beatId: 7,
                    value: "builtin:equipment.snare",
                    marcherIds: [1],
                },
                {
                    id: 3,
                    type: "equipment",
                    beatId: 11,
                    value: EQUIPMENT_USUAL,
                    marcherIds: [1],
                },
            ],
        });
        expect(compiled.flags).toEqual([]);
        expect(heldAt(compiled, 1, 1)).toBe("winds");
        expect(heldAt(compiled, 1, 2)).toBe("rifle");
        expect(heldAt(compiled, 1, 6)).toBe("battery");
        expect(cueValueAt(compiled, 1, "equipment", 6)).toBe(
            "builtin:equipment.snare",
        );
        expect(cueValueAt(compiled, 1, "equipment", 10)).toBe(TRUMPET.id);
        const last = compiled.segments(1, "equipment").at(-1)!;
        expect(last).toMatchObject({ cueId: 3, value: TRUMPET.id });
    });
});

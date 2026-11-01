// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    cueCountsByChannel,
    hornEquipmentLabel,
    sameWho,
    whoEntries,
    whoMarcherIds,
} from "../visualsWho";

const marchers = [
    { id: 1, section: "Trumpet" },
    { id: 2, section: "Trumpet" },
    { id: 3, section: " trumpet " },
    { id: 4, section: "Color Guard" },
    { id: 5, section: "Snare" },
];
const tags = [
    { id: 10, name: "Soloists" },
    { id: 11, name: null },
    { id: 12, name: "Empty" },
];
const byTag = new Map<number, number[]>([
    [10, [1, 4]],
    [11, [5, 99]],
    [12, [99]],
]);

describe("whoEntries", () => {
    it("lists the band, the sections in score order, then the tags with members", () => {
        const entries = whoEntries(marchers, tags, byTag);
        expect(entries.map((e) => [e.who.kind, e.label, e.count])).toEqual([
            ["band", "", 5],
            // a section spelled two ways is one section, as cue targets match
            ["section", "Trumpet", 3],
            ["section", "Snare", 1],
            ["section", "Color Guard", 1],
            ["tag", "Soloists", 2],
            // an unnamed tag gets the app's fallback; a marcher not in the
            // show doesn't count, and a tag with nobody isn't listed
            ["tag", "tag-11", 1],
        ]);
    });
});

describe("whoMarcherIds", () => {
    it("finds each who's marchers", () => {
        const ids = (who: Parameters<typeof whoMarcherIds>[0]) =>
            [...whoMarcherIds(who, marchers, byTag, [2, 5])].sort();
        expect(ids({ kind: "band" })).toEqual([1, 2, 3, 4, 5]);
        expect(ids({ kind: "section", section: "TRUMPET" })).toEqual([1, 2, 3]);
        expect(ids({ kind: "tag", tagId: 11 })).toEqual([5]);
        expect(ids({ kind: "selection" })).toEqual([2, 5]);
    });
});

describe("sameWho", () => {
    it("matches sections ignoring case and outer spaces", () => {
        expect(
            sameWho(
                { kind: "section", section: "Trumpet" },
                { kind: "section", section: " trumpet" },
            ),
        ).toBe(true);
        expect(
            sameWho({ kind: "tag", tagId: 1 }, { kind: "tag", tagId: 2 }),
        ).toBe(false);
        expect(sameWho({ kind: "band" }, null)).toBe(false);
        expect(sameWho(null, null)).toBe(true);
    });
});

describe("cueCountsByChannel", () => {
    it("counts the behavior channels only", () => {
        expect(
            cueCountsByChannel([
                { channel: "feet" },
                { channel: "facing" },
                { channel: "facing" },
                { channel: "carry" },
            ]),
        ).toEqual({ feet: 1, horn_equipment: 0, facing: 2, body: 0 });
    });
});

describe("hornEquipmentLabel", () => {
    it("names the tab by who is focused", () => {
        expect(hornEquipmentLabel(["Trumpet", "Clarinet"])).toBe("horn");
        expect(hornEquipmentLabel(["Color Guard", "Snare"])).toBe("equipment");
        expect(hornEquipmentLabel(["Trumpet", "Snare"])).toBe("both");
        expect(hornEquipmentLabel([])).toBe("both");
    });
});

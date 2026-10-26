import { describe, expect, it } from "vitest";
import { fromEntry, openShowArgs } from "../handoff";

const bytes = new Uint8Array([1, 2, 3]);

describe("a show handed across a reload", () => {
    it("reopens as backed up only if it came from a picked file", () => {
        expect(
            openShowArgs({
                bytes,
                name: "a.dots",
                changed: false,
                backedUp: true,
            }),
        ).toEqual([bytes, "a.dots", false, true]);
        expect(
            openShowArgs({
                bytes,
                name: "New",
                changed: true,
                backedUp: false,
            }),
        ).toEqual([bytes, "New", false, false]);
    });
    it("counts an entry from before backups were tracked as not backed up", () => {
        expect(fromEntry({ bytes, name: "old", changed: false })).toEqual({
            bytes,
            name: "old",
            changed: false,
            backedUp: false,
        });
    });
});

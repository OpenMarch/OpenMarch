import { describe, expect, it, beforeEach } from "vitest";
import {
    pushRecentId,
    readRecentIds,
    resolveRecentItems,
    SELECT_TAB_RECENTS_STORAGE_KEY,
    writeRecentIds,
} from "../chipSelectorRecents";

const items = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" },
    { id: "e" },
    { id: "f" },
    { id: "g" },
];
const getId = (item: { id: string }) => item.id;

describe("pushRecentId", () => {
    it("prepends the id in LIFO order", () => {
        expect(pushRecentId(["b", "c"], "a")).toEqual(["a", "b", "c"]);
    });

    it("leaves an existing id in place", () => {
        expect(pushRecentId(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
    });

    it("caps the list at 6", () => {
        expect(pushRecentId(["a", "b", "c", "d", "e", "f"], "g")).toEqual([
            "g",
            "a",
            "b",
            "c",
            "d",
            "e",
        ]);
    });
});

describe("resolveRecentItems", () => {
    it("falls back to the first 6 items when recents are empty", () => {
        expect(resolveRecentItems(items, [], getId)).toEqual(items.slice(0, 6));
    });

    it("returns recents in LIFO order, then fills remaining slots", () => {
        expect(resolveRecentItems(items, ["g", "c", "a"], getId)).toEqual([
            { id: "g" },
            { id: "c" },
            { id: "a" },
            { id: "b" },
            { id: "d" },
            { id: "e" },
        ]);
    });

    it("skips stale ids and fills remaining slots", () => {
        expect(
            resolveRecentItems(items, ["missing", "c", "gone", "a"], getId),
        ).toEqual([
            { id: "c" },
            { id: "a" },
            { id: "b" },
            { id: "d" },
            { id: "e" },
            { id: "f" },
        ]);
    });

    it("falls back to the first 6 items when every recent id is stale", () => {
        expect(resolveRecentItems(items, ["missing", "gone"], getId)).toEqual(
            items.slice(0, 6),
        );
    });

    it("includes each matching id at most once", () => {
        expect(resolveRecentItems(items, ["c", "c", "a"], getId)).toEqual([
            { id: "c" },
            { id: "a" },
            { id: "b" },
            { id: "d" },
            { id: "e" },
            { id: "f" },
        ]);
    });
});

describe("readRecentIds / writeRecentIds", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("returns an empty list when nothing is stored", () => {
        expect(readRecentIds("section")).toEqual([]);
    });

    it("round-trips a category without clobbering others", () => {
        writeRecentIds("section", ["Trumpet", "Flute"]);
        writeRecentIds("tag", ["12"]);

        expect(readRecentIds("section")).toEqual(["Trumpet", "Flute"]);
        expect(readRecentIds("tag")).toEqual(["12"]);
        expect(readRecentIds("family")).toEqual([]);
    });

    it("returns an empty list for corrupt storage", () => {
        localStorage.setItem(SELECT_TAB_RECENTS_STORAGE_KEY, "not-json");
        expect(readRecentIds("section")).toEqual([]);
    });

    it("recovers when existing storage is a JSON array", () => {
        localStorage.setItem(SELECT_TAB_RECENTS_STORAGE_KEY, "[]");
        writeRecentIds("section", ["Trumpet"]);
        expect(readRecentIds("section")).toEqual(["Trumpet"]);
    });
});

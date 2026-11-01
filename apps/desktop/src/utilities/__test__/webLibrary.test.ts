// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    addShow,
    addVersion,
    backupReminderDue,
    duplicateShow,
    emptyIndex,
    findShow,
    formatAgo,
    isLibraryIndex,
    localDay,
    MAX_VERSIONS,
    newVersionId,
    parseGeneration,
    parseLegacyName,
    recordBackup,
    recordEdit,
    removeShow,
    renameShow,
    setOpen,
    shouldKeepVersion,
    summaries,
    uniqueName,
    VERSION_INTERVAL_MS,
    type LibraryIndex,
} from "../webLibrary";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 20, 10, 0, 0).getTime();

const withShow = (backedUp = false): LibraryIndex =>
    addShow(emptyIndex(), {
        id: "a",
        name: "Halftime.dots",
        now: T0,
        backedUp,
    });

describe("adding, naming and removing shows", () => {
    it("adds a show named without .dots", () => {
        const show = findShow(withShow(), "a")!;
        expect(show.name).toBe("Halftime");
        expect(show.backedUpAt).toBeNull();
        expect(show.changedSinceBackup).toBe(true);
        expect(show.versions).toEqual([]);
    });
    it("counts a show opened from a file as backed up by that file", () => {
        const show = findShow(withShow(true), "a")!;
        expect(show.backedUpAt).toBe(T0);
        expect(show.changedSinceBackup).toBe(false);
    });
    it("keeps names apart", () => {
        let index = withShow();
        index = addShow(index, {
            id: "b",
            name: "halftime",
            now: T0,
            backedUp: false,
        });
        expect(findShow(index, "b")!.name).toBe("halftime (2)");
        expect(uniqueName(index, "Halftime")).toBe("Halftime (3)");
        expect(uniqueName(index, "  ")).toBe("Untitled");
        // Renaming a show to its own name is fine
        expect(findShow(renameShow(index, "a", "Halftime"), "a")!.name).toBe(
            "Halftime",
        );
        expect(findShow(renameShow(index, "a", "Opener"), "a")!.name).toBe(
            "Opener",
        );
    });
    it("duplicates without versions or backup", () => {
        let index = recordBackup(withShow(), "a", T0);
        index = addVersion(index, "a", {
            id: "1",
            at: T0,
            reason: "edit",
        }).index;
        index = duplicateShow(index, "a", "b", T0 + 1);
        const copy = findShow(index, "b")!;
        expect(copy.name).toBe("Halftime copy");
        expect(copy.versions).toEqual([]);
        expect(copy.backedUpAt).toBeNull();
    });
    it("forgets the open show when it's removed", () => {
        const index = removeShow(setOpen(withShow(), "a"), "a");
        expect(index.shows).toEqual([]);
        expect(index.openId).toBeNull();
        expect(() => setOpen(index, "a")).toThrow();
    });
    it("lists the most recently edited first", () => {
        let index = withShow();
        index = addShow(index, {
            id: "b",
            name: "Opener",
            now: T0 + 5,
            backedUp: false,
        });
        index = recordEdit(index, "a", T0 + 10);
        expect(summaries(index).map((s) => s.id)).toEqual(["a", "b"]);
    });
    it("doesn't change the index it's given", () => {
        const index = withShow();
        const copy = structuredClone(index);
        recordEdit(index, "a", T0 + 1);
        renameShow(index, "a", "X");
        addVersion(index, "a", { id: "1", at: T0, reason: "edit" });
        expect(index).toEqual(copy);
    });
});

describe("versions", () => {
    it("never drops the new version or a kept one, oldest first otherwise", () => {
        let index = withShow();
        for (let i = 0; i < 3; i++)
            index = addVersion(
                index,
                "a",
                { id: `v${i}`, at: T0 + i, reason: "edit" },
                3,
            ).index;
        // Restoring v0, the oldest: the copy kept first must not remove it
        const restoring = addVersion(
            index,
            "a",
            { id: "before", at: T0 + 10, reason: "before-restore" },
            3,
            ["v0"],
        );
        expect(restoring.dropped.map((v) => v.id)).toEqual(["v1"]);
        expect(
            findShow(restoring.index, "a")!.versions.map((v) => v.id),
        ).toEqual(["v0", "v2", "before"]);
        // A clock that went back still keeps the version just made
        const skewed = addVersion(
            index,
            "a",
            { id: "late", at: T0 - 100, reason: "edit" },
            3,
        );
        expect(skewed.dropped.map((v) => v.id)).toEqual(["v0"]);
        expect(
            findShow(skewed.index, "a")!.versions.map((v) => v.id),
        ).toContain("late");
    });
    it("keeps one at most every two minutes of editing", () => {
        let index = withShow();
        const show = () => findShow(index, "a")!;
        expect(shouldKeepVersion(show(), "edit", T0)).toBe(true);
        index = addVersion(index, "a", {
            id: "1",
            at: T0,
            reason: "edit",
        }).index;
        // Unchanged since: none
        expect(
            shouldKeepVersion(show(), "edit", T0 + 10 * VERSION_INTERVAL_MS),
        ).toBe(false);
        index = recordEdit(index, "a", T0 + 1000);
        expect(shouldKeepVersion(show(), "edit", T0 + 1000)).toBe(false);
        expect(
            shouldKeepVersion(show(), "edit", T0 + VERSION_INTERVAL_MS),
        ).toBe(true);
    });
    it("keeps one on opening or before a restore whenever it changed", () => {
        let index = addVersion(withShow(), "a", {
            id: "1",
            at: T0,
            reason: "edit",
        }).index;
        expect(shouldKeepVersion(findShow(index, "a")!, "opened", T0 + 1)).toBe(
            false,
        );
        index = recordEdit(index, "a", T0 + 1);
        expect(shouldKeepVersion(findShow(index, "a")!, "opened", T0 + 2)).toBe(
            true,
        );
        expect(
            shouldKeepVersion(findShow(index, "a")!, "before-restore", T0 + 2),
        ).toBe(true);
    });
    it(`keeps the newest ${MAX_VERSIONS} and says which to delete`, () => {
        let index = withShow();
        const dropped: string[] = [];
        for (let i = 0; i < MAX_VERSIONS + 3; i++) {
            const result = addVersion(index, "a", {
                id: String(i),
                at: T0 + i * VERSION_INTERVAL_MS,
                reason: "edit",
            });
            index = result.index;
            dropped.push(...result.dropped.map((v) => v.id));
        }
        const versions = findShow(index, "a")!.versions;
        expect(versions).toHaveLength(MAX_VERSIONS);
        expect(versions[0].id).toBe("3");
        expect(dropped).toEqual(["0", "1", "2"]);
    });
    it("gives versions unique ids", () => {
        const index = addVersion(withShow(), "a", {
            id: String(T0),
            at: T0,
            reason: "edit",
        }).index;
        expect(newVersionId(findShow(index, "a")!, T0)).toBe(String(T0 + 1));
    });
});

describe("backups and the reminder", () => {
    it("counts days of editing since the last backup", () => {
        let index = recordBackup(withShow(), "a", T0);
        expect(findShow(index, "a")!.editDays).toEqual([]);
        index = recordEdit(index, "a", T0 + 1000);
        index = recordEdit(index, "a", T0 + 2000);
        index = recordEdit(index, "a", T0 + DAY);
        expect(findShow(index, "a")!.editDays).toEqual([
            localDay(T0),
            localDay(T0 + DAY),
        ]);
    });
    it("reminds after three days of editing, at most once a day", () => {
        const show = { changedSinceBackup: true, editDays: ["d1", "d2"] };
        expect(backupReminderDue(show, T0, null)).toBe(false);
        const three = { ...show, editDays: ["d1", "d2", "d3"] };
        expect(backupReminderDue(three, T0, null)).toBe(true);
        expect(backupReminderDue(three, T0, T0 - DAY / 2)).toBe(false);
        expect(backupReminderDue(three, T0, T0 - DAY)).toBe(true);
        expect(
            backupReminderDue(
                { ...three, changedSinceBackup: false },
                T0,
                null,
            ),
        ).toBe(false);
    });
});

describe("file names", () => {
    it("reads the earlier single-show names", () => {
        expect(parseLegacyName("12-My%20Show")).toEqual({
            sequence: 12,
            name: "My Show",
        });
        expect(parseLegacyName("library")).toBeNull();
        expect(parseLegacyName("3-%E0%A4%A")).toBeNull();
    });
    it("reads generations", () => {
        expect(parseGeneration("show.12.dots", "show", "dots")).toBe(12);
        expect(parseGeneration("index.3.json", "index", "json")).toBe(3);
        expect(parseGeneration("show.dots", "show", "dots")).toBeNull();
        expect(parseGeneration("v-123.dots", "show", "dots")).toBeNull();
    });
    it("checks an index before trusting it", () => {
        expect(isLibraryIndex(withShow())).toBe(true);
        expect(isLibraryIndex({ format: 2, shows: [] })).toBe(false);
        expect(isLibraryIndex({ format: 1, shows: [{ id: 1 }] })).toBe(false);
        expect(isLibraryIndex(null)).toBe(false);
    });
});

describe("formatAgo", () => {
    it("says how long ago, in words", () => {
        expect(formatAgo(T0, T0)).toBe("now");
        expect(formatAgo(T0 - 5 * 60 * 1000, T0)).toBe("5 minutes ago");
        expect(formatAgo(T0 - DAY, T0)).toBe("yesterday");
        expect(formatAgo(T0 - 2 * DAY, T0)).toBe("2 days ago");
        expect(formatAgo(T0 - 21 * DAY, T0)).toBe("3 weeks ago");
    });
});

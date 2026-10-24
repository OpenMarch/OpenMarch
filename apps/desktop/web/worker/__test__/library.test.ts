// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryDir } from "../dir";
import {
    Library,
    readGeneration,
    writeGeneration,
    isDatabase,
} from "../library";
import { VERSION_INTERVAL_MS } from "@/utilities/webLibrary";

/** Bytes that pass for a SQLite file, tagged so tests can tell them apart. */
function show(tag: string): Uint8Array {
    const bytes = new Uint8Array(200);
    bytes.set(new TextEncoder().encode("SQLite format 3\0"));
    bytes.set(new TextEncoder().encode(tag), 100);
    return bytes;
}
const tagOf = (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.subarray(100)).replace(/\0+$/, "");

let clock = 0;
let ids = 0;
const options = () => ({ now: () => clock, newId: () => `id${++ids}` });

beforeEach(() => {
    clock = 1_000_000;
    ids = 0;
});

async function libraryFolder(base: MemoryDir) {
    return base.folder("library");
}

describe("crash-safe writes", () => {
    it("keeps the previous generation when a write is cut short", async () => {
        const dir = new MemoryDir();
        await writeGeneration(dir, "show", "dots", show("one"));
        dir.failWrites = { count: 1, keep: 50 };
        await expect(
            writeGeneration(dir, "show", "dots", show("two")),
        ).rejects.toThrow();
        expect(await dir.files()).toEqual(["show.1.dots"]);
        const read = await readGeneration(dir, "show", "dots", (b) =>
            isDatabase(b) ? b : null,
        );
        expect(tagOf(read!)).toBe("one");
    });
    it("skips a damaged newest file left by a crash", async () => {
        const dir = new MemoryDir();
        await writeGeneration(dir, "show", "dots", show("one"));
        // A crash after writing part of generation 2, before removing 1
        dir.entries.set("show.2.dots", show("two").slice(0, 40));
        const read = await readGeneration(dir, "show", "dots", (b) =>
            isDatabase(b) ? b : null,
        );
        expect(tagOf(read!)).toBe("one");
        // The next write goes past the damaged one and cleans both up
        await writeGeneration(dir, "show", "dots", show("three"));
        expect(await dir.files()).toEqual(["show.3.dots"]);
    });
});

describe("the library", () => {
    it("keeps several shows, each with its own copy, across reopening", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const a = await library.addShow("Opener.dots", show("A"), {
            backedUp: true,
        });
        const b = await library.addShow("Ballad", show("B"), {
            backedUp: false,
        });
        await library.setOpen(b);

        const again = await Library.open(base, options());
        expect(
            again
                .list()
                .map((s) => s.name)
                .sort(),
        ).toEqual(["Ballad", "Opener"]);
        expect(again.current.openId).toBe(b);
        expect(tagOf(await again.readShow(a))).toBe("A");
        expect(tagOf(await again.readShow(b))).toBe("B");
    });

    it("survives a crash while writing the index", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        await library.addShow("Opener", show("A"), { backedUp: false });
        const root = await libraryFolder(base);
        root.failWrites = { count: 1, keep: 10 };
        await expect(
            library.addShow("Ballad", show("B"), { backedUp: false }),
        ).rejects.toThrow();
        const again = await Library.open(base, options());
        expect(again.list().map((s) => s.name)).toEqual(["Opener"]);
        // The half-added show's folder is cleaned up
        expect(await (await root.folder("shows")).folders()).toEqual(["id1"]);
    });

    it("saves edits and keeps versions at most every two minutes", async () => {
        const library = await Library.open(new MemoryDir(), options());
        const id = await library.addShow("Opener", show("v0"), {
            backedUp: false,
        });
        clock += 1000;
        await library.saveShow(id, show("v1"));
        expect(library.current.shows[0].versions).toHaveLength(1);
        clock += 1000;
        await library.saveShow(id, show("v2"));
        expect(library.current.shows[0].versions).toHaveLength(1);
        clock += VERSION_INTERVAL_MS;
        await library.saveShow(id, show("v3"));
        const versions = library.current.shows[0].versions;
        expect(versions).toHaveLength(2);
        expect(tagOf(await library.readShow(id))).toBe("v3");
        expect(tagOf(await library.readVersion(id, versions[0].id))).toBe("v1");
        expect(library.current.shows[0].changedSinceBackup).toBe(true);
    });

    it("restores a version, keeping the state it replaces", async () => {
        const library = await Library.open(new MemoryDir(), options());
        const id = await library.addShow("Opener", show("v0"), {
            backedUp: false,
        });
        await library.saveShow(id, show("v1"));
        const first = library.current.shows[0].versions[0];
        clock += 1000;
        await library.saveShow(id, show("v2"));
        clock += 1000;
        await library.restoreVersion(id, first.id);
        expect(tagOf(await library.readShow(id))).toBe("v1");
        const versions = library.current.shows[0].versions;
        expect(versions.at(-1)!.reason).toBe("before-restore");
        expect(tagOf(await library.readVersion(id, versions.at(-1)!.id))).toBe(
            "v2",
        );
    });

    it("drops old versions to make room when the disk is full", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("v0"), {
            backedUp: false,
        });
        for (let i = 1; i <= 7; i++) {
            clock += VERSION_INTERVAL_MS;
            await library.saveShow(id, show(`v${i}`));
        }
        expect(library.current.shows[0].versions).toHaveLength(7);
        const showDir = await (
            await (await libraryFolder(base)).folder("shows")
        ).folder(id);
        showDir.failWrites = { count: 1, keep: 0 };
        clock += 1000;
        await library.saveShow(id, show("v8"));
        expect(tagOf(await library.readShow(id))).toBe("v8");
        expect(library.current.shows[0].versions).toHaveLength(2);
        expect(
            (await showDir.files()).filter((f) => f.startsWith("v-")),
        ).toHaveLength(2);
    });

    it("renames, duplicates, deletes and records backups", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("A"), {
            backedUp: false,
        });
        await library.rename(id, "Closer");
        const copy = await library.duplicate(id);
        expect(tagOf(await library.readShow(copy))).toBe("A");
        expect(
            library
                .list()
                .map((s) => s.name)
                .sort(),
        ).toEqual(["Closer", "Closer copy"]);
        clock += 5;
        await library.recordBackup(id);
        expect(library.current.shows.find((s) => s.id === id)!.backedUpAt).toBe(
            clock,
        );
        await library.remove(copy);
        expect(library.list().map((s) => s.id)).toEqual([id]);
        expect(
            await (await (await libraryFolder(base)).folder("shows")).folders(),
        ).toEqual([id]);
    });
});

describe("moving an earlier build's show into the library", () => {
    it("adds the newest whole copy as the open show and removes the old files", async () => {
        const base = new MemoryDir();
        base.entries.set("3-My%20Show", show("old"));
        base.entries.set("4-My%20Show", show("newest").slice(0, 30)); // cut short
        const library = await Library.open(base, options());
        expect(library.list().map((s) => s.name)).toEqual(["My Show"]);
        expect(library.current.openId).toBe("id1");
        expect(tagOf(await library.readShow("id1"))).toBe("old");
        expect(await base.files()).toEqual([]);
        // Not again on the next start
        const again = await Library.open(base, options());
        expect(again.list()).toHaveLength(1);
    });
    it("starts empty with nothing to move", async () => {
        const library = await Library.open(new MemoryDir(), options());
        expect(library.list()).toEqual([]);
        expect(library.current.openId).toBeNull();
    });
});

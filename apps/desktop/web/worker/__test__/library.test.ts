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

/**
 * Bytes shaped like a whole SQLite file of `pages` 512-byte pages (header,
 * page size, page count), tagged so tests can tell them apart.
 */
function show(tag: string, pages = 2): Uint8Array {
    const bytes = new Uint8Array(512 * pages);
    bytes.set(new TextEncoder().encode("SQLite format 3\0"));
    const view = new DataView(bytes.buffer);
    view.setUint16(16, 512);
    view.setUint32(24, 7); // change counter
    view.setUint32(28, pages); // page count
    view.setUint32(92, 7); // page count valid for change 7
    bytes.set(new TextEncoder().encode(tag), 100);
    return bytes;
}
const tagOf = (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.subarray(100, 140)).replace(/\0+$/, "");

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
        // The add failed as a whole (whatever was being added still exists
        // elsewhere); the library is as it was
        expect(again.list().map((s) => s.name)).toEqual(["Opener"]);
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

/** A show of about `size` bytes. */
const bigShow = (tag: string, size: number) => show(tag, Math.ceil(size / 512));

describe("never losing shows the index doesn't describe", () => {
    it("rebuilds the index from the show folders when no index can be read", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const a = await library.addShow("Opener", show("A"), {
            backedUp: false,
        });
        clock += VERSION_INTERVAL_MS;
        await library.saveShow(a, show("A2"));
        const b = await library.addShow("Ballad", show("B"), {
            backedUp: false,
        });
        // Every index generation damaged (a kill during the write, a bad disk)
        const root = await libraryFolder(base);
        for (const file of await root.files())
            if (file.startsWith("index."))
                root.entries.set(file, new TextEncoder().encode("{ broken"));

        const again = await Library.open(base, options());
        const shows = again.list();
        expect(shows.map((s) => s.id).sort()).toEqual([a, b].sort());
        expect(shows.map((s) => s.name).sort()).toEqual(["Ballad", "Opener"]);
        expect(tagOf(await again.readShow(a))).toBe("A2");
        expect(
            again.current.shows.find((s) => s.id === a)!.versions.length,
        ).toBeGreaterThan(0);
        expect((await (await root.folder("shows")).folders()).sort()).toEqual(
            [a, b].sort(),
        );
    });

    it("keeps a show folder the index doesn't list, adding it back", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        await library.addShow("Opener", show("A"), { backedUp: false });
        // A show written whose index write never happened
        const shows = await (await libraryFolder(base)).folder("shows");
        const stray = await shows.folder("stray");
        await stray.write("show.1.dots", show("S"));

        const again = await Library.open(base, options());
        expect(await shows.folders()).toContain("stray");
        expect(again.current.shows.some((s) => s.id === "stray")).toBe(true);
        expect(tagOf(await again.readShow("stray"))).toBe("S");
    });

    it("finishes a delete that was cut short instead of bringing the show back", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("A"), {
            backedUp: false,
        });
        const root = await libraryFolder(base);
        const shows = await root.folder("shows");
        // The folder was marked, the index written, then the page died
        (await shows.folder(id)).entries.set("deleted", new Uint8Array([1]));
        await library.remove(id).catch(() => {});
        await shows
            .folder(id)
            .then((dir) => dir.write("show.1.dots", show("A")));
        (await shows.folder(id)).entries.set("deleted", new Uint8Array([1]));
        const again = await Library.open(base, options());
        expect(again.list()).toEqual([]);
        expect(await shows.folders()).toEqual([]);
    });

    it("never touches a library written by a newer version", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("A"), {
            backedUp: false,
        });
        const root = await libraryFolder(base);
        for (const file of await root.files()) root.entries.delete(file);
        root.entries.set(
            "index.9.json",
            new TextEncoder().encode(JSON.stringify({ format: 2, things: [] })),
        );
        const before = JSON.stringify([
            ...(await root.folder("shows")).subfolders.keys(),
        ]);

        const again = await Library.open(base, options());
        expect(again.readOnly).toBe("newer-format");
        expect(again.list()).toEqual([]);
        await expect(
            again.addShow("New", show("N"), { backedUp: false }),
        ).rejects.toThrow(/newer version/);
        expect(
            JSON.stringify([...(await root.folder("shows")).subfolders.keys()]),
        ).toBe(before);
        expect(await root.files()).toEqual(["index.9.json"]);
        expect(
            tagOf(
                await (
                    await (await root.folder("shows")).folder(id)
                ).read("show.1.dots"),
            ),
        ).toBe("A");
    });
});

describe("a full disk", () => {
    it("frees old versions before writing the index, so the save gets through", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", bigShow("v0", 2000), {
            backedUp: false,
        });
        for (let i = 1; i <= 6; i++) {
            clock += VERSION_INTERVAL_MS;
            await library.saveShow(id, bigShow(`v${i}`, 2000));
        }
        // Not even room for a new index
        base.disk.limit = base.used() + 10;
        clock += 1000;
        await library.saveShow(id, bigShow("v7", 2000));
        expect(tagOf(await library.readShow(id))).toBe("v7");
        expect(library.current.shows[0].versions.length).toBeLessThan(6);
        const again = await Library.open(base, options());
        expect(tagOf(await again.readShow(id))).toBe("v7");
    });

    it("drops versions whose files are gone from the index", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("v0"), {
            backedUp: false,
        });
        clock += VERSION_INTERVAL_MS;
        await library.saveShow(id, show("v1"));
        const dir = await (
            await (await libraryFolder(base)).folder("shows")
        ).folder(id);
        for (const file of await dir.files())
            if (file.startsWith("v-")) await dir.remove(file);
        const again = await Library.open(base, options());
        expect(again.current.shows[0].versions).toEqual([]);
    });
});

describe("files cut short past the header", () => {
    it("falls back to the older generation when the newest is cut short", async () => {
        const library = await Library.open(new MemoryDir(), options());
        const id = await library.addShow("Opener", show("one", 4), {
            backedUp: false,
        });
        // A crash wrote generation 2 only partly: the header is there, the rest isn't
        const dir = (
            library as unknown as { showDir(id: string): Promise<MemoryDir> }
        ).showDir(id);
        (await dir).entries.set("show.2.dots", show("two", 4).slice(0, 1200));
        expect(tagOf(await library.readShow(id))).toBe("one");
    });

    it("doesn't list a version file that was cut short", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("A"), {
            backedUp: false,
        });
        const dir = await (
            await (await libraryFolder(base)).folder("shows")
        ).folder(id);
        dir.entries.set("v-123.dots", show("V", 4).slice(0, 700));
        const again = await Library.open(base, options());
        expect(again.current.shows[0].versions.map((v) => v.id)).not.toContain(
            "123",
        );
    });
});

describe("deleting", () => {
    it("works on a full disk, when people delete to make room", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const keep = await library.addShow("Keep", show("K"), {
            backedUp: false,
        });
        const id = await library.addShow("Big", bigShow("B", 4000), {
            backedUp: false,
        });
        clock += VERSION_INTERVAL_MS;
        await library.saveShow(id, bigShow("B2", 4000));
        base.disk.limit = base.used(); // not one byte free
        await library.remove(id);
        expect(library.list().map((s) => s.id)).toEqual([keep]);
        expect(
            await (await (await libraryFolder(base)).folder("shows")).folders(),
        ).toEqual([keep]);
    });

    it("finishes a delete cut short after the index was written", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Gone", show("G"), {
            backedUp: false,
        });
        const shows = await (await libraryFolder(base)).folder("shows");
        const saved = shows.subfolders.get(id)!;
        await library.remove(id);
        // As if the page died before the folder was removed
        shows.subfolders.set(id, saved);
        const again = await Library.open(base, options());
        expect(again.list()).toEqual([]);
        expect(await shows.folders()).toEqual([]);
    });
});

describe("deleting on a disk with no room at all", () => {
    it("makes room with the show's own files", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Big", bigShow("B", 4000), {
            backedUp: false,
        });
        const dir = await (
            await (await libraryFolder(base)).folder("shows")
        ).folder(id);
        // No versions to drop, and not one byte free
        for (const file of await dir.files())
            if (file.startsWith("v-")) await dir.remove(file);
        (
            library as unknown as {
                index: { shows: { versions: unknown[] }[] };
            }
        ).index.shows[0].versions = [];
        base.disk.limit = base.used();
        await library.remove(id);
        expect(library.list()).toEqual([]);
    });
});

describe("restoring", () => {
    it("doesn't spend a second version slot when the restored show is reopened", async () => {
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
        const count = library.current.shows[0].versions.length;
        clock += 1000;
        await library.keepVersion(id, "opened");
        expect(library.current.shows[0].versions).toHaveLength(count);
    });
});

describe("errors that freeing space can't fix", () => {
    it("keeps the versions when a save fails for another reason", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        const id = await library.addShow("Opener", show("v0"), {
            backedUp: false,
        });
        for (let i = 1; i <= 3; i++) {
            clock += VERSION_INTERVAL_MS;
            await library.saveShow(id, show(`v${i}`));
        }
        const showDir = await (
            await (await libraryFolder(base)).folder("shows")
        ).folder(id);
        showDir.failWrites = {
            count: 1,
            keep: 0,
            error: "NoModificationAllowedError",
        };
        clock += 1000;
        await expect(library.saveShow(id, show("v4"))).rejects.toThrow(
            /NoModificationAllowed/,
        );
        expect(library.current.shows[0].versions).toHaveLength(3);
        expect(
            (await showDir.files()).filter((f) => f.startsWith("v-")),
        ).toHaveLength(3);
    });
});

describe("an add that fails", () => {
    it("leaves no extra show behind when the index can't be written", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        await library.addShow("Opener", show("A"), { backedUp: false });
        const root = await libraryFolder(base);
        for (let attempt = 0; attempt < 3; attempt++) {
            root.failWrites = { count: 1, keep: 10 };
            await expect(
                library.addShow("Ballad", show("B"), { backedUp: false }),
            ).rejects.toThrow();
        }
        const again = await Library.open(base, options());
        expect(again.list().map((s) => s.name)).toEqual(["Opener"]);
        expect(await (await root.folder("shows")).folders()).toEqual(["id1"]);
    });

    it("removes the folder when the index write after it fails", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        await library.addShow("Opener", show("A"), { backedUp: false });
        const root = await libraryFolder(base);
        // The write that lists the show fails; earlier index writes go through
        root.failWrites = { count: 1, keep: 10, skip: 1 };
        await expect(library.duplicate("id1")).rejects.toThrow();
        const again = await Library.open(base, options());
        expect(again.list().map((s) => s.name)).toEqual(["Opener"]);
        expect(await (await root.folder("shows")).folders()).toEqual(["id1"]);
    });

    it("cleans up an add cut short by a crash, but keeps folders a lost index can't explain", async () => {
        const base = new MemoryDir();
        const library = await Library.open(base, options());
        await library.addShow("Opener", show("A"), { backedUp: false });
        const root = await libraryFolder(base);
        const shows = await root.folder("shows");
        // A crash after the show was written, before the index listed it:
        // the index says an add was under way
        const index = { ...library.current, pending: ["aborted"] };
        await root.write(
            "index.99.json",
            new TextEncoder().encode(JSON.stringify(index)),
        );
        await (await shows.folder("aborted")).write("show.1.dots", show("X"));
        // And one no index mentions at all
        await (await shows.folder("unknown")).write("show.1.dots", show("U"));
        const again = await Library.open(base, options());
        expect((await shows.folders()).sort()).toEqual(["id1", "unknown"]);
        expect(again.current.shows.map((s) => s.id).sort()).toEqual([
            "id1",
            "unknown",
        ]);
        expect(again.current.pending ?? []).toEqual([]);
    });
});

// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeVersionHash, sha256Hex } from "../hash";
import {
    blobRelativePath,
    LibraryError,
    openLibraryStore,
    type LibraryStore,
} from "../store";
import { LICENSE_UNKNOWN } from "../types";

const bytes = (text: string) => new TextEncoder().encode(text);
const BUILT_IN_ID = "00000000-0000-4000-8000-000000000001";
const SHOW_ITEM_ID = "11111111-2222-4333-8444-555555555555";

let dir: string;
let root: string;
let builtinsRoot: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "om-library-"));
    root = path.join(dir, "library");
    builtinsRoot = path.join(dir, "builtins");
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

function clock() {
    let t = Date.UTC(2026, 9, 11);
    return () => new Date((t += 1000));
}

async function open(options: { builtins?: boolean } = {}) {
    return openLibraryStore({
        root,
        builtinsRoot: options.builtins ? builtinsRoot : undefined,
        now: clock(),
    });
}

/** Writes a built-in the way the app would ship one: same layout, fixed id. */
async function writeBuiltIn() {
    const authoring = await openLibraryStore({ root: builtinsRoot });
    return authoring.addVersion({
        itemId: BUILT_IN_ID,
        kind: "model",
        name: "Riser",
        tags: ["prop"],
        license: {
            license: "CC-BY-4.0",
            author: "A. Maker",
            sourceUrl: "https://example.com/riser",
            attribution: "Riser by A. Maker",
        },
        parts: { glb: bytes("riser glb"), sidecar: bytes("{}") },
    });
}

async function expectLibraryError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(LibraryError);
    await expect(promise).rejects.toMatchObject({ code });
}

describe("computeVersionHash", () => {
    it("does not depend on part order", () => {
        expect(
            computeVersionHash({ a: "1".repeat(64), b: "2".repeat(64) }),
        ).toBe(computeVersionHash({ b: "2".repeat(64), a: "1".repeat(64) }));
    });

    it("changes when a part's role or bytes change", () => {
        const base = computeVersionHash({ glb: "1".repeat(64) });
        expect(computeVersionHash({ gltf: "1".repeat(64) })).not.toBe(base);
        expect(computeVersionHash({ glb: "3".repeat(64) })).not.toBe(base);
    });
});

describe("local Library store", () => {
    let store: LibraryStore;

    beforeEach(async () => {
        store = await open();
    });

    it("round-trips an item and its Versions through disk", async () => {
        const glb = bytes("glb v1");
        const sidecar = bytes('{"importNotes":[]}');
        const first = await store.addVersion({
            kind: "model",
            name: "  Riser  ",
            tags: ["prop", " prop ", ""],
            originalFilename: "riser.glb",
            parts: { glb, sidecar },
            source: { filename: "riser.gltf", bytes: bytes("source gltf") },
        });
        expect(first.outcome).toBe("created");
        expect(first.item.name).toBe("Riser");
        expect(first.item.tags).toEqual(["prop"]);
        expect(first.version.hash).toBe(
            computeVersionHash({
                glb: sha256Hex(glb),
                sidecar: sha256Hex(sidecar),
            }),
        );
        expect(
            existsSync(path.join(root, blobRelativePath(sha256Hex(glb)))),
        ).toBe(true);
        expect(blobRelativePath(sha256Hex(glb))).toBe(
            path.join(
                "blobs",
                "sha256",
                sha256Hex(glb).slice(0, 2),
                sha256Hex(glb),
            ),
        );

        const second = await store.addVersion({
            itemId: first.item.id,
            kind: "model",
            name: "ignored",
            parts: { glb: bytes("glb v2"), sidecar },
        });
        expect(second.outcome).toBe("added-version");
        expect(second.item.name).toBe("Riser");

        const reopened = await open();
        const item = await reopened.getItem(first.item.id);
        expect(item?.versions.map((v) => v.hash)).toEqual([
            first.version.hash,
            second.version.hash,
        ]);
        expect(item?.builtIn).toBe(false);
        expect(item?.originalFilename).toBe("riser.glb");
        expect(item?.license).toBe(LICENSE_UNKNOWN);
        expect(item?.modified).toBe(false);
        expect(
            await reopened.readVersionParts(first.item.id, first.version.hash),
        ).toEqual({ glb, sidecar });
        expect(
            await reopened.readSource(first.item.id, first.version.hash),
        ).toEqual({ filename: "riser.gltf", bytes: bytes("source gltf") });
        expect(
            await reopened.readSource(first.item.id, second.version.hash),
        ).toBeNull();
        expect((await reopened.findVersion(second.version.hash))?.item.id).toBe(
            first.item.id,
        );
    });

    it("reuses the existing item for identical bytes", async () => {
        const parts = { original: bytes("png"), display: bytes("ktx") };
        const first = await store.addVersion({
            kind: "artwork",
            name: "Logo",
            parts,
            source: { filename: "logo.png", bytes: bytes("a") },
        });
        const again = await store.addVersion({
            kind: "artwork",
            name: "Logo copy",
            parts: { display: bytes("ktx"), original: bytes("png") },
            source: { filename: "other.png", bytes: bytes("b") },
        });
        expect(again.outcome).toBe("existing");
        expect(again.item.id).toBe(first.item.id);
        expect(again.version).toEqual(first.version);
        expect(await store.listItems()).toHaveLength(1);
    });

    it("keeps one item when the same bytes are added concurrently", async () => {
        const add = () =>
            store.addVersion({
                kind: "model",
                name: "Flag",
                parts: { glb: bytes("same") },
            });
        const results = await Promise.all([add(), add(), add()]);
        expect(new Set(results.map((r) => r.item.id)).size).toBe(1);
        expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    });

    it("rebuilds the index from manifests alone", async () => {
        const a = await store.addVersion({
            kind: "model",
            name: "A",
            parts: { glb: bytes("a") },
        });
        const b = await store.addVersion({
            kind: "uniform",
            name: "B",
            parts: { uniform: bytes("{}") },
        });

        await rm(path.join(root, "index.json"));
        const fromMissing = await open();
        expect((await fromMissing.listItems()).map((i) => i.id).sort()).toEqual(
            [a.item.id, b.item.id].sort(),
        );
        expect(existsSync(path.join(root, "index.json"))).toBe(true);
        expect((await fromMissing.findVersion(b.version.hash))?.item.id).toBe(
            b.item.id,
        );

        await writeFile(path.join(root, "index.json"), "not json");
        const fromCorrupt = await open();
        expect(await fromCorrupt.listItems({ kind: "uniform" })).toEqual([
            expect.objectContaining({ id: b.item.id, name: "B" }),
        ]);

        // A manifest removed behind the store's back drops out of the index.
        await rm(path.join(root, "items", `${a.item.id}.json`));
        const afterRemoval = await open();
        expect((await afterRemoval.listItems()).map((i) => i.id)).toEqual([
            b.item.id,
        ]);
        expect(await afterRemoval.findVersion(a.version.hash)).toBeNull();
    });

    it("ignores a stale index left by a crash before the index write", async () => {
        const first = await store.addVersion({
            kind: "model",
            name: "Riser",
            parts: { glb: bytes("v1") },
        });
        const staleIndex = await readFile(path.join(root, "index.json"));
        const second = await store.addVersion({
            itemId: first.item.id,
            kind: "model",
            name: "Riser",
            parts: { glb: bytes("v2") },
        });
        // The manifest has v2, but the index went back to naming v1 only.
        await writeFile(path.join(root, "index.json"), staleIndex);

        const reopened = await open();
        expect((await reopened.findVersion(second.version.hash))?.item.id).toBe(
            first.item.id,
        );
        const again = await reopened.addVersion({
            itemId: first.item.id,
            kind: "model",
            name: "Riser",
            parts: { glb: bytes("v2") },
        });
        expect(again.outcome).toBe("existing");
        expect(
            (await reopened.getItem(first.item.id))?.versions.map(
                (v) => v.hash,
            ),
        ).toEqual([first.version.hash, second.version.hash]);
    });

    it("refuses a corrupt blob and rewrites it when its bytes come back", async () => {
        const glb = bytes("good bytes");
        const created = await store.addVersion({
            kind: "model",
            name: "Riser",
            parts: { glb },
        });
        const blob = path.join(root, blobRelativePath(sha256Hex(glb)));
        await writeFile(blob, "");
        await expectLibraryError(store.readBlob(sha256Hex(glb)), "corrupt");

        // Importing the same bytes again, here as a new item, repairs it.
        await store.addVersion({
            kind: "model",
            name: "Riser again",
            parts: { glb, sidecar: bytes("{}") },
        });
        expect(
            await store.readVersionParts(created.item.id, created.version.hash),
        ).toEqual({ glb });
    });

    it("reports unreadable manifests when rebuilding", async () => {
        await store.addVersion({
            kind: "model",
            name: "Good",
            parts: { glb: bytes("good") },
        });
        await writeFile(
            path.join(
                root,
                "items",
                "99999999-9999-4999-8999-999999999999.json",
            ),
            "{}",
        );
        const result = await store.rebuildIndex();
        expect(result.itemCount).toBe(1);
        expect(result.skipped).toEqual([
            expect.objectContaining({
                file: "99999999-9999-4999-8999-999999999999.json",
            }),
        ]);
    });

    it("adds a show's Version under the show's item id", async () => {
        const derivedFrom = {
            itemId: BUILT_IN_ID,
            version: "a".repeat(64),
        };
        const result = await store.addVersion({
            itemId: SHOW_ITEM_ID,
            kind: "artwork",
            name: "Show art",
            derivedFrom,
            license: { license: "CC0-1.0" },
            parts: { original: bytes("o"), display: bytes("d") },
        });
        expect(result.outcome).toBe("created");
        expect(result.item.id).toBe(SHOW_ITEM_ID);
        expect(result.item.derivedFrom).toEqual(derivedFrom);
        expect(result.item.modified).toBe(true);
    });

    it("rejects a Version of the wrong kind for its item", async () => {
        const model = await store.addVersion({
            kind: "model",
            name: "M",
            parts: { glb: bytes("m") },
        });
        await expectLibraryError(
            store.addVersion({
                itemId: model.item.id,
                kind: "artwork",
                name: "M",
                parts: { original: bytes("x") },
            }),
            "kind-mismatch",
        );
    });

    it("validates input", async () => {
        await expectLibraryError(
            store.addVersion({ kind: "model", name: "X", parts: {} }),
            "invalid-input",
        );
        await expectLibraryError(
            store.addVersion({
                kind: "model",
                name: "X",
                parts: { "../escape": bytes("x") },
            }),
            "invalid-input",
        );
        await expectLibraryError(
            store.addVersion({
                itemId: "not-a-uuid",
                kind: "model",
                name: "X",
                parts: { glb: bytes("x") },
            }),
            "invalid-input",
        );
        await expectLibraryError(
            store.addVersion({
                kind: "model",
                name: " ",
                parts: { glb: bytes("x") },
            }),
            "invalid-input",
        );
        await expectLibraryError(
            store.addVersion({
                kind: "model",
                name: "X",
                license: { license: "MIT OR Apache-2.0" },
                parts: { glb: bytes("x") },
            }),
            "invalid-input",
        );
        await expectLibraryError(store.readBlob("../../etc"), "invalid-input");
        expect(await store.listItems()).toEqual([]);
    });

    it("updates metadata without making a Version", async () => {
        const created = await store.addVersion({
            kind: "artwork",
            name: "Banner",
            parts: { original: bytes("b") },
        });
        const updated = await store.updateItem(created.item.id, {
            name: "Big banner",
            tags: ["front"],
            license: {
                license: "LicenseRef-Proprietary",
                licenseText: "Licensed to our band only",
                author: " Designer ",
            },
        });
        expect(updated.versions).toEqual(created.item.versions);
        expect(updated.name).toBe("Big banner");
        expect(updated.author).toBe("Designer");
        expect(updated.license).toBe("LicenseRef-Proprietary");
        expect(updated.updatedAt > created.item.updatedAt).toBe(true);

        const cleared = await store.updateItem(created.item.id, {
            license: { license: "" },
        });
        expect(cleared.license).toBe(LICENSE_UNKNOWN);
        expect(cleared.author).toBe("Designer");

        expect((await (await open()).getItem(created.item.id))?.name).toBe(
            "Big banner",
        );
    });

    it("deletes an item's manifest but never its blobs", async () => {
        const glb = bytes("keep me");
        const created = await store.addVersion({
            kind: "model",
            name: "Gone",
            parts: { glb },
        });
        await store.deleteItem(created.item.id);
        expect(await store.getItem(created.item.id)).toBeNull();
        expect(await store.listItems()).toEqual([]);
        expect(await store.readBlob(sha256Hex(glb))).toEqual(glb);
        await expectLibraryError(
            store.deleteItem(created.item.id),
            "not-found",
        );
    });

    it("saves, updates and deletes size presets", async () => {
        const saved = await store.saveSizePreset({
            name: "Our silk",
            data: { widthM: 0.9144, heightM: 1.3716 },
        });
        const renamed = await store.saveSizePreset({
            id: saved.id,
            name: "Our big silk",
            data: { widthM: 1.0668, heightM: 1.524 },
        });
        expect(renamed.createdAt).toBe(saved.createdAt);
        const reopened = await open();
        expect(await reopened.listSizePresets()).toEqual([renamed]);
        await reopened.deleteSizePreset(saved.id);
        expect(await reopened.listSizePresets()).toEqual([]);
        await expectLibraryError(
            reopened.deleteSizePreset(saved.id),
            "not-found",
        );
    });

    it("saves, renames, adds by id and deletes camera profiles", async () => {
        const data = { kit: "hs", cameras: [{ kind: "kit", id: "pressBox" }] };
        const saved = await store.saveCameraProfile({ name: "Judges", data });
        const renamed = await store.saveCameraProfile({
            id: saved.id,
            name: "Judges' views",
            data,
        });
        expect(renamed.createdAt).toBe(saved.createdAt);
        // A profile from another computer keeps its id.
        const added = await store.saveCameraProfile({
            id: SHOW_ITEM_ID,
            name: "From a colleague",
            data,
        });
        expect(added.id).toBe(SHOW_ITEM_ID);
        const reopened = await open();
        expect(await reopened.listCameraProfiles()).toEqual([renamed, added]);
        expect(
            JSON.parse(
                await readFile(path.join(root, "camera-profiles.json"), "utf8"),
            ).profiles,
        ).toHaveLength(2);
        await reopened.deleteCameraProfile(saved.id);
        expect(await reopened.listCameraProfiles()).toEqual([added]);
        await expectLibraryError(
            reopened.deleteCameraProfile(saved.id),
            "not-found",
        );
        await expectLibraryError(
            Promise.resolve().then(() =>
                reopened.saveCameraProfile({ id: "nope", name: "x", data }),
            ),
            "invalid-input",
        );
    });

    it("reports a corrupt size presets file as corrupt", async () => {
        await writeFile(path.join(root, "size-presets.json"), "not json");
        await expectLibraryError(store.listSizePresets(), "corrupt");
    });
});

describe("built-ins", () => {
    it("are read-only, and editing one makes a copy that inherits its license", async () => {
        const shipped = await writeBuiltIn();
        const store = await open({ builtins: true });

        const builtIn = await store.getItem(BUILT_IN_ID);
        expect(builtIn?.builtIn).toBe(true);
        expect((await store.listItems())[0]).toMatchObject({
            id: BUILT_IN_ID,
            builtIn: true,
        });
        expect(
            await store.readVersionParts(BUILT_IN_ID, shipped.version.hash),
        ).toEqual({ glb: bytes("riser glb"), sidecar: bytes("{}") });

        await expectLibraryError(
            store.updateItem(BUILT_IN_ID, { name: "Mine" }),
            "read-only",
        );
        await expectLibraryError(store.deleteItem(BUILT_IN_ID), "read-only");

        // The built-in's own bytes are already in the Library.
        const same = await store.addVersion({
            itemId: BUILT_IN_ID,
            kind: "model",
            name: "Riser",
            parts: { glb: bytes("riser glb"), sidecar: bytes("{}") },
        });
        expect(same.outcome).toBe("existing");
        expect(same.item.id).toBe(BUILT_IN_ID);

        const edited = await store.addVersion({
            itemId: BUILT_IN_ID,
            kind: "model",
            name: "",
            license: { license: "MIT" },
            parts: { glb: bytes("taller riser"), sidecar: bytes("{}") },
        });
        expect(edited.outcome).toBe("copied");
        expect(edited.item.id).not.toBe(BUILT_IN_ID);
        expect(edited.item.builtIn).toBe(false);
        expect(edited.item.name).toBe("Riser");
        expect(edited.item.derivedFrom).toEqual({
            itemId: BUILT_IN_ID,
            version: shipped.version.hash,
        });
        expect(edited.item).toMatchObject({
            license: "CC-BY-4.0",
            author: "A. Maker",
            sourceUrl: "https://example.com/riser",
            attribution: "Riser by A. Maker",
            modified: true,
        });

        // The copy lives in the user's Library; the built-in is untouched.
        expect(
            existsSync(path.join(root, "items", `${BUILT_IN_ID}.json`)),
        ).toBe(false);
        expect((await store.getItem(BUILT_IN_ID))?.versions).toHaveLength(1);
        await expectLibraryError(
            store.updateItem(edited.item.id, { license: { modified: false } }),
            "invalid-input",
        );

        const reopened = await open({ builtins: true });
        expect((await reopened.getItem(edited.item.id))?.modified).toBe(true);
        expect(await reopened.listItems()).toHaveLength(2);
    });

    it("rejects a base Version the built-in doesn't have", async () => {
        await writeBuiltIn();
        const store = await open({ builtins: true });
        await expectLibraryError(
            store.addVersion({
                itemId: BUILT_IN_ID,
                baseVersion: "f".repeat(64),
                kind: "model",
                name: "Riser",
                parts: { glb: bytes("other") },
            }),
            "not-found",
        );
    });

    it("never writes to the built-ins root", async () => {
        await writeBuiltIn();
        const before = await readFile(
            path.join(builtinsRoot, "items", `${BUILT_IN_ID}.json`),
            "utf8",
        );
        const store = await open({ builtins: true });
        await store.addVersion({
            itemId: BUILT_IN_ID,
            kind: "model",
            name: "Riser",
            parts: { glb: bytes("edit") },
        });
        expect(
            await readFile(
                path.join(builtinsRoot, "items", `${BUILT_IN_ID}.json`),
                "utf8",
            ),
        ).toBe(before);
        expect(
            existsSync(
                path.join(
                    builtinsRoot,
                    blobRelativePath(sha256Hex(bytes("edit"))),
                ),
            ),
        ).toBe(false);
    });
});

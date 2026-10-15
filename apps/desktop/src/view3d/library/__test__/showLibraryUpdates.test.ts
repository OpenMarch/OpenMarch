import { describe, expect, it } from "vitest";
import {
    buildAddFromShowRequest,
    findLibraryUpdates,
    type ShowItemForUpdates,
} from "../showLibraryUpdates";
import { AddFromShowRequestSchema, type LibraryItemSummary } from "../protocol";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";

const h = (c: string) => c.repeat(64);
const RIFLE = "11111111-1111-4111-8111-111111111111";
const FLAG = "22222222-2222-4222-8222-222222222222";

const license = {
    license: "CC-BY-4.0",
    licenseText: null,
    author: "A. Maker",
    sourceUrl: null,
    attribution: null,
    modified: false,
};
const metadata = {
    tags: ["guard"],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    originalFilename: "rifle.glb",
    derivedFrom: null,
    ...license,
};

const showRifle = (versionHash = h("1")): ShowItemForUpdates => ({
    itemId: RIFLE,
    versionHash,
    name: "Rifle",
    metadata,
});

const libraryRifle = (
    patch: Partial<LibraryItemSummary> = {},
): LibraryItemSummary => ({
    id: RIFLE,
    kind: "model",
    name: "Rifle",
    tags: ["guard"],
    updatedAt: "2026-10-02T00:00:00.000Z",
    license: "CC-BY-4.0",
    versions: [h("1")],
    builtIn: false,
    ...patch,
});

describe("findLibraryUpdates", () => {
    it("finds nothing when the show has the Library's latest", () => {
        expect(
            findLibraryUpdates({
                showItems: [showRifle()],
                library: [libraryRifle()],
            }),
        ).toEqual([]);
    });

    it("offers a newer Version", () => {
        expect(
            findLibraryUpdates({
                showItems: [showRifle()],
                library: [libraryRifle({ versions: [h("1"), h("2")] })],
            }),
        ).toEqual([
            {
                itemId: RIFLE,
                type: "version",
                showVersions: [h("1")],
                latest: h("2"),
            },
        ]);
    });

    it("offers a metadata-only update", () => {
        for (const patch of [
            { name: "Parade rifle" },
            { tags: ["guard", "rifle"] },
            { license: "CC0-1.0" },
        ]) {
            expect(
                findLibraryUpdates({
                    showItems: [showRifle()],
                    library: [libraryRifle(patch)],
                }),
            ).toEqual([{ itemId: RIFLE, type: "metadata" }]);
        }
    });

    it("offers nothing when only the item's updated time moved", () => {
        // "Add to my Library" adds this show's Version and bumps updatedAt
        expect(
            findLibraryUpdates({
                showItems: [showRifle()],
                library: [
                    libraryRifle({ updatedAt: "2026-10-05T00:00:00.000Z" }),
                ],
            }),
        ).toEqual([]);
    });

    it("lists an item once when the show has several of its Versions", () => {
        expect(
            findLibraryUpdates({
                showItems: [showRifle(h("1")), showRifle(h("2"))],
                library: [libraryRifle({ versions: [h("1"), h("2"), h("3")] })],
            }),
        ).toEqual([
            {
                itemId: RIFLE,
                type: "version",
                showVersions: [h("1"), h("2")],
                latest: h("3"),
            },
        ]);
    });

    it("offers nothing for an item the Library doesn't have", () => {
        expect(
            findLibraryUpdates({ showItems: [showRifle()], library: [] }),
        ).toEqual([]);
    });

    it("offers nothing when the show's Version isn't one the Library knows", () => {
        // Another machine's edit: neither is newer, so nothing is offered
        expect(
            findLibraryUpdates({
                showItems: [showRifle(h("9"))],
                library: [libraryRifle({ versions: [h("1"), h("2")] })],
            }),
        ).toEqual([]);
    });
});

describe("buildAddFromShowRequest", () => {
    const blobs: Record<string, Uint8Array> = {
        [h("a")]: new Uint8Array([1, 2]),
        [h("b")]: new Uint8Array([3]),
    };
    const item: ShowLibraryItem = {
        itemId: FLAG,
        versionHash: h("1"),
        kind: "artwork",
        name: "Flag",
        builtIn: false,
        metadata: { ...metadata, originalFilename: "flag.png" },
        pins: [],
        parts: { original: h("a"), display: h("b") },
        sidecar: null,
        embeddedAt: "2026-10-02 00:00:00",
    };
    const readBlob = async (hash: string) => blobs[hash];

    it("sends every part, the name, tags and license", async () => {
        const request = await buildAddFromShowRequest({ item, readBlob });
        expect(AddFromShowRequestSchema.safeParse(request).success).toBe(true);
        expect(request).toMatchObject({
            itemId: FLAG,
            kind: "artwork",
            name: "Flag",
            tags: ["guard"],
            versionHash: h("1"),
            license: {
                license: "CC-BY-4.0",
                licenseText: null,
                author: "A. Maker",
                sourceUrl: null,
                attribution: null,
            },
            derivedFrom: null,
        });
        expect(Object.keys(request.parts).sort()).toEqual([
            "display",
            "original",
        ]);
    });

    it("refuses when the show is missing a part's bytes", async () => {
        await expect(
            buildAddFromShowRequest({
                item: { ...item, parts: { ...item.parts, display: h("c") } },
                readBlob,
            }),
        ).rejects.toThrow(/display/);
    });
});

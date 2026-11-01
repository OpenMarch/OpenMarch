// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@om-electron/main/library/types";
import { sha256Hex } from "@om-electron/main/library/hash";
import { versionToEmbed } from "../showLibraryEmbed";
import type { ReadPartsRequest, Result } from "../protocol";

const bytes = (text: string) => new TextEncoder().encode(text);
const FLAG = "22222222-2222-4222-8222-222222222222";

const stored: Record<string, Uint8Array> = {
    original: bytes("flag.png"),
    display: bytes("flag.ktx2"),
    sidecar: bytes("{}"),
};
const partHashes = Object.fromEntries(
    Object.entries(stored).map(([role, b]) => [role, sha256Hex(b)]),
);

const flag = (patch: Partial<LibraryItem> = {}): LibraryItem => ({
    schemaVersion: 1,
    id: FLAG,
    kind: "artwork",
    name: "Flag",
    tags: ["guard"],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    originalFilename: "flag.png",
    derivedFrom: null,
    license: "CC-BY-4.0",
    licenseText: null,
    author: "A. Maker",
    sourceUrl: null,
    attribution: null,
    modified: false,
    builtIn: false,
    versions: [
        {
            hash: "a".repeat(64),
            createdAt: "2026-10-01T00:00:00.000Z",
            parts: partHashes,
            source: null,
        },
    ],
    ...patch,
});

const readParts = async (
    request: ReadPartsRequest,
): Promise<Result<Record<string, Uint8Array>>> => ({
    ok: true,
    value: Object.fromEntries(request.roles.map((r) => [r, stored[r]])),
});

describe("versionToEmbed", () => {
    it("reads every part, the original included", async () => {
        const requests: ReadPartsRequest[] = [];
        const version = await versionToEmbed({
            item: flag(),
            versionHash: "a".repeat(64),
            readParts: (request) => {
                requests.push(request);
                return readParts(request);
            },
        });
        expect(requests).toHaveLength(1);
        expect([...requests[0].roles].sort()).toEqual([
            "display",
            "original",
            "sidecar",
        ]);
        expect(Object.keys(version.parts).sort()).toEqual([
            "display",
            "original",
            "sidecar",
        ]);
        expect(version).toMatchObject({
            itemId: FLAG,
            versionHash: "a".repeat(64),
            kind: "artwork",
            name: "Flag",
            builtIn: false,
            pins: [],
            metadata: {
                tags: ["guard"],
                createdAt: "2026-10-01T00:00:00.000Z",
                updatedAt: "2026-10-02T00:00:00.000Z",
                originalFilename: "flag.png",
                derivedFrom: null,
                license: "CC-BY-4.0",
                licenseText: null,
                author: "A. Maker",
                sourceUrl: null,
                attribution: null,
                modified: false,
            },
        });
    });

    it("refuses a Version the item doesn't have", async () => {
        await expect(
            versionToEmbed({
                item: flag(),
                versionHash: "b".repeat(64),
                readParts,
            }),
        ).rejects.toThrow(/no Version/);
    });

    it("refuses a part read-parts can't serve", async () => {
        const item = flag();
        item.versions[0].parts = { ...partHashes, mystery: "c".repeat(64) };
        await expect(
            versionToEmbed({ item, versionHash: "a".repeat(64), readParts }),
        ).rejects.toThrow(/mystery/);
    });

    it("passes on a failed read", async () => {
        await expect(
            versionToEmbed({
                item: flag(),
                versionHash: "a".repeat(64),
                readParts: async () => ({
                    ok: false,
                    error: { code: "corrupt", message: "Library is corrupt" },
                }),
            }),
        ).rejects.toThrow(/corrupt/);
    });

    it("refuses when a part comes back missing", async () => {
        await expect(
            versionToEmbed({
                item: flag(),
                versionHash: "a".repeat(64),
                readParts: async (request) => ({
                    ok: true,
                    value: { display: stored.display },
                }),
            }),
        ).rejects.toThrow(/original|sidecar/);
    });
});

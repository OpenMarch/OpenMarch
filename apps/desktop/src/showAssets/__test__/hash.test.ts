// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
    canonicalJson,
    hashParts,
    isSha256Hex,
    sha256Hex,
    versionHashOf,
    versionHashOfListing,
} from "../hash";

const bytes = (text: string) => new TextEncoder().encode(text);
const nodeSha = (data: Uint8Array | string) =>
    createHash("sha256").update(data).digest("hex");

describe("sha256Hex", () => {
    it("hashes bytes the way node:crypto does", async () => {
        for (const sample of ["", "glb", "a longer sidecar {}"])
            expect(await sha256Hex(bytes(sample))).toBe(nodeSha(sample));
    });

    it("writes 64 lowercase hex digits", async () => {
        expect(isSha256Hex(await sha256Hex(bytes("x")))).toBe(true);
        expect(isSha256Hex("A".repeat(64))).toBe(false);
        expect(isSha256Hex("a".repeat(63))).toBe(false);
    });
});

describe("canonicalJson", () => {
    it("sorts every object's keys, at any depth, with no spaces", () => {
        expect(
            canonicalJson({
                b: 1,
                a: { d: [3, { z: true, y: null }], c: "x" },
            }),
        ).toBe('{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}');
    });

    it("gives equal text for equal values written in any order", () => {
        expect(canonicalJson({ widthM: 1.5, heightM: 2 })).toBe(
            canonicalJson({ heightM: 2, widthM: 1.5 }),
        );
    });

    it("refuses what JSON can't hold exactly", () => {
        expect(() => canonicalJson({ a: Number.NaN })).toThrow(/number/);
        expect(() => canonicalJson({ a: Infinity })).toThrow(/number/);
        expect(() => canonicalJson({ a: undefined as never })).toThrow(
            /undefined/,
        );
    });
});

describe("versionHashOf", () => {
    const parts = { model: nodeSha("glTF-model"), thumbnail: nodeSha("png") };
    const sidecar = canonicalJson({ widthM: 2, heightM: 1 });

    it("is pinned: the listing never changes, or every stored Version would", async () => {
        expect(await versionHashOf(parts, sidecar)).toBe(
            "b6e1a8e89d770876456f074719c96ecc54115a120a5e89ca9eedaacadaf43bc4",
        );
    });

    it("is the parked Library's listing with the sidecar as a part", async () => {
        // archive/pre-convergence electron/main/library/hash.ts computeVersionHash
        const all: Record<string, string> = {
            ...parts,
            sidecar: nodeSha(sidecar),
        };
        let listing = "openmarch-library-version/1\n";
        for (const role of Object.keys(all).sort())
            listing += `${role} ${all[role]}\n`;
        expect(await versionHashOf(parts, sidecar)).toBe(nodeSha(listing));
        expect(await versionHashOfListing(all)).toBe(nodeSha(listing));
    });

    it("changes with any part or the sidecar", async () => {
        const base = await versionHashOf(parts, sidecar);
        expect(
            await versionHashOf({ ...parts, model: nodeSha("other") }, sidecar),
        ).not.toBe(base);
        expect(
            await versionHashOf(
                parts,
                canonicalJson({ widthM: 3, heightM: 1 }),
            ),
        ).not.toBe(base);
        expect(await versionHashOf({ model: parts.model }, sidecar)).not.toBe(
            base,
        );
    });

    it("refuses no parts, and a part called sidecar", async () => {
        await expect(versionHashOf({}, "{}")).rejects.toThrow(
            /at least one part/,
        );
        await expect(
            versionHashOf({ sidecar: nodeSha("x") }, "{}"),
        ).rejects.toThrow(/sidecar/);
    });
});

describe("hashParts", () => {
    it("hashes each part", async () => {
        const parts = { model: bytes("glb"), thumbnail: bytes("png") };
        expect(await hashParts(parts)).toEqual({
            model: nodeSha("glb"),
            thumbnail: nodeSha("png"),
        });
    });
});

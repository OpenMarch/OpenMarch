// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeVersionHash, sha256Hex } from "@om-electron/main/library/hash";
import { hashParts, sha256HexOf, versionHashOf } from "../showHash";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("showHash", () => {
    it("hashes bytes the way the main process does", async () => {
        for (const sample of ["", "glb", "a longer sidecar {}"]) {
            expect(await sha256HexOf(bytes(sample))).toBe(
                sha256Hex(bytes(sample)),
            );
        }
    });

    it("names a Version the way the main process does", async () => {
        const partHashes = {
            sidecar: sha256Hex(bytes("{}")),
            glb: sha256Hex(bytes("glTF")),
        };
        expect(await versionHashOf(partHashes)).toBe(
            computeVersionHash(partHashes),
        );
    });

    it("hashes each part of a Version", async () => {
        const parts = { original: bytes("png"), display: bytes("ktx2") };
        expect(await hashParts(parts)).toEqual({
            original: sha256Hex(parts.original),
            display: sha256Hex(parts.display),
        });
    });

    it("refuses a Version with no parts", async () => {
        await expect(versionHashOf({})).rejects.toThrow(/at least one part/);
    });
});

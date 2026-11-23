import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    copyExtendedAttributes,
    copyFileMetadata,
    isReadOnly,
} from "../fileMetadata";
import { checkForConflict, type FileIdentity } from "../fileIdentity";

/** A stand-in for macOS `xattr` backed by a map per file. */
function fakeXattr(files: Record<string, Record<string, string>>) {
    const calls: string[][] = [];
    const exec = async (file: string, args: string[]) => {
        calls.push([file, ...args]);
        if (args.length === 1) {
            return { stdout: Object.keys(files[args[0]] ?? {}).join("\n") };
        }
        const [flag, name, ...rest] = args;
        if (flag === "-px") {
            const value = files[rest[0]]?.[name];
            if (value === undefined) throw new Error("No such xattr");
            // xattr prints hex in spaced, wrapped groups.
            return { stdout: value.replace(/(..)/g, "$1 ") + "\n" };
        }
        if (flag === "-wx") {
            const [hex, target] = rest;
            (files[target] ??= {})[name] = hex;
            return { stdout: "" };
        }
        throw new Error(`Unexpected xattr call: ${args.join(" ")}`);
    };
    return { exec, calls };
}

describe("copyExtendedAttributes", () => {
    it("copies Finder tags and other attributes to the replacement", async () => {
        const files = {
            "show.dots": {
                "com.apple.metadata:_kMDItemUserTags": "62706c6973743030a1",
                "com.apple.FinderInfo": "0000000000000000",
            },
        };
        const { exec } = fakeXattr(files);

        const result = await copyExtendedAttributes(
            "show.dots",
            "temp.tmp",
            exec,
        );

        expect(result.failed).toEqual([]);
        expect(files).toMatchObject({
            "temp.tmp": {
                "com.apple.metadata:_kMDItemUserTags": "62706c6973743030a1",
                "com.apple.FinderInfo": "0000000000000000",
            },
        });
    });

    it("reports attributes it couldn't copy instead of failing the save", async () => {
        const exec = async (_file: string, args: string[]) => {
            if (args.length === 1) return { stdout: "a\nb\n" };
            if (args[1] === "b") throw new Error("Operation not permitted");
            return { stdout: args[0] === "-px" ? "00" : "" };
        };
        const result = await copyExtendedAttributes("from", "to", exec);
        expect(result).toEqual({ copied: ["a"], failed: ["b"] });
    });

    it("only runs xattr on macOS", async () => {
        const dir = fs.mkdtempSync(join(tmpdir(), "openmarch-metadata-"));
        try {
            const from = join(dir, "from");
            const to = join(dir, "to");
            fs.writeFileSync(from, "");
            fs.writeFileSync(to, "");
            fs.chmodSync(from, 0o600);
            const { exec, calls } = fakeXattr({});

            await copyFileMetadata(from, to, { platform: "linux", exec });
            expect(calls).toEqual([]);
            expect(fs.statSync(to).mode & 0o777).toBe(0o600);

            await copyFileMetadata(from, to, { platform: "darwin", exec });
            expect(calls).toEqual([["/usr/bin/xattr", from]]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("checkForConflict", () => {
    const expected: FileIdentity = {
        size: 100,
        mtimeMs: 1,
        ino: 2,
        dev: 3,
        sha256: "aaa",
    };

    it("passes an unchanged file", () => {
        expect(checkForConflict(expected, { ...expected })).toEqual({
            conflict: false,
            metadataOnly: false,
        });
    });

    it("passes a file whose metadata changed but content didn't", () => {
        expect(
            checkForConflict(expected, { ...expected, mtimeMs: 9, ino: 8 }),
        ).toEqual({ conflict: false, metadataOnly: true });
    });

    it("flags changed content when the stat changed too", () => {
        expect(
            checkForConflict(expected, {
                ...expected,
                mtimeMs: 9,
                sha256: "bbb",
            }),
        ).toEqual({
            conflict: true,
            reason: "modified",
            changed: ["mtimeMs", "sha256"],
        });
    });

    it("trusts an unchanged stat without reading the file (no hash is taken then)", () => {
        expect(
            checkForConflict(expected, { ...expected, sha256: null }),
        ).toEqual({ conflict: false, metadataOnly: false });
    });

    it("flags a changed stat when the hash from open isn't known", () => {
        expect(
            checkForConflict(
                { ...expected, sha256: null },
                { ...expected, mtimeMs: 9 },
            ),
        ).toMatchObject({ conflict: true, reason: "modified" });
    });

    it("flags a missing file", () => {
        expect(checkForConflict(expected, null)).toMatchObject({
            conflict: true,
            reason: "missing",
        });
    });
});

describe("isReadOnly", () => {
    it("treats a path with no file yet as writable on Windows (Save As to a new file)", async () => {
        await expect(
            isReadOnly(join(tmpdir(), "openmarch-no-such-show.dots"), "win32"),
        ).resolves.toBe(false);
    });
});

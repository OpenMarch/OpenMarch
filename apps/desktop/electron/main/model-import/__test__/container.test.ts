// @vitest-environment node
// cspell:words Fsecret Fetc Fpasswd Csecret
/**
 * A `.gltf`'s resources are read only from inside the picked file's folder:
 * `..`, absolute paths, schemes, Windows paths and symlinks that climb out
 * are refused, and their bytes never reach the stored source.
 */
import {
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    checkResources,
    readModelFile,
    resourcePathOf,
    resourcesByPath,
    sourceFileOf,
    type RawGltf,
} from "../container";
import { importModelFile } from "../pipeline";
import type { ModelImportResult } from "../types";

const FIXTURES = path.join(__dirname, "fixtures");
const SECRET = "OM-SECRET-BYTES-OUTSIDE-THE-FOLDER";

let root: string;
/** The picked file's folder; `root/secret.bin` sits just outside it. */
let folder: string;
let secretPath: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "om-model-uri-"));
    folder = path.join(root, "picked");
    await mkdir(folder);
    secretPath = path.join(root, "secret.bin");
    await writeFile(secretPath, SECRET);
    await copyFile(
        path.join(FIXTURES, "model.bin"),
        path.join(folder, "model.bin"),
    );
    await copyFile(
        path.join(FIXTURES, "logo.png"),
        path.join(folder, "logo.png"),
    );
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** Writes `picked/model.gltf` with the buffer's (and optionally image's) URI. */
async function writeGltf(
    bufferUri: string,
    imageUri = "logo.png",
): Promise<string> {
    const json = JSON.parse(
        await readFile(path.join(FIXTURES, "model.gltf"), "utf8"),
    );
    json.buffers[0].uri = bufferUri;
    json.images[0].uri = imageUri;
    const file = path.join(folder, "model.gltf");
    await writeFile(file, JSON.stringify(json));
    return file;
}

function outsideRejection(r: ModelImportResult) {
    expect(r.report.status).toBe("rejected");
    expect(r.output).toBeNull();
    return r.report.cantImport.find((x) => x.code === "resourceOutsideFolder");
}

/** Reads the file and checks no secret bytes were read or would be stored. */
async function expectNotRead(file: string) {
    const input = await readModelFile(file);
    for (const data of Object.values(input.resources ?? {})) {
        expect(Buffer.from(data).toString()).not.toContain(SECRET);
    }
    const source = Buffer.from(sourceFileOf(input).bytes).toString();
    expect(source).not.toContain(Buffer.from(SECRET).toString("base64"));
    return input;
}

describe("resources outside the picked folder", () => {
    it("refuses a ../ escape", async () => {
        const file = await writeGltf("../secret.bin");
        await expectNotRead(file);
        const r = await importModelFile(file);
        expect(outsideRejection(r)?.uri).toBe("../secret.bin");
    });

    it("refuses a percent-encoded %2e%2e/ escape", async () => {
        const file = await writeGltf("%2e%2e/secret.bin");
        await expectNotRead(file);
        const r = await importModelFile(file);
        expect(outsideRejection(r)?.uri).toBe("%2e%2e/secret.bin");
    });

    it("refuses an absolute path", async () => {
        const uri = secretPath.split(path.sep).join("/");
        const file = await writeGltf(uri);
        await expectNotRead(file);
        const r = await importModelFile(file);
        expect(outsideRejection(r)?.uri).toBe(uri);
    });

    it("refuses a file: URL", async () => {
        const uri = pathToFileURL(secretPath).href;
        const file = await writeGltf(uri);
        await expectNotRead(file);
        const r = await importModelFile(file);
        expect(r.report.status).toBe("rejected");
        expect(r.report.cantImport).toContainEqual({
            code: "externalUri",
            uri,
        });
    });

    it("refuses a symlink inside the folder that points outside", async (ctx) => {
        try {
            await symlink(secretPath, path.join(folder, "link.bin"));
        } catch {
            ctx.skip(); // No symlink permission (e.g. Windows without dev mode).
        }
        const file = await writeGltf("link.bin");
        const input = await expectNotRead(file);
        expect(input.refusedResources).toEqual(["link.bin"]);
        const r = await importModelFile(file);
        expect(outsideRejection(r)?.uri).toBe("link.bin");
    });

    it("still imports resources in a subfolder", async () => {
        await mkdir(path.join(folder, "bin"));
        await mkdir(path.join(folder, "textures"));
        await copyFile(
            path.join(FIXTURES, "model.bin"),
            path.join(folder, "bin", "model.bin"),
        );
        await copyFile(
            path.join(FIXTURES, "logo.png"),
            path.join(folder, "textures", "logo.png"),
        );
        const file = await writeGltf("bin/model.bin", "textures/logo.png");
        const input = await readModelFile(file);
        expect(Object.keys(input.resources!).sort()).toEqual([
            "bin/model.bin",
            "textures/logo.png",
        ]);
        expect(input.refusedResources).toBeUndefined();
        const r = await importModelFile(file);
        expect(r.report.cantImport).toEqual([]);
        expect(r.report.status).toBe("ready");
    });

    it("imports resources whose URIs aren't written in normal form", async () => {
        await mkdir(path.join(folder, "textures"));
        await copyFile(
            path.join(FIXTURES, "logo.png"),
            path.join(folder, "textures", "logo.png"),
        );
        const file = await writeGltf("./model.bin", "textures/./logo.png");
        const input = await readModelFile(file);
        expect(Object.keys(input.resources!).sort()).toEqual([
            "./model.bin",
            "textures/./logo.png",
        ]);
        const r = await importModelFile(file);
        expect(r.report.cantImport).toEqual([]);
        expect(r.report.status).toBe("ready");
    });
});

describe("resourcePathOf", () => {
    it.each([
        ["../secret.bin"],
        ["a/../../secret.bin"],
        ["%2e%2e/secret.bin"],
        ["%2E%2E%2Fsecret.bin"],
        ["/etc/passwd"],
        ["%2Fetc%2Fpasswd"],
        ["//server/share/secret.bin"],
        ["C:/Windows/win.ini"],
        ["C:\\Windows\\win.ini"],
        ["c%3A/Windows/win.ini"],
        ["\\\\server\\share\\secret.bin"],
        ["..\\secret.bin"],
        ["sub%5C..%5C..%5Csecret.bin"],
        ["model.bin%00.png"],
        ["%E0%A4%A"],
    ])("refuses %s as outside the folder", (uri) => {
        expect(resourcePathOf(uri)).toEqual({
            ok: false,
            code: "resourceOutsideFolder",
        });
    });

    it.each([
        ["file:///etc/passwd"],
        ["https://example.com/model.bin"],
        ["file%3A%2F%2F%2Fetc%2Fpasswd"],
    ])("refuses %s as an external URI", (uri) => {
        expect(resourcePathOf(uri)).toEqual({
            ok: false,
            code: "externalUri",
        });
    });

    it("decodes and normalizes a relative path", () => {
        expect(resourcePathOf("my%20textures/./logo.png")).toEqual({
            ok: true,
            path: "my textures/logo.png",
        });
        expect(resourcePathOf("a/../model.bin")).toEqual({
            ok: true,
            path: "model.bin",
        });
    });

    it("makes checkResources reject an in-memory escape", () => {
        const json = { buffers: [{ uri: "../secret.bin" }] } as RawGltf;
        expect(() =>
            checkResources(json, { "../secret.bin": new Uint8Array(1) }),
        ).toThrow(/outside the picked folder/);
    });

    it("keys resources by normalized path, never for a refused URI", () => {
        const json = {
            buffers: [{ uri: "./model.bin" }, { uri: "link.bin" }],
            images: [{ uri: "my%20textures/./logo.png" }],
        } as RawGltf;
        const bin = new Uint8Array([1]);
        const link = new Uint8Array([2]);
        const png = new Uint8Array([3]);
        const keyed = resourcesByPath(
            json,
            {
                "./model.bin": bin,
                "link.bin": link,
                "my%20textures/./logo.png": png,
            },
            ["link.bin"],
        );
        expect(keyed).toEqual({
            "./model.bin": bin,
            "model.bin": bin,
            "link.bin": link,
            "my%20textures/./logo.png": png,
            "my textures/logo.png": png,
        });
    });
});

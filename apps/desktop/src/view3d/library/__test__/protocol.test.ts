// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_KINDS } from "../../../../electron/main/model-import/rules";
import { createImportClient, isStale, type LibraryApi } from "../importClient";
import {
    CommitMetaSchema,
    ImportCommitRequestSchema,
    ImportInspectRequestSchema,
    LIBRARY_CHANNELS,
    LIBRARY_INVOKE_CHANNELS,
    MODEL_KIND_VALUES,
    ModelImportChoicesSchema,
    type ImportInspection,
    type Result,
} from "../protocol";

const PRELOADS = path.join(__dirname, "../../../../electron/preload");
const preloadSource = (file: string) =>
    readFileSync(path.join(PRELOADS, file), "utf8");

const id = () => crypto.randomUUID();

describe("library protocol", () => {
    it("keeps the model kinds equal to the pipeline's", () => {
        expect(MODEL_KIND_VALUES).toEqual(MODEL_KINDS);
    });

    it("has the 19 channels of the design, all under library:", () => {
        expect(LIBRARY_CHANNELS).toHaveLength(19);
        expect(new Set(LIBRARY_CHANNELS).size).toBe(19);
        for (const c of LIBRARY_CHANNELS) {
            expect(c).toMatch(/^library:[a-z-]+$/);
        }
    });

    it("the editor's preload hard-codes exactly the main registry's channels", () => {
        const used = new Set(
            [...preloadSource("index.ts").matchAll(/"(library:[a-z-]+)"/g)].map(
                (m) => m[1],
            ),
        );
        expect([...used].sort()).toEqual([...LIBRARY_CHANNELS].sort());
    });

    it("the 3D View's preload has no Library method and its API keys are unchanged", () => {
        const source = preloadSource("view3d.ts");
        expect(source).not.toMatch(/library:/);
        const api = source.slice(
            source.indexOf("const VIEW3D_API = {"),
            source.indexOf("contextBridge.exposeInMainWorld"),
        );
        const keys = [...api.matchAll(/^ {4}([A-Za-z0-9]+):/gm)].map(
            (m) => m[1],
        );
        expect(keys).toEqual([
            "isMacOS",
            "sqlRead",
            "hello",
            "on",
            "requestVenueChange",
            "requestPlayback",
        ]);
    });

    it("refuses paths, unknown keys and oversize strings", () => {
        const base = {
            sessionId: id(),
            fileId: id(),
            type: "model" as const,
            choices: {},
        };
        expect(ImportInspectRequestSchema.safeParse(base).success).toBe(true);
        expect(
            ImportInspectRequestSchema.safeParse({
                ...base,
                path: "/tmp/x.glb",
            }).success,
        ).toBe(false);
        expect(
            ImportInspectRequestSchema.safeParse({
                ...base,
                fileId: "/tmp/x.glb",
            }).success,
        ).toBe(false);
        expect(
            ImportInspectRequestSchema.safeParse({
                ...base,
                choices: { unitConversion: "cm", extra: 1 },
            }).success,
        ).toBe(false);
        expect(
            CommitMetaSchema.safeParse({ name: "x".repeat(201) }).success,
        ).toBe(false);
        expect(
            CommitMetaSchema.safeParse({
                name: "ok",
                tags: Array.from({ length: 33 }, () => "t"),
            }).success,
        ).toBe(false);
        expect(
            CommitMetaSchema.safeParse({
                name: "ok",
                license: { licenseText: "x".repeat(4097) },
            }).success,
        ).toBe(false);
    });

    it("takes an artwork slot picked from the material list (Q67)", () => {
        const slot = { material: 1, id: "artwork", widthM: 2.4, heightM: 0.6 };
        const parse = (s: object) =>
            ModelImportChoicesSchema.safeParse({ slots: [s] }).success;
        expect(parse(slot)).toBe(true);
        expect(parse({ ...slot, material: -1 })).toBe(false);
        expect(parse({ ...slot, material: 0.5 })).toBe(false);
        expect(parse({ ...slot, id: "front panel" })).toBe(false);
        expect(parse({ ...slot, widthM: 0 })).toBe(false);
        expect(parse({ ...slot, name: "Wood" })).toBe(false);
    });

    it("caps a commit's thumbnail at 1 MB", () => {
        const commit = {
            sessionId: id(),
            fileId: id(),
            type: "model",
            kind: "prop",
            choices: {},
            meta: { name: "A" },
        };
        expect(
            ImportCommitRequestSchema.safeParse({
                ...commit,
                thumbnail: new Uint8Array(1024 * 1024),
            }).success,
        ).toBe(true);
        expect(
            ImportCommitRequestSchema.safeParse({
                ...commit,
                thumbnail: new Uint8Array(1024 * 1024 + 1),
            }).success,
        ).toBe(false);
    });
});

describe("createImportClient", () => {
    it("drops a model inspect reply older than the latest call", async () => {
        const resolvers: ((r: Result<ImportInspection>) => void)[] = [];
        const api = {
            importInspect: () =>
                new Promise<Result<ImportInspection>>((resolve) =>
                    resolvers.push(resolve),
                ),
        } as unknown as LibraryApi;
        const client = createImportClient(api);
        const request = { sessionId: id(), fileId: id(), choices: {} };
        const first = client.inspectModel(request);
        const second = client.inspectModel({
            ...request,
            choices: { simplify: true },
        });
        const reply = (requestSeq: number): Result<ImportInspection> => ({
            ok: true,
            value: {
                type: "model",
                fileId: request.fileId,
                requestSeq,
                report: {} as never,
                sidecar: null,
                previewReady: false,
                matches: [],
            },
        });
        resolvers[0](reply(1));
        resolvers[1](reply(2));
        expect(isStale(await first)).toBe(true);
        const latest = await second;
        expect(!isStale(latest) && latest.ok && latest.value.requestSeq).toBe(
            2,
        );
    });

    it("filters progress to its session", () => {
        let listener: ((p: { sessionId: string }) => void) | null = null;
        const api = {
            onImportProgress: (cb: typeof listener) => {
                listener = cb;
                return () => {};
            },
        } as unknown as LibraryApi;
        const seen: string[] = [];
        createImportClient(api).onProgress("a", (p) => seen.push(p.sessionId));
        listener!({ sessionId: "b" });
        listener!({ sessionId: "a" });
        expect(seen).toEqual(["a"]);
    });

    it("keeps channel names in one place", () => {
        expect(LIBRARY_INVOKE_CHANNELS.importPick).toBe("library:import-pick");
    });
});

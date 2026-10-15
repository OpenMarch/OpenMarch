// @vitest-environment node
// cspell:words gltf
import {
    copyFile,
    mkdtemp,
    open,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    LIBRARY_CHANGED_CHANNEL,
    LIBRARY_IMPORT_PROGRESS_CHANNEL,
    LIBRARY_INVOKE_CHANNELS as C,
    type ImportInspection,
    type ImportProgress,
    type ImportSession,
    type LibraryChanged,
    type Result,
} from "../../../../src/view3d/library/protocol";
import { sniffArtworkFormat } from "../../artwork-import/formats";
import type { PdfRenderer } from "../../artwork-import/pdf";
import { computeVersionHash, sha256Hex } from "../../library/hash";
import { openLibraryStore, type LibraryStore } from "../../library/store";
import type { OpenDialogSpec } from "../files";
import {
    createLibraryIpcService,
    type IpcSender,
    type LibraryIpcService,
} from "../service";
import { ImportWorkerClient } from "../worker-client";
import { FakeWorkerChild, fakeSpawner } from "./fakeWorker";

const FIXTURES = path.join(__dirname, "../../model-import/__test__/fixtures");
const KIT_ID = "6b1f3c1e-5a43-4d0e-9a51-2f7c8e9d0a11";

let dir: string;
let files: string;
let store: LibraryStore;
let service: LibraryIpcService;
let worker: ImportWorkerClient;
let spawner: ReturnType<typeof fakeSpawner>;
let picks: string[][];
let saveTarget: string | null;
let dialogSpecs: OpenDialogSpec[];
let changes: LibraryChanged[];
let pushes: { channel: string; payload: unknown }[];
let lastFolder: string | null;
let pdfRenderer: PdfRenderer | null;

const editor: IpcSender = {
    id: 1,
    send: (channel, payload) => pushes.push({ channel, payload }),
};
const otherEditor: IpcSender = { id: 2, send: () => {} };

function solid(width: number, height: number) {
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 200, g: 40, b: 40, alpha: 1 },
        },
    });
}

async function writePng(name: string, w: number, h: number) {
    const file = path.join(files, name);
    await writeFile(file, await solid(w, h).png().toBuffer());
    return file;
}

async function writeTwoPagePdf(name: string) {
    const doc = new PDFDocument({ size: [36 * 72, 54 * 72] });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on("end", r));
    doc.rect(72, 72, 200, 200).fill("#2d4f9e");
    doc.addPage({ size: [36 * 72, 54 * 72] });
    doc.end();
    await done;
    const file = path.join(files, name);
    await writeFile(file, Buffer.concat(chunks));
    return file;
}

/** Stands in for pdf.js: two 36 × 54 in pages. */
const fakePdfRenderer: PdfRenderer = {
    async open(bytes) {
        expect(sniffArtworkFormat(bytes)).toBe("pdf");
        return {
            pages: [
                { widthPt: 36 * 72, heightPt: 54 * 72 },
                { widthPt: 36 * 72, heightPt: 54 * 72 },
            ],
            async renderPage(_i, size) {
                return new Uint8Array(
                    await solid(size.width, size.height).png().toBuffer(),
                );
            },
        };
    },
};

function call<T = unknown>(
    channel: string,
    payload?: unknown,
    sender: IpcSender = editor,
): Promise<Result<T>> {
    const handler = service.handlers[channel as keyof typeof service.handlers];
    return handler(sender, payload) as Promise<Result<T>>;
}

function value<T>(result: Result<T>): T {
    if (!result.ok)
        throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
}

async function pick(paths: string[], purpose = "any") {
    picks.push(paths);
    return value(await call<ImportSession | null>(C.importPick, { purpose }))!;
}

function makeService(spawn = fakeSpawner()) {
    spawner = spawn;
    worker = new ImportWorkerClient({ spawn: spawner.spawn });
    service = createLibraryIpcService({
        getStore: async () => store,
        worker,
        showOpenDialog: async (spec) => {
            dialogSpecs.push(spec);
            return picks.shift() ?? null;
        },
        showSaveDialog: async () => saveTarget,
        getLastFolder: () => lastFolder,
        setLastFolder: (f) => {
            lastFolder = f;
        },
        pdfRenderer: () => pdfRenderer,
        sendChanged: (c) => changes.push(c),
    });
}

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "om-library-ipc-"));
    files = path.join(dir, "picked");
    await import("node:fs/promises").then((fs) => fs.mkdir(files));
    store = await openLibraryStore({ root: path.join(dir, "library") });
    picks = [];
    dialogSpecs = [];
    changes = [];
    pushes = [];
    saveTarget = null;
    lastFolder = null;
    pdfRenderer = fakePdfRenderer;
    makeService();
});

afterEach(async () => {
    service.dispose();
    await rm(dir, { recursive: true, force: true });
});

describe("library:import-pick", () => {
    it("uses the spec's filters, returns refs only and remembers the folder", async () => {
        const glb = path.join(files, "flag.glb");
        await copyFile(path.join(FIXTURES, "equipment-clean-kit.glb"), glb);
        const session = await pick([glb], "model");
        expect(dialogSpecs[0]).toEqual({
            title: "Import",
            filters: [
                { name: "3D model (glb, gltf)", extensions: ["glb", "gltf"] },
                { name: "All Files", extensions: ["*"] },
            ],
            properties: ["openFile"],
        });
        expect(session.files).toEqual([
            {
                fileId: expect.stringMatching(/^[0-9a-f-]{36}$/),
                filename: "flag.glb",
                sizeBytes: expect.any(Number),
                type: "model",
                tooLarge: false,
            },
        ]);
        expect(JSON.stringify(session)).not.toContain(dir);
        expect(lastFolder).toBe(files);

        picks.push([]);
        await call(C.importPick, { purpose: "artwork" });
        expect(dialogSpecs[1].defaultPath).toBe(files);
        expect(dialogSpecs[1].filters.map((f) => f.name)).toEqual([
            "Artwork (png, jpg, svg, pdf)",
            "All Files",
        ]);
        expect(dialogSpecs[1].properties).toEqual([
            "openFile",
            "multiSelections",
        ]);
    });

    it("selects a filter showing models and artwork for Library Import…", async () => {
        picks.push([]);
        await call(C.importPick, { purpose: "any" });
        expect(dialogSpecs[0].filters[0]).toEqual({
            name: "Models and artwork",
            extensions: ["glb", "gltf", "png", "jpg", "jpeg", "svg", "pdf"],
        });
        expect(dialogSpecs[0].filters.slice(1).map((f) => f.name)).toEqual([
            "3D model (glb, gltf)",
            "Artwork (png, jpg, svg, pdf)",
            "All Files",
        ]);
    });

    it("returns null when the dialog is cancelled", async () => {
        expect(value(await call(C.importPick, { purpose: "any" }))).toBeNull();
    });

    it("types files by sniffing, not the extension", async () => {
        const fakePng = path.join(files, "notes.png");
        await writeFile(fakePng, "just text");
        const realPng = await writePng("art.dat", 10, 10);
        const session = await pick([fakePng, realPng], "artwork");
        expect(session.files.map((f) => f.type)).toEqual([
            "unsupported",
            "artwork",
        ]);
    });

    it("refuses a pick that mixes models and artwork, or holds two models", async () => {
        const glb = path.join(files, "flag.glb");
        await copyFile(path.join(FIXTURES, "equipment-clean-kit.glb"), glb);
        const art = await writePng("a.png", 10, 10);
        picks.push([glb, art]);
        const mixed = await call(C.importPick, { purpose: "any" });
        expect(mixed).toMatchObject({
            ok: false,
            error: {
                code: "mixed-selection",
                message: "import models and artwork separately",
            },
        });
        const glb2 = path.join(files, "flag2.glb");
        await copyFile(glb, glb2);
        picks.push([glb, glb2]);
        expect(await call(C.importPick, { purpose: "any" })).toMatchObject({
            ok: false,
            error: {
                code: "mixed-selection",
                message: "import one model at a time",
            },
        });
        expect(service.sessions.size).toBe(0);
    });

    it("flags over-limit files and refuses more than 50 per pick", async () => {
        const big = path.join(files, "huge.glb");
        const handle = await open(big, "w");
        await handle.write(
            await readFile(path.join(FIXTURES, "equipment-clean-kit.glb")),
        );
        await handle.truncate(200 * 1024 * 1024 + 1);
        await handle.close();
        const session = await pick([big], "model");
        expect(session.files[0]).toMatchObject({
            type: "model",
            tooLarge: true,
        });
        const inspected = await call(C.importInspect, {
            sessionId: session.sessionId,
            fileId: session.files[0].fileId,
            type: "model",
            choices: {},
        });
        expect(inspected).toMatchObject({
            ok: false,
            error: { code: "too-large" },
        });

        const art = await writePng("a.png", 4, 4);
        picks.push(Array.from({ length: 51 }, () => art));
        expect(await call(C.importPick, { purpose: "artwork" })).toMatchObject({
            ok: false,
            error: { code: "too-large" },
        });
    });

    it("refuses any payload carrying a path or unknown keys", async () => {
        for (const payload of [
            { purpose: "any", path: "/etc/passwd" },
            { purpose: "any", context: { filePath: "/etc/passwd" } },
            { purpose: "/etc/passwd" },
            undefined,
        ]) {
            expect(await call(C.importPick, payload)).toMatchObject({
                ok: false,
                error: { code: "invalid-request" },
            });
        }
        expect(dialogSpecs).toHaveLength(0);
    });
});

describe("model import", () => {
    async function modelSession() {
        const glb = path.join(files, "flag.glb");
        await copyFile(path.join(FIXTURES, "equipment-clean-kit.glb"), glb);
        const session = await pick([glb], "model");
        return { session, fileId: session.files[0].fileId, glb };
    }

    it("picks, inspects, previews and commits through the worker", async () => {
        const { session, fileId, glb } = await modelSession();
        const inspection = value(
            await call<ImportInspection>(C.importInspect, {
                sessionId: session.sessionId,
                fileId,
                type: "model",
                choices: {},
            }),
        );
        if (inspection.type !== "model") throw new Error("not a model");
        expect(inspection.report.status).toBe("ready");
        expect(inspection.requestSeq).toBe(1);
        expect(inspection.previewReady).toBe(true);
        expect(inspection.sidecar?.stamp.itemId).toBe(KIT_ID);
        expect(inspection.matches).toEqual([]);
        const stages = pushes
            .filter((p) => p.channel === LIBRARY_IMPORT_PROGRESS_CHANNEL)
            .map((p) => (p.payload as ImportProgress).stage);
        expect(stages[0]).toBe("reading");
        expect(stages).toContain("writing");

        const preview = value(
            await call<{ mimeType: string; bytes: Uint8Array }>(
                C.importPreview,
                {
                    sessionId: session.sessionId,
                    fileId,
                    type: "model",
                },
            ),
        );
        expect(preview.mimeType).toBe("model/gltf-binary");

        // The file changes on disk after review: the reviewed bytes are stored.
        await writeFile(glb, "changed");
        const thumbnail = new Uint8Array(
            await solid(512, 300).png().toBuffer(),
        );
        const jobsBefore = spawner.children[0].received.length;
        const committed = value(
            await call<{
                type: "model";
                saved: {
                    item: { id: string };
                    versionHash: string;
                    outcome: string;
                } | null;
            }>(C.importCommit, {
                sessionId: session.sessionId,
                fileId,
                type: "model",
                kind: "equipment",
                choices: {},
                meta: { name: "Flag", tags: ["kit"] },
                thumbnail,
            }),
        );
        // Same choices: the reviewed result is reused, not re-run.
        expect(spawner.children[0].received.length).toBe(jobsBefore);
        expect(committed.saved?.outcome).toBe("created");
        expect(committed.saved?.item.id).toBe(KIT_ID);
        expect(changes).toEqual([{ itemIds: [KIT_ID] }]);
        const source = await store.readSource(
            KIT_ID,
            committed.saved!.versionHash,
        );
        expect(source?.bytes).toEqual(
            new Uint8Array(
                await readFile(path.join(FIXTURES, "equipment-clean-kit.glb")),
            ),
        );

        // The captured thumbnail was re-encoded at 256 px, and 128 derives from it.
        const thumbs = value(
            await call<({ bytes: Uint8Array } | null)[]>(C.thumbnails, {
                items: [
                    {
                        itemId: KIT_ID,
                        versionHash: committed.saved!.versionHash,
                    },
                ],
                maxPx: 128,
            }),
        );
        const meta = await sharp(thumbs[0]!.bytes).metadata();
        expect([meta.format, meta.width]).toEqual(["png", 128]);

        // A re-pick of the same file now matches by kit id.
        await copyFile(path.join(FIXTURES, "equipment-clean-kit.glb"), glb);
        const again = await pick([glb], "model");
        const second = value(
            await call<ImportInspection>(C.importInspect, {
                sessionId: again.sessionId,
                fileId: again.files[0].fileId,
                type: "model",
                choices: {},
            }),
        );
        expect(second.type === "model" && second.matches).toEqual([
            {
                itemId: KIT_ID,
                name: "Flag",
                builtIn: false,
                reason: "kit-item-id",
            },
        ]);
        // The new pick closed the old session.
        expect(
            await call(C.importPreview, {
                sessionId: session.sessionId,
                fileId,
                type: "model",
            }),
        ).toMatchObject({ ok: false, error: { code: "session-expired" } });
    });

    it("lists the materials and commits an artwork slot picked from them (Q67)", async () => {
        const glb = path.join(files, "riser.glb");
        await copyFile(path.join(FIXTURES, "prop-no-extras.glb"), glb);
        const session = await pick([glb], "model");
        const base = {
            sessionId: session.sessionId,
            fileId: session.files[0].fileId,
            type: "model",
        };
        const inspection = value(
            await call<ImportInspection>(C.importInspect, {
                ...base,
                kind: "prop",
                choices: {},
            }),
        );
        if (inspection.type !== "model") throw new Error("not a model");
        expect(inspection.report.materials).toMatchObject([
            { index: 0, name: "Wood", outputIndex: 0, fileSlot: null },
        ]);
        const slots = [
            { material: 0, id: "artwork", widthM: 2.4, heightM: 0.6 },
        ];
        // A slot id outside the naming rule never reaches the worker.
        expect(
            await call(C.importInspect, {
                ...base,
                kind: "prop",
                choices: { slots: [{ ...slots[0], id: "front panel" }] },
            }),
        ).toMatchObject({ ok: false, error: { code: "invalid-request" } });
        const committed = value(
            await call<{
                saved: { item: { id: string }; versionHash: string } | null;
            }>(C.importCommit, {
                ...base,
                kind: "prop",
                choices: { slots },
                meta: { name: "Riser" },
            }),
        );
        const parts = value(
            await call<Record<string, Uint8Array>>(C.readParts, {
                itemId: committed.saved!.item.id,
                versionHash: committed.saved!.versionHash,
                roles: ["sidecar"],
            }),
        );
        const stored = JSON.parse(new TextDecoder().decode(parts.sidecar));
        expect(stored.artworkSlots).toEqual([
            {
                id: "artwork",
                widthM: 2.4,
                heightM: 0.6,
                target: { material: 0 },
                hasUVs: true,
            },
        ]);
    });

    it("answers every inspect with a rising requestSeq; the newest result is kept", async () => {
        const { session, fileId } = await modelSession();
        const base = { sessionId: session.sessionId, fileId, type: "model" };
        const [first, second] = await Promise.all([
            call<ImportInspection>(C.importInspect, { ...base, choices: {} }),
            call<ImportInspection>(C.importInspect, {
                ...base,
                choices: { unitConversion: "cm" },
            }),
        ]);
        const a = value(first);
        const b = value(second);
        expect(a.type === "model" && a.requestSeq).toBe(1);
        expect(b.type === "model" && b.requestSeq).toBe(2);
        // The commit with the newest choices reuses that result.
        const jobs = spawner.children[0].received.length;
        await call(C.importCommit, {
            ...base,
            kind: "equipment",
            choices: { unitConversion: "cm" },
            meta: { name: "Flag" },
        });
        expect(spawner.children[0].received.length).toBe(jobs);
    });

    it("turns a worker crash into worker-crashed; the retry works on the kept bytes", async () => {
        let crashNext = true;
        service.dispose();
        makeService(
            fakeSpawner(() => {
                if (!crashNext) return new FakeWorkerChild();
                crashNext = false;
                const child: FakeWorkerChild = new FakeWorkerChild(async () =>
                    child.crash(),
                );
                return child;
            }),
        );
        const { session, fileId } = await modelSession();
        const request = {
            sessionId: session.sessionId,
            fileId,
            type: "model",
            choices: {},
        };
        expect(await call(C.importInspect, request)).toMatchObject({
            ok: false,
            error: { code: "worker-crashed" },
        });
        const retry = value(
            await call<ImportInspection>(C.importInspect, request),
        );
        expect(retry.type === "model" && retry.report.status).toBe("ready");
    });

    it("cancel kills the running job and answers cancelled", async () => {
        service.dispose();
        makeService(
            fakeSpawner(() => new FakeWorkerChild(() => new Promise(() => {}))),
        );
        const { session, fileId } = await modelSession();
        const pending = call(C.importInspect, {
            sessionId: session.sessionId,
            fileId,
            type: "model",
            choices: {},
        });
        await new Promise((r) => setTimeout(r, 20));
        value(await call(C.importCancel, { sessionId: session.sessionId }));
        expect(await pending).toMatchObject({
            ok: false,
            error: { code: "cancelled" },
        });
        expect(spawner.children[0].killed).toBe(true);
    });

    it("cancel before the job reaches the worker still answers cancelled", async () => {
        const { session, fileId } = await modelSession();
        const pending = call(C.importInspect, {
            sessionId: session.sessionId,
            fileId,
            type: "model",
            choices: {},
        });
        value(await call(C.importCancel, { sessionId: session.sessionId }));
        expect(await pending).toMatchObject({
            ok: false,
            error: { code: "cancelled" },
        });
        expect(spawner.children).toHaveLength(0);
    });

    it("refuses another editor's session and expired or made-up ids", async () => {
        const { session, fileId } = await modelSession();
        const request = {
            sessionId: session.sessionId,
            fileId,
            type: "model",
            choices: {},
        };
        expect(await call(C.importInspect, request, otherEditor)).toMatchObject(
            {
                ok: false,
                error: { code: "session-expired" },
            },
        );
        expect(
            await call(C.importInspect, {
                ...request,
                fileId: crypto.randomUUID(),
            }),
        ).toMatchObject({ ok: false, error: { code: "unknown-file" } });
        service.close(editor, { sessionId: session.sessionId });
        expect(await call(C.importInspect, request)).toMatchObject({
            ok: false,
            error: { code: "session-expired" },
        });
    });

    it("closeSender ends the editor's sessions (reload or close)", async () => {
        await modelSession();
        expect(service.sessions.size).toBe(1);
        service.closeSender(editor.id);
        expect(service.sessions.size).toBe(0);
    });
});

describe("artwork import", () => {
    it("inspects two files at once, previews pages and commits each file", async () => {
        const png = await writePng("silk.png", 360, 540);
        const pdf = await writeTwoPagePdf("front-back.pdf");
        const session = await pick([png, pdf], "artwork");
        const inspection = value(
            await call<ImportInspection>(C.importInspect, {
                sessionId: session.sessionId,
                type: "artwork",
            }),
        );
        if (inspection.type !== "artwork") throw new Error("not artwork");
        expect(inspection.files.map((f) => f.inspection.ok)).toEqual([
            true,
            true,
        ]);
        // Same 2:3 shape: one size question for all three pages.
        expect(inspection.aspectGroups).toHaveLength(1);
        expect(inspection.aspectGroups[0].members).toHaveLength(3);

        const pdfId = session.files[1].fileId;
        const preview = value(
            await call<{ mimeType: string; bytes: Uint8Array }>(
                C.importPreview,
                {
                    sessionId: session.sessionId,
                    fileId: pdfId,
                    type: "artwork",
                    page: 1,
                    maxPx: 256,
                },
            ),
        );
        const meta = await sharp(preview.bytes).metadata();
        expect([meta.format, Math.max(meta.width!, meta.height!)]).toEqual([
            "png",
            256,
        ]);

        const size = {
            width: { m: 0.9144, typed: "36 in" },
            height: { m: 1.3716, typed: "54 in" },
            source: "user",
        };
        const result = value(
            await call<{ type: "artwork"; reports: { imported: unknown[] }[] }>(
                C.importCommit,
                {
                    sessionId: session.sessionId,
                    type: "artwork",
                    files: session.files.map((f) => ({
                        fileId: f.fileId,
                        surface: "silk",
                        size,
                        meta: { name: f.filename },
                    })),
                },
            ),
        );
        expect(result.reports.map((r) => r.imported.length)).toEqual([1, 2]);
        expect(changes).toHaveLength(2);
        const items = value(await call<unknown[]>(C.list, { kind: "artwork" }));
        expect(items).toHaveLength(3);
    });

    it("cancel stops between files; files already stored stay", async () => {
        const a = await writePng("a.png", 300, 200);
        const b = await writePng("b.png", 300, 200);
        const session = await pick([a, b], "artwork");
        const size = {
            width: { m: 3 },
            height: { m: 2 },
            source: "user",
        };
        // Cancel as soon as the first file's progress starts.
        const sender: IpcSender = {
            id: editor.id,
            send: (channel, payload) => {
                pushes.push({ channel, payload });
                const p = payload as ImportProgress;
                if (
                    p.fileId === session.files[0].fileId &&
                    p.fraction !== null
                ) {
                    void call(C.importCancel, { sessionId: session.sessionId });
                }
            },
        };
        const result = await call(
            C.importCommit,
            {
                sessionId: session.sessionId,
                type: "artwork",
                files: session.files.map((f) => ({
                    fileId: f.fileId,
                    surface: "propSlot",
                    size,
                    meta: { name: f.filename },
                })),
            },
            sender,
        );
        expect(result).toMatchObject({
            ok: false,
            error: { code: "cancelled" },
        });
        const items = value(await call<unknown[]>(C.list, { kind: "artwork" }));
        expect(items.length).toBeLessThan(2);
    });

    it("answers busy for a second artwork job in the same session", async () => {
        const a = await writePng("a.png", 30, 20);
        const session = await pick([a], "artwork");
        const request = { sessionId: session.sessionId, type: "artwork" };
        const [one, two] = await Promise.all([
            call(C.importInspect, request),
            call(C.importInspect, request),
        ]);
        expect([one.ok, two.ok].sort()).toEqual([false, true]);
        expect(!two.ok ? two : one).toMatchObject({ error: { code: "busy" } });
    });
});

describe("Library reads and writes", () => {
    async function storedArtwork() {
        const png = new Uint8Array(await solid(400, 200).png().toBuffer());
        const added = await import("../../artwork-import").then((m) =>
            m.importArtwork(store, {
                file: { filename: "a.png", bytes: png },
                surface: "propSlot",
                size: { width: { m: 2 }, height: { m: 1 }, source: "user" },
            }),
        );
        return added.imported[0];
    }

    it("read-parts serves glb, sidecar and display only, never originals", async () => {
        const page = await storedArtwork();
        const parts = value(
            await call<Record<string, Uint8Array>>(C.readParts, {
                itemId: page.item.id,
                versionHash: page.version.hash,
                roles: ["display", "sidecar"],
            }),
        );
        expect(Object.keys(parts).sort()).toEqual(["display", "sidecar"]);
        expect(
            await call(C.readParts, {
                itemId: page.item.id,
                versionHash: page.version.hash,
                roles: ["original"],
            }),
        ).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    });

    it("thumbnails resize the display part and cache it", async () => {
        const page = await storedArtwork();
        const request = {
            items: [
                { itemId: page.item.id, versionHash: page.version.hash },
                { itemId: crypto.randomUUID(), versionHash: page.version.hash },
            ],
            maxPx: 128,
        };
        const [thumb, missing] = value(
            await call<({ bytes: Uint8Array } | null)[]>(C.thumbnails, request),
        );
        expect(missing).toBeNull();
        expect((await sharp(thumb!.bytes).metadata()).width).toBe(128);
        const cached = path.join(
            store.root,
            "cache",
            "thumbs",
            `${page.version.hash}-128.png`,
        );
        expect(await readFile(cached)).toEqual(Buffer.from(thumb!.bytes));
    });

    it("update and delete push library:changed; a built-in error maps through", async () => {
        const page = await storedArtwork();
        const updated = value(
            await call<{ name: string }>(C.updateItem, {
                itemId: page.item.id,
                patch: { name: "Renamed", tags: ["x"] },
            }),
        );
        expect(updated.name).toBe("Renamed");
        value(await call(C.deleteItem, { itemId: page.item.id }));
        expect(changes).toEqual([
            { itemIds: [page.item.id] },
            { itemIds: [page.item.id] },
        ]);
        expect(
            await call(C.deleteItem, { itemId: page.item.id }),
        ).toMatchObject({
            ok: false,
            error: { code: "not-found" },
        });
        expect(
            await call(C.updateItem, {
                itemId: page.item.id,
                patch: { name: "x".repeat(201) },
            }),
        ).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    });

    it("add-from-show recomputes the Version hash and checks the sidecar", async () => {
        const page = await storedArtwork();
        const parts = await store.readVersionParts(
            page.item.id,
            page.version.hash,
        );
        const itemId = crypto.randomUUID();
        const base = {
            itemId,
            kind: "artwork",
            name: "From show",
            tags: [],
            license: {},
            derivedFrom: null,
            parts,
        };
        expect(
            await call(C.addFromShow, { ...base, versionHash: "0".repeat(64) }),
        ).toMatchObject({ ok: false, error: { code: "hash-mismatch" } });
        const badSidecar = {
            ...parts,
            sidecar: new TextEncoder().encode("{}"),
        };
        const badHash = computeVersionHash(
            Object.fromEntries(
                Object.entries(badSidecar).map(([r, b]) => [r, sha256Hex(b)]),
            ),
        );
        expect(
            await call(C.addFromShow, {
                ...base,
                parts: badSidecar,
                versionHash: badHash,
            }),
        ).toMatchObject({ ok: false, error: { code: "corrupt" } });
        // Identical bytes reuse the existing item.
        const ok = value(
            await call<{ outcome: string }>(C.addFromShow, {
                ...base,
                versionHash: page.version.hash,
            }),
        );
        expect(ok.outcome).toBe("existing");
        expect(
            await call(C.addFromShow, {
                ...base,
                parts: { ...parts, extra: new Uint8Array(1) },
                versionHash: page.version.hash,
            }),
        ).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    });

    it("size presets round-trip", async () => {
        const saved = value(
            await call<{ id: string }>(C.sizePresetSave, {
                name: "My silk",
                data: { kind: "silk" },
            }),
        );
        expect(value(await call<unknown[]>(C.sizePresets))).toHaveLength(1);
        value(await call(C.sizePresetDelete, { id: saved.id }));
        expect(value(await call<unknown[]>(C.sizePresets))).toHaveLength(0);
    });
});

describe("library:template-save", () => {
    it("generates one format in the worker and writes it where the user chose", async () => {
        const { TEMPLATE_SURFACES } =
            await import("../../../../src/view3d/core/artworkTemplates");
        const surface = TEMPLATE_SURFACES[0];
        saveTarget = path.join(files, "my-template.svg");
        const saved = value(
            await call<{ filename: string }>(C.templateSave, {
                surfaceId: surface.id,
                format: "svg",
            }),
        );
        expect(saved).toEqual({ filename: "my-template.svg" });
        expect((await readFile(saveTarget, "utf8")).startsWith("<")).toBe(true);
        expect(lastFolder).toBe(files);

        saveTarget = null;
        expect(
            value(
                await call(C.templateSave, {
                    surfaceId: surface.id,
                    format: "pdf",
                }),
            ),
        ).toBeNull();
        expect(
            await call(C.templateSave, { surfaceId: "no-such", format: "pdf" }),
        ).toMatchObject({ ok: false, error: { code: "not-found" } });
    });

    it("saves the menu's variants: a sagging-bottom swing and a Floor prop", async () => {
        for (const surfaceId of [
            "silk-swing-44x66-sagging-bottom",
            "silk-6ft-36x54-sag-9in",
            "floor-prop-4x8ft",
        ]) {
            saveTarget = path.join(files, `${surfaceId}.svg`);
            expect(
                value(await call(C.templateSave, { surfaceId, format: "svg" })),
            ).toEqual({ filename: `${surfaceId}.svg` });
        }
    });
});

it("pushes library:changed through sendChanged only, never to the sender", () => {
    expect(pushes.filter((p) => p.channel === LIBRARY_CHANGED_CHANNEL)).toEqual(
        [],
    );
});

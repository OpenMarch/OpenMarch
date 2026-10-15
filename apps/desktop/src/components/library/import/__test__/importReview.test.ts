import { describe, expect, it, vi } from "vitest";
import {
    addBlocker,
    artworkCommitFiles,
    choicesKey,
    createImportReview,
    displayName,
    asksArtworkSurface,
    defaultSizeFor,
    defaultSurfaceFor,
    initialGroup,
    litMaterial,
    slotSizeFor,
    surfaceForSize,
    surfaceForTemplate,
    templateMatchingSize,
} from "../importReview";
import {
    ART_FILE_A,
    ART_FILE_B,
    choicesReport,
    createFakeLibrary,
    deferred,
    fileRef,
    ITEM_ID,
    KIT_MATCH,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    pdfInspection,
    pngInspection,
    pngOfAspect,
    session,
    SESSION,
    surfaceReport,
} from "./fakeLibrary";
import { toMeters, type Length } from "@/view3d/core/sizes";
import { CommitMetaSchema } from "@/view3d/library/protocol";

let urlCount = 0;
const urls = {
    toUrl: () => `blob:test/${++urlCount}`,
    revokeUrl: vi.fn(),
};

const tick = () => new Promise((r) => setTimeout(r, 0));

function modelFake(first = choicesReport(), matches = [KIT_MATCH]) {
    const lib = createFakeLibrary();
    lib.on("importPick", () =>
        ok(session([fileRef(MODEL_FILE, "drum_major_mace.glb", "model")])),
    );
    let seq = 0;
    lib.on("importInspect", () =>
        ok(modelInspection(first, { requestSeq: ++seq, matches })),
    );
    lib.on("importPreview", () =>
        ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
    );
    return lib;
}

describe("helpers", () => {
    it("names a file without its extension", () => {
        expect(displayName("drum_major_mace.glb")).toBe("drum major mace");
        expect(displayName("Winter guard.PDF")).toBe("Winter guard");
    });

    it("keeps a name from a long file name within the name limit", () => {
        expect(displayName(`${"a".repeat(300)}.png`)).toHaveLength(200);
    });

    it("keys choices independent of key order", () => {
        expect(choicesKey({ simplify: true, rotateToYUp: false })).toBe(
            choicesKey({ rotateToYUp: false, simplify: true }),
        );
    });

    it("maps catalog chips to surfaces", () => {
        expect(surfaceForTemplate("silk-6ft-36x54")).toBe("silk");
        expect(surfaceForTemplate("floor-wgi-minimum-60x90ft")).toBe(
            "baseFloor",
        );
        expect(surfaceForTemplate("flat-prop-4x8ft")).toBe("propSlot");
        expect(surfaceForTemplate(null)).toBeNull();
    });
});

describe("artwork surface helpers (Q67)", () => {
    it("sizes a slot from the two larger sides of where it's drawn", () => {
        // Upright, thin in z: width × height.
        expect(slotSizeFor({ sizeM: [1.2, 0.9, 0.02] })).toEqual({
            widthM: 1.2,
            heightM: 0.9,
        });
        // Upright, thin in x: depth × height.
        expect(slotSizeFor({ sizeM: [0.02, 1, 2] })).toEqual({
            widthM: 2,
            heightM: 1,
        });
        // Lying flat: x × z.
        expect(slotSizeFor({ sizeM: [3, 0.01, 2] })).toEqual({
            widthM: 3,
            heightM: 2,
        });
        expect(slotSizeFor({ sizeM: null })).toBeNull();
    });

    it("asks only when the kind is known, nothing is marked, it isn't a Garment and a surface has UVs", () => {
        const report = surfaceReport();
        expect(asksArtworkSurface(report)).toBe(true);
        expect(asksArtworkSurface({ ...report, kind: null })).toBe(false);
        expect(asksArtworkSurface({ ...report, kind: "garment" })).toBe(false);
        expect(asksArtworkSurface({ ...report, status: "rejected" })).toBe(
            false,
        );
        expect(
            asksArtworkSurface({
                ...report,
                materials: report.materials.map((m, i) => ({
                    ...m,
                    fileSlot: i === 0 ? "silk" : null,
                })),
            }),
        ).toBe(false);
        expect(asksArtworkSurface(modelReport())).toBe(false);
        // nothing with UVs: artwork can't map, so there's nothing to ask
        expect(
            asksArtworkSurface({
                ...report,
                materials: report.materials.map((m) => ({
                    ...m,
                    hasUVs: false,
                })),
            }),
        ).toBe(false);
    });
});

describe("From file sizes (Q68)", () => {
    const inch = (n: number) => ({ m: (n * 254) / 10000 });
    const group = pdfInspection().aspectGroups[0];

    it("matches a file size to the catalog template it equals", () => {
        expect(templateMatchingSize(group, inch(36), inch(54))).toBe(
            "silk-6ft-36x54",
        );
        // A 300 dpi PNG's pixels-per-meter rounding still matches.
        expect(
            templateMatchingSize(group, { m: 10800 / 11811 }, inch(54)),
        ).toBe("silk-6ft-36x54");
        expect(templateMatchingSize(group, inch(30), inch(45))).toBeNull();
    });

    it("gives From file the matched template's surface, a typed size none", () => {
        const fromFile = {
            width: inch(36),
            height: inch(54),
            source: "file" as const,
            templateId: null,
        };
        expect(surfaceForSize(group, fromFile)).toBe("silk");
        expect(surfaceForSize(group, { ...fromFile, source: "user" })).toBe(
            null,
        );
        expect(surfaceForSize(group, null)).toBeNull();
    });
});

describe("createImportReview: picking", () => {
    it("closes when the dialog is cancelled", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () => ok(null));
        const onClose = vi.fn();
        const store = createImportReview(lib.client, { ...urls, onClose });
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("closed");
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("shows mixed-selection inline and picks again on retry", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () => ({
            ok: false,
            error: { code: "mixed-selection", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("error");
        expect(store.getState().error).toEqual({
            code: "mixed-selection",
            during: "pick",
        });
        lib.on("importPick", () => ok(null));
        await store.getState().retry();
        expect(lib.calls.importPick).toHaveLength(2);
    });

    it("lists unsupported and over-limit files under Can't import", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(
                session([
                    fileRef(ART_FILE_A, "notes.txt", "unsupported"),
                    {
                        ...fileRef(ART_FILE_B, "huge.png", "artwork"),
                        tooLarge: true,
                    },
                ]),
            ),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("review");
        expect(lib.calls.importInspect).toBeUndefined();
        expect(addBlocker(store.getState())).toBe("nothing");
    });
});

describe("createImportReview: a model", () => {
    it("inspects with the picker's kind and the pre-selected choices", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model", { kind: "equipment" });
        expect(lib.calls.importInspect[0]).toEqual({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            kind: "equipment",
            choices: {},
            type: "model",
        });
        const state = store.getState();
        expect(state.phase).toBe("review");
        expect(state.model?.glbUrl).toMatch(/^blob:test\//);
        // A kit itemId pre-selects "New version of …" and its name.
        expect(state.matchMode).toBe("update");
        expect(state.meta.name).toBe("Riser 8 × 4");
        expect(addBlocker(state)).toBeNull();
    });

    it("asks for the kind, then re-inspects with it", async () => {
        const needsKind = modelReport({
            status: "needs-kind",
            kind: null,
            kindSource: null,
            output: null,
            needsChoice: [
                {
                    code: "kind",
                    options: ["prop", "equipment"],
                    preselected: null,
                },
            ],
        });
        const lib = modelFake(needsKind, []);
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(addBlocker(store.getState())).toBe("needsKind");
        expect(store.getState().model?.glbUrl).toBeNull();
        expect(lib.calls.importPreview).toBeUndefined();

        lib.on("importInspect", () => ok(modelInspection(modelReport())));
        store.getState().setKind("prop");
        await tick();
        expect(lib.calls.importInspect[1]).toMatchObject({
            kind: "prop",
            choices: {},
        });
        expect(addBlocker(store.getState())).toBeNull();
        expect(store.getState().meta.name).toBe("drum major mace");
    });

    it("keeps only the newest inspect when choices change quickly", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");

        const slow = deferred<unknown>();
        const fast = deferred<unknown>();
        const answers = [slow.promise, fast.promise];
        lib.on("importInspect", () => answers.shift());
        store.getState().setChoices({ rotateToYUp: false });
        store.getState().setChoices({ simplify: false });
        const newest = modelInspection(modelReport({ badges: ["scaled"] }), {
            requestSeq: 3,
        });
        fast.resolve(ok(newest));
        await tick();
        slow.resolve(ok(modelInspection(modelReport(), { requestSeq: 2 })));
        await tick();
        expect(store.getState().model?.inspection?.requestSeq).toBe(3);
        expect(store.getState().model?.choices).toEqual({
            rotateToYUp: false,
            simplify: false,
        });
        expect(store.getState().model?.inspecting).toBe(false);
    });

    it("loads the before model without simplify for before/after", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        const afterUrl = store.getState().model?.glbUrl;
        store.getState().setShowBefore(true);
        await tick();
        expect(lib.calls.importInspect.at(-1)).toMatchObject({
            choices: { simplify: false },
        });
        const model = store.getState().model!;
        expect(model.showBefore).toBe(true);
        expect(model.beforeUrl).toMatch(/^blob:test\//);
        expect(model.glbUrl).toBe(afterUrl);
    });

    it("puts artwork on a picked material, lights the hovered one, and commits it (Q67)", async () => {
        const lib = modelFake(surfaceReport(), []);
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model", { kind: "prop" });
        const model = () => store.getState().model!;
        expect(litMaterial(model())).toBeNull();

        store.getState().hoverMaterial(1);
        expect(litMaterial(model())?.outputIndex).toBe(1);
        store.getState().hoverMaterial(null);

        store.getState().setArtworkSurface(0);
        await tick();
        const slots = [
            { material: 0, id: "artwork", widthM: 2.4, heightM: 0.6 },
        ];
        expect(lib.calls.importInspect.at(-1)).toMatchObject({
            choices: { slots },
        });
        // Picked and not hovered: the picked one stays lit.
        expect(litMaterial(model())?.name).toBe("Front");

        lib.on("importCommit", () =>
            ok({ type: "model", report: surfaceReport(), saved: null }),
        );
        await store.getState().commit();
        expect(lib.calls.importCommit[0]).toMatchObject({
            kind: "prop",
            choices: { slots },
        });

        store.getState().setArtworkSurface(null);
        await tick();
        expect(model().choices).toEqual({});
        expect(
            (lib.calls.importInspect.at(-1) as { choices: object }).choices,
        ).toEqual({});
    });

    it("sets the grip from a clicked point", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store.getState().startGripPick();
        expect(store.getState().model?.pickingGrip).toBe(true);
        store.getState().setGrip([0, 1.2, 0.01]);
        await tick();
        expect(lib.calls.importInspect.at(-1)).toMatchObject({
            choices: { grip: { right: [0, 1.2, 0.01] } },
        });
        expect(store.getState().model?.pickingGrip).toBe(false);
    });

    it("commits the reviewed choices with the kit's item id and a thumbnail", async () => {
        const lib = modelFake();
        lib.on("importCommit", () =>
            ok({
                type: "model",
                report: choicesReport(),
                saved: {
                    outcome: "added-version",
                    item: { id: ITEM_ID, name: "Riser 8 × 4" },
                    versionHash: "a".repeat(64),
                },
            }),
        );
        const onCommitted = vi.fn();
        const store = createImportReview(lib.client, { ...urls, onCommitted });
        await store.getState().pick("model");
        store
            .getState()
            .setThumbnailCapture(async () => new Uint8Array([137, 80]));
        store.getState().setMeta({ tags: "mace, guard, mace" });
        await store.getState().commit();
        expect(lib.calls.importCommit[0]).toEqual({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            type: "model",
            kind: "equipment",
            choices: {},
            meta: {
                name: "Riser 8 × 4",
                tags: ["mace", "guard"],
                itemId: ITEM_ID,
            },
            thumbnail: new Uint8Array([137, 80]),
        });
        expect(store.getState().phase).toBe("done");
        expect(store.getState().done).toMatchObject({
            names: ["Riser 8 × 4"],
            newVersion: true,
        });
        expect(onCommitted).toHaveBeenCalledExactlyOnceWith(
            [ITEM_ID],
            store.getState().done,
        );
    });

    it("adds as new without the item id when asked", async () => {
        const lib = modelFake();
        lib.on("importCommit", () =>
            ok({ type: "model", report: choicesReport(), saved: null }),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store.getState().setMatchMode("new");
        await store.getState().commit();
        expect(
            (lib.calls.importCommit[0] as { meta: object }).meta,
        ).not.toHaveProperty("itemId");
        // Not ready after all: back to the review.
        expect(store.getState().phase).toBe("review");
    });

    it("returns to the review when a commit is cancelled", async () => {
        const lib = modelFake();
        lib.on("importCommit", () => ({
            ok: false,
            error: { code: "cancelled", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        await store.getState().commit();
        expect(store.getState().phase).toBe("review");
        expect(store.getState().cancelledCommit).toBe(true);
    });

    it("locks the choices while a commit runs, so Add can't reopen", async () => {
        const lib = modelFake();
        const pending = deferred<unknown>();
        lib.on("importCommit", () => pending.promise);
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        const inspects = lib.calls.importInspect.length;
        void store.getState().commit();
        await tick();
        store.getState().setChoices({ simplify: false });
        store.getState().setKind("prop");
        store.getState().startGripPick();
        await tick();
        expect(lib.calls.importInspect).toHaveLength(inspects);
        expect(store.getState().phase).toBe("committing");
        expect(store.getState().model?.choices).toEqual({});
        expect(store.getState().model?.pickingGrip).toBe(false);
        expect(addBlocker(store.getState())).toBe("busy");
        pending.resolve(
            ok({ type: "model", report: choicesReport(), saved: null }),
        );
        await tick();
        expect(lib.calls.importCommit).toHaveLength(1);
    });

    it("keeps the report and its choices when a re-inspect is cancelled", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        const shown = store.getState().model?.inspection;
        lib.on("importInspect", () => ({
            ok: false,
            error: { code: "cancelled", message: "x" },
        }));
        store.getState().setChoices({ rotateToYUp: false });
        await tick();
        const state = store.getState();
        expect(state.phase).toBe("review");
        expect(state.error).toBeNull();
        expect(state.model?.inspection).toBe(shown);
        expect(state.model?.choices).toEqual({});
        expect(state.model?.inspecting).toBe(false);
    });

    it("goes back to after when the before model fails to load", async () => {
        const lib = modelFake();
        const revokeUrl = vi.fn();
        const store = createImportReview(lib.client, { ...urls, revokeUrl });
        await store.getState().pick("model");
        store.getState().setShowBefore(true);
        await tick();
        const before = store.getState().model!.beforeUrl;
        store.getState().beforeFailed();
        expect(store.getState().model).toMatchObject({
            beforeUrl: null,
            showBefore: false,
        });
        expect(revokeUrl).toHaveBeenCalledWith(before);
        expect(store.getState().model?.glbUrl).toMatch(/^blob:test\//);
    });

    it("sends only meta main accepts, however long the fields", async () => {
        const lib = modelFake();
        lib.on("importCommit", () =>
            ok({ type: "model", report: choicesReport(), saved: null }),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store.getState().setMeta({
            name: "n".repeat(300),
            tags: `${"t".repeat(100)}, b`,
            author: "a".repeat(300),
            license: "+",
        });
        await store.getState().commit();
        const meta = (lib.calls.importCommit[0] as { meta: unknown }).meta;
        expect(CommitMetaSchema.safeParse(meta).success).toBe(true);
        expect(meta).toMatchObject({
            tags: ["t".repeat(64), "b"],
            license: { licenseText: "+" },
        });
    });

    it("shows a crashed worker inline and retries the inspect", async () => {
        const lib = modelFake();
        lib.on("importInspect", () => ({
            ok: false,
            error: { code: "worker-crashed", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        expect(store.getState().error).toEqual({
            code: "worker-crashed",
            during: "inspect",
        });
        lib.on("importInspect", () => ok(modelInspection(choicesReport())));
        await store.getState().retry();
        expect(store.getState().phase).toBe("review");
    });

    it("forwards progress and cancels the running step", async () => {
        const lib = modelFake();
        const pending = deferred<unknown>();
        lib.on("importInspect", () => pending.promise);
        lib.on("importCancel", () => ok(undefined));
        const store = createImportReview(lib.client, urls);
        void store.getState().pick("model");
        await tick();
        lib.emitProgress({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            stage: "validating",
            fraction: null,
        });
        expect(store.getState().progress?.stage).toBe("validating");
        await store.getState().cancelRunning();
        expect(lib.calls.importCancel).toEqual([{ sessionId: SESSION }]);
        pending.resolve({
            ok: false,
            error: { code: "cancelled", message: "x" },
        });
        await tick();
        expect(store.getState().error?.code).toBe("cancelled");
    });

    it("frees the session and its URLs on close", async () => {
        const lib = modelFake();
        const revokeUrl = vi.fn();
        const store = createImportReview(lib.client, { ...urls, revokeUrl });
        await store.getState().pick("model");
        const url = store.getState().model?.glbUrl;
        store.getState().close();
        expect(lib.closed).toEqual([SESSION]);
        expect(revokeUrl).toHaveBeenCalledWith(url);
    });
});

describe("createImportReview: artwork", () => {
    function artworkFake(inspection = pdfInspection()) {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(session([fileRef(ART_FILE_A, "silks.pdf", "artwork")])),
        );
        lib.on("importInspect", () => ok(inspection));
        lib.on("importPreview", () =>
            ok({ mimeType: "image/png", bytes: new Uint8Array([1]) }),
        );
        return lib;
    }

    it("asks once per aspect, pre-selecting the size from the file", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const artwork = store.getState().artwork!;
        expect(artwork.groups).toHaveLength(2);
        expect(artwork.groups.map((g) => g.size?.source)).toEqual([
            "file",
            "file",
        ]);
        expect(artwork.selected[ART_FILE_A]).toEqual([0, 1]);
        expect(artwork.focus).toEqual({ fileId: ART_FILE_A, page: 0 });
        expect(addBlocker(store.getState())).toBeNull();
    });

    it("prints a From file size that equals a template on its kind (Q68)", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const groups = () => store.getState().artwork!.groups;
        // 36 × 54 in is the silk template; 4 × 8 ft has no chip here, so
        // it starts as Silk like any other shape (Q77).
        expect(groups().map((g) => g.surface)).toEqual(["silk", "silk"]);
        const fileSize = groups()[0].size!;
        store.getState().setGroupSize(0, {
            ...fileSize,
            width: { m: 1 },
            source: "user",
        });
        expect(groups()[0].surface).toBe("silk");
        store.getState().setGroupSize(0, fileSize);
        expect(groups()[0].surface).toBe("silk");
    });

    it("lets the picker's surface win over a matched template (Q68)", async () => {
        const lib = artworkFake();
        lib.on("importPick", () =>
            ok(
                session([fileRef(ART_FILE_A, "silks.pdf", "artwork")], {
                    surface: "floorProp",
                }),
            ),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("artwork", { surface: "floorProp" });
        expect(store.getState().artwork!.groups.map((g) => g.surface)).toEqual([
            "floorProp",
            "floorProp",
        ]);
    });

    it("commits one entry per surface, each page with its size", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        store.getState().setGroupSurface(1, "floorProp");
        const files = artworkCommitFiles(store.getState());
        expect(files).toEqual([
            {
                fileId: ART_FILE_A,
                surface: "silk",
                pages: [0],
                pageSizes: { "0": "file" },
                meta: { name: "silks" },
            },
            {
                fileId: ART_FILE_A,
                surface: "floorProp",
                pages: [1],
                pageSizes: { "1": "file" },
                meta: { name: "silks" },
            },
        ]);
    });

    it("takes a template chip's size and surface, and drops deselected pages", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const chip =
            store.getState().artwork!.inspection.aspectGroups[0].chips[0];
        store.getState().setGroupSize(0, {
            width: chip.width,
            height: chip.height,
            source: "template",
            templateId: chip.catalogId,
        });
        store.getState().togglePage(ART_FILE_A, 1);
        const files = artworkCommitFiles(store.getState());
        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
            surface: "silk",
            pages: [0],
            pageSizes: {
                "0": {
                    source: "template",
                    templateId: "silk-6ft-36x54",
                    width: { m: 0.9144, typed: "36 in" },
                },
            },
        });
    });

    it("keeps a matching chip and its surface, and never shows a DPI line", async () => {
        const lib = artworkFake(pngInspection());
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        // Pre-selected from the first matching chip: 36 × 54 in silk.
        const artwork = store.getState().artwork!;
        expect(artwork.groups[0]).toMatchObject({
            surface: "silk",
            size: { source: "template", templateId: "silk-6ft-36x54" },
            sizeChosen: false,
            standard: null,
        });
        // The refused file isn't selectable.
        expect(artwork.selected[ART_FILE_B]).toEqual([]);
    });

    it("starts other shapes on a Silk fitted to the image, following the surface (Q77)", async () => {
        // 5 : 4 matches nothing in the catalog.
        const lib = artworkFake(pngOfAspect(1000, 800));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const group = () => store.getState().artwork!.groups[0];
        expect(group()).toEqual({
            surface: "silk",
            surfaceChosen: false,
            sizeChosen: false,
            size: {
                width: inLength(54),
                height: inLength(43.25),
                source: "template",
                templateId: null,
            },
            standard: { width: inLength(54), height: inLength(36) },
        });
        expect(addBlocker(store.getState())).toBeNull();

        store.getState().setGroupSurface(0, "baseFloor");
        expect(group().size).toMatchObject({
            width: { typed: "90 ft" },
            height: { typed: "72 ft" },
        });
        expect(group().standard).toMatchObject({
            width: { typed: "90 ft" },
            height: { typed: "60 ft" },
        });
        store.getState().setGroupSurface(0, "propSlot");
        expect(group().size).toMatchObject({
            width: { typed: "8 ft" },
            height: { typed: "6.4 ft" },
        });
        // Uniforms have no default size: the size step asks again.
        store.getState().setGroupSurface(0, "uniformPart");
        expect(group().size).toBeNull();
        expect(addBlocker(store.getState())).toBe("needsSize");

        // A size the user sets stays when the surface changes.
        const typed = {
            width: { m: 1.2 },
            height: { m: 0.9 },
            source: "user" as const,
            templateId: null,
        };
        store.getState().setGroupSize(0, typed);
        expect(group()).toMatchObject({ sizeChosen: true, standard: null });
        store.getState().setGroupSurface(0, "silk");
        expect(group().size).toEqual(typed);
    });

    it("starts floor shapes on Base floor with the floor chip (Q77)", async () => {
        // 106 × 78 ft: the larger WGI floor, no silk of that shape.
        const lib = artworkFake(pngOfAspect(1060, 780));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(store.getState().artwork!.groups[0]).toMatchObject({
            surface: "baseFloor",
            size: {
                source: "template",
                templateId: "floor-wgi-maximum-78x106ft",
            },
            standard: null,
        });
    });

    it("keeps the file's size when the surface changes", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const before = store.getState().artwork!.groups[1].size;
        store.getState().setGroupSurface(1, "baseFloor");
        expect(store.getState().artwork!.groups[1].size).toEqual(before);
    });

    it("loads each page preview once", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        await tick();
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        expect(lib.calls.importPreview).toEqual([
            {
                sessionId: SESSION,
                fileId: ART_FILE_A,
                type: "artwork",
                page: 1,
                maxPx: 256,
            },
        ]);
        expect(
            store.getState().artwork!.previews[`${ART_FILE_A}:1@256`],
        ).toMatch(/^blob:/);
    });

    it("ends the review and shows the Library when a commit is cancelled", async () => {
        const lib = artworkFake();
        lib.on("importCommit", () => ({
            ok: false,
            error: { code: "cancelled", message: "x" },
        }));
        const onCommitStopped = vi.fn();
        const onClose = vi.fn();
        const store = createImportReview(lib.client, {
            ...urls,
            onCommitStopped,
            onClose,
        });
        await store.getState().pick("any");
        await store.getState().commit();
        // Pages stored before the cancel stay; Add can't import them twice.
        expect(store.getState().phase).toBe("closed");
        expect(lib.closed).toEqual([SESSION]);
        expect(onClose).toHaveBeenCalledOnce();
        expect(onCommitStopped).toHaveBeenCalledOnce();
    });

    it("reports added and skipped pages when done", async () => {
        const lib = artworkFake();
        lib.on("importCommit", () =>
            ok({
                type: "artwork",
                reports: [
                    {
                        filename: "silks.pdf",
                        format: "pdf",
                        imported: [
                            {
                                page: 0,
                                item: { id: ITEM_ID, name: "silks (page 1)" },
                            },
                        ],
                        notImported: [
                            {
                                page: 1,
                                notes: [
                                    {
                                        group: "needs-choice",
                                        code: "size",
                                        message: "Choose its size.",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        );
        const onCommitted = vi.fn();
        const store = createImportReview(lib.client, { ...urls, onCommitted });
        await store.getState().pick("any");
        await store.getState().commit();
        expect(store.getState().done).toEqual({
            names: ["silks (page 1)"],
            notImported: [
                { filename: "silks.pdf", page: 1, message: "Choose its size." },
            ],
            newVersion: false,
        });
        expect(onCommitted).toHaveBeenCalledExactlyOnceWith(
            [ITEM_ID],
            store.getState().done,
        );
    });
});

const inLength = (n: number): Length => ({
    m: toMeters(n, "in"),
    typed: `${n} in`,
});

describe("artwork defaults (Q77)", () => {
    const groupOf = (width: number, height: number) =>
        pngOfAspect(width, height).aspectGroups[0];

    it("starts on Silk, or Base floor when a floor has the image's shape", () => {
        expect(defaultSurfaceFor(groupOf(1000, 800))).toBe("silk");
        expect(defaultSurfaceFor(groupOf(1060, 780))).toBe("baseFloor");
        // 3 : 2 is both the 36 × 54 in silk and the 60 × 90 ft floor: Silk wins.
        expect(defaultSurfaceFor(groupOf(900, 600))).toBe("silk");
    });

    it("prefers a chip of the surface's kind over the fitted default", () => {
        const group = groupOf(900, 600);
        expect(defaultSizeFor(group, "silk").size?.templateId).toBe(
            "silk-6ft-36x54",
        );
        expect(defaultSizeFor(group, "floorProp").size?.templateId).toBe(
            "floor-wgi-minimum-60x90ft",
        );
    });

    it("keeps today's chip and surface for a shape only a flat prop has", () => {
        // 1 : 2 is the 4 × 8 ft sheet.
        expect(initialGroup(groupOf(500, 1000), null)).toMatchObject({
            surface: "propSlot",
            size: { templateId: "flat-prop-4x8ft" },
            sizeChosen: false,
        });
    });

    it("fits the picker's surface default when no chip of its kind matches", () => {
        const group = initialGroup(groupOf(1000, 800), {
            surface: "baseFloor",
        });
        expect(group).toMatchObject({
            surface: "baseFloor",
            surfaceChosen: true,
            size: { width: { typed: "90 ft" }, height: { typed: "72 ft" } },
        });
    });
});

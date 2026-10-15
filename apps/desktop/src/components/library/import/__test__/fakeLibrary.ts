/**
 * A stand-in for the editor's `window.electron.library` (C1.9 preload),
 * so the review's tests run the real `createImportClient` (including its
 * stale-reply handling) without Electron. Each invoke records its request
 * and answers from a handler the test sets; a handler may return a promise
 * the test resolves later.
 */
import {
    catalogSizesForAspect,
    pixelAspectTolerance,
} from "@/view3d/core/sizes";
import {
    createImportClient,
    type LibraryApi,
} from "@/view3d/library/importClient";
import type {
    ArtworkInspection,
    AspectGroup,
    ImportFileRef,
    ImportInspection,
    ImportProgress,
    ImportSession,
    LibraryChanged,
    LibraryMatch,
    ModelImportReport,
    ModelSidecar,
    Result,
} from "@/view3d/library/protocol";

type Handler = (request: never) => unknown;

export interface FakeLibrary {
    api: LibraryApi;
    client: ReturnType<typeof createImportClient>;
    calls: Record<string, unknown[]>;
    on(method: string, handler: Handler): void;
    emitProgress(progress: ImportProgress): void;
    /** Pushes `library:changed` to `onChanged` listeners. */
    emitChanged(changed: LibraryChanged): void;
    closed: string[];
}

export const SESSION = "00000000-0000-4000-8000-000000000001";
export const MODEL_FILE = "00000000-0000-4000-8000-000000000002";
export const ART_FILE_A = "00000000-0000-4000-8000-000000000003";
export const ART_FILE_B = "00000000-0000-4000-8000-000000000004";
export const ITEM_ID = "00000000-0000-4000-8000-0000000000aa";

export function ok<T>(value: T): Result<T> {
    return { ok: true, value };
}

export function createFakeLibrary(): FakeLibrary {
    const calls: Record<string, unknown[]> = {};
    const handlers: Record<string, Handler> = {};
    const listeners = new Set<(p: ImportProgress) => void>();
    const changeListeners = new Set<(c: LibraryChanged) => void>();
    const closed: string[] = [];
    const invoke =
        (method: string) =>
        async (request?: unknown): Promise<unknown> => {
            (calls[method] ??= []).push(request);
            const handler = handlers[method];
            if (!handler) {
                return {
                    ok: false,
                    error: { code: "invalid-request", message: method },
                };
            }
            return handler(request as never);
        };
    const api = {
        importPick: invoke("importPick"),
        importInspect: invoke("importInspect"),
        importPreview: invoke("importPreview"),
        importCommit: invoke("importCommit"),
        importCancel: invoke("importCancel"),
        importClose: (request: { sessionId: string }) => {
            closed.push(request.sessionId);
        },
        onImportProgress: (cb: (p: ImportProgress) => void) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        templateSave: invoke("templateSave"),
        list: invoke("list"),
        readParts: invoke("readParts"),
        thumbnails: invoke("thumbnails"),
        onChanged: (cb: (c: LibraryChanged) => void) => {
            changeListeners.add(cb);
            return () => changeListeners.delete(cb);
        },
    } as unknown as LibraryApi;
    return {
        api,
        client: createImportClient(api),
        calls,
        closed,
        on(method, handler) {
            handlers[method] = handler;
        },
        emitProgress(progress) {
            for (const l of listeners) l(progress);
        },
        emitChanged(changed) {
            for (const l of changeListeners) l(changed);
        },
    };
}

/** A promise with its resolve, for answers the test releases later. */
export function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

export function fileRef(
    fileId: string,
    filename: string,
    type: ImportFileRef["type"],
    sizeBytes = 120_000,
): ImportFileRef {
    return { fileId, filename, sizeBytes, type, tooLarge: false };
}

export function session(
    files: ImportFileRef[],
    context: ImportSession["context"] = null,
): ImportSession {
    return { sessionId: SESSION, files, context };
}

const measurements = (triangles: number) => ({
    bounds: {
        min: [-0.02, 0, -0.02] as [number, number, number],
        max: [0.02, 1.52, 0.02] as [number, number, number],
        size: [0.04, 1.52, 0.04] as [number, number, number],
    },
    triangles,
    trianglesByFit: null,
    drawCalls: 1,
    textures: [],
    joints: [],
    maxInfluences: 0,
});

export function modelReport(
    overrides: Partial<ModelImportReport> = {},
): ModelImportReport {
    return {
        pipelineVersion: 1,
        status: "ready",
        kind: "equipment",
        kindSource: "option",
        cantImport: [],
        needsChoice: [],
        fixedForYou: [],
        notes: [],
        badges: [],
        source: measurements(6412),
        output: measurements(2000),
        materials: [],
        metadata: { generator: null, copyright: null, license: null },
        ...overrides,
    };
}

/** The drum major mace of the prototype: four pre-selected choices. */
export function choicesReport(): ModelImportReport {
    return modelReport({
        needsChoice: [
            {
                code: "unitConversion",
                largestM: 152.4,
                options: ["none", "cm"],
                preselected: "cm",
                applied: "cm",
            },
            { code: "rotateToYUp", preselected: true, applied: true },
            {
                code: "simplify",
                triangles: 6412,
                cap: 2000,
                simplifiedTriangles: 2000,
                preselected: true,
                applied: true,
            },
            {
                code: "missingGrip",
                preselected: { right: [0, 0.38, 0] },
                applied: { right: [0, 0.38, 0] },
                misnamed: [],
            },
        ],
        fixedForYou: [{ code: "dracoDecoded" }],
        notes: [{ code: "customPropertiesOff" }, { code: "noStretchZones" }],
        badges: ["scaled", "simplified", "noStretchZones"],
    });
}

/** A riser with no slots: three materials to pick the artwork surface from (Q67). */
export function surfaceReport(): ModelImportReport {
    return modelReport({
        kind: "prop",
        notes: [{ code: "customPropertiesOff" }],
        materials: [
            {
                index: 0,
                name: "Front",
                outputIndex: 0,
                sizeM: [2.4, 0.6, 0.02],
                areaM2: 2.9,
                hasUVs: true,
                fileSlot: null,
            },
            {
                index: 1,
                name: "Trim",
                outputIndex: 1,
                sizeM: [2.4, 0.6, 1.2],
                areaM2: 1.1,
                hasUVs: false,
                fileSlot: null,
            },
            {
                index: 2,
                name: "Unused",
                outputIndex: null,
                sizeM: null,
                areaM2: 0,
                hasUVs: false,
                fileSlot: null,
            },
        ],
    });
}

export function sidecar(grip: [number, number, number] | null): ModelSidecar {
    return {
        format: "openmarch/model-sidecar@1",
        pipelineVersion: 1,
        kind: "equipment",
        bounds: measurements(1).bounds,
        triangles: 2000,
        drawCalls: 1,
        grips: {
            right: grip ? { position: grip, rotation: [0, 0, 0, 1] } : null,
            left: null,
        },
        attachPoints: {},
        artworkSlots: [],
        stretch: null,
        stamp: { itemId: null, kind: null, kitVersion: null },
        garment: null,
        metadata: {
            generator: null,
            copyright: null,
        },
        importNotes: {
            needsChoice: [],
            fixedForYou: [],
            notes: [],
            badges: [],
        },
    };
}

export function modelInspection(
    report: ModelImportReport,
    options: {
        requestSeq?: number;
        matches?: LibraryMatch[];
        grip?: [number, number, number] | null;
    } = {},
): Extract<ImportInspection, { type: "model" }> {
    return {
        type: "model",
        fileId: MODEL_FILE,
        requestSeq: options.requestSeq ?? 1,
        report,
        sidecar:
            report.status === "ready" ? sidecar(options.grip ?? null) : null,
        previewReady: report.status === "ready",
        matches: options.matches ?? [],
    };
}

export const KIT_MATCH: LibraryMatch = {
    itemId: ITEM_ID,
    name: "Riser 8 × 4",
    builtIn: false,
    reason: "kit-item-id",
};

const inch = (n: number) => ({ m: (n * 254) / 10000, typed: `${n} in` });

/** A two-page PDF: page 1 is 36 × 54 in, page 2 is 4 × 8 ft (from file). */
export function pdfInspection(): Extract<
    ImportInspection,
    { type: "artwork" }
> {
    const inspection: ArtworkInspection = {
        ok: true,
        filename: "silks.pdf",
        format: "pdf",
        colorSpace: "srgb",
        notes: [],
        pages: [
            {
                index: 0,
                vector: true,
                pixels: null,
                aspect: 36 / 54,
                fileSize: {
                    width: inch(36),
                    height: inch(54),
                    from: "pdf-page",
                },
            },
            {
                index: 1,
                vector: true,
                pixels: null,
                aspect: 0.5,
                fileSize: {
                    width: inch(48),
                    height: inch(96),
                    from: "pdf-page",
                },
            },
        ],
    };
    const groups: AspectGroup[] = [
        {
            aspect: 36 / 54,
            members: [{ file: 0, page: 0 }],
            fileSize: { width: inch(36), height: inch(54) },
            chips: [
                {
                    catalogId: "silk-6ft-36x54",
                    label: "Silk 36 × 54 in",
                    width: inch(36),
                    height: inch(54),
                },
            ],
        },
        {
            aspect: 0.5,
            members: [{ file: 0, page: 1 }],
            fileSize: { width: inch(48), height: inch(96) },
            chips: [],
        },
    ];
    return {
        type: "artwork",
        files: [{ fileId: ART_FILE_A, inspection, matches: [] }],
        aspectGroups: groups,
    };
}

/** A 600 × 900 px PNG with no print size, plus a refused file. */
export function pngInspection(): Extract<
    ImportInspection,
    { type: "artwork" }
> {
    return {
        type: "artwork",
        files: [
            {
                fileId: ART_FILE_A,
                inspection: {
                    ok: true,
                    filename: "flag.png",
                    format: "png",
                    colorSpace: "srgb",
                    notes: [
                        {
                            group: "needs-choice",
                            code: "size",
                            message: "This file doesn't say how big it prints.",
                        },
                    ],
                    pages: [
                        {
                            index: 0,
                            vector: false,
                            pixels: { width: 600, height: 900 },
                            aspect: 600 / 900,
                            fileSize: null,
                        },
                    ],
                },
                matches: [],
            },
            {
                fileId: ART_FILE_B,
                inspection: {
                    ok: false,
                    filename: "broken.png",
                    format: "png",
                    notes: [
                        {
                            group: "cant-import",
                            code: "unreadable",
                            message: "This PNG can't be read.",
                        },
                    ],
                },
                matches: [],
            },
        ],
        aspectGroups: [
            {
                aspect: 600 / 900,
                members: [{ file: 0, page: 0 }],
                fileSize: null,
                chips: [
                    {
                        catalogId: "silk-6ft-36x54",
                        label: "Silk 36 × 54 in",
                        width: inch(36),
                        height: inch(54),
                    },
                ],
            },
        ],
    };
}

/** A one-page PNG of `width` × `height` px with the catalog's real chips. */
export function pngOfAspect(width: number, height: number) {
    const inspection = pngInspection();
    const aspect = width / height;
    const file = inspection.files[0].inspection;
    if (file.ok) {
        file.pages[0] = { ...file.pages[0], pixels: { width, height }, aspect };
    }
    inspection.aspectGroups[0] = {
        ...inspection.aspectGroups[0],
        aspect,
        chips: catalogSizesForAspect(
            aspect,
            pixelAspectTolerance({ width, height }),
        ),
    };
    return inspection;
}

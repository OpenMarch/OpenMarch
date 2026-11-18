import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    ImportedModel,
    ModelImportChoices,
    ModelImportResult,
} from "../../types";
import {
    configureModelImportSession,
    defaultModelName,
    useModelImportSession,
    withoutEmpty,
} from "../modelImportSession";

const model = (name: string, triangles = 100): ImportedModel =>
    ({
        name,
        parts: {
            model: new Uint8Array([1]),
            distant: new Uint8Array([2]),
            thumbnail: new Uint8Array([triangles % 256]),
        },
        sidecar: { triangles },
        credits: { author: "Ann" },
    }) as unknown as ImportedModel;

const ok = (name: string, triangles?: number): ModelImportResult => ({
    ok: true,
    report: { cantImport: [], needsChoice: [], fixedForYou: [], notes: [] },
    model: model(name, triangles),
});

/** Runs that finish when the test says */
function deferredRuns() {
    const runs: {
        choices: ModelImportChoices;
        signal: AbortSignal;
        finish: (result: ModelImportResult) => void;
    }[] = [];
    const save = vi.fn(async (m: ImportedModel) => ({
        modelValue: `library:${m.name}@x`,
    }));
    configureModelImportSession({
        run: (_files, choices, signal) =>
            new Promise((resolve) =>
                runs.push({ choices, signal, finish: resolve }),
            ),
        save,
    });
    return { runs, save };
}

const session = () => useModelImportSession.getState();
const FILES = [{ name: "Riser.glb", bytes: new Uint8Array([1]) }];

afterEach(() => {
    session().cancel();
    configureModelImportSession(null);
});

describe("the model import session", () => {
    it("fills the name and credits from the first result, and keeps edits after", async () => {
        const { runs } = deferredRuns();
        session().open(FILES);
        expect(session().running).toBe(true);
        runs[0].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        expect(session()).toMatchObject({
            name: "Riser",
            credits: { author: "Ann" },
        });

        session().setName("Stage riser");
        session().choose({ turn: 90 });
        runs[1].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        expect(session().name).toBe("Stage riser");
        expect(runs[1].choices).toEqual({ turn: 90 });
    });

    it("drops a run a newer choice replaced", async () => {
        const { runs } = deferredRuns();
        session().open(FILES);
        session().choose({ detail: "original" });
        expect(runs[0].signal.aborted).toBe(true);
        runs[1].finish(ok("Newer"));
        runs[0].finish(ok("Older"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        expect(session().result).toMatchObject({ model: { name: "Newer" } });
    });

    it("loads the Original once, and again only after a choice other than the level", async () => {
        const { runs } = deferredRuns();
        session().open(FILES);
        runs[0].finish(ok("Riser", 50));
        await vi.waitFor(() => expect(session().running).toBe(false));

        session().loadBefore();
        expect(runs[1].choices).toEqual({ detail: "original" });
        runs[1].finish(ok("Riser", 90));
        await vi.waitFor(() =>
            expect(session().before).toMatchObject({
                status: "ready",
                triangles: 90,
                // Its bytes, for the 3D comparison
                model: new Uint8Array([1]),
            }),
        );
        session().loadBefore();
        expect(runs).toHaveLength(2);

        session().choose({ detail: "detailed" });
        expect(session().before).toMatchObject({ status: "ready" });
        session().choose({ unitFix: "cm" });
        expect(session().before).toBeNull();
    });

    it("adds with the edited name and credits, then ends", async () => {
        const { runs, save } = deferredRuns();
        session().open(FILES);
        runs[0].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        session().setName("  Riser A ");
        session().setCredits({ author: " ", license: "CC0-1.0" });
        expect(await session().add()).toBe("library:Riser A@x");
        expect(save.mock.calls[0][0]).toMatchObject({
            name: "Riser A",
            credits: { license: "CC0-1.0" },
        });
        expect(save.mock.calls[0][0].credits).not.toHaveProperty("author");
        expect(session().files).toBeNull();
    });

    it("keeps the review open with the error when Add fails", async () => {
        const { runs, save } = deferredRuns();
        save.mockRejectedValueOnce(new Error("disk full"));
        session().open(FILES);
        runs[0].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        expect(await session().add()).toBeNull();
        expect(session()).toMatchObject({
            saving: false,
            saveError: "Error: disk full",
        });
        expect(session().files).not.toBeNull();
    });
});

describe("defaultModelName", () => {
    it("takes the file's title, else the model file's name", () => {
        expect(defaultModelName(FILES, model("Chair"))).toBe("Chair");
        expect(
            defaultModelName(
                [
                    { name: "scene.bin", bytes: new Uint8Array() },
                    { name: "Tuba stand.gltf", bytes: new Uint8Array() },
                ],
                undefined,
            ),
        ).toBe("Tuba stand");
    });
});

it("leaves blank credits out: empty means Unknown", () => {
    expect(
        withoutEmpty({ license: "", author: " Ann ", sourceUrl: " " }),
    ).toEqual({ author: "Ann" });
});

describe("the session around a save", () => {
    it("fills the name and credits once a Try again reads the file", async () => {
        const { runs } = deferredRuns();
        session().open(FILES);
        runs[0].finish({
            ok: false,
            report: {
                cantImport: [{ code: "timedOut", seconds: 120 }],
                needsChoice: [],
                fixedForYou: [],
                notes: [],
            },
        });
        await vi.waitFor(() => expect(session().running).toBe(false));
        session().retry();
        runs[1].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        expect(session()).toMatchObject({
            name: "Riser",
            credits: { author: "Ann" },
        });
    });

    it("keeps Cancel from undoing a save under way", async () => {
        const { runs, save } = deferredRuns();
        let finishSave!: () => void;
        save.mockImplementationOnce(
            (m) =>
                new Promise((resolve) => {
                    finishSave = () =>
                        resolve({ modelValue: `library:${m.name}@x` });
                }),
        );
        session().open(FILES);
        runs[0].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        const added = session().add();
        session().cancel();
        expect(session()).toMatchObject({ saving: true });
        finishSave();
        expect(await added).toBe("library:Riser@x");
    });

    it("leaves an import opened during a save alone", async () => {
        const { runs, save } = deferredRuns();
        let finishSave!: () => void;
        save.mockImplementationOnce(
            (m) =>
                new Promise((resolve) => {
                    finishSave = () =>
                        resolve({ modelValue: `library:${m.name}@x` });
                }),
        );
        session().open(FILES);
        runs[0].finish(ok("Riser"));
        await vi.waitFor(() => expect(session().running).toBe(false));
        const added = session().add();
        session().open([
            { name: "Tuba stand.glb", bytes: new Uint8Array([2]) },
        ]);
        finishSave();
        expect(await added).toBeNull();
        expect(session().files?.[0].name).toBe("Tuba stand.glb");
        expect(runs[1].signal.aborted).toBe(false);
    });
});

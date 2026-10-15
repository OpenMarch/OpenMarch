// cspell:words unhover
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import ImportPanel from "../ImportPanel";
import { createImportReview } from "../importReview";
import {
    ART_FILE_A,
    ART_FILE_B,
    choicesReport,
    createFakeLibrary,
    fileRef,
    KIT_MATCH,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    pdfInspection,
    pngInspection,
    pngOfAspect,
    session,
    surfaceReport,
} from "./fakeLibrary";

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => cleanup());

const urls = { toUrl: () => "blob:test/x", revokeUrl: vi.fn() };

async function renderModel(report = choicesReport(), matches = [KIT_MATCH]) {
    const lib = createFakeLibrary();
    lib.on("importPick", () =>
        ok(session([fileRef(MODEL_FILE, "drum_major_mace.glb", "model")])),
    );
    lib.on("importInspect", () => ok(modelInspection(report, { matches })));
    lib.on("importPreview", () =>
        ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
    );
    const store = createImportReview(lib.client, urls);
    await act(() => store.getState().pick("model", { kind: "equipment" }));
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ImportPanel store={store} />
        </TolgeeProvider>,
    );
    return { lib, store };
}

async function renderArtwork(inspection = pdfInspection(), files = 1) {
    const lib = createFakeLibrary();
    const refs = [fileRef(ART_FILE_A, "silks.pdf", "artwork")];
    if (files > 1) refs.push(fileRef(ART_FILE_B, "broken.png", "artwork"));
    lib.on("importPick", () => ok(session(refs)));
    lib.on("importInspect", () => ok(inspection));
    lib.on("importPreview", () =>
        ok({ mimeType: "image/png", bytes: new Uint8Array([1]) }),
    );
    const store = createImportReview(lib.client, urls);
    await act(() => store.getState().pick("any"));
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ImportPanel store={store} />
        </TolgeeProvider>,
    );
    return { lib, store };
}

describe("ImportPanel: models", () => {
    it("shows each Needs your choice item pre-selected", async () => {
        await renderModel();
        const group = await screen.findByTestId("import-group-choices");
        expect(within(group).getByText("Needs your choice")).toBeVisible();
        expect(screen.getByTestId("import-choice-rotate")).toHaveAttribute(
            "data-state",
            "checked",
        );
        expect(screen.getByTestId("import-choice-simplify")).toHaveAttribute(
            "data-state",
            "checked",
        );
        expect(screen.getByTestId("import-choice-grip")).toHaveAttribute(
            "data-state",
            "checked",
        );
        expect(screen.getByTestId("import-units-cm")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByText("Simplify to 2,000 triangles")).toBeVisible();
        expect(screen.getByTestId("import-after")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("asks which surface takes artwork when the file marks none (Q67)", async () => {
        const { lib, store } = await renderModel(surfaceReport(), []);
        const surface = await screen.findByTestId("import-surface");
        expect(within(surface).getByText("Artwork surface")).toBeVisible();
        expect(screen.getByTestId("import-surface-none")).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(
            within(screen.getByTestId("import-surface-0")).getByText(
                /About 2\.40 m × 0\.60 m/,
            ),
        ).toBeVisible();
        expect(
            within(screen.getByTestId("import-surface-1")).getByText(/no UVs/),
        ).toBeVisible();
        // Nothing draws the third material: not offered.
        expect(screen.queryByTestId("import-surface-2")).toBeNull();

        await userEvent.hover(screen.getByTestId("import-surface-1"));
        expect(store.getState().model?.hoveredMaterial).toBe(1);
        await userEvent.unhover(screen.getByTestId("import-surface-1"));
        expect(store.getState().model?.hoveredMaterial).toBeNull();

        await userEvent.click(screen.getByTestId("import-surface-0"));
        await waitFor(() =>
            expect(lib.calls.importInspect.at(-1)).toMatchObject({
                choices: {
                    slots: [
                        {
                            material: 0,
                            id: "artwork",
                            widthM: 2.4,
                            heightM: 0.6,
                        },
                    ],
                },
            }),
        );
        expect(screen.getByTestId("import-surface-0")).toHaveAttribute(
            "aria-checked",
            "true",
        );
    });

    it("doesn't ask for a surface when the file marks a slot", async () => {
        const report = surfaceReport();
        report.materials[0].fileSlot = "front";
        await renderModel(report, []);
        await screen.findByTestId("import-report");
        expect(screen.queryByTestId("import-surface")).toBeNull();
    });

    it("keeps Fixed for you collapsed and Notes open", async () => {
        await renderModel();
        const fixed = screen.getByTestId("import-group-fixed");
        expect(
            within(fixed).queryByText("Draco compression decoded"),
        ).toBeNull();
        await userEvent.click(within(fixed).getByRole("button"));
        expect(
            within(fixed).getByText("Draco compression decoded"),
        ).toBeVisible();
        expect(
            screen.getByText("Looks like custom properties were off"),
        ).toBeVisible();
    });

    it("reads Add new version for a kit re-import, and re-inspects on a choice", async () => {
        const { lib } = await renderModel();
        expect(screen.getByTestId("import-match")).toHaveTextContent(
            "New version of Riser 8 × 4",
        );
        const add = screen.getByTestId("import-add");
        expect(add).toHaveTextContent("Add new version");
        expect(add).toBeEnabled();
        await userEvent.click(screen.getByTestId("import-match-new"));
        expect(add).toHaveTextContent("Add to Library");
        await userEvent.click(screen.getByTestId("import-choice-rotate"));
        await waitFor(() =>
            expect(lib.calls.importInspect.at(-1)).toMatchObject({
                choices: { rotateToYUp: false },
            }),
        );
    });

    it("lists a rejection with the starter kit pointer and blocks Add", async () => {
        await renderModel(
            modelReport({
                status: "rejected",
                output: null,
                cantImport: [
                    {
                        code: "overTriangleCap",
                        triangles: 96300,
                        cap: 20000,
                        limit: 80000,
                    },
                ],
            }),
            [],
        );
        const cant = screen.getByTestId("import-group-cant");
        expect(cant).toHaveTextContent(
            "96,300 triangles: over the limit of 80,000",
        );
        expect(cant).toHaveTextContent("Blender starter kit");
        const add = screen.getByTestId("import-add");
        expect(add).toBeDisabled();
        expect(add).toHaveTextContent("Can't import");
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("says a clean file is ready in one click", async () => {
        await renderModel(modelReport(), []);
        expect(
            screen.getByText("Ready to add. Nothing needs your choice."),
        ).toBeVisible();
        expect(screen.getByTestId("import-add")).toBeEnabled();
    });

    it("keeps the license fields collapsed with the rights line", async () => {
        await renderModel(modelReport(), []);
        expect(
            screen.getByText(
                "Only import artwork and models you have the rights to use.",
            ),
        ).toBeVisible();
        expect(screen.queryByLabelText("Author")).toBeNull();
        await userEvent.click(screen.getByTestId("import-details-toggle"));
        expect(screen.getByLabelText("Author")).toBeVisible();
    });
});

describe("ImportPanel: artwork", () => {
    it("groups PDF pages by aspect, one size question each, and counts Add", async () => {
        await renderArtwork();
        expect(screen.getByTestId("import-size-0")).toBeVisible();
        expect(screen.getByTestId("import-size-1")).toBeVisible();
        expect(screen.getByText("From file: 36 × 54 in")).toBeVisible();
        // No DPI or print-readiness line (Q75).
        expect(screen.queryByTestId("import-dpi")).toBeNull();
        expect(screen.queryByTestId("import-size-0-fitted")).toBeNull();
        expect(screen.getByTestId("import-add")).toHaveTextContent(
            "Add 2 to Library",
        );
    });

    it("locks the aspect as the size changes", async () => {
        await renderArtwork(pngInspection(), 2);
        const width = screen.getByTestId("import-size-0-width-in");
        await userEvent.clear(screen.getByTestId("import-size-0-width-ft"));
        await userEvent.clear(width);
        await userEvent.type(width, "4{Enter}");
        // Height follows the locked aspect: 4 in wide is 6 in tall.
        await waitFor(() =>
            expect(screen.getByTestId("import-size-0-height-in")).toHaveValue(
                6,
            ),
        );
        expect(screen.queryByTestId("import-dpi")).toBeNull();
        expect(screen.getByTestId("import-group-cant")).toHaveTextContent(
            "broken.png",
        );
        expect(screen.getByTestId("import-add")).toHaveTextContent(
            "Add to Library",
        );
    });

    it("notes when the default size was fitted to the image (Q77)", async () => {
        await renderArtwork(pngOfAspect(1000, 800), 2);
        expect(
            screen.getByTestId("import-size-0-surface-silk"),
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByTestId("import-size-0-fitted")).toHaveTextContent(
            "Fitted to your image’s shape; the standard Silk is 54 × 36 in.",
        );
        // 54 × 43.25 in.
        expect(screen.getByTestId("import-size-0-width-ft")).toHaveValue(4);
        expect(screen.getByTestId("import-size-0-width-in")).toHaveValue(6);
        expect(screen.getByTestId("import-size-0-height-in")).toHaveValue(7.25);
        await userEvent.click(
            screen.getByTestId("import-size-0-surface-baseFloor"),
        );
        expect(screen.getByTestId("import-size-0-fitted")).toHaveTextContent(
            "the standard Base floor is 90 × 60 ft.",
        );
    });
});

describe("ImportPanel: errors and progress", () => {
    it("shows mixed-selection inline with Choose files again", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () => ({
            ok: false,
            error: { code: "mixed-selection", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await act(() => store.getState().pick("any"));
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ImportPanel store={store} />
            </TolgeeProvider>,
        );
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("Import models and artwork separately");
        expect(screen.getByTestId("import-retry")).toHaveTextContent(
            "Choose files again",
        );
        lib.on("importPick", () => ok(null));
        await userEvent.click(screen.getByTestId("import-retry"));
        expect(lib.calls.importPick).toHaveLength(2);
    });

    it("shows progress with Cancel while inspecting", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(session([fileRef(MODEL_FILE, "big.glb", "model")])),
        );
        lib.on("importInspect", () => new Promise(() => {}));
        lib.on("importCancel", () => ok(undefined));
        const store = createImportReview(lib.client, urls);
        void store.getState().pick("model");
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ImportPanel store={store} />
            </TolgeeProvider>,
        );
        await screen.findByTestId("import-progress");
        act(() =>
            lib.emitProgress({
                sessionId: store.getState().session!.sessionId,
                fileId: MODEL_FILE,
                stage: "decoding",
                fraction: null,
            }),
        );
        expect(screen.getByText("Decoding…")).toBeVisible();
        await userEvent.click(screen.getByTestId("import-progress-cancel"));
        expect(lib.calls.importCancel).toHaveLength(1);
    });
});

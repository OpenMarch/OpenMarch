import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import ImportPreviewStage from "../ImportPreviewStage";
import { createImportReview } from "../importReview";
import type { ImportPreviewCanvasProps } from "../ImportPreviewCanvas";
import {
    ART_FILE_A,
    choicesReport,
    createFakeLibrary,
    fileRef,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    pdfInspection,
    session,
    surfaceReport,
} from "./fakeLibrary";

// jsdom has no WebGL: a stand-in for the code-split canvas records its
// props and turns a click into a picked point.
const canvasProps: ImportPreviewCanvasProps[] = [];
vi.mock("../ImportPreviewCanvas", () => ({
    default: (props: ImportPreviewCanvasProps) => {
        canvasProps.push(props);
        return (
            <button
                data-testid="canvas-stand-in"
                data-url={props.showBefore ? props.beforeUrl : props.url}
                data-view={props.view}
                data-picking={String(props.picking)}
                onClick={() => props.onPick([0, 1.1, 0])}
            />
        );
    },
}));

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    canvasProps.length = 0;
});

let n = 0;
const urls = { toUrl: () => `blob:test/${++n}`, revokeUrl: vi.fn() };

function wrap(node: React.ReactNode) {
    return render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            {node}
        </TolgeeProvider>,
    );
}

async function modelStore(report = choicesReport()) {
    const lib = createFakeLibrary();
    lib.on("importPick", () =>
        ok(session([fileRef(MODEL_FILE, "mace.glb", "model")])),
    );
    lib.on("importInspect", () =>
        ok(modelInspection(report, { grip: [0, 0.38, 0] })),
    );
    lib.on("importPreview", () =>
        ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
    );
    const store = createImportReview(lib.client, urls);
    await act(() => store.getState().pick("model"));
    return { lib, store };
}

describe("ImportPreviewStage", () => {
    it("shows the reviewed GLB in the code-split canvas with the grip", async () => {
        const { store } = await modelStore();
        wrap(<ImportPreviewStage store={store} />);
        const canvas = await screen.findByTestId("canvas-stand-in");
        expect(canvas.dataset.url).toBe(store.getState().model?.glbUrl);
        expect(canvasProps.at(-1)?.grip).toEqual([0, 0.38, 0]);
        expect(screen.getByTestId("import-stage-triangles")).toHaveTextContent(
            "2,000 triangles · cap 2,000",
        );
        expect(
            screen.getByTestId("import-stage-before-after"),
        ).toHaveTextContent("After");
    });

    it("lights the hovered material, else the picked one (Q67)", async () => {
        const { store } = await modelStore(surfaceReport());
        wrap(<ImportPreviewStage store={store} />);
        await screen.findByTestId("canvas-stand-in");
        expect(canvasProps.at(-1)?.highlightMaterial).toBeNull();
        expect(screen.queryByTestId("import-stage-surface")).toBeNull();

        act(() => store.getState().hoverMaterial(1));
        expect(canvasProps.at(-1)?.highlightMaterial).toBe(1);
        expect(screen.getByTestId("import-stage-surface")).toHaveTextContent(
            "Artwork surface: Trim",
        );
        act(() => store.getState().hoverMaterial(null));
        act(() => store.getState().setArtworkSurface(0));
        await waitFor(() =>
            expect(canvasProps.at(-1)?.highlightMaterial).toBe(0),
        );
        expect(screen.getByTestId("import-stage-surface")).toHaveTextContent(
            "Artwork surface: Front",
        );
    });

    it("switches between front, side and top views", async () => {
        const { store } = await modelStore();
        wrap(<ImportPreviewStage store={store} />);
        await screen.findByTestId("canvas-stand-in");
        await userEvent.click(screen.getByTestId("import-view-top"));
        expect(screen.getByTestId("canvas-stand-in").dataset.view).toBe("top");
        expect(screen.getByTestId("import-view-top")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("sets the grip from a click while picking", async () => {
        const { lib, store } = await modelStore();
        wrap(<ImportPreviewStage store={store} />);
        await screen.findByTestId("canvas-stand-in");
        act(() => store.getState().startGripPick());
        expect(screen.getByTestId("import-stage-picking")).toBeVisible();
        expect(screen.getByTestId("canvas-stand-in").dataset.picking).toBe(
            "true",
        );
        await userEvent.click(screen.getByTestId("canvas-stand-in"));
        await waitFor(() =>
            expect(lib.calls.importInspect.at(-1)).toMatchObject({
                choices: { grip: { right: [0, 1.1, 0] } },
            }),
        );
    });

    it("shows the before model for simplify", async () => {
        const { store } = await modelStore();
        wrap(<ImportPreviewStage store={store} />);
        await screen.findByTestId("canvas-stand-in");
        await act(async () => store.getState().setShowBefore(true));
        await waitFor(() =>
            expect(screen.getByTestId("canvas-stand-in").dataset.url).toBe(
                store.getState().model?.beforeUrl,
            ),
        );
        expect(
            screen.getByTestId("import-stage-before-after"),
        ).toHaveTextContent("Before");
        expect(screen.getByTestId("import-stage-triangles")).toHaveTextContent(
            "6,412 triangles",
        );
    });

    it("asks for the kind before there is anything to show", async () => {
        const { store } = await modelStore(
            modelReport({
                status: "needs-kind",
                kind: null,
                output: null,
                needsChoice: [
                    { code: "kind", options: ["prop"], preselected: null },
                ],
            }),
        );
        wrap(<ImportPreviewStage store={store} />);
        expect(
            screen.getByText("Choose what it is to see the preview."),
        ).toBeVisible();
        expect(screen.queryByTestId("canvas-stand-in")).toBeNull();
    });

    it("shows the focused artwork page's 1024 px preview", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(session([fileRef(ART_FILE_A, "silks.pdf", "artwork")])),
        );
        lib.on("importInspect", () => ok(pdfInspection()));
        lib.on("importPreview", () =>
            ok({ mimeType: "image/png", bytes: new Uint8Array([1]) }),
        );
        const store = createImportReview(lib.client, urls);
        await act(() => store.getState().pick("any"));
        wrap(<ImportPreviewStage store={store} />);
        const image = await screen.findByTestId("import-stage-image");
        expect(image).toHaveAttribute(
            "src",
            store.getState().artwork!.previews[`${ART_FILE_A}:0@1024`],
        );
        expect(lib.calls.importPreview).toContainEqual(
            expect.objectContaining({ page: 0, maxPx: 1024 }),
        );
        expect(screen.getByText("silks.pdf · Page 1")).toBeVisible();
        expect(screen.getByText("36 × 54 in · vector")).toBeVisible();
    });
});

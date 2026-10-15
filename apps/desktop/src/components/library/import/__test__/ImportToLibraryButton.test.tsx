import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import ImportToLibraryButton from "../ImportToLibraryButton";
import { AssetsHost } from "@/components/assets/AssetsModal";
import { useAssetsStore } from "@/components/assets/assetsStore";
import {
    createFakeLibrary,
    fileRef,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    session,
} from "./fakeLibrary";

vi.mock("@/hooks/queries/useShowLibrary", () => ({
    useEmbedImportedVersions: () => ({ mutate: vi.fn() }),
}));
vi.mock("../ImportPreviewCanvas", () => ({
    default: () => <div data-testid="canvas-stand-in" />,
}));

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    useAssetsStore.getState().review?.getState().close();
});

function renderButton() {
    const lib = createFakeLibrary();
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ImportToLibraryButton client={lib.client} />
            <AssetsHost />
        </TolgeeProvider>,
    );
    return lib;
}

describe("ImportToLibraryButton", () => {
    it("opens the dialog and shows nothing when it's cancelled", async () => {
        const lib = renderButton();
        lib.on("importPick", () => ok(null));
        await userEvent.click(screen.getByTestId("import-to-library"));
        expect(lib.calls.importPick).toEqual([{ purpose: "any" }]);
        await waitFor(() =>
            expect(screen.getByTestId("import-to-library")).toBeEnabled(),
        );
        expect(screen.queryByTestId("import-review-host")).toBeNull();
    });

    it("opens the review host after a pick, and Cancel closes it", async () => {
        const lib = renderButton();
        lib.on("importPick", () =>
            ok(session([fileRef(MODEL_FILE, "riser.glb", "model")])),
        );
        lib.on("importInspect", () =>
            ok(modelInspection(modelReport(), { matches: [] })),
        );
        lib.on("importPreview", () =>
            ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
        );
        await userEvent.click(screen.getByTestId("import-to-library"));
        expect(await screen.findByTestId("import-review-host")).toBeVisible();
        expect(screen.getByTestId("import-panel")).toBeVisible();
        expect(screen.getByTestId("import-stage")).toBeVisible();
        await userEvent.click(screen.getByTestId("import-cancel"));
        await waitFor(() =>
            expect(screen.queryByTestId("import-review-host")).toBeNull(),
        );
        expect(lib.closed).toHaveLength(1);
    });
});

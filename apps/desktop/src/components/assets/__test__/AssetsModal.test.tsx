import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import AssetsModal, { AssetsHost } from "../AssetsModal";
import { useAssetsStore } from "../assetsStore";
import {
    createFakeLibrary,
    fileRef,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    session,
} from "@/components/library/import/__test__/fakeLibrary";
import {
    libraryItem,
    sampleLibrary,
    serveLibrary,
} from "@/components/library/browser/__test__/libraryFixtures";

vi.mock("@/components/library/import/ImportPreviewCanvas", () => ({
    default: () => <div data-testid="canvas-stand-in" />,
}));

// One fake for the file: the editor's default clients are created once.
const lib = createFakeLibrary();
const library = sampleLibrary(50);

beforeAll(async () => {
    (window as unknown as { electron: unknown }).electron = {
        library: lib.api,
    };
    URL.createObjectURL = vi.fn(() => "blob:test/1");
    URL.revokeObjectURL = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    serveLibrary(lib, library);
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    useAssetsStore.getState().review?.getState().close();
    useSidebarModalStore.getState().setOpen(false);
});

function renderSidebar() {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <AssetsModal />
            <SidebarModal />
            <AssetsHost />
        </TolgeeProvider>,
    );
}

describe("Assets sidebar tab", () => {
    it("opens and closes the Assets panel", async () => {
        renderSidebar();
        const tab = screen.getByTestId("assets-tab");
        expect(tab).toHaveAccessibleName("Assets");
        await userEvent.click(tab);
        const panel = await screen.findByTestId("assets-panel");
        expect(panel).toHaveTextContent("Assets");
        expect(screen.getByTestId("import-to-library")).toHaveTextContent(
            "Import…",
        );
        expect(screen.getByTestId("artwork-templates-menu")).toBeVisible();
        expect(await screen.findByTestId("library-group-silks")).toBeVisible();
        await userEvent.click(tab);
        expect(screen.queryByTestId("assets-panel")).toBeNull();
    });

    it("lands on the Library with the new item ringed after a commit", async () => {
        renderSidebar();
        await userEvent.click(screen.getByTestId("assets-tab"));
        lib.on("importPick", () =>
            ok(session([fileRef(MODEL_FILE, "flag.glb", "model")])),
        );
        lib.on("importInspect", () =>
            ok(modelInspection(modelReport(), { matches: [] })),
        );
        lib.on("importPreview", () =>
            ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
        );
        const added = libraryItem(9001, "model", "Swing flag", "equipment");
        lib.on("importCommit", () => {
            library.push(added);
            return ok({
                type: "model",
                report: modelReport(),
                saved: {
                    outcome: "created",
                    item: { id: added.summary.id, name: "Swing flag" },
                    versionHash: added.summary.versions[1],
                },
            });
        });

        await userEvent.click(screen.getByTestId("import-to-library"));
        expect(await screen.findByTestId("import-review-host")).toBeVisible();
        // Esc closes every sidebar panel; the review keeps going.
        act(() => {
            useSidebarModalStore.getState().setOpen(false);
        });
        expect(screen.queryByTestId("assets-panel")).toBeNull();
        expect(screen.getByTestId("import-review-host")).toBeVisible();

        await waitFor(() =>
            expect(screen.getByTestId("import-add")).toBeEnabled(),
        );
        await userEvent.click(screen.getByTestId("import-add"));

        await waitFor(() =>
            expect(screen.queryByTestId("import-review-host")).toBeNull(),
        );
        expect(await screen.findByTestId("assets-panel")).toBeVisible();
        await waitFor(() =>
            expect(screen.getByTitle("Swing flag")).toHaveAttribute(
                "data-highlighted",
                "true",
            ),
        );
        expect(screen.getByTestId("import-to-library")).toBeEnabled();
    });
});

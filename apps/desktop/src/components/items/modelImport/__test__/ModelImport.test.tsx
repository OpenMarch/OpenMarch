// cspell:words Wayfair
import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { useEffect } from "react";
import { describeDbTests, type DbConnection } from "@/test/base";
import { harnessQueryClient, setUpFeature } from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { getItemGeometry, getItems } from "@/db-functions/items";
import { getShowAssets } from "@/db-functions/showAssets";
import { performUndo } from "@/db-functions/history";
import { showAssetKeys } from "@/hooks/queries/useShowAssets";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { usePropDrawn } from "@/field/fieldPropTool";
import type { DrawnOutline } from "@/items/itemOutlines";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { useItemActionHandlers } from "@/shortcuts/handlers/useItemActionHandlers";
import { importModel as runImport } from "@/showAssets/modelImport/pipeline";
import { saveImportedModel } from "@/showAssets/modelImport/saveImportedModel";
import {
    configureModelImportSession,
    useModelImportSession,
} from "@/showAssets/modelImport/review/modelImportSession";
import type { PickedFile } from "@/showAssets/modelImport/types";
import { env, picked } from "@/showAssets/modelImport/__test__/fixtures";
import { showModelImportReview } from "../openModelImport";

/**
 * The model import in the Props panel (fork #999): the review on one screen, Add, the Imported
 * group, and placing an imported model as a prop. The import runs the real pipeline in Node, as
 * the worker would.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

const JsdomBlob = globalThis.Blob;
afterAll(() => {
    globalThis.Blob = JsdomBlob;
});

beforeAll(async () => {
    await tolgee.run();
    Element.prototype.scrollIntoView ??= () => {};
    // jsdom's Blob can't be read back; the thumbnail's PNG encoder reads one
    globalThis.Blob = NodeBlob as unknown as typeof Blob;
    // jsdom has no object URLs
    URL.createObjectURL ??= () => "blob:test";
    URL.revokeObjectURL ??= () => {};
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
    useModelImportSession.getState().cancel();
    useItemDrawingStore.getState().resetDrawingState();
    configureModelImportSession(null);
    vi.restoreAllMocks();
});

const PAGE = 1;

const port: { drawn: ((outline: DrawnOutline) => void) | null } = {
    drawn: null,
};
/** The field's `propDrawn` port and the item actions, as the editor has them */
function Editor() {
    const drawn = usePropDrawn();
    useItemActionHandlers();
    useEffect(() => {
        port.drawn = drawn;
    }, [drawn]);
    return null;
}

/** The pipeline in Node for runs; the show's store for Add */
function configure(db: DbConnection) {
    const runs: { simplify?: boolean; turn?: number }[] = [];
    configureModelImportSession({
        run: async (files, choices) => {
            runs.push(choices);
            return runImport(files, choices, env);
        },
        save: async (model) => {
            const { modelValue } = await saveImportedModel({ db, model });
            await harnessQueryClient()!.invalidateQueries({
                queryKey: showAssetKeys.all(),
            });
            return { modelValue };
        },
    });
    return runs;
}

async function openReview(files: PickedFile[]) {
    await act(async () => {
        useModelImportSession.getState().open(files);
        showModelImportReview();
    });
    const review = await screen.findByTestId("model-import-review");
    await waitFor(() =>
        expect(useModelImportSession.getState().running).toBe(false),
    );
    return review;
}

describeDbTests("Model import", (it) => {
    it("reviews a model, adds it, and places it as a prop that one undo removes", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        const runs = configure(db);
        await setUpFeature(
            <>
                <SidebarModal />
                <Editor />
            </>,
            PAGE,
            [],
        );
        const review = await openReview([picked("SheenChair.glb")]);

        // The size to confirm, the turn, and before and after simplifying
        expect(
            within(review).getByTestId("model-import-size").textContent,
        ).toMatch(/^[\d.]+ × [\d.]+ m, [\d.]+ m tall$/);
        expect(
            within(review).getByTestId("model-import-choices"),
        ).toHaveTextContent("Simplify to 20,000 triangles");
        expect(within(review).getByTestId("model-import-after")).toBeTruthy();

        fireEvent.click(within(review).getByTestId("model-import-turn"));
        await waitFor(() => expect(runs.at(-1)).toMatchObject({ turn: 90 }));
        await waitFor(() =>
            expect(useModelImportSession.getState().running).toBe(false),
        );

        // The license fields (this file states none: Unknown); blank ones aren't stored
        fireEvent.click(
            within(review).getByTestId("model-import-credits-toggle"),
        );
        fireEvent.change(within(review).getByTestId("model-import-author"), {
            target: { value: "  Wayfair  " },
        });
        fireEvent.change(within(review).getByTestId("model-import-sourceUrl"), {
            target: { value: " " },
        });

        fireEvent.change(within(review).getByTestId("model-import-name"), {
            target: { value: "Chair" },
        });
        fireEvent.click(within(review).getByTestId("model-import-add"));

        // Stored, and shown under Imported
        // Hashing the parts takes a moment
        const tile = await screen.findByRole(
            "button",
            { name: "Place Chair" },
            { timeout: 10_000 },
        );
        const [asset] = await getShowAssets({ db });
        expect(asset).toMatchObject({
            kind: "model",
            name: "Chair",
            credits: { author: "Wayfair" },
        });
        expect(asset.credits).not.toHaveProperty("sourceUrl");
        expect(asset.sidecar).toMatchObject({ facing: { turnDeg: 90 } });

        // Picking it and clicking the field places a prop at the playhead
        fireEvent.click(tile);
        expect(useItemDrawingStore.getState().placing).toMatchObject({
            kind: "model",
            baseName: "Chair",
        });
        expect(useSidebarModalStore.getState().isOpen).toBe(false);
        act(() =>
            port.drawn!({
                outlineType: "rectangle",
                centerX: 300,
                centerY: 200,
                widthPixels: 1,
                depthPixels: 1,
            }),
        );
        await waitFor(async () =>
            expect(await getItems({ db })).toHaveLength(1),
        );
        const [item] = await getItems({ db });
        expect(item).toMatchObject({
            kind: "prop",
            surface_type: "obstacle",
            locked: false,
            model: `library:${asset.id}@${asset.versionHash}`,
            marcher: { name: "Chair 1" },
        });
        const sizeM = asset.sidecar.sizeM as {
            width: number;
            depth: number;
            height: number;
        };
        const [geometry] = await getItemGeometry({ db });
        expect(geometry).toMatchObject({
            outline_type: "rectangle",
            width: sizeM.width,
            depth: sizeM.depth,
            height: sizeM.height,
        });

        // One undo removes the prop and keeps the model
        await performUndo(db);
        expect(await getItems({ db })).toHaveLength(0);
        expect(await getShowAssets({ db })).toHaveLength(1);
    });

    it("leaves the show unchanged on Cancel", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        configure(db);
        await setUpFeature(<SidebarModal />, PAGE, []);
        const review = await openReview([picked("TextureCoordinateTest.glb")]);
        fireEvent.click(within(review).getByTestId("model-import-cancel"));
        expect(await screen.findByTestId("imported-models")).toBeTruthy();
        expect(await getShowAssets({ db })).toHaveLength(0);
        expect(await getItems({ db })).toHaveLength(0);
    });

    it("shows why a file can't be imported on the review, never in an alert", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        configure(db);
        const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
        await setUpFeature(<SidebarModal />, PAGE, []);
        const review = await openReview([
            { name: "notes.txt", bytes: new Uint8Array([1, 2, 3]) },
        ]);
        expect(
            within(review).getByTestId("model-import-cant"),
        ).toHaveTextContent("No model in the files");
        expect(within(review).getByTestId("model-import-add")).toBeDisabled();
        expect(alert).not.toHaveBeenCalled();
    });

    it("offers Try again when the import itself failed", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        let fail = true;
        configureModelImportSession({
            run: async (files, choices) => {
                if (fail)
                    return {
                        ok: false,
                        report: {
                            cantImport: [{ code: "timedOut", seconds: 120 }],
                            needsChoice: [],
                            fixedForYou: [],
                            notes: [],
                        },
                    };
                return runImport(files, choices, env);
            },
            save: async (model) => saveImportedModel({ db, model }),
        });
        await setUpFeature(<SidebarModal />, PAGE, []);
        const review = await openReview([picked("TextureCoordinateTest.glb")]);
        expect(
            within(review).getByTestId("model-import-cant"),
        ).toHaveTextContent("It took too long");
        fail = false;
        fireEvent.click(
            within(review).getByRole("button", { name: "Try again" }),
        );
        await waitFor(() =>
            expect(
                within(review).getByTestId("model-import-add"),
            ).toBeEnabled(),
        );
    });
});

// cspell:words Khronos
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
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { harnessQueryClient, setUpFeature } from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { createItems, getItems, updateItems } from "@/db-functions/items";
import { getShowAssets } from "@/db-functions/showAssets";
import { performUndo } from "@/db-functions/history";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { importModel as runImport } from "@/showAssets/modelImport/pipeline";
import { saveImportedModel } from "@/showAssets/modelImport/saveImportedModel";
import { env, picked } from "@/showAssets/modelImport/__test__/fixtures";
import { openItemEditor } from "@/components/items/openItemEditor";
import { showAssetsView } from "../openAssets";

/**
 * The Assets view (fork #1001): the show's imported assets with their size, use and credits,
 * the unused note and Remove unused…, and a prop whose model an undo brought back after it was
 * removed. The models come from the real import pipeline, in Node.
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
    globalThis.Blob = NodeBlob as unknown as typeof Blob;
    URL.createObjectURL ??= () => "blob:test";
    URL.revokeObjectURL ??= () => {};
});
afterEach(() => {
    cleanup();
    stopTimelineResolver();
    vi.restoreAllMocks();
});

/** Imports a fixture as the review's Add would, with no license */
async function store(db: DbConnection, file: string, name: string) {
    const result = await runImport([picked(file)], {}, env);
    if (!result.ok) throw new Error(`${file} should import`);
    const { modelValue } = await saveImportedModel({
        db,
        model: { ...result.model, name, credits: {} },
    });
    return modelValue;
}

const refresh = () =>
    act(async () => harnessQueryClient()!.invalidateQueries());

describeDbTests("Assets view", (it) => {
    it("lists the show's assets, says which nothing uses, and removes only those", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        const chair = await store(db, "SheenChair.glb", "Chair");
        await store(db, "TextureCoordinateTest.glb", "Test pattern");
        const beats = await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .all();
        const [prop] = await createItems({
            db,
            newItems: [
                {
                    kind: "prop",
                    surfaceType: "obstacle",
                    home: [100, 100],
                    beatId: beats[0]!.id,
                    model: chair,
                    geometry: { outlineType: "rectangle", width: 1, depth: 1 },
                },
            ],
        });
        await setUpFeature(<SidebarModal />, 1, []);
        await act(async () => showAssetsView());

        const view = await screen.findByTestId("assets-view");
        await waitFor(() =>
            expect(within(view).getAllByTestId("asset-row")).toHaveLength(2),
        );
        const [chairRow, patternRow] = within(view).getAllByTestId("asset-row");
        expect(chairRow).toHaveTextContent("Chair");
        expect(chairRow).toHaveTextContent("Used once");
        expect(patternRow).toHaveTextContent("Not used");
        // No license given: the share note, never "infringing"
        expect(patternRow).toHaveTextContent("may not have the right to share");
        expect(screen.getByTestId("assets-unused-note")).toHaveTextContent(
            /^1 asset isn't used anywhere in the show · [\d.]+ (KB|MB)/,
        );

        // Remove unused… lists what it removes, and removes only that
        fireEvent.click(screen.getByTestId("assets-remove-unused"));
        const list = await screen.findByTestId("assets-remove-list");
        expect(within(list).getAllByRole("listitem")).toHaveLength(1);
        expect(list).toHaveTextContent("Test pattern");
        fireEvent.click(screen.getByTestId("assets-remove-confirm"));
        await waitFor(async () =>
            expect((await getShowAssets({ db })).map((a) => a.name)).toEqual([
                "Chair",
            ]),
        );
        await waitFor(() =>
            expect(screen.queryByTestId("assets-unused-note")).toBeNull(),
        );

        // The prop lets go of its model, the model is removed, and an undo brings the prop's
        // reference back: it draws as a block, and the show says so
        await updateItems({
            db,
            modifiedItems: [{ itemId: prop!.id, model: null }],
        });
        await refresh();
        fireEvent.click(await screen.findByTestId("assets-remove-unused"));
        fireEvent.click(await screen.findByTestId("assets-remove-confirm"));
        await waitFor(async () =>
            expect(await getShowAssets({ db })).toHaveLength(0),
        );
        await performUndo(db);
        await refresh();
        expect(
            await screen.findByTestId("assets-missing-note"),
        ).toHaveTextContent("1 prop names a model this show doesn't have");
        const [item] = await getItems({ db });
        await act(async () => openItemEditor(item!));
        expect(await screen.findByTestId("item-model-missing")).toBeTruthy();
    });

    it("saves credits without making a new Version", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        await store(db, "TextureCoordinateTest.glb", "Test pattern");
        const [before] = await getShowAssets({ db });
        await setUpFeature(<SidebarModal />, 1, []);
        await act(async () => showAssetsView());
        const row = await screen.findByTestId("asset-row");
        fireEvent.click(within(row).getByRole("button", { expanded: false }));
        fireEvent.click(await screen.findByTestId("asset-credits-toggle"));
        fireEvent.change(screen.getByTestId("asset-author"), {
            target: { value: "Khronos" },
        });
        await waitFor(
            async () => {
                const [after] = await getShowAssets({ db });
                expect(after!.credits).toEqual({ author: "Khronos" });
                expect(after!.versionHash).toBe(before!.versionHash);
            },
            { timeout: 3000 },
        );
    });

    it("opens Remove unused… from its command, listing nothing when everything is used", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        await setUpFeature(<SidebarModal />, 1, []);
        await act(async () => showAssetsView({ openRemove: true }));
        expect(
            await screen.findByTestId("assets-remove-dialog"),
        ).toHaveTextContent("nothing to remove");
        expect(screen.queryByTestId("assets-remove-confirm")).toBeNull();
        void db;
    });
});

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import type { LibraryItemUses } from "@/db-functions/showLibraryDelete";
import type { LibraryItemSummary } from "@/view3d/library/protocol";
import {
    createFakeLibrary,
    ok,
} from "@/components/library/import/__test__/fakeLibrary";
import ShowAssets from "../ShowAssets";
import type { ShowAssetDeletion } from "../DeleteShowAssetDialog";
import { h, librarySummary, showItem } from "./showFixtures";

let show: ShowLibraryItem[] = [];
vi.mock("@/hooks/queries/useShowLibrary", () => ({
    useShowLibrary: () => ({ data: show }),
    showLibraryKeys: { all: () => ["library_items"] },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
    await tolgee.run();
    // Radix Select needs these, which happy-dom lacks
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => {
    cleanup();
    show = [];
});

function setup(library: LibraryItemSummary[], deletion?: ShowAssetDeletion) {
    const lib = createFakeLibrary();
    lib.on("list", () => ok(library));
    const blobs: Record<string, Uint8Array> = {
        [h("d")]: new Uint8Array([1, 2]),
        [h("e")]: new TextEncoder().encode('{"surface":"silk"}'),
    };
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ShowAssets
                    api={lib.api}
                    readBlob={async (hash) => blobs[hash]}
                    deletion={deletion}
                />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
    return lib;
}

describe("This show", () => {
    it("lists what the show embeds and adds a missing item to the Library from the show's copy", async () => {
        const kept = showItem(1, "Kept silk");
        const missing = showItem(2, "Shared silk");
        show = [kept, missing];
        const lib = setup([librarySummary(kept)]);
        lib.on("addFromShow", () =>
            ok({ outcome: "created", item: { id: missing.itemId } }),
        );

        const silks = await screen.findByTestId("show-group-silks");
        const rows = within(silks).getAllByTestId("show-item");
        expect(rows.map((r) => r.getAttribute("title"))).toEqual([
            "Kept silk",
            "Shared silk",
        ]);
        await waitFor(() =>
            expect(within(rows[1]).getByTestId("show-item-add")).toBeVisible(),
        );
        expect(within(rows[0]).queryByTestId("show-item-add")).toBeNull();

        await userEvent.click(within(rows[1]).getByTestId("show-item-add"));
        await waitFor(() => expect(lib.calls.addFromShow).toHaveLength(1));
        expect(lib.calls.addFromShow[0]).toMatchObject({
            itemId: missing.itemId,
            versionHash: missing.versionHash,
            name: "Shared silk",
            parts: { display: new Uint8Array([1, 2]) },
            license: { license: "LicenseRef-Unknown" },
        });
    });

    it("notes a newer Version in the Library without applying it", async () => {
        const behind = showItem(1, "Behind silk");
        show = [behind];
        setup([
            librarySummary(behind, { versions: [behind.versionHash, h("f")] }),
        ]);
        expect(await screen.findByTestId("show-item-update")).toHaveTextContent(
            "A newer version is in your Library.",
        );
    });

    it("offers no Add while the Library can't be read", async () => {
        show = [showItem(1, "Silk")];
        const lib = createFakeLibrary();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <TolgeeProvider tolgee={tolgee} fallback="">
                    <ShowAssets
                        api={lib.api}
                        readBlob={async () => undefined}
                    />
                </TolgeeProvider>
            </QueryClientProvider>,
        );
        await waitFor(() => expect(lib.calls.list).toHaveLength(1));
        expect(screen.queryByTestId("show-item-add")).toBeNull();
    });

    it("says when the show uses nothing yet", () => {
        setup([]);
        expect(
            screen.getByText("This show doesn't use any assets yet."),
        ).toBeVisible();
    });
});

describe("Deleting from this show", () => {
    const noUses: LibraryItemUses = {
        floor: false,
        items: [],
        pinnedBy: [],
    };
    const fakeDeletion = (
        found: Partial<LibraryItemUses>,
        outcome: "deleted" | "keptForUndo" = "deleted",
    ) => {
        const calls: string[] = [];
        const deletion: ShowAssetDeletion = {
            uses: async () => ({ ...noUses, ...found }),
            remove: async (itemId) => {
                calls.push(`remove ${itemId}`);
                return { outcome };
            },
        };
        return { deletion, calls };
    };
    const openDelete = async (name: string) => {
        const row = (await screen.findAllByTestId("show-item")).find(
            (r) => r.getAttribute("title") === name,
        )!;
        await userEvent.click(within(row).getByTestId("show-item-delete"));
        return await screen.findByTestId("delete-show-asset");
    };

    it("deletes an item nothing uses after asking", async () => {
        const silk = showItem(1, "Old silk");
        show = [silk];
        const { deletion, calls } = fakeDeletion({});
        const lib = setup([librarySummary(silk)], deletion);
        await waitFor(() => expect(lib.calls.list).toHaveLength(1));

        const dialog = await openDelete("Old silk");
        expect(dialog).toHaveTextContent("Delete Old silk from this show?");
        await waitFor(() =>
            expect(
                within(dialog).getByTestId("delete-show-asset-confirm-text"),
            ).toHaveTextContent(
                "Your Library keeps its own copy. This can't be undone.",
            ),
        );
        await userEvent.click(
            within(dialog).getByTestId("delete-show-asset-confirm"),
        );
        await waitFor(() => expect(calls).toEqual([`remove ${silk.itemId}`]));
        expect(toast.success).toHaveBeenCalledWith(
            "Deleted Old silk from this show.",
        );
    });

    it("can't delete an item another item pins", async () => {
        show = [showItem(1, "Crest")];
        const { deletion } = fakeDeletion({
            pinnedBy: [{ itemId: "u", name: "Home uniform" }],
        });
        setup([], deletion);

        const dialog = await openDelete("Crest");
        expect(
            within(dialog).getByTestId("delete-show-asset-pinned"),
        ).toHaveTextContent(
            "It's part of Home uniform, so it can't be deleted.",
        );
        expect(
            within(dialog).queryByTestId("delete-show-asset-confirm"),
        ).toBeNull();
    });

    it("can't delete the show's floor, and says where to change it", async () => {
        show = [
            showItem(1, "Field image", { sidecar: { surface: "baseFloor" } }),
        ];
        const { deletion } = fakeDeletion({ floor: true });
        setup([], deletion);

        const dialog = await openDelete("Field image");
        expect(dialog).toHaveTextContent("Field image is in use");
        expect(
            within(dialog).getByTestId("delete-show-asset-floor"),
        ).toHaveTextContent(
            "It's this show's floor, so it can't be deleted. Change the floor in Field settings → Image.",
        );
        expect(
            within(dialog).queryByTestId("delete-show-asset-confirm"),
        ).toBeNull();
    });

    it("lists the props that use it, and offers no delete while they do", async () => {
        show = [showItem(1, "Crest"), showItem(2, "Other crest")];
        const { deletion } = fakeDeletion({
            items: [
                { marcherId: 7, label: "Flat 1" },
                { marcherId: 8, label: "Rifle 2" },
            ],
        });
        setup([], deletion);

        const dialog = await openDelete("Crest");
        const items = within(dialog).getByTestId("delete-show-asset-item-uses");
        expect(
            within(items)
                .getAllByRole("listitem")
                .map((li) => li.textContent),
        ).toEqual(["Flat 1 · model", "Rifle 2 · model"]);
        expect(
            within(dialog).queryByTestId("delete-show-asset-confirm"),
        ).toBeNull();
    });

    it("says the item goes for good when the Library has no copy, and offers to add one first", async () => {
        const silk = showItem(1, "Shared silk");
        show = [silk];
        const { deletion } = fakeDeletion({});
        const lib = setup([], deletion);
        lib.on("addFromShow", () =>
            ok({ outcome: "created", item: { id: silk.itemId } }),
        );
        await waitFor(() => expect(lib.calls.list).toHaveLength(1));

        const dialog = await openDelete("Shared silk");
        const text = within(dialog).getByTestId(
            "delete-show-asset-confirm-text",
        );
        expect(text).toHaveTextContent(
            "Your Library doesn't have a copy, so it will be gone for good.",
        );
        await userEvent.click(
            within(dialog).getByTestId("delete-show-asset-add-to-library"),
        );
        await waitFor(() => expect(lib.calls.addFromShow).toHaveLength(1));
        await waitFor(() =>
            expect(text).toHaveTextContent("Your Library keeps its own copy."),
        );
        expect(
            within(dialog).queryByTestId("delete-show-asset-add-to-library"),
        ).toBeNull();
    });
});
